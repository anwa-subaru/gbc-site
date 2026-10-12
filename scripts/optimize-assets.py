#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
optimize-assets.py — GBC 粉丝站资产整理与优化管线
================================================

输入：/workspace/gbcc/gbc/gbc（991 个文件 / 2.3G；目录与文件名为字面量 #Uxxxx 转义）
输出：/workspace/gbc-site/public/assets/{characters,logo,posters,covers,artworks,emoji,videos}/
      + /workspace/gbc-site/public/assets/manifest.json

管线步骤（对应任务 5 项）：
  1) 解码转义文件名（re.sub(r"#U([0-9a-fA-F]{4})", chr(int(...,16))））
  2) 按用途归类到 7 个目标分类目录
  3) 全部输出路径转 ASCII 安全命名（如 characters/nina/01.webp），原（解码后）名记入 manifest
  4) 大图压缩转 WebP（quality=80，最长边按分类设上限；立绘 RGBA 保留透明通道）
  5) 生成 manifest.json（分类 → 文件列表，含原路径/尺寸/体积，供站点组件消费）

设计要点 / 踩坑记录：
  * 源文件扩展名**不可信**：`宣发海报/img_kv-0*.png` 实为 WebP（RIFF 魔数）。
    本脚本一律用 PIL 按内容打开、统一编码为 WebP，因此不受错误扩展名影响。
  * 立绘 / logo 保留 alpha；无 alpha 的按 RGB 处理。
  * 跳过 Illustrator 源文件（.ai）、非角色 PV 视频、以及 AI 放大重复目录
    （`upscayl_*`、`补4x`），避免无意义体积。
  * 视频仅保留 `角色pv/*.webm`，压到每个 <10MB。

用法：
  python3 scripts/optimize-assets.py                 # 全量
  python3 scripts/optimize-assets.py --dry-run       # 只列计划
  python3 scripts/optimize-assets.py --only characters covers
  python3 scripts/optimize-assets.py --clean         # 先清空输出目录
  python3 scripts/optimize-assets.py --workers 4

依赖：Pillow、ffmpeg/ffprobe。
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import time
from collections import OrderedDict
from concurrent.futures import ProcessPoolExecutor, as_completed

try:
    from PIL import Image

    Image.MAX_IMAGE_PIXELS = None  # 源图最大 72.9MB / 11000+ px，关闭 DecompressionBomb
except ImportError:  # pragma: no cover
    sys.stderr.write("[fatal] 需要 Pillow：pip install Pillow\n")
    raise

# --------------------------------------------------------------------------
# 常量
# --------------------------------------------------------------------------

DEFAULT_SRC = "/workspace/gbcc/gbc/gbc"
DEFAULT_OUT = "/workspace/gbc-site/public/assets"

CATEGORIES = ["characters", "logo", "posters", "covers", "artworks", "emoji", "videos"]

RASTER_EXT = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tif", ".tiff"}
VECTOR_EXT = {".svg"}
GIF_EXT = {".gif"}
VIDEO_EXT = {".mp4", ".webm", ".mov", ".m4v"}
SKIP_EXT = {".ai"}  # Illustrator 源文件，网页无法直接使用

# 每分类压缩档： (quality, max_edge)
# 立绘/海报需要细节；画廊/周边是批量展示，可以更省；表情包本质是小图。
PROFILES = {
    "characters": (80, 1600),
    "logo":       (92, 1024),   # logo 需要锐利边缘，质量高、尺寸小
    "posters":    (80, 1920),
    "covers":     (80, 1000),   # 方形专辑封面
    "artworks":   (76, 1400),
    "emoji":      (80, 320),
}

VIDEO_MAX_BYTES = 10 * 1024 * 1024
VIDEO_MAX_EDGE = 1920

ESCAPE_RE = re.compile(r"#U([0-9a-fA-F]{4})")

