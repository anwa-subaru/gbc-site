# DESIGN.md — GBC 粉丝站设计规范

> 目标站点：Astro 纯静态 / GitHub Pages 托管 / 移动 + 桌面双端响应式
> 品牌：**GIRLS BAND CRY（ガールズバンドクライ）** / 乐队 **TOGENASHI TOGEARI（トゲナシトゲアリ）**
> 本文档为下游页面实现的唯一视觉依据。所有色值、尺寸、动效曲线均可直接复制使用。

---

## 0. 前置调研结论（重要修正）

任务书假设官方视觉为「深底 + 品红/青霓虹」。经实测**官方两站的实际设计语言与此不同**，本文档以实测为准，并对假设做了兼容性处理。依据如下：

| 结论 | 证据 |
|---|---|
| 品牌主色是**红**，不是品红 | 动画官网 CSS 中 `#f40000` 出现 **21 次**；剧场版主 KV `img_kv-01.png` 采样 **48.77%** 像素为 `#F40000`；游戏站 token `--c-band1:#f40000` |
| 官方「深底」是**纯黑 `#000000`**，不是深蓝/深绿 | 两站 CSS 中 `#000` 分别为 39 次 / 7 次；游戏站 token `--c-black:#000000` |
| 品红/青**确实存在**，但仅作为 KV 中的**能量特效色** | TV 动画 KV 实测含霓虹粉 `#FE8EC7`（0.58%）、霓虹青 `#2DFEC6`（0.27%）、`#6BD6FD` |
| 官方断点是 **1024/1025px** | 官网 `@media screen and (max-width:1024px)` / `(min-width:1025px)` |
| 官方签名缓动是 `cubic-bezier(.19,1,.22,1)` | 动画站 10 次、游戏站 token `--ease-out-expo` 同值 |
| 官方标题是**矢量描边 SVG**（非实时文本） | `ttl_news.svg` = `viewBox="0 0 450 121"` 的纯 `<path>` 字形轮廓 |
| ⚠️ `#47704C` 是**透明蒙版色**，不是品牌色 | 该色在所有官方 PNG 中恒为 **PLTE 索引 0 且 `tRNS` alpha=0**；若误当作品牌绿会造成明显错误 |

**设计策略**：以官方红为主色，采用深底（任务书要求）承载红色与霓虹特效色，二者兼容且更贴近原作气质。

---

## 1. 设计定位与原则

**一句话**：把官方 KV 的「红底黑字 + 撕纸笔触 + 半调网点 + 荧光能量线」转译为一套克制、有编辑感的深底排版系统。

五条原则：

1. **红是主角，只做强调**。红色面积占比控制在单屏 ≤ 12%，靠大面积深底与留白制造张力，避免整站泛红导致廉价感。
2. **大字重、紧字距、零装饰**。标题用极粗字重（800–900）+ 收紧字距（`-0.02em`），拒绝渐变、阴影、圆角泛滥。
3. **半调网点是唯一的纹理**。官方 KV 标志性 halftone 以极低透明度（3%–6%）铺在分区背景，禁止叠加其他噪点。
4. **一笔到底的斜切**。官方大量使用对角线分割与斜切遮罩（游戏站用 `linear-gradient` 做斜切条），本站以 `clip-path` 复刻。
5. **动效服务于「进入」，不服务于「炫技」**。全部 ≤ 400ms，无弹跳、无旋转、无视差滥用。

---

## 2. 色板

### 2.1 品牌核心色（实测，可直接使用）

| Token | Hex | 用途 | 来源 |
|---|---|---|---|
| `--gbc-red` | `#F40000` | **主色**：CTA、强调、下划线、图标激活态 | 官网 CSS ×21 + KV 像素 48.77% + 游戏站 `--c-band1` |
| `--gbc-red-deep` | `#C60000` | 红色按下态 / 红底上的暗部 | 游戏站 CSS |
| `--gbc-red-ui` | `#DC1D15` | 游戏站 UI 红，偏暖，用于**大面积红块**时比 `#F40000` 更耐看 | 游戏站 `--c-red` |
| `--gbc-red-kv` | `#FA0808` | KV 实测纯红，仅用于全屏 Hero 背景 | TV KV 像素采样 |

> 大面积铺红用 `--gbc-red-ui`，小面积强调用 `--gbc-red`。这是唯一允许的红色分工。

### 2.2 霓虹能量色（来自 KV 美术，用于点缀与光效）

| Token | Hex | 用途 |
|---|---|---|
| `--neon-pink` | `#FE8EC7` | 高亮描边、hover 光晕、渐变端点 |
| `--neon-pink-deep` | `#E95991` | 粉色的文字/边框安全色（对比度更高） |
| `--neon-cyan` | `#2DFEC6` | 焦点环、进度条、成功态、数据高亮 |
| `--neon-cyan-soft` | `#6BD6FD` | 次级青色，用于链接下划线动画 |

**使用纪律**：霓虹色**永不同时出现两种以上**，且单屏面积 ≤ 3%。它们的作用是「划破深底」，不是装饰。

### 2.3 中性阶（深底系统）

| Token | Hex | 用途 |
|---|---|---|
| `--ink-000` | `#FFFFFF` | 主文本（深底上） |
| `--ink-050` | `#F5F5F5` | 浅底页面背景（游戏站 `--c-gray`） |
| `--ink-100` | `#E6E8EC` | 深底上的次级标题 |
| `--ink-300` | `#9AA1AE` | 正文辅助、说明文字 |
| `--ink-400` | `#6B7280` | 占位符、禁用文字 |
| `--ink-600` | `#363A46` | 深底上的分隔线 |
| `--ink-700` | `#262932` | 卡片边框 |
| `--ink-800` | `#1B1D24` | 卡片背景（raised） |
| `--ink-850` | `#14161B` | 分区背景 |
| `--ink-900` | `#0E0F13` | **页面主背景** |
| `--ink-950` | `#08090B` | 页脚 / 最深沉区 |

> 深底色相统一偏冷（蓝相 ≈ 220°），与官方影片 KV 的 `#2C303C / #313237 / #272D35` 冷灰蓝调一致。

