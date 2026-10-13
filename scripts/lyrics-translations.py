#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
lyrics-translations.py — 抓取官方中文翻译（网易云 tlyric）并写进歌词数据
=====================================================================

数据源
------
/workspace/GBC-all-lyrics-lrc.txt 每首段落头部有 `# 来源: 网易云音乐 id=NNN`，
用这个 id 调 `https://music.163.com/api/song/lyric?id=NNN&lv=-1&tv=-1`，
返回的 `tlyric.lyric` 就是**带时间戳的官方中文翻译**（网易云译者投稿）。

对齐方式
--------
tlyric 的时间戳与 lrc 完全一致，而站内每行的 `times[i]` 就是从 lrc 来的，
所以直接按时间戳配对（容差 20ms）即可，不需要再做文本对齐。
插值出来的行（没有 lrc 锚点）没有对应译文，留空字符串。

产物
----
src/data/lyrics/NN.json 新增 `zh: string[]`（与 lines 等长，缺译为 ""）
原始响应缓存到 content/tlyric-raw.json，重复执行不再打网络。

用法
----
    python3 scripts/lyrics-translations.py [--refresh]
"""

import json
import re
import sys
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LRC_PATH = Path("/workspace/GBC-all-lyrics-lrc.txt")
CACHE = ROOT / "content/tlyric-raw.json"
API = "https://music.163.com/api/song/lyric?id={}&lv=-1&tv=-1&kv=-1"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36"
TS_RE = re.compile(r"^\[(\d+):(\d+\.\d+)\](.*)$")


def parse_lrc_ts(text):
    """LRC 文本 → [(秒, 文本)]"""
    out = []
    for line in text.splitlines():
        m = TS_RE.match(line.strip())
        if not m:
            continue
        out.append((int(m.group(1)) * 60 + float(m.group(2)), m.group(3).strip()))
    return out


def song_ids():
    """LRC 文件里每首歌的 (段名, 网易云 id)"""
    raw = LRC_PATH.read_text(encoding="utf-8")
    out = []
    for chunk in re.split(r"^={20,}$", raw, flags=re.M):
        m = re.search(r"^【(.+?)】\s*$", chunk, flags=re.M)
        if not m:
            continue
        idm = re.search(r"网易云音乐 id=(\d+)", chunk)
        out.append((m.group(1).strip(), idm.group(1) if idm else None))
    return out


def fetch(sid, refresh=False):
    cache = json.loads(CACHE.read_text(encoding="utf-8")) if CACHE.exists() else {}
    if sid in cache and not refresh:
        return cache[sid]
    req = urllib.request.Request(API.format(sid), headers={"User-Agent": UA, "Referer": "https://music.163.com/"})
    with urllib.request.urlopen(req, timeout=25) as r:
        data = json.loads(r.read().decode("utf-8"))
    cache[sid] = data
    CACHE.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf-8")
    time.sleep(0.4)
    return data


def norm_title(s):
    import unicodedata
    s = unicodedata.normalize("NFKC", s)
    for ch in "〜～~":
        s = s.replace(ch, "")
    return re.sub(r"[\s　·・:：\-–—/／\\'\"“”‘’()（）\[\]【】!！?？.。,，]", "", s).lower()


def main():
    refresh = "--refresh" in sys.argv
    ids = {norm_title(t): i for t, i in song_ids() if i}
    songs = json.loads((ROOT / "src/data/songs.json").read_text(encoding="utf-8"))
    total = hit = 0
    for song in songs:
        path = ROOT / f"src/data/lyrics/{song['n']:02d}.json"
        doc = json.loads(path.read_text(encoding="utf-8"))
        sid = ids.get(norm_title(song["title"]))
        if not sid and norm_title(song["title"]) == "arrow":
            sid = ids.get("箭")
        if not sid:
            print(f"  n={song['n']:2d} {song['title'][:22]:24s} 无网易云 id")
            continue
        tl = parse_lrc_ts((fetch(sid, refresh).get("tlyric") or {}).get("lyric") or "")
        # 时间戳 → 译文
        by_t = {}
        for t, txt in tl:
            if txt and not txt.startswith("["):
                by_t.setdefault(round(t, 2), txt)
        zh = []
        for t in doc.get("times") or []:
            zh.append(by_t.get(round(t, 2), ""))
        got = sum(1 for x in zh if x)
        total += len(zh)
        hit += got
        doc["zh"] = zh
        path.write_text(json.dumps(doc, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        print(f"  n={song['n']:2d} {song['title'][:22]:24s} 译文 {got}/{len(zh)}")
    print(f"合计：{hit}/{total} 行有中文译文（{hit/max(1,total)*100:.1f}%）")


if __name__ == "__main__":
    main()