# 跳过 AI 放大重复目录（原图已存在，放大版无额外信息）
SKIP_DIR_PATTERNS = ("upscayl", "补4x")

# --------------------------------------------------------------------------
# 分类 / 目录名映射
# --------------------------------------------------------------------------

# 一级目录 → 分类
TOP_CATEGORY = {
    "logo 元素素材": "logo",
    "透明底人物立绘": "characters",
    "宣发海报": "posters",
    "封面": "covers",
    "角色pv": "videos",
    "贺图": "artworks",
    "广告素材": "artworks",
    "周边图": "artworks",
    "透明底非常规图": "artworks",
    "收藏集第一弹": "artworks",
    "收藏集第二弹": "artworks",
}

# 二级及以下目录名（解码后）→ ASCII slug
DIR_MAP = {
    # logo 元素素材
    "Live logo": "live",
    "icon": "icon",
    "logo": "brand",
    "元素": "elements",
    "姓名": "names",
    "签名": "signatures",
    "职位": "parts",
    # 封面
    "专辑ep": "album",
    "BD": "bd",
    "PV": "pv",
    "视频": "video",
    # 贺图
    "动画": "anime",
    "手岛绘": "nari-illust",
    "个人": "solo",
    "劇場版総集編 ガールズバンドクライ【前編】青春狂走曲": "movie",
    "運命に賭けたい論理MV": "mv-unmei",
    # 广告素材
    "pop up shop": "popup-shop",
    "「Cry Rose」": "cry-rose",
    "人设图": "character-design",
    "卡套": "card-sleeve",
    "周边上新宣发": "merch-promo",
    "島村楽器": "shimamura",
    # 周边图
    "三丽鸥联动": "sanrio",
    "三立鸥联动立绘（透明底）": "sanrio-cutout",
    "亚克力挂件1": "acrylic-strap",
    "亚克力牌1": "acrylic-plate",
    "夜水母联动": "jellyfish",
    "周边": "goods",
    "亚克力立牌": "acrylic-stand",
    "亚克力贴纸": "acrylic-sticker",
    "亚克力钥匙扣": "acrylic-keychain",
    "徽章": "badge",
    "水母联动人物介绍": "jellyfish-chars",
    "原图": "raw",
    "抠": "cutout",
    "背景": "bg",
    # 透明底非常规图
    "gbc工作猫": "work-cat",
    "gbc工作猫#2": "work-cat-2",
    "gbc平成辣妹": "heisei-gyaru",
    "gbc玩偶": "plush",
    "小gbc": "mini",
    "島村楽器 ラゾーナ川崎店 柄图": "shimamura-kawasaki",
    # 收藏集
    "其他": "misc",
    "卡池图片": "gacha-art",
    "卡池视频": "gacha-video",  # 会被视频规则跳过
    "收藏集勋章": "badges",
    "动态表情包（原版）": "animated",
    "动态表情包": "animated",
    "少女乐队呐喊动态表情_干饭等": "animated-1",
    "少女乐队的呐喊第二弹动态表情包_一等": "animated-2",
    "少女乐队的呐喊表情包": "static-1",
    "间奏时光表情包_哭等": "interlude-1",
    "间奏时光表情包_欣慰等": "interlude-2",
    "类型1": "type1", "类型2": "type2", "类型3": "type3",
    "类型4": "type4", "类型6": "type6",
    # 角色立绘子目录
    "组合图": "_group",
    "bd": "_bd",
    "未超分图留档": "_archive",
    "钻石之尘": "_diamond-dust",
    "爆ぜて咲く 衣装": "hazete-saku",
    "Ai": "ai", "Hina": "hina", "Nana": "nana", "Rin": "rin",
}

# 源目录名（小写）→ 角色 slug
CHAR_DIR_ALIASES = {
    "nina": "nina", "rupa": "rupa", "tomo": "tomo",
    "486": "subaru", "subaru": "subaru",
    "mmk": "momoka", "momoka": "momoka",
}