### 2.4 角色代表色（**官方权威，双源交叉验证**）

五色同时来自「官方 logo 素材包乐器图标」与「萌娘百科条目」，**完全一致**，可放心作为角色页主题色：

| 角色 | Token | Hex | 担当 | 官方图标文件 |
|---|---|---|---|---|
| 井芹仁菜 NINA | `--c-nina` | `#D90E2C` | Vo. | `logo 元素素材/icon/主唱.svg` |
| 河原木桃香 MOMOKA | `--c-momoka` | `#85C9DC` | Gt. | `logo 元素素材/icon/吉他.svg` |
| 安和昴 SUBARU | `--c-subaru` | `#76BD53` | Dr. | `logo 元素素材/icon/鼓.svg` |
| 海老塚智 TOMO | `--c-tomo` | `#E34D8D` | Key. | `logo 元素素材/icon/键盘.svg` |
| RUPA | `--c-rupa` | `#EEDA01` | Ba. | `logo 元素素材/icon/贝斯.svg` |

**用法**：角色页以该色为 `--accent`，用于：角色名下划线、签名背景、立绘背光（`drop-shadow`）、技能/担当标签。**不要**把角色色用于全局导航。

### 2.5 乐队色（游戏站官方 token）

`--band-togetoge: #F40000` ・ `--band-cannalily: #3953EF` ・ `--band-f272: #808080` ・ `--band-kuzumimizuku: #73A792`

用于剧情页多乐队并列时的识别色。

### 2.6 语义色

| Token | Hex | 说明 |
|---|---|---|
| `--ok` | `#2DFEC6` | 复用霓虹青 |
| `--warn` | `#EEDA01` | 复用 RUPA 黄 |
| `--focus` | `#2DFEC6` | 焦点环，2px，offset 2px |

### 2.7 对比度校验（WCAG AA）

（数值为按 WCAG 2.1 相对亮度公式实算，非估算）

| 组合 | 对比度 | 结论 |
|---|---|---|
| `#FFFFFF` on `#0E0F13` | **19.15:1** | ✅ AAA |
| `#2DFEC6` on `#0E0F13` | **14.69:1** | ✅ AAA |
| `#FE8EC7` on `#0E0F13` | **9.04:1** | ✅ AAA |
| `#9AA1AE` on `#0E0F13` | **7.37:1** | ✅ AAA（正文可用） |
| `#FF4D4D` on `#0E0F13` | **5.86:1** | ✅ AA（深底上的红色正文用此值） |
| `#F40000` on `#0E0F13` | **4.42:1** | ⚠️ 未达 AA 正文，仅限 ≥24px 粗体 / 非文本图形 |
| `#F40000` on `#FFFFFF` | **4.33:1** | ⚠️ 仅限 ≥18.66px 粗体 |
| `#FFFFFF` on `#F40000` | **4.33:1** | ⚠️ 仅限 ≥18.66px 粗体 |
| `#6B7280` on `#0E0F13` | **3.96:1** | ⚠️ 仅限非文本（占位符/禁用态） |

> **红线**：`--gbc-red` 在深底上对比度 **4.42:1**，**不可**用于 24px 以下正文。需要红色正文时改用 `#FF4D4D`（5.86:1，达 AA）。
> 白字压红底同样只有 **4.33:1**，所以红底上的正文必须 ≥18.66px 且 700 字重以上——这也是官方 KV 只用**超粗大字**压红底的原因。

---

## 3. 字体栈

### 3.1 三语字体栈（日 / 英 / 中）

官方两站分别使用：

- 动画站：`"Noto Sans JP", "Hiragino Kaku Gothic ProN", …` + 拉丁 `Barlow`
- 游戏站：`"LINE Seed JP"` + 拉丁 `Tektur`

本站为中文粉丝站，需在官方基础上补中文字体。**统一为以下三条栈**：

```css
/* 正文 / UI —— 日英中混排 */
--font-sans:
  "Noto Sans SC",          /* 中文主字体 */
  "Noto Sans JP",          /* 日文（官方同款） */
  "Hiragino Sans", "Hiragino Kaku Gothic ProN",
  "PingFang SC", "Microsoft YaHei",
  system-ui, -apple-system, sans-serif;

/* 展示标题 —— 拉丁用 Barlow（官方动画站同款），日文回退 Noto Sans JP */
--font-display:
  "Barlow", "Noto Sans JP", "Noto Sans SC",
  "Hiragino Sans", system-ui, sans-serif;

/* 数字 / 标签 / 编号 —— 拉丁用 Tektur（官方游戏站同款），几何科技感 */
--font-mono-num:
  "Tektur", "Barlow", ui-monospace, "SFMono-Regular", monospace;
```

**加载策略**（Astro + `@fontsource` 自托管，禁用 Google Fonts CDN）：

| 字体 | 字重 | 子集 | 说明 |
|---|---|---|---|
| Noto Sans SC | 400, 700, 900 | `chinese-simplified` | 主中文字体 |
| Noto Sans JP | 400, 700, 900 | `japanese` | 日文标题与歌词 |
| Barlow | 600, 800 | `latin` | 英文标签、日期 |
| Tektur | 500, 700 | `latin` | 数字、编号、担当缩写 |

- 全部 `font-display: swap`，`preload` 仅限首屏用到的 900 字重中文子集。
- 中文子集建议按页面 `unicode-range` 拆分，避免单文件过大。

### 3.2 字重阶梯

| 名称 | 值 | 用途 |
|---|---|---|
| `--fw-regular` | 400 | 正文 |
| `--fw-medium` | 500 | 强调正文、导航 |
| `--fw-bold` | 700 | 小标题、卡片标题 |
| `--fw-ex-bold` | 800 | 区块标题 |
| `--fw-black` | 900 | Hero 主标题、巨型数字 |

> 官方游戏站定义了 `--f-w-thin:100` 至 `--f-w-ex-black:950` 的完整阶梯；本站**只用 400 / 700 / 800 / 900** 四档，保持克制。

### 3.3 字号阶梯（8px 网格对齐）

