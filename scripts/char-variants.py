#!/usr/bin/env python3
"""立绘多尺寸变体（@240w / @480w / @800w），供 <img srcset> 使用。

为什么需要
----------
角色页每位角色下方是一整条立绘缩略图带（5 人共 209 张 <img>）。原图长边
1600px，而缩略图元素只有 132~150 CSS px（contain 后内容更窄）。实测：

  1600px 交给浏览器降采样 → 与理想参考 RMSE 19.65，单张 74.8K
  预先 LANCZOS 缩到合适尺寸 → RMSE 16.78（更接近理想），单张 12K

也就是"预生成小图"既更清晰又省 84% 流量。手机滚一遍角色页原本要下十几 MB。

**按宽度切，不按长边**：srcset 的 `w` 描述符比的是图片**宽度**，而 249 张立绘
里 158 张宽高比 <0.5（瘦高，中位 0.43）。若按长边 400px 切，瘦高图只有 154px
宽，浏览器按 `sizes × DPR` 一算就跳过它去拿原图了。

实现要点
--------
* **从源 PNG 生成**（读 public/assets/manifest.json 里记录的 source 路径），
  不拿现有 webp 再压一遍——那是二次有损。
* 参数与 optimize-assets.py 一致：quality=80、method=5；
  alpha 用 Pillow 默认（alpha_quality=100，无损），立绘边缘不做有损 alpha。
* 源图长边本来就小于目标尺寸时跳过（不放大）。
* 结果写进 public/assets/char-variants.json，模板据此拼 srcset；
  文件缺失时模板自动退回单图，不会构建失败。

用法：python3 scripts/char-variants.py [--src /workspace/gbcc/gbc/gbc] [--force]
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_SRC = "/workspace/gbcc/gbc/gbc"
MANIFEST = ROOT / "public/assets/manifest.json"
OUT_INDEX = ROOT / "public/assets/char-variants.json"
ESCAPE_RE = re.compile(r"#U([0-9a-fA-F]{4})")
WIDTHS = (240, 480, 800)    # 缩略图带 / 大图 / 高分屏大图（按图片宽度）
QUALITY = 80
MIN_GAIN = 1.05             # 变体比现有文件小不到 5% 就不生成


def decode_name(name: str) -> str:
    """把 #U4f7f#U7528 形式的转义名还原为真实 Unicode。"""
    if "#U" not in name:
        return name
    return ESCAPE_RE.sub(lambda m: chr(int(m.group(1), 16)), name)


def variant_size(sw: int, sh: int, target_w: int) -> tuple[int, int]:
    """按目标宽度等比缩放；高度四舍五入。"""
    return target_w, max(1, round(sh * target_w / float(sw)))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", default=DEFAULT_SRC)
    ap.add_argument("--force", action="store_true", help="已有变体也重新生成")
    args = ap.parse_args()

    if not MANIFEST.exists():
        print(f"找不到 {MANIFEST}，先跑 scripts/optimize-assets.py", file=sys.stderr)
        return 1

    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    entries = manifest.get("categories", {}).get("characters", [])
    src_root = Path(args.src)

    index: dict[str, list[dict]] = {}
    made = skipped = missing = 0
    bytes_new = bytes_src = 0
    t0 = time.time()

    for i, e in enumerate(entries, 1):
        if not e.get("ok") or e.get("kind") != "image":
            continue
        out_path = ROOT / "public" / e["path"]
        src_path = src_root / decode_name(e["source"])
        if not src_path.exists():
            missing += 1
            print(f"  ! 源图缺失: {e['source_name']}")
            continue

        sw, sh = e["source_width"], e["source_height"]
        cur_edge = max(e["width"], e["height"])
        variants: list[dict] = []
        with Image.open(src_path) as im:
            im.load()
            has_alpha = im.mode in ("RGBA", "LA") or (
                im.mode == "P" and "transparency" in im.info
            )
            for W in WIDTHS:
                if sw <= W * MIN_GAIN:
                    continue                      # 源图本来就没这么宽，不放大
                vw, vh = variant_size(sw, sh, W)
                if max(vw, vh) >= cur_edge * 0.98:
                    continue                      # 变体不比现有文件小，没意义
                vpath = out_path.with_name(f"{out_path.stem}@{W}w.webp")
                rel = vpath.relative_to(ROOT / "public").as_posix()
                if vpath.exists() and not args.force:
                    variants.append({"target": W, "path": rel, "width": vw, "height": vh})
                    skipped += 1
                    continue
                out = im.convert("RGBA") if has_alpha else im.convert("RGB")
                out = out.resize((vw, vh), Image.LANCZOS)
                if has_alpha:
                    out.save(vpath, "WEBP", quality=QUALITY, method=5, exact=False)
                else:
                    out.save(vpath, "WEBP", quality=QUALITY, method=5)
                variants.append({"target": W, "path": rel, "width": vw, "height": vh})
                made += 1
                bytes_new += vpath.stat().st_size
        if variants:
            index[e["path"]] = variants
            bytes_src += e.get("bytes", 0)
        if i % 25 == 0:
            print(f"  … {i}/{len(entries)}  {time.time()-t0:.0f}s")

    OUT_INDEX.write_text(
        json.dumps(
            {
                "generated_by": "scripts/char-variants.py",
                "widths": list(WIDTHS),
                "quality": QUALITY,
                "note": "由 optimize-assets.py 的 manifest 反查源图生成；模板用 <img srcset> 消费",
                "variants": index,
            },
            ensure_ascii=False,
            indent=1,
        )
        + "\n",
        encoding="utf-8",
    )

    print(
        f"\n完成：{made} 个新变体（复用 {skipped}），覆盖 {len(index)} 张立绘，"
        f"源图缺失 {missing}，用时 {time.time()-t0:.0f}s"
    )
    if made:
        print(f"新变体合计 {bytes_new/1048576:.2f} MB（对应的原图合计 {bytes_src/1048576:.2f} MB）")
    print(f"索引写入 {OUT_INDEX.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