# 官方角色资料（罗马字 / 日文 / 担当）—— 依据动画官网 CHARACTER 页与萌娘百科条目
CHARACTERS = OrderedDict([
    ("nina",   {"ja": "井芹仁菜", "en": "Nina Iseri",     "romaji": "Iseri Nina",    "part": "vo",  "color": "#D90E2C"}),
    ("momoka", {"ja": "河原木桃香", "en": "Momoka Kawaragi", "romaji": "Kawaragi Momoka", "part": "gt", "color": "#85C9DC"}),
    ("subaru", {"ja": "安和昴",   "en": "Subaru Awa",     "romaji": "Awa Subaru",    "part": "dr",  "color": "#76BD53"}),
    ("tomo",   {"ja": "海老塚智",  "en": "Tomo Ebizuka",   "romaji": "Ebizuka Tomo",  "part": "key", "color": "#E34D8D"}),
    ("rupa",   {"ja": "ルパ",     "en": "Rupa",           "romaji": "Rupa",          "part": "ba",  "color": "#EEDA01"}),
])

# 文件名中出现的角色线索（顺序无关，按最长匹配优先）
CHAR_NAME_HINTS = {
    "nina":   ["井芹仁菜", "仁菜", "nina"],
    "momoka": ["河原木桃香", "桃香", "mmk", "momoka", "ももか"],
    "subaru": ["安和すばる", "安和昴", "すばる", "昴", "486", "subaru"],
    "tomo":   ["海老塚智", "海老冢智", "智", "tomo", "ebizuka"],
    "rupa":   ["ルパ", "rupa", "卢帕"],
}

# 文件名关键词 → ASCII 标签（用于给输出文件起可读后缀）
LABEL_KEYWORDS = [
    ("春服", "spring"), ("夏服", "summer"), ("冬服", "winter"),
    ("立小指", "koyubi"), ("爆ぜて咲く", "hazete-saku"),
    ("空白とカタルシス", "catharsis"), ("踢踏跳跃", "tapping"),
    ("三丽鸥", "sanrio"), ("平成辣妹", "heisei-gyaru"),
    ("工作猫", "work-cat"), ("玩偶", "plush"), ("rpg风", "rpg"), ("rpg風", "rpg"),
    ("ガルクラ展", "galkura-exhibit"), ("Zepp", "zepp"), ("cryrose", "cry-rose"),
    ("cry rose", "cry-rose"), ("hmv", "hmv"), ("epos", "epos"),
    ("ZOZOTOWN", "zozotown"), ("pop up", "pop-up"), ("pop-up", "pop-up"),
    ("水母", "jellyfish"), ("for you", "for-you"), ("耳机", "headphones"),
    ("花", "flower"), ("签名", "sign"), ("勋章", "badge"), ("头像", "avatar"),
    ("封面", "cover"), ("背景", "bg"),
]

# --------------------------------------------------------------------------
# 工具
# --------------------------------------------------------------------------


def decode_escapes(name: str) -> str:
    """把 #U4f7f#U7528 形式的转义名还原为真实 Unicode。"""
    if "#U" not in name:
        return name
    return ESCAPE_RE.sub(lambda m: chr(int(m.group(1), 16)), name)


def ascii_slug(text: str, fallback: str = "x", maxlen: int = 40) -> str:
    """任意字符串 → ASCII 安全 slug（小写，仅 [a-z0-9-]）。"""
    s = str(text).lower()
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    s = re.sub(r"-{2,}", "-", s)
    return (s[:maxlen].strip("-") or fallback)


def human_size(n: float) -> str:
    for unit in ("B", "KB", "MB", "GB"):
        if n < 1024 or unit == "GB":
            return f"{n:.1f}{unit}"
        n /= 1024.0
    return f"{n:.1f}GB"


def log(msg: str) -> None:
    print(msg, flush=True)