以 16px 为基准根字号，全部落在 8px 网格或 4px 半格：

| Token | 桌面 (≥1024px) | 移动 (<768px) | 字距 | 行高 | 用途 |
|---|---|---|---|---|---|
| `--fs-display` | 80px | 40px | `-0.03em` | 0.95 | Hero 主标题 |
| `--fs-h1` | 56px | 32px | `-0.02em` | 1.05 | 页面标题 |
| `--fs-h2` | 40px | 24px | `-0.01em` | 1.15 | 区块标题 |
| `--fs-h3` | 24px | 20px | `0` | 1.3 | 卡片标题 |
| `--fs-h4` | 20px | 18px | `0` | 1.4 | 小标题 |
| `--fs-body-lg` | 18px | 16px | `0.01em` | 1.75 | 导语 |
| `--fs-body` | 16px | 16px | `0.02em` | 1.75 | 正文 |
| `--fs-sm` | 14px | 14px | `0.04em` | 1.6 | 辅助说明 |
| `--fs-xs` | 12px | 12px | `0.06em` | 1.5 | 标签、出处、版权 |
| `--fs-label` | 12px | 11px | `0.08em` | 1 | 全大写英文标签 |

**字距纪律**：日文/中文标题一律 `-0.02em ~ -0.03em`（收紧），英文标签一律 `0.06em ~ 0.08em`（放开）。这是官方两站共同的排版习惯（官网实测字距仅 `.04em / .06em / .08em` 三档）。

**移动端缩放**：不使用官方那种纯 `vw` 方案（1920 基准，小屏不可读）。改用 `clamp()`：

```css
--fs-display: clamp(40px, 8vw, 80px);
--fs-h1:      clamp(32px, 5vw, 56px);
--fs-h2:      clamp(24px, 3.2vw, 40px);
```

---

## 4. 网格、间距与断点

### 4.1 8px 基础网格

所有间距、尺寸、圆角均为 **8 的倍数**（4px 为半格，仅用于图标与描边）。

| Token | 值 | 典型用途 |
|---|---|---|
| `--sp-1` | 4px | 图标与文字间距、描边偏移 |
| `--sp-2` | 8px | 标签内边距、紧凑间隔 |
| `--sp-3` | 16px | 段落间距、卡片内边距（移动） |
| `--sp-4` | 24px | 卡片内边距（桌面） |
| `--sp-5` | 32px | 卡片间距 |
| `--sp-6` | 48px | 区块内分组间距 |
| `--sp-7` | 64px | 区块间距（移动） |
| `--sp-8` | 96px | 区块间距（桌面） |
| `--sp-9` | 128px | 页面级大分区 |

### 4.2 容器与栅格

```css
--container-max: 1280px;   /* 内容最大宽度 */
--container-pad: 24px;     /* 移动端左右留白 */
--container-pad-lg: 48px;  /* 桌面端左右留白 */
--grid-gap: 24px;
```

- 桌面：12 列栅格，`gap: 24px`
- 平板（768–1023）：8 列，`gap: 20px`
- 移动（<768）：4 列，`gap: 16px`

### 4.3 断点（按任务书要求，并兼容官方）

```css
/* 移动优先 */
/* 默认：< 768px  移动 */
@media (min-width: 768px)  { /* 平板 */ }
@media (min-width: 1024px) { /* 桌面 */ }
```

| 断点 | 范围 | 布局策略 |
|---|---|---|
| **Mobile** | 320–767px | 单列；导航收为汉堡全屏抽屉；Hero 立绘居下半身裁切；卡片 1 列 |
| **Tablet** | 768–1023px | 2 列卡片；导航仍为抽屉；Hero 文字居左、立绘右侧 40% |
| **Desktop** | 1024–1439px | 12 列；顶部横向导航；Hero 左右分栏 |
| **Wide** | ≥1440px | 内容锁定 `1280px` 居中，两侧留白，背景纹理延伸至全宽 |

> 官方用 `1024px` 作为 SP/PC 分界（`max-width:1024px` / `min-width:1025px`），与任务书的 1024 断点一致，直接对齐。
> 游戏站另设 `1200 / 1260 / 1420 / 1600 / 1640 / 1830` 等中间断点，本站**不需要**——用 `clamp()` 做流体过渡即可，减少断点维护成本。

### 4.4 圆角与描边

| Token | 值 | 用途 |
|---|---|---|
| `--r-none` | 0 | **默认**。卡片、图片、按钮一律直角 |
| `--r-sm` | 4px | 标签、徽章 |
| `--r-pill` | 999px | 仅用于「担当」小药丸 |

> **直角是本设计的性格**。官方 KV、logo、UI 全部为直角/锐角，禁止使用 8px 以上的圆角卡片。

---

## 5. 组件规范

### 5.1 图形化标题（Section Title）

官方做法：标题是**矢量描边 SVG**（`ttl_news.svg`，`viewBox="0 0 450 121"`，纯 `<path>` 字形）。本站分两级实现：

**A. 巨型分区标题（视觉锤）**——复刻官方 SVG 手法：

```html
<h2 class="sec-title">
  <span class="sec-title__en">CHARACTER</span>
  <span class="sec-title__ja">キャラクター</span>
</h2>
```

```css
.sec-title__en {
  font-family: var(--font-display);
  font-size: var(--fs-h2);
  font-weight: 900;
  letter-spacing: -0.02em;
  text-transform: uppercase;
  color: var(--ink-000);
}
.sec-title__ja {
  display: block;
  font-size: var(--fs-xs);
  letter-spacing: 0.08em;
  color: var(--gbc-red);
  margin-top: var(--sp-1);
}
```

- 英文大写做主体，日文小字做副标，红色点缀——**这是官方最常见的标题结构**。
- 可选：将英文标题导出为 `<path>` SVG，实现官方那种字形贴合与斜切裁切。仅 Hero 主标题需要这么做。

**B. 通用区块标题**——`--fs-h3` + 左侧 4px 红色竖线（`border-left: 4px solid var(--gbc-red)`，`padding-left: 16px`）。

### 5.2 卡片（Card）

