#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
lyrics-lrc-align.py — 把官方 LRC 时间轴对齐到站内歌词文本
==========================================================

背景
----
站内歌词（src/data/lyrics/*.json）的文本来自人工收集的官方歌词页，
但**没有时间轴**，早期靠「等距估算」（整首时长 ÷ 行数）来高亮，
后果是高亮整体抢跑：例如 碧いif 首句其实在 13.477s，
等距估算会从 0s 就开始高亮，整首歌都错一句。

输入 LRC（/workspace/GBC-all-lyrics-lrc.txt）是网易云的标准 LRC：
逐行时间戳（**不是**逐字，没有 <mm:ss.xxx> 内联标记），
1751 行 / 38 首。它按乐句切分，与站内文本行数不一致
（站内版本把乐句合并了），所以不能按下标硬套，必须做对齐。

做法
----
1. 解析 LRC 段落，剔除 作词/作曲/编曲 元数据行与纯空行
2. 按标题归一化匹配站内曲目（含 arrow ↔ 箭 这类异名）
3. 动态规划做**单调对齐**（Needleman-Wunsch 风格）：
   匹配得分 = 行文本相似度×2-0.4，跳过得 -0.7，相似度 <0.34 不允许匹配
4. 未对齐的行按前后已对齐邻居线性插值，再做单调化（保证时间递增）
5. **文本不动**（站内收集版更干净：LRC 里有 抜け殼/じや/せがい/疑神暗鬼
   这类错字），只把时间戳写进 JSON 的新字段 `times`

跳过规则
--------
· LRC 末行时间 < 曲长×0.6 → 判定为 short ver.，保留等距估算
  （例：n=8 さよならあの日のメロディ，网易云只有 4 行/15.5s 的 short ver.，
   站内是 267s 完整版）
· 对齐率 < 50% → 判定匹配错歌，保留等距估算

用法
----
    python3 scripts/lyrics-lrc-align.py [LRC路径]
    # 默认读 /workspace/GBC-all-lyrics-lrc.txt
    # 幂等：可重复执行，每次全量重写 times 字段

之后需要 `pnpm build` 才会生效（PlayerBar.astro 构建期读取这些 JSON
内联进页面）。
"""

import difflib
import json
import re
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LRC_PATH = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("/workspace/GBC-all-lyrics-lrc.txt")
META_RE = re.compile(r"^(作词|作曲|编曲|作詞|編曲|翻译|翻譯)\s*[:：]")
TS_RE = re.compile(r"^\[(\d+):(\d+\.\d+)\]\s?(.*)$")


def norm(s: str) -> str:
    """标题/行文本归一化：全半角、装饰性符号、大小写全部抹平后比较。"""
    s = unicodedata.normalize("NFKC", s)
    for ch in "〜～~":
        s = s.replace(ch, "")
    s = re.sub(r"[\s　·・:：\-–—/／\\'\"“”‘’()（）\[\]【】!！?？.。,，]", "", s)
    return s.lower()


def sim(a: str, b: str) -> float:
    a, b = norm(a), norm(b)
    if not a or not b:
        return 0.0
    if a == b:
        return 1.0
    return difflib.SequenceMatcher(None, a, b).ratio()


def parse_lrc(path: Path):
    raw = path.read_text(encoding="utf-8")
    out = []
    for chunk in re.split(r"^={20,}$", raw, flags=re.M):
        m = re.search(r"^【(.+?)】\s*$", chunk, flags=re.M)
        if not m:
            continue
        lines = []
        for line in chunk.splitlines():
            mm = TS_RE.match(line)
            if not mm:
                continue
            t = int(mm.group(1)) * 60 + float(mm.group(2))
            txt = mm.group(3).strip()
            if not txt or META_RE.match(txt):
                continue
            lines.append((t, txt))
        out.append({"title": m.group(1).strip(), "lines": lines})
    return out


def align(mine, lrc):
    """单调对齐，返回 {站内行下标: LRC 行下标}。"""
    n, m = len(mine), len(lrc)
    NEG = -1e9
    dp = [[NEG] * (m + 1) for _ in range(n + 1)]
    bk = [[0] * (m + 1) for _ in range(n + 1)]
    dp[0][0] = 0
    for i in range(n + 1):
        for j in range(m + 1):
            if i == 0 and j == 0:
                continue
            best, arg = NEG, 0
            if i and j:
                s = sim(mine[i - 1], lrc[j - 1][1])
                if s >= 0.34 and dp[i - 1][j - 1] + s * 2 - 0.4 > best:
                    best, arg = dp[i - 1][j - 1] + s * 2 - 0.4, 1
            if i and dp[i - 1][j] - 0.7 > best:
                best, arg = dp[i - 1][j] - 0.7, 2
            if j and dp[i][j - 1] - 0.7 > best:
                best, arg = dp[i][j - 1] - 0.7, 3
            dp[i][j], bk[i][j] = best, arg
    i, j, pairs = n, m, []
    while i or j:
        a = bk[i][j]
        if a == 1:
            pairs.append((i - 1, j - 1)); i, j = i - 1, j - 1
        elif a == 2:
            pairs.append((i - 1, -1)); i -= 1
        else:
            j -= 1
    return {a: b for a, b in reversed(pairs) if a >= 0 and b >= 0}


def main() -> int:
    if not LRC_PATH.exists():
        print(f"找不到 LRC 文件：{LRC_PATH}")
        return 1
    lrc_songs = parse_lrc(LRC_PATH)
    site = json.loads((ROOT / "src/data/songs.json").read_text(encoding="utf-8"))

    def find(song):
        k = norm(song["title"])
        for s in lrc_songs:
            if norm(s["title"]) == k:
                return s
        for s in lrc_songs:
            if k and (k in norm(s["title"]) or norm(s["title"]) in k):
                return s
        if k == "arrow":  # 站内名 arrow / LRC 名 箭
            for s in lrc_songs:
                if norm(s["title"]) == "箭":
                    return s
        return None

    ok, skipped = 0, []
    for song in site:
        n = song["n"]
        path = ROOT / f"src/data/lyrics/{n:02d}.json"
        doc = json.loads(path.read_text(encoding="utf-8"))
        mine = [x for x in doc["lines"] if x.strip()]
        dur = song.get("dur") or 180
        sec = find(song)
        if not sec:
            skipped.append((n, song["title"], "无对应 LRC 段"))
            continue
        lrc = sec["lines"]
        if not lrc or lrc[-1][0] < dur * 0.6:
            skipped.append((n, song["title"], f"LRC 覆盖不足（末 {lrc[-1][0] if lrc else 0:.0f}s / 曲长 {dur}s）"))
            continue
        mp = align(mine, lrc)
        if len(mp) < len(mine) * 0.5:
            skipped.append((n, song["title"], f"对齐率过低 {len(mp)}/{len(mine)}"))
            continue
        times = [None] * len(mine)
        for i, j in mp.items():
            times[i] = lrc[j][0]
        known = [i for i, t in enumerate(times) if t is not None]
        for i in range(len(mine)):
            if times[i] is not None:
                continue
            prev = [k for k in known if k < i]
            nxt = [k for k in known if k > i]
            if prev and nxt:
                a, b = prev[-1], nxt[0]
                times[i] = times[a] + (times[b] - times[a]) * (i - a) / (b - a)
            elif prev:
                a = prev[-1]
                times[i] = times[a] + (i - a) * (dur - times[a]) / (len(mine) - a)
            else:
                b = nxt[0]
                times[i] = max(0.0, times[b] - (b - i) * (times[b] / max(1, b)))
        for i in range(1, len(times)):
            if times[i] <= times[i - 1] + 0.25:
                times[i] = times[i - 1] + 0.25
        doc["lines"] = mine
        doc["times"] = [round(t, 3) for t in times]
        path.write_text(json.dumps(doc, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        ok += 1

    print(f"写入时间轴：{ok}/{len(site)} 首")
    for n, title, why in skipped:
        print(f"  跳过 n={n:2d} {title[:24]:26s} {why}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