# --------------------------------------------------------------------------
# 分类与命名规划
# --------------------------------------------------------------------------


def map_dir(part: str) -> str:
    """目录名 → ASCII slug。优先查表，其次 ASCII 化，最后回退。"""
    if part in DIR_MAP:
        return DIR_MAP[part]
    return ascii_slug(part, "misc")


def classify(top: str, parts: list) -> str:
    """决定目标分类。"""
    cat = TOP_CATEGORY.get(top, "artworks")
    # 收藏集里的表情包单独归到 emoji
    if cat == "artworks" and any("表情" in p for p in parts):
        return "emoji"
    return cat


def char_slug_for(parts: list) -> str | None:
    """透明底人物立绘/<子目录> → 角色 slug；组合/钻尘/档案返回 None。"""
    if len(parts) < 2:
        return None
    sub = parts[1]
    return CHAR_DIR_ALIASES.get(sub) or CHAR_DIR_ALIASES.get(sub.lower())


def detect_char(name: str) -> str | None:
    low = name.lower()
    for slug, hints in CHAR_NAME_HINTS.items():
        for h in hints:
            if h.lower() in low:
                return slug
    return None


def label_for(stem: str) -> str:
    """从文件名提炼 ASCII 标签。"""
    for kw, lab in LABEL_KEYWORDS:
        if kw.lower() in stem.lower():
            return lab
    return ""


def plan_output(parts: list, decoded_name: str) -> tuple:
    """
    返回 (category, rel_dir, label, meta)。
    parts = 解码后的相对路径各段；parts[-1] 是文件名。
    """
    top = parts[0] if parts else ""
    stem = os.path.splitext(decoded_name)[0]
    category = classify(top, parts)
    meta: dict = {}

    if category == "characters":
        slug = char_slug_for(parts)
        if slug:
            rel_dir = f"characters/{slug}"
            meta["character"] = slug
        else:
            # 组合图 / 钻尘 / 档案 / bd
            sub = map_dir(parts[1]) if len(parts) > 1 else "_misc"
            if len(parts) > 2 and parts[1] == "钻石之尘":
                sub = f"_diamond-dust/{map_dir(parts[2])}"
            elif len(parts) > 2 and parts[1] == "未超分图留档":
                sub = f"_archive/{map_dir(parts[2])}"
            rel_dir = f"characters/{sub}"
            c = detect_char(decoded_name)
            if c:
                meta["character"] = c
        lab = label_for(stem)
        if lab:
            meta["label"] = lab
        return category, rel_dir, lab, meta

    if category == "logo":
        subs = [map_dir(p) for p in parts[1:-1]]
        rel_dir = "logo/" + "/".join(subs) if subs else "logo"
        # 官方 logo 的日文名无法 ASCII 化，用固定语义名代替
        lab = ascii_slug(stem, "")
        if not lab:
            lab = "brand"
        return category, rel_dir, lab, meta

    if category == "posters":
        return category, "posters", "", meta

    if category == "covers":
        sub = map_dir(parts[1]) if len(parts) > 1 else "misc"
        return category, f"covers/{sub}", "", meta

    if category == "emoji":
        theme = "misc"
        for p in parts[1:-1]:
            if "表情" in p:
                theme = map_dir(p)
                break
        return category, f"emoji/{theme}", "", meta

    if category == "videos":
        slug = detect_char(decoded_name) or "pv"
        meta["character"] = slug if slug != "pv" else None
        return category, "videos/role-pv", slug, meta

    # artworks
    subs = [map_dir(p) for p in parts[1:-1]]
    if len(subs) > 2:
        subs = subs[:2]
    rel_dir = "artworks/" + "/".join(subs) if subs else "artworks"
    lab = label_for(stem)
    if lab:
        meta["label"] = lab
    c = detect_char(decoded_name)
    if c:
        meta["character"] = c
    return category, rel_dir, lab, meta