```css
.card {
  background: var(--ink-800);
  border: 1px solid var(--ink-700);
  border-radius: 0;
  padding: var(--sp-4);
  transition: transform 240ms var(--ease-out-cubic),
              border-color 240ms var(--ease-out-cubic);
}
.card:hover {
  transform: translateY(-4px);
  border-color: var(--gbc-red);
}
```

- **图片卡**（音乐/画廊）：图片 `aspect-ratio` 固定，`object-fit: cover`，溢出隐藏。hover 时图片 `scale(1.04)`，`overflow: hidden` 裁切。
- **角色卡**：顶部为立绘（透明底 PNG 直接叠在卡片背景上，不做白底），底部为姓名 + 担当标签。hover 时卡片边框与角色名下划线切换为角色代表色。
- **禁止**：卡片阴影堆叠、彩色渐变边框、圆角气泡。

### 5.3 导航（Navigation）

**桌面（≥1024px）**：顶部固定条，高 `72px`。

```css
.nav {
  position: sticky; top: 0; z-index: 100;
  height: 72px;
  background: rgba(14, 15, 19, 0.72);
  backdrop-filter: blur(16px) saturate(140%);
  border-bottom: 1px solid var(--ink-700);
}
```

- 左侧：GBC 白色 logo（`ガールズバンドクライ 白字.png`），高 `28px`。
- 右侧：5 个页面链接，`--fs-sm` + `letter-spacing: 0.06em`。
- 激活态：链接下方 2px 红条，`transform: scaleX()` 从 0→1 展开。
- hover：文字由 `--ink-300` 变 `--ink-000`，底部红条 240ms 展开。

**移动（<1024px）**：汉堡按钮 → 全屏抽屉。

- 抽屉背景 `--ink-950`，从右侧 `translateX(100%)` 滑入，280ms `--ease-out-expo`。
- 链接纵向排列，`--fs-h2` 大字重，逐条 `stagger 40ms` 淡入上移。
- 抽屉打开时 `body { overflow: hidden }`，焦点锁定在抽屉内（`focus trap`）。
- 关闭：`Esc` / 点击遮罩 / 点击链接。

### 5.4 按钮（Button）

| 变体 | 样式 | 用途 |
|---|---|---|
| **Primary** | 背景 `--gbc-red`，文字 `#FFF`，900 字重，`padding: 16px 32px`，直角 | 主 CTA |
| **Ghost** | 透明背景，`1px solid --ink-600`，文字 `--ink-000` | 次级操作 |
| **Link** | 文字 + 2px 红色下划线，`text-underline-offset: 6px` | 内联跳转 |

- 最小点击区 **44×44px**（移动端无障碍要求）。
- hover：Primary 背景变 `--gbc-red-deep`；Ghost 边框变 `--gbc-red`、文字变 `--gbc-red`。
- 禁用态：`opacity: 0.4`，`cursor: not-allowed`。

### 5.5 标签 / 担当徽章（Tag）

复刻官方 `txt_part-*.png` 的用法（实测这些图标为**纯红 `#F40000` 描边**）：

```css
.tag {
  display: inline-flex; align-items: center; gap: var(--sp-1);
  font-family: var(--font-mono-num);
  font-size: var(--fs-label);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  padding: 4px 8px;
  border: 1px solid currentColor;
  border-radius: var(--r-sm);
  color: var(--accent, var(--gbc-red));
}
```

- 担当缩写：`VO` / `GT` / `DR` / `KEY` / `BA`——**直接复用官方图标 SVG**，与角色代表色天然对应。

### 5.6 出处标注（Citation）——本项目强制组件

由于文案仅取自官方 + 萌娘百科且**禁二创**，每个内容区块必须有出处行：

```html
<p class="cite">
  出处：<a href="https://zh.moegirl.org.cn/井芹仁菜" rel="noopener noreferrer">萌娘百科「井芹仁菜」</a>
</p>
```

```css
.cite {
  font-size: var(--fs-xs);
  letter-spacing: 0.06em;
  color: var(--ink-400);
  border-top: 1px solid var(--ink-700);
  padding-top: var(--sp-2);
  margin-top: var(--sp-4);
}
.cite a { color: var(--ink-300); text-decoration: underline; text-underline-offset: 4px; }
.cite a:hover { color: var(--neon-cyan); }
```

### 5.7 斜切分区（Clip Section）——官方标志性手法

游戏站用 `linear-gradient` 生成对角斜切条，本站用 `clip-path` 复刻：

```css
.slash {
  clip-path: polygon(0 0, 100% 4%, 100% 100%, 0 96%);
}
```

- 用于页面分区的上下边界，制造「撕纸/斜切」动势。
- 单个页面**最多使用 2 次**，避免视觉混乱。

### 5.8 半调网点纹理（Halftone）

官方 KV 的核心纹理。用 CSS 生成，零图片成本：

```css
.halftone::before {
  content: "";
  position: absolute; inset: 0;
  background-image: radial-gradient(circle, var(--ink-000) 1px, transparent 1px);
  background-size: 4px 4px;
  opacity: 0.04;
  pointer-events: none;
}
```

- 仅铺在分区背景，`opacity` 上限 **0.06**。
- 红色分区上改用 `radial-gradient(circle, #000 1px, transparent 1px)`，`opacity: 0.10`。

---

## 6. 动效规范

### 6.1 缓动曲线（官方 token，直接复用）

```css
--ease-out-quad:     cubic-bezier(0.25, 0.46, 0.45, 0.94);
--ease-out-cubic:    cubic-bezier(0.215, 0.61, 0.355, 1);
--ease-out-expo:     cubic-bezier(0.19, 1, 0.22, 1);   /* ★ 官方签名曲线 */
--ease-in-out-quad:  cubic-bezier(0.455, 0.03, 0.515, 0.955);
--ease-out-back:     cubic-bezier(0.175, 0.885, 0.32, 1.275);
```

`--ease-out-expo` 是两站共用的签名曲线（动画站 10 次 `width .5s cubic-bezier(.19,1,.22,1)`；游戏站 token `--ease-out-expo` 同值），**所有进入类动画默认使用它**。

