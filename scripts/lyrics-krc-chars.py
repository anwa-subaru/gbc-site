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

顺带修「插值假时间」
------------------
站内 times 来自网易云 LRC，站内文本来自 j-lyric，两边**断句不同**：
站内把 LRC 的两行并成一行时，这行会取到后半句的时间（偏晚约 3s）；
把一行拆成两行时，拆出来的行只能插值（能偏几秒到十几秒）。
判据：|KRC行起始 − 站内times| > 0.8s（实测 37 首的 |中位差| 全部 ≤0.49s、
MAD ≤0.22s，所以超过 0.8s 的必是断句产物）。这类行直接用 KRC 的第一字时间
修正 times，行高亮与扫红一起变准。修正后再重基准，首字偏移自然从 0 开始。
只想重算逐字、不想动 times 时把 FIX_THRESHOLD 调大即可。

幂等：可重复执行，每次全量重写 kch（并修正上面那类行时间）；文本不动。

用法
----
    python3 scripts/lyrics-krc-chars.py [KRC目录]
    # 默认 /workspace/gbc-lyrics/output
"""

import difflib
import json
import statistics
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


def align_song(our_lines, krc_lines):
    """整曲字符级对齐 → 每行每个字的 **KRC 绝对**起始时间（ms，未重基准）。

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
    # 平均字间隔：给"行首/行尾没有 KRC 对应字"（如站内的 (せかい) 注音、
    # 多出来的标点）做外推，否则它们会全挤在同一个时刻一起变红
    gaps = [res[known[i + 1]] - res[known[i]] for i in range(len(known) - 1)]
    step = statistics.median([g for g in gaps if g > 0]) if any(g > 0 for g in gaps) else 180.0
    for k in range(n):
        if res[k] is not None:
            continue
        left = max((x for x in known if x < k), default=None)
        right = min((x for x in known if x > k), default=None)
        if left is None:
            res[k] = res[right] - step * (right - k)
        elif right is None:
            res[k] = res[left] + step * (k - left)
        else:
            res[k] = res[left] + (res[right] - res[left]) * (k - left) / (right - left)

    out = {}
    for k in range(n):
        i = owner[k]
        out.setdefault(i, []).append(res[k])
    hit = len(known) / n if n else 0.0
    return out, hit


# 站内行时间与 KRC 行起始差多少才算"断句产物"（而不是两家打轴的正常差异）
# 实测：37 首的 |中位差| 全部 ≤0.49s、MAD ≤0.22s，所以 >0.8s 的必是
# "站内把网易云的一行拆成两行/把两行并成一行"导致的插值假时间。
FIX_THRESHOLD = 0.8
FIX_MIN_GAP = 0.25   # 修完仍要保持行时间严格递增
SHIFT_OVER_MS = 350  # 首字被钳超过这么多就整行顺延（而不是挤在一起同时变红）


def fix_line_times(lines, times, per_line):
    """用 KRC 的真实行起始修掉插值出来的假时间。

    站内的 times 来自网易云 LRC，而站内文本（j-lyric）断句与 LRC 不一致：
    被合并的行会取到后半句的时间（偏晚 3s 左右），被拆开的行会插值（可能偏
    早或偏晚好几秒）。这类行的高亮与扫红都是错的，用 KRC 的第一字时间修正。
    返回 (新 times, [(行号, 旧值, 新值), ...])
    """
    deltas = {i: per_line[i][0] / 1000 - times[i] for i in per_line if per_line[i]}
    if not deltas:
        return list(times), []
    med = statistics.median(deltas.values())
    mad = statistics.median([abs(v - med) for v in deltas.values()])
    limit = max(FIX_THRESHOLD, 3 * mad)
    new = list(times)
    fixed = []
    for i in sorted(deltas):
        if abs(deltas[i]) <= limit:
            continue
        cand = per_line[i][0] / 1000
        # 只接受"能塞进前一行之后"的修正，塞不进就保持原值（宁可不动）
        if i > 0 and cand <= new[i - 1] + FIX_MIN_GAP:
            continue
        if i + 1 < len(new) and cand >= times[i + 1] - FIX_MIN_GAP:
            continue
        fixed.append((i, new[i], round(cand, 3)))
        new[i] = round(cand, 3)
    return new, fixed


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

        per_line, hit_rate = align_song(lines, data)
        if not per_line:
            print(f"  n={n:2d} {title[:22]:22s} 跳过（字符级对齐失败）")
            continue

        # ① 先用 KRC 修掉插值出来的假行时间
        times, fixed = fix_line_times(lines, times, per_line)

        # ② 再把逐字时间重基准到（修正后的）行起始上
        kch, chars = [], 0
        for i, line in enumerate(lines):
            arr = per_line.get(i)
            if not arr:
                kch.append("")
                continue
            base = times[i] * 1000
            raw = arr[: len(line)]
            # 第一个字落在行起始之前多少（两家打轴的正常差异，通常 0.1~0.5s）
            clamp = max(0.0, base - raw[0])
            if clamp > SHIFT_OVER_MS:
                # 钳掉太多的话，行首会有一串字"啪"地同时变红。改成整行顺延：
                # 保留 KRC 的字间隔（节奏不变），只是从行高亮那一刻开始扫。
                mono = [max(0.0, v - raw[0]) for v in raw]
            else:
                run, mono = 0.0, []
                for v in raw:
                    run = max(run, v - base)
                    mono.append(max(0, run))
            kch.append(",".join(str(int(round(v / 10))) for v in mono))
            chars += len(mono)

        doc["kch"] = kch
        doc["times"] = times
        f.write_text(json.dumps(doc, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        covered = sum(1 for k in kch if k)
        stats.append((n, title, name, len(lines), covered, chars, hit_rate, len(fixed)))
        print(
            f"  n={n:2d} {title[:20]:20s} ← {name[:22]:22s} "
            f"行 {covered:2d}/{len(lines):2d} 字 {chars:4d} 字符命中 {hit_rate*100:5.1f}%"
            + (f"  修正行时间 {len(fixed)} 处" if fixed else "")
        )
        for i, old, new in fixed:
            print(f"        · 第{i+1}行 {old:.3f}s → {new:.3f}s  {lines[i][:26]}")

    tot_chars = sum(s[5] for s in stats)
    tot_lines = sum(s[4] for s in stats)
    tot_fix = sum(s[7] for s in stats)
    print(f"\n合计：{len(stats)} 首 / {tot_lines} 行带逐字 / {tot_chars} 字 / 修正行时间 {tot_fix} 处")
    print(f"新增字段体积 ≈ {tot_chars * 3.2 / 1024:.0f} KB（原始 JSON）")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