def should_skip(rel_decoded: str, ext: str, category: str) -> str | None:
    """返回跳过原因，或 None 表示处理。"""
    if ext in SKIP_EXT:
        return "illustrator-source"
    low = rel_decoded.lower()
    for pat in SKIP_DIR_PATTERNS:
        if pat.lower() in low:
            return "upscaled-duplicate"
    if ext in VIDEO_EXT and category != "videos":
        return "video-not-needed"  # 仅保留角色 PV
    return None


# --------------------------------------------------------------------------
# 图像处理
# --------------------------------------------------------------------------


def flatten_to_rgb(im: Image.Image) -> Image.Image:
    """带 alpha 的图铺白底转 RGB；其余直接转 RGB。"""
    if im.mode in ("RGBA", "LA") or (im.mode == "P" and "transparency" in im.info):
        im = im.convert("RGBA")
        bg = Image.new("RGB", im.size, (255, 255, 255))
        bg.paste(im, mask=im.split()[-1])
        return bg
    return im.convert("RGB")


def encode_image(src: str, dst: str, quality: int, max_edge: int, keep_alpha: bool) -> dict:
    """缩放 + 转 WebP。返回尺寸与元信息。"""
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    with Image.open(src) as im:
        im.load()
        src_w, src_h = im.size
        src_mode = im.mode

        has_alpha = (
            im.mode in ("RGBA", "LA")
            or (im.mode == "P" and "transparency" in im.info)
        )

        scale = min(1.0, max_edge / float(max(src_w, src_h)))
        if scale < 1.0:
            new_size = (max(1, round(src_w * scale)), max(1, round(src_h * scale)))
            im = im.resize(new_size, Image.LANCZOS)

        if has_alpha and keep_alpha:
            out = im.convert("RGBA")
            out.save(dst, "WEBP", quality=quality, method=5, exact=False)
        else:
            out = flatten_to_rgb(im)
            out.save(dst, "WEBP", quality=quality, method=5)

        return {
            "width": out.size[0],
            "height": out.size[1],
            "source_width": src_w,
            "source_height": src_h,
            "source_mode": src_mode,
            "alpha": bool(has_alpha and keep_alpha),
        }


def encode_animated(src: str, dst: str, max_edge: int) -> dict:
    """多帧素材（GIF / 动态 WebP）→ 动画 WebP（保留帧序与透明）。

    注意：以前只对 .gif 走这条路径，.webp 源的动态表情包被 encode_image
    按静图存了，40 个 10 帧贴纸全被压成单帧（画面上只剩一条残影）。
    """
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    with Image.open(src) as im:
        n = getattr(im, "n_frames", 1)
        src_w, src_h = im.size
        scale = min(1.0, max_edge / float(max(src_w, src_h)))
        frames, durations = [], []
        for i in range(n):
            im.seek(i)
            fr = im.convert("RGBA")
            if scale < 1.0:
                fr = fr.resize(
                    (max(1, round(src_w * scale)), max(1, round(src_h * scale))),
                    Image.LANCZOS,
                )
            frames.append(fr.copy())
            durations.append(max(20, int(im.info.get("duration", 80) or 80)))
    if len(frames) > 1:
        frames[0].save(
            dst, "WEBP", save_all=True, append_images=frames[1:],
            duration=durations, loop=0, quality=80, method=4,
        )
    else:
        frames[0].save(dst, "WEBP", quality=80, method=5)
    return {
        "width": frames[0].size[0], "height": frames[0].size[1],
        "source_width": src_w, "source_height": src_h,
        "frames": len(frames), "animated": len(frames) > 1,
    }


# --------------------------------------------------------------------------
# 视频处理
# --------------------------------------------------------------------------