### 6.2 时长阶梯（全部 < 400ms）

| Token | 时长 | 用途 |
|---|---|---|
| `--dur-instant` | 100ms | 颜色/透明度瞬时反馈 |
| `--dur-fast` | 160ms | 图标旋转、checkbox |
| `--dur-base` | 240ms | **默认**：hover、边框、按钮、链接（官方 `--opacity-transition: opacity 0.24s ease`） |
| `--dur-slow` | 320ms | 抽屉滑入、模态、卡片入场 |
| `--dur-enter` | 400ms | 页面级入场动画（**上限**） |

> **硬约束**：任何单次动效时长 ≤ 400ms。官方那种 `.5s` / `1s` 的缓慢位移**不采用**，因为在长页面上会显著拖慢浏览节奏。

### 6.3 标准动效配方

**A. 元素入场（滚动触发，IntersectionObserver）**

```css
[data-reveal] {
  opacity: 0;
  transform: translateY(16px);
  transition: opacity var(--dur-enter) var(--ease-out-expo),
              transform var(--dur-enter) var(--ease-out-expo);
}
[data-reveal].is-visible { opacity: 1; transform: none; }
```

- 阈值 `0.15`，`rootMargin: "0px 0px -10% 0px"`。
- 同组元素 `stagger 60ms`，整组完成 ≤ 400ms。
- 触发一次即 `unobserve`，不重复播放。

**B. Hover 反馈**

```css
--opacity-hover: 0.7;   /* 官方 token，用于图片/图标 */
```
- 链接：下划线 `scaleX(0→1)`，240ms `--ease-out-cubic`。
- 卡片：`translateY(-4px)` + 边框变红，240ms。
- 图片：`scale(1.04)`，320ms `--ease-out-expo`。

**C. 页面切换**（Astro View Transitions）

- 淡出 160ms / 淡入 240ms，无位移。
- 共享元素（如角色卡 → 角色页立绘）用 `view-transition-name` 做形变。

**D. Hero 立绘入场**

- 立绘 `opacity 0→1` + `translateY(24px→0)`，400ms `--ease-out-expo`。
- 标题分行 stagger 60ms。
- **不做**视差滚动、不做持续浮动动画。

### 6.4 `prefers-reduced-motion` 降级（强制）

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
  [data-reveal] { opacity: 1 !important; transform: none !important; }
  .card:hover { transform: none; }
  .card:hover img { transform: none; }
  .nav-drawer { transition: none; }
}
```

**降级原则**：不是「加速」，而是**直接呈现终态**。所有依赖动画才能看到的内容（`opacity: 0` 初始态）必须在此模式下强制可见。JS 侧同步检查：

```js
const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
if (reduce) document.querySelectorAll('[data-reveal]').forEach(el => el.classList.add('is-visible'));
```

### 6.5 焦点与键盘

- 焦点环：`outline: 2px solid var(--neon-cyan); outline-offset: 2px;`——**禁止** `outline: none`。
- 抽屉/模态：焦点锁定 + `Esc` 关闭 + 关闭后焦点归位到触发按钮。

---

## 7. 五个页面版式说明

### 7.1 首页 `/`（Home）

| 区块 | 桌面布局 | 移动布局 | 素材 |
|---|---|---|---|
| **① Hero KV** | 左文右图，文字区 5 列 / 立绘 7 列。背景 `--gbc-red-kv` 全宽红，叠加 halftone | 上下堆叠：文字居上，立绘下半身裁切贴底 | `组合图/乐队头像.png` 或 `img_kv-03-1.png` |
| **② 巨型标题** | `--fs-display` 900 字重白字「GIRLS BAND CRY」+ 日文副标 | `clamp` 降至 40px | 文字 + `logo/ガールズバンドクライ 白字.png` |
| **③ 乐队介绍** | 左 4 列导语 + 右 8 列正文，`--fs-body-lg` | 单列 | 文案取自萌娘百科，带出处 |
| **④ 成员速览** | 5 张角色卡横排（`grid-template-columns: repeat(5, 1fr)`） | 横向滚动 `scroll-snap` 或 2 列换行 | 5 张「立小指」立绘 |
| **⑤ 最新作品** | 3 张专辑封面卡 + 「查看全部」 | 1 列 | `封面/专辑ep/` |
| **⑥ 页脚** | 4 列：logo / 导航 / 出处声明 / 版权 | 单列堆叠 | `--ink-950` |

**Hero 关键**：红底上文字必须为**纯白或纯黑**，不可用灰色（红底灰字对比度不足）。手写毛笔字（官方 KV 的「怒りも喜びも哀しも 全部ぶちこめ。」）以 SVG 路径形式作为装饰元素，**不作为可读文本**。

### 7.2 角色页 `/characters`（列表 + 详情）

**列表页**：
- 顶部：`--fs-h1`「CHARACTER」+ 日文「キャラクター」+ 红色副标。
- 主体：5 张角色卡，桌面 3 列（`repeat(auto-fill, minmax(320px, 1fr))`），移动 1 列。
- 每卡：透明底立绘（`aspect-ratio: 3/4`，`object-fit: contain`，底部对齐）+ 姓名（日/中/英三行）+ 担当标签 + 角色色顶边条（4px）。

**详情页** `/characters/[slug]`：
- **Hero**：左立绘（`立小指` 全身）+ 右信息。背景为该角色代表色的**极低透明度径向渐变**（`radial-gradient` at 立绘位置，`opacity 0.12`），营造角色「背光」。
- **信息表**：姓名 / 担当 / 乐器 / 年龄 / 出身 / 所属乐队——数据来自萌娘百科，每行带出处。
- **签名**：使用官方 SVG 签名（`签名/nina sign.svg` 等），放在姓名旁，`fill: currentColor` 跟随角色色。
- **立绘画廊**：该角色其余立绘（春服 / 夏服 / 冬服 / 爆ぜて咲く 衣装）横向滚动。
- **出处**：底部统一标注萌娘百科条目链接。

**slug 映射**：`nina` / `momoka` / `subaru` / `tomo` / `rupa`。

### 7.3 音乐页 `/music`

- **顶部分类 Tab**：`全部 / 单曲 / 专辑 / OST`，激活态红色下划线。移动端横向滚动。
- **主体网格**：专辑封面卡，桌面 `repeat(auto-fill, minmax(240px, 1fr))`（约 4–5 列），移动 2 列。
- **封面卡**：`aspect-ratio: 1/1` 方形，`object-fit: cover`；hover 时封面 `scale(1.04)` + 底部浮出曲名条（半透明黑底 + 白字）。
- **曲名**：日文原名为主（`--fs-h4`），中文/罗马音为副（`--fs-sm`，`--ink-300`）。**不翻译、不改写曲名**。
- **可选**：Tektur 数字编号（`#01`…）作为左侧索引，强化编辑排版感。
- **出处**：封面图来自官方 CD 发行物；曲目信息标注官方来源。

