#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
lyrics-krc-chars.py — 把酷狗 KRC 的**逐字**时间轴写进站内歌词
==============================================================

背景
----
在这之前，"唱到哪个字哪个字变红"是靠**行内线性推算**：
    sweep = min(行时长*0.85, max(0.9, 字数*0.17))
也就是说每首歌、每一行的扫红速度都是猜的，遇到拖长音/切分快的行就对不上。

/workspace/gbc-lyrics/output/*.json 是酷狗 KRC 解密解压后的逐字数据：
    [{ "ls": 行起始ms, "ld": 行时长ms,
       "chars": [[字相对起始ms, 字时长ms, "字或词"], ...],
       "plain": "该行文本" }, ...]

做法
----
1. 按标题归一化把 KRC 与站内曲目对上（复用 lyrics-lrc-align.py 的 norm/sim，
   含 arrow ↔ 箭 这类异名）
2. 动态规划做**单调对齐**（KRC 行 ↔ 站内行），因为两边断句不同
3. 每个 KRC 词条按字符数均分它的时长 → 得到 KRC 文本的逐字时长
4. 再用 SequenceMatcher 把 KRC 文本映射到站内文本（站内偶有空格/标点差异），
   站内多出来的字（如全角空格）补一个默认时长
5. 写进 JSON 新字段 `kch`：**每个字相对「本行起始」的偏移（厘秒整数，逗号分隔）**，
   顺序与 lines[i] 一一对应，例 "0,50,70,88,107,139,162,192,215"
   —— 只存"什么时候开始变红"一个数，体积最小；运行时数一数有多少个偏移 ≤ 已播时长
   就知道该红几个字。

为什么是「相对站内行起始」而不是「KRC 行内相对时长」
--------------------------------------------------
两套来源（站内 times 来自网易云 LRC，KRC 来自酷狗）的**行起始**本身有
每首 100~500ms 不等的差异（各自都是人工打轴）。所以这里把 KRC 的**绝对**逐字
时间换算到站内行起始上：
    kch[k] = (KRC行起始 + 第k字相对偏移) - 站内times[i]
好处是行级高亮完全沿用站内已验证的时间轴（不产生回归），而扫红用的是
KRC 的真实节奏与真实起始（不再是猜的速度）。偏移为负的钳到 0。

幂等：可重复执行，每次全量重写 kch 字段（文本与 times 不动）。

用法
----
    python3 scripts/lyrics-krc-chars.py [KRC目录]
    # 默认 /workspace/gbc-lyrics/output
"""

import difflib
import json
import re
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LYR = ROOT / "src/data/lyrics"
KRC_DIR = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("/workspace/gbc-lyrics/output")

# 站内标题 → KRC 文件名 的异名映射（KRC 用的是官方曲名，站内偶有简写）
ALIAS = {"arrow": "箭"}


def norm(s: str) -> str:
    """标题/行文本归一化：全半角、装饰符号、大小写全部抹平后比较。"""
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


def load_krc():
    out = {}
    for f in sorted(KRC_DIR.glob("*.json")):
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
        except Exception:
            continue
        if isinstance(data, list) and data and isinstance(data[0], dict) and "chars" in data[0]:
            out[f.stem] = data
    return out


def pick_krc(title: str, krc: dict):
    """标题归一化匹配；先精确后相似度，再走异名表。"""
    t = norm(title)
    for name, data in krc.items():
        if norm(name) == t:
            return name, data
    alias = ALIAS.get(norm(title))
    if alias:
        for name, data in krc.items():
            if norm(name) == norm(alias):
                return name, data
    best, score = None, 0.0
    for name, data in krc.items():
        s = sim(title, name)
        if s > score:
            best, score = name, s
    return (best, krc[best]) if score >= 0.6 else (None, None)


def krc_char_times(krc_lines):
    """KRC 全曲逐字绝对时间（ms）：[(abs_ms, char), ...]（多字词条按字数均分）"""
    out = []
    for L in krc_lines:
        for rel, dur, text in L["chars"]:
            text = text.replace("\r", "")
            if not text:
                continue
            for k, ch in enumerate(text):
                out.append((L["ls"] + rel + dur * k / len(text), ch))
    return out


def align_song(our_lines, our_times, krc_lines):
    """整曲字符级对齐 → 每行每个字的绝对起始时间（ms）。

    先做整曲对齐（而不是逐行对齐）：站内有些行把 KRC 的 2~3 行合并了，
    逐行匹配会只取到其中一行、剩下的字没有时间。整曲对齐天然处理合并/拆分。
    """
    ktimes = krc_char_times(krc_lines)
    kstr = "".join(c for _, c in ktimes)
    # 站内字符序列（记录它属于哪一行）
    ostr, owner = "", []
    for i, line in enumerate(our_lines):
        for ch in line:
            ostr += ch
            owner.append(i)

    res = [None] * len(ostr)
    sm = difflib.SequenceMatcher(None, ostr, kstr, autojunk=False)
    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        if tag == "equal":
            for k in range(i2 - i1):
                res[i1 + k] = ktimes[j1 + k][0]

    # 未命中的字（站内有而 KRC 没有：空格、标点差异）→ 用左右邻居线性插值
    n = len(res)
    known = [k for k in range(n) if res[k] is not None]
    if not known:
        return None, 0.0
    for k in range(n):
        if res[k] is not None:
            continue
        left = max((x for x in known if x < k), default=None)
        right = min((x for x in known if x > k), default=None)
        if left is None:
            res[k] = res[right]
        elif right is None:
            res[k] = res[left]
        else:
            res[k] = res[left] + (res[right] - res[left]) * (k - left) / (right - left)

    # 行内单调化（对齐偶发跳变时保证不会倒着变红）
    out = {}
    for k in range(n):
        i = owner[k]
        out.setdefault(i, []).append(res[k])
    for i, arr in out.items():
        base = our_times[i] * 1000
        run = 0.0
        mono = []
        for v in arr:
            run = max(run, v - base)
            mono.append(max(0, run))
        out[i] = mono
    hit = len(known) / n if n else 0.0
    return out, hit


def main() -> int:
    krc = load_krc()
    if not krc:
        print(f"× 没在 {KRC_DIR} 找到 KRC json")
        return 1
    print(f"KRC 曲目 {len(krc)} 首\n")

    stats = []
    for n in range(1, 39):
        f = LYR / f"{n:02d}.json"
        if not f.exists():
            continue
        doc = json.loads(f.read_text(encoding="utf-8"))
        title = doc["title"]
        times = doc.get("times")
        lines = doc["lines"]
        if not times:
            print(f"  n={n:2d} {title[:22]:22s} 跳过（无行级时间轴）")
            continue
        name, data = pick_krc(title, krc)
        if not data:
            print(f"  n={n:2d} {title[:22]:22s} 跳过（KRC 里没有这首）")
            continue

        per_line, hit_rate = align_song(lines, times, data)
        if not per_line:
            print(f"  n={n:2d} {title[:22]:22s} 跳过（字符级对齐失败）")
            continue

        kch, chars = [], 0
        for i, line in enumerate(lines):
            offs = per_line.get(i)
            if not offs:
                kch.append("")
                continue
            # 偏移不能超过本行长度太多（KRC 多出来的尾巴截掉）
            offs = offs[: len(line)]
            kch.append(",".join(str(int(round(v / 10))) for v in offs))
            chars += len(offs)

        # 行起始差异（KRC vs 站内）：只用于报告
        deltas = []
        for i, arr in per_line.items():
            if arr:
                deltas.append((arr[0] + times[i] * 1000) - times[i] * 1000)
        doc["kch"] = kch
        f.write_text(json.dumps(doc, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        covered = sum(1 for k in kch if k)
        stats.append((n, title, name, len(lines), covered, chars, hit_rate, 0.0))
        print(
            f"  n={n:2d} {title[:20]:20s} ← {name[:22]:22s} "
            f"行 {covered:2d}/{len(lines):2d} 字 {chars:4d} 字符命中 {hit_rate*100:5.1f}%"
        )

    tot_chars = sum(s[5] for s in stats)
    tot_lines = sum(s[4] for s in stats)
    print(f"\n合计：{len(stats)} 首 / {tot_lines} 行带逐字 / {tot_chars} 字")
    print(f"新增字段体积 ≈ {tot_chars * 3.2 / 1024:.0f} KB（原始 JSON）")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