def probe_duration(path: str) -> float:
    """取时长（秒）。webm 容器常缺 duration，退回解码探测。"""
    try:
        r = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "default=nw=1:nk=1", path],
            capture_output=True, text=True, timeout=60,
        )
        v = (r.stdout or "").strip()
        if v and v != "N/A":
            return float(v)
    except Exception:
        pass
    try:
        r = subprocess.run(
            ["ffprobe", "-v", "error", "-select_streams", "v:0",
             "-count_packets", "-show_entries", "stream=nb_read_packets,r_frame_rate",
             "-of", "json", path],
            capture_output=True, text=True, timeout=300,
        )
        s = json.loads(r.stdout or "{}")["streams"][0]
        num, den = (s.get("r_frame_rate") or "24/1").split("/")
        fps = float(num) / float(den or 1)
        return float(s["nb_read_packets"]) / max(fps, 1.0)
    except Exception:
        return 0.0


def encode_video(src: str, dst: str, max_edge: int) -> dict:
    """ffmpeg 转 VP9/WebM，确保 ≤ VIDEO_MAX_BYTES；超限则按目标码率二次编码。"""
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    dur = probe_duration(src)

    def run(crf: str, maxrate: str | None) -> bool:
        cmd = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", src,
               "-vf", f"scale='if(gt(iw,ih),min({max_edge},iw),-2)':'if(gt(iw,ih),-2,min({max_edge},ih))'",
               "-c:v", "libvpx-vp9", "-crf", crf, "-b:v", "0",
               "-deadline", "good", "-cpu-used", "4", "-row-mt", "1",
               "-pix_fmt", "yuv420p", "-auto-alt-ref", "0"]
        if maxrate:
            cmd += ["-maxrate", maxrate, "-bufsize", maxrate]
        cmd += ["-c:a", "libopus", "-b:a", "96k", "-ac", "2", "-f", "webm", dst]
        r = subprocess.run(cmd, capture_output=True, text=True)
        if r.returncode != 0:
            sys.stderr.write((r.stderr or "")[-600:])
            return False
        return True

    if not run("34", None):
        raise RuntimeError("ffmpeg 首次编码失败")
    size = os.path.getsize(dst)
    if size <= VIDEO_MAX_BYTES:
        return {"duration": round(dur, 2), "video_pass": "crf34"}

    # 超限：用时长算目标码率再压一档
    d = dur or probe_duration(dst) or 0
    if d <= 0:
        raise RuntimeError("无法获得时长，且首次编码超出预算")
    target = int(VIDEO_MAX_BYTES * 8 * 0.85 / d)
    if not run("40", f"{max(250_000, target)}"):
        raise RuntimeError("ffmpeg 二次编码失败")
    size = os.path.getsize(dst)
    if size > VIDEO_MAX_BYTES:
        raise RuntimeError(f"视频仍超预算：{human_size(size)}")
    return {"duration": round(dur, 2), "video_pass": "crf40-capped"}


# --------------------------------------------------------------------------
# 单文件 worker（供进程池调用）
# --------------------------------------------------------------------------


def is_animated(path: str) -> bool:
    """源文件是否多帧（动态 WebP 也要走动画编码，否则动画会丢）。"""
    try:
        with Image.open(path) as im:
            return getattr(im, "n_frames", 1) > 1
    except Exception:
        return False


def process_one(job: dict) -> dict:
    src = job["src"]
    dst = job["dst"]
    ext = job["ext"]
    category = job["category"]
    quality, max_edge = PROFILES.get(category, (80, 1600))

    if ext in VECTOR_EXT:
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        shutil.copyfile(src, dst)
        return {"ok": True, "bytes": os.path.getsize(dst), "kind": "vector"}

    if ext in GIF_EXT or is_animated(src):
        info = encode_animated(src, dst, max_edge)
        return {"ok": True, "bytes": os.path.getsize(dst), "kind": "animated", **info}

    if ext in VIDEO_EXT:
        info = encode_video(src, dst, VIDEO_MAX_EDGE)
        return {"ok": True, "bytes": os.path.getsize(dst), "kind": "video", **info}

    keep_alpha = category in ("characters", "logo", "artworks", "emoji")
    info = encode_image(src, dst, quality, max_edge, keep_alpha)
    return {"ok": True, "bytes": os.path.getsize(dst), "kind": "image", **info}