素材：`封面/专辑ep/`（28 张，文件名即曲名）、`封面/BD/`（7 张）、`封面/PV/`（5 张）。

### 7.4 画廊页 `/gallery`

- **瀑布流 / 网格**：桌面 CSS `columns: 3`（保留原图纵横比，适合横竖混排的贺图），移动 `columns: 1`。
- **图片**：`width: 100%`，`break-inside: avoid`，`margin-bottom: 24px`。
- **灯箱**：点击放大，背景 `rgba(8,9,11,0.96)`，`Esc` 关闭，左右键切换，焦点锁定。
- **分组**：按来源分区——「官方贺图 #01–#13」（`贺图/动画/`）、「手島nari 绘」（`贺图/手岛绘/`）、「角色生日」（`贺图/个人/`）、「宣发海报」（`宣发海报/`）。
- **懒加载**：全部 `loading="lazy"` + `decoding="async"`，首屏仅 6 张 eager。
- **出处**：每张图标注来源（官方 X / 官网 / 版权方），版权声明置于页脚。

### 7.5 剧情页 `/story`

- **叙事长页**，单列，`max-width: 720px` 居中（阅读宽度上限）。
- **章节结构**：每章 = 章节号（Tektur 大字 + 红色）+ 章节标题（`--fs-h2`）+ 正文（`--fs-body`，`line-height: 1.75`）。
- **时间线**：左侧 2px 竖线 + 节点圆点，滚动时节点按 `IntersectionObserver` 依次点亮为 `--gbc-red`。
- **关键视觉**：章节间插入官方 KV 横图（`宣发海报/` 中横屏素材），全宽出血，上下加斜切 `clip-path`。
- **引文块**：`border-left: 4px solid var(--gbc-red)`，`--fs-body-lg`，斜体不加（日文/中文不宜斜体）。
- **出处**：每章末尾标注来源（动画官网 STORY / 萌娘百科条目）。**严格转述，不添加原创解读**。

---

## 8. 推荐素材清单（原路径 → 用途）

素材根目录：`/workspace/gbcc/gbc/gbc/`
> ⚠️ **目录名与文件名含字面量 Unicode 转义**（如 `#U89d2#U8272`）。构建时需解码：
> ```python
> re.sub(r'#U([0-9a-f]{4})', lambda m: chr(int(m.group(1), 16)), s)
> ```
> ⚠️ **扩展名不可信**：`宣发海报/img_kv-01.png`、`img_kv-02.png`、`img_kv-03-1.png` 实际为 **WebP**（magic = `RIFF....WEBP`）。构建流程需按 magic bytes 判定，或统一转码为 WebP 后重命名。

### 8.1 首页 Hero / KV

| 原路径 | 规格 | 用途 |
|---|---|---|
| `透明底人物立绘/组合图/乐队头像.png` | 3472×2604, 7.0MB, RGBA | **★ 首页 Hero 主视觉**：5 人全身透明底合影，构图完整、姿态活泼，直接叠红底 |
| `透明底人物立绘/组合图/冬服.png` | 9.6MB, RGBA | 备选 Hero（冬季制服，色调更冷） |
| `透明底人物立绘/组合图/夏服.png` | 7.6MB, RGBA | 备选 Hero（夏季，明亮） |
| `透明底人物立绘/组合图/夏服坐姿.png` | 5.9MB, RGBA | 首页「乐队介绍」区配图 |
| `宣发海报/img_kv-03-1.png` | 2399×3252, WebP | **TV 动画主 KV**：含红底 + 霓虹青/粉能量线 + 毛笔字，首页全屏 KV 备选 |
| `宣发海报/img_kv-01.png` | WebP | 剧场版 KV（红底 + 蓝色剪影），强对比，适合做分区横幅 |
| `宣发海报/GBC_togetoge_kv0_*.png` | 9.7MB | 乐队主 KV，适合音乐页头图 |
| `透明底人物立绘/组合图/踢踏跳跃带乐器.png` | 13.1MB, RGBA | 动态感强的组合图，适合画廊页首图 |

### 8.2 Logo / 品牌元素

| 原路径 | 用途 |
|---|---|
| `logo 元素素材/logo/ガールズバンドクライ 白字.png` | **★ 深底导航栏 logo**（白字透明底，144KB） |
| `logo 元素素材/logo/ガールズバンドクライ 红.png` | 红字版，用于浅底或页脚 |
| `logo 元素素材/logo/ガールズバンドクライ.png` | 标准版（黑字），浅底使用 |
| `logo 元素素材/logo/LOGO 1 透明.png` / `LOGO 2` / `LOGO 3` | 备用标识变体 |
| `logo 元素素材/logo/红生姜.png` | 剧中乐队「beni-shouga」logo，剧情页用 |
| `logo 元素素材/logo/新川崎.png` | 剧中乐队「新川崎（仮）」logo，剧情页用 |
| `logo 元素素材/logo/ダイヤモンドダスト 透明.png` | 「Diamond Dust」logo，剧情页用 |
| `logo 元素素材/icon/{主唱,吉他,贝斯,键盘,鼓}.svg` | **★ 担当图标**，已按角色色着色（`#D90E2C`/`#85C9DC`/`#EEDA01`/`#E34D8D`/`#76BD53`），直接用 `<img>` 或内联 SVG |
| `logo 元素素材/签名/{nina,mmk,486,tomo,rupa} sign.svg` | **★ 角色签名**，矢量，`fill: currentColor` 跟随角色色 |
| `logo 元素素材/姓名/{nina,momoka,subaru,tomo,rupa}.png` | 手写名字图（5076×1080），角色页大字装饰 |
| `logo 元素素材/元素/中指 1.png` / `中指 2.png` | 标志性「竖中指」图形元素，作装饰点缀（黑白各一） |
| `logo 元素素材/元素/黑字 透明.png` / `白字 透明.png` | 通用标题字形，可作 SVG 化参考 |