# --------------------------------------------------------------------------
# 主流程
# --------------------------------------------------------------------------


def build_jobs(src_root: str, out_root: str, only: set | None) -> tuple:
    """扫描源目录，规划所有输出任务。返回 (jobs, skipped, total_src_bytes)。"""
    jobs: list = []
    skipped: list = []
    total_src = 0
    # 每个输出目录一个递增计数器，保证稳定 ASCII 编号
    counters: dict = {}

    for root, dirs, files in os.walk(src_root):
        dirs.sort()
        for f in sorted(files):
            src_path = os.path.join(root, f)
            rel = os.path.relpath(src_path, src_root)
            parts = [decode_escapes(p) for p in rel.split(os.sep)]
            decoded_name = parts[-1]
            rel_decoded = "/".join(parts)
            ext = os.path.splitext(decoded_name)[1].lower()

            category = classify(parts[0] if parts else "", parts)
            if only and category not in only:
                continue

            reason = should_skip(rel_decoded, ext, category)
            if reason:
                skipped.append({"source": rel_decoded, "reason": reason,
                                "bytes": os.path.getsize(src_path)})
                continue

            _, rel_dir, label, meta = plan_output(parts, decoded_name)

            # 扩展名：光栅/GIF → webp；矢量保持；视频 → webm
            if ext in RASTER_EXT or ext in GIF_EXT:
                out_ext = ".webp"
            elif ext in VECTOR_EXT:
                out_ext = ".svg"
            elif ext in VIDEO_EXT:
                out_ext = ".webm"
            else:
                skipped.append({"source": rel_decoded, "reason": "unsupported-ext",
                                "bytes": os.path.getsize(src_path)})
                continue

            n = counters.get(rel_dir, 0) + 1
            counters[rel_dir] = n
            stem = f"{n:02d}" + (f"-{label}" if label else "")
            filename = stem + out_ext
            rel_out = f"{rel_dir}/{filename}"
            dst_path = os.path.join(out_root, rel_out)

            src_size = os.path.getsize(src_path)
            total_src += src_size

            entry = OrderedDict()
            entry["path"] = f"assets/{rel_out}"
            entry["category"] = category
            entry["index"] = n
            entry["source"] = rel.replace(os.sep, "/")
            entry["source_name"] = decoded_name
            entry["source_bytes"] = src_size
            entry.update({k: v for k, v in meta.items() if v})

            jobs.append({
                "src": src_path, "dst": dst_path, "ext": ext,
                "category": category, "entry": entry,
            })

    return jobs, skipped, total_src