### 8.3 角色立绘（角色页）

**★ 首选「立小指」组**（乐队标志性手势，五角色齐全，RGBA 透明底，41–55% 不透明像素）：

| 角色 | 原路径 | 规格 |
|---|---|---|
| 仁菜 NINA | `透明底人物立绘/nina/nina 29 立小指.png` | 3.9MB |
| 桃香 MOMOKA | `透明底人物立绘/mmk/mmk 27 立小指.png` | 3.5MB |
| 昴 SUBARU | `透明底人物立绘/486/486 26 立小指.png` | 3.9MB |
| 智 TOMO | `透明底人物立绘/tomo/tomo 24 立小指.png` | 3.7MB |
| RUPA | `透明底人物立绘/rupa/rupa 24 立小指.png` | 3.3MB |

**半身版**（详情页 Hero 用，构图更紧）：同名文件 + ` 高清半身` 后缀，如 `nina 29 立小指 高清半身.png`（2.5MB）。

**备选「春服」组**（五角色齐全，日常服，适合列表页）：

`透明底人物立绘/{nina,mmk,486,tomo,rupa}/<角色> 1 春服.png`（2.4–3.6MB）

**角色页画廊可选**（每角色均有全套）：`2 夏服站姿` / `3 夏服坐姿` / `5 冬服` / `15 爆ぜて咲く 衣装 4x` / `10 空白とカタルシス` 等。

> **性能提示**：单张立绘 2.4–4MB，直接上线会拖垮首屏。构建时必须转 WebP（质量 82）+ 生成 `srcset`（建议 480/768/1200/1600 四档）。目标：单张立绘 < 180KB。

### 8.4 音乐页素材

| 原路径 | 数量 | 用途 |
|---|---|---|
| `封面/专辑ep/` | 28 张 | **★ 专辑/单曲封面**，文件名即曲名（如 `運命の華.jpg`、`爆ぜて咲く.jpg`、`雑踏、僕らの街.jpg`） |
| `封面/BD/` | 7 张 | Blu-ray 卷封面，可做「影像作品」分区 |
| `封面/PV/` | 5 张 | 角色 PV 封面（超宽幅） |
| `封面/视频/` | 10 张 | 视频缩略图 |

### 8.5 画廊页素材

| 原路径 | 数量 | 用途 |
|---|---|---|
| `贺图/动画/` | 15 张 | **★ 官方编号贺图 #01–#13**（含 `8A`/`8B`），带标题与序号，适合做带说明的图集 |
| `贺图/手岛绘/` | 10 张 | **★ 角色设计手島nari 亲绘**，含生日贺图，品质最高 |
| `贺图/个人/` | 5 张 | 五位角色单人贺图（`nina.jpg`/`mmk.jpg`/`486.jpg`/`tomo.jpg`/`rupa.jpg`） |
| `贺图/劇場版総集編…/` | 6 张 | 剧场版公开纪念绘 |
| `宣发海报/` | 30 张 | 各类宣发海报（注意 `img_kv-0*.png` 实为 WebP） |
| `周边图/三丽鸥联动/三立鸥联动立绘（透明底）/` | 9 张 | 三丽鸥联动透明底立绘（含 Diamond Dust 成员） |
| `周边图/夜水母联动/水母联动人物介绍/抠/` | 5 张 | 联动角色抠图（透明底） |

### 8.6 剧情页素材

| 原路径 | 用途 |
|---|---|
| `logo 元素素材/Live logo/{凛音之理,协奏之响,咆哮之奏,奏檄之叫,薄明的序奏,鸣动之刻}.png` | **★ 各场 Live 标题 logo**，剧情页时间线节点图标 |
| `logo 元素素材/logo/{红生姜,新川崎,ダイヤモンドダスト}.png` | 剧中乐队 logo |
| `透明底人物立绘/钻石之尘/` | Diamond Dust 成员立绘（`Ai`/`Hina`/`Nana`/`Rin` 各 4 版） |
| `宣发海报/第二季制作决定.jpg`、`劇場版総集編…jpg` | 重大节点配图 |

### 8.7 素材使用红线

1. **仅使用官方美术**。素材库中不含任何同人图；若混入必须剔除。
2. **禁止二创/改色/拼接**。立绘不得重绘、不得 AI 扩图后再用；仅允许等比缩放与 WebP 转码。
3. **禁止商用**。页脚必须保留 `©東映アニメーション` 及素材库提供的版权说明（见 `使用注意(1).png`、`参与鸣谢(1).png`）。
4. **优先透明底素材**（`透明底人物立绘/`），避免白底图直接叠深底产生白框。
5. **文字素材（logo/签名）优先用 SVG**（`签名/*.svg`、`icon/*.svg`），其次 PNG，**不要**用 `.ai` 源文件直接上线。

---

## 9. 无障碍与性能基线

### 9.1 无障碍（WCAG 2.1 AA）

- 全部图片必须有 `alt`；纯装饰图用 `alt=""`。
- 语义化标签：`<header> <nav> <main> <section> <article> <footer>`，每页一个 `<h1>`。
- 键盘可达：所有交互元素可 Tab 聚焦，焦点环可见（`--neon-cyan`）。
- 移动端点击区 ≥ 44×44px。
- 语言标注：`<html lang="zh-CN">`，日文片段加 `lang="ja"`。
- 尊重 `prefers-reduced-motion`（见 §6.4）与 `prefers-color-scheme`（可选浅色变体）。