def main() -> int:
    ap = argparse.ArgumentParser(description="GBC 资产整理与优化管线")
    ap.add_argument("--src", default=DEFAULT_SRC)
    ap.add_argument("--out", default=DEFAULT_OUT)
    ap.add_argument("--only", nargs="*", default=None, choices=CATEGORIES)
    ap.add_argument("--clean", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--workers", type=int, default=max(1, min(4, (os.cpu_count() or 2))))
    args = ap.parse_args()

    src_root = os.path.abspath(args.src)
    out_root = os.path.abspath(args.out)
    if not os.path.isdir(src_root):
        log(f"[fatal] 源目录不存在: {src_root}")
        return 2

    started = time.time()
    only = set(args.only) if args.only else None
    jobs, skipped, total_src = build_jobs(src_root, out_root, only)
    log(f"[plan] 待处理 {len(jobs)} 个，跳过 {len(skipped)} 个，源 {human_size(total_src)}")

    if args.dry_run:
        by_cat: dict = {}
        for j in jobs:
            by_cat.setdefault(j["category"], []).append(j["entry"]["path"])
        for c in CATEGORIES:
            if c in by_cat:
                log(f"  {c:<10} {len(by_cat[c]):>4} 个   例：{by_cat[c][0]}")
        log(f"  跳过原因分布：{ {r: sum(1 for s in skipped if s['reason']==r) for r in sorted({s['reason'] for s in skipped})} }")
        return 0

    if args.clean and os.path.isdir(out_root):
        log(f"[clean] 清空 {out_root}")
        shutil.rmtree(out_root)
    os.makedirs(out_root, exist_ok=True)
    for c in CATEGORIES:
        os.makedirs(os.path.join(out_root, c), exist_ok=True)

    manifest = OrderedDict((c, []) for c in CATEGORIES)
    failures: list = []
    done = 0

    with ProcessPoolExecutor(max_workers=args.workers) as pool:
        futures = {pool.submit(process_one, j): j for j in jobs}
        for fut in as_completed(futures):
            job = futures[fut]
            entry = job["entry"]
            try:
                res = fut.result()
            except Exception as e:  # 单文件失败不中断管线
                failures.append({"source": entry["source"], "error": str(e)[:300]})
                log(f"[warn] 失败 {entry['source']}: {str(e)[:160]}")
                continue
            entry["bytes"] = res.pop("bytes")
            entry["kind"] = res.pop("kind")
            entry.update({k: v for k, v in res.items() if v is not None})
            manifest[entry["category"]].append(entry)
            done += 1
            if done % 50 == 0:
                log(f"  ... {done}/{len(jobs)}（{time.time()-started:.0f}s）")

    for c in CATEGORIES:
        manifest[c].sort(key=lambda e: e["path"])

    summary = OrderedDict()
    for c in CATEGORIES:
        files = manifest[c]
        summary[c] = {
            "files": len(files),
            "bytes": sum(f.get("bytes", 0) for f in files),
            "source_bytes": sum(f.get("source_bytes", 0) for f in files),
        }

    total_bytes = sum(summary[c]["bytes"] for c in CATEGORIES)
    doc = OrderedDict()
    doc["generated_by"] = "scripts/optimize-assets.py"
    doc["generated_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    doc["settings"] = {
        "profiles": {k: {"quality": v[0], "max_edge": v[1]} for k, v in PROFILES.items()},
        "video_max_bytes": VIDEO_MAX_BYTES,
        "video_max_edge": VIDEO_MAX_EDGE,
        "skipped_dirs": list(SKIP_DIR_PATTERNS),
    }
    doc["totals"] = {
        "files": sum(summary[c]["files"] for c in CATEGORIES),
        "bytes": total_bytes,
        "source_bytes": total_src,
        "skipped": len(skipped),
        "failed": len(failures),
        "elapsed_sec": round(time.time() - started, 1),
    }
    doc["summary"] = summary
    doc["characters"] = CHARACTERS
    doc["skipped"] = skipped
    doc["failures"] = failures
    doc["categories"] = manifest

    manifest_path = os.path.join(out_root, "manifest.json")
    with open(manifest_path, "w", encoding="utf-8") as fh:
        json.dump(doc, fh, ensure_ascii=False, indent=2, default=str)

    log("")
    log("=" * 66)
    log(f"完成：{doc['totals']['files']} 个文件，输出 {human_size(total_bytes)}"
        f"（源 {human_size(total_src)}），跳过 {len(skipped)}，失败 {len(failures)}，"
        f"耗时 {doc['totals']['elapsed_sec']}s")
    for c in CATEGORIES:
        s = summary[c]
        if s["files"]:
            log(f"  {c:<10} {s['files']:>4} 个  {human_size(s['bytes']):>9}"
                f"   (源 {human_size(s['source_bytes'])})")
    log(f"  manifest: {manifest_path} ({human_size(os.path.getsize(manifest_path))})")
    log("=" * 66)
    return 0 if not failures else 1


if __name__ == "__main__":
    raise SystemExit(main())