### 9.2 性能（GitHub Pages 静态托管）

| 指标 | 目标 |
|---|---|
| LCP | < 2.5s（4G） |
| CLS | < 0.1 |
| 单页 JS | < 30KB gzip（Astro 默认零 JS，仅交互组件水合） |
| 首屏图片 | ≤ 200KB |

**关键措施**：
- Astro 默认零 JS；仅导航抽屉 / 灯箱 / 滚动揭示使用 `client:visible` 水合。
- 所有图片经 `astro:assets` 转 WebP + 响应式 `srcset`，显式声明 `width`/`height` 防 CLS。
- 字体自托管 + `font-display: swap` + 首屏 `preload`。
- 非首屏图片一律 `loading="lazy"`。
- 素材库原图巨大（单张最大 72.9MB），**构建期必须压缩**，禁止直接拷贝原始 PNG 进 `public/`。

---

## 10. 实现速查（CSS 变量汇总）

```css
:root {
  /* ---- 品牌 ---- */
  --gbc-red:      #F40000;
  --gbc-red-deep: #C60000;
  --gbc-red-ui:   #DC1D15;
  --gbc-red-kv:   #FA0808;

  /* ---- 霓虹 ---- */
  --neon-pink:      #FE8EC7;
  --neon-pink-deep: #E95991;
  --neon-cyan:      #2DFEC6;
  --neon-cyan-soft: #6BD6FD;

  /* ---- 中性 ---- */
  --ink-000: #FFFFFF; --ink-050: #F5F5F5; --ink-100: #E6E8EC;
  --ink-300: #9AA1AE; --ink-400: #6B7280; --ink-600: #363A46;
  --ink-700: #262932; --ink-800: #1B1D24; --ink-850: #14161B;
  --ink-900: #0E0F13; --ink-950: #08090B;

  /* ---- 角色 ---- */
  --c-nina:   #D90E2C;
  --c-momoka: #85C9DC;
  --c-subaru: #76BD53;
  --c-tomo:   #E34D8D;
  --c-rupa:   #EEDA01;

  /* ---- 乐队 ---- */
  --band-togetoge:   #F40000;
  --band-cannalily:  #3953EF;
  --band-f272:       #808080;
  --band-kuzumimizuku: #73A792;

  /* ---- 语义 ---- */
  --bg: var(--ink-900); --fg: var(--ink-000);
  --accent: var(--gbc-red); --focus: var(--neon-cyan);

  /* ---- 字体 ---- */
  --font-sans: "Noto Sans SC","Noto Sans JP","Hiragino Sans","PingFang SC","Microsoft YaHei",system-ui,sans-serif;
  --font-display: "Barlow","Noto Sans JP","Noto Sans SC",system-ui,sans-serif;
  --font-mono-num: "Tektur","Barlow",ui-monospace,monospace;

  /* ---- 动效 ---- */
  --ease-out-quad:  cubic-bezier(0.25, 0.46, 0.45, 0.94);
  --ease-out-cubic: cubic-bezier(0.215, 0.61, 0.355, 1);
  --ease-out-expo:  cubic-bezier(0.19, 1, 0.22, 1);
  --ease-out-back:  cubic-bezier(0.175, 0.885, 0.32, 1.275);
  --dur-instant: 100ms; --dur-fast: 160ms; --dur-base: 240ms;
  --dur-slow: 320ms;    --dur-enter: 400ms;
  --opacity-hover: 0.7;

  /* ---- 间距 / 容器 ---- */
  --sp-1: 4px;  --sp-2: 8px;  --sp-3: 16px; --sp-4: 24px;
  --sp-5: 32px; --sp-6: 48px; --sp-7: 64px; --sp-8: 96px; --sp-9: 128px;
  --container-max: 1280px; --container-pad: 24px; --grid-gap: 24px;

  /* ---- 圆角 ---- */
  --r-none: 0; --r-sm: 4px; --r-pill: 999px;
}
```

---

## 11. 出处与依据

本规范所有色值与数值均来自实测或官方/权威公开来源：

| 依据 | 来源 |
|---|---|
| `#f40000` 品牌红、`#000`/`#fff` 中性、字体栈 `Noto Sans JP` + `Barlow`、断点 1024/1025、缓动 `cubic-bezier(.19,1,.22,1)`、字距 `.04/.06/.08em`、SVG 图形化标题 | 官方剧场版站 CSS：`girls-band-cry.com/wp-content/themes/gbc_v1-1/assets/css/index/style.css` |
| 设计 token `--c-red:#dc1d15`、`--c-band1..4`、`--ease-out-expo`、`--opacity-transition:opacity .24s ease`、字体 `LINE Seed JP` + `Tektur`、`--vw-base:1920` | 官方游戏站 CSS：`gbc-firstriff.com/wp-content/themes/gbc-firstriff_teaser/assets/css/app.css` |
| 品牌红 `#F40000`（KV 像素 48.77%）、霓虹粉 `#FE8EC7`、霓虹青 `#2DFEC6`、`#6BD6FD`、红 `#FA0808` | 官方 KV 像素采样（`img_kv-01.png`、TV 动画 KV） |
| 五角色代表色 `#D90E2C` / `#85C9DC` / `#76BD53` / `#E34D8D` / `#EEDA01` | **双源交叉验证**：官方 logo 素材包乐器图标（`logo 元素素材/icon/*.png`，逐色占比 94–97%）+ [萌娘百科](https://zh.moegirl.org.cn/) 各角色条目 |
| 立绘 / logo / 封面 / 贺图素材 | 本地素材库 `/workspace/gbcc/gbc/gbc/` |
| `#47704C` 为透明蒙版色的判定 | 逐 PNG 解析 `PLTE` + `tRNS`：该色恒为索引 0 且 alpha=0 |

**排版纪律参考**：官方站采用的编辑式排版手法（超大字重对比、全大写英文标签 + 小字日文副标、`letter-spacing` 分档、直角与斜切、半调纹理、内容分区强节奏）与 Awwwards 日系获奖站点的通行做法一致，本文档据此收敛为可执行的 token。
