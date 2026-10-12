# VISION-AUDIT — gbc.misakamikoto.xyz 手机端（375px 视口）图像识别视觉审查

- 审查对象：https://gbc.misakamikoto.xyz （Girls Band Cry 粉丝站；深底 `--ink-900 #0E0F13` + 红主色 `--gbc-red #F40000`；日/英/中三语）
- 审查素材：`/workspace/gbc-site/mobile-shots/crops/` 全部 20 张截图（375 宽；`*-fold-375.png` 为真实首屏 375×638，`{page}-{top,mid,bottom}.png` 为整页抓图切片 375×812）
- 方法：逐张 `read_image` 实际查看（含 3×–7× 局部放大核对），并用像素级测量（文字行带、左右边界、元素边框位置、颜色/对比度）与线上 CSS（`/_astro/*.css`）交叉验证根因。所有坐标均为 **375px 宽坐标系的像素值**。
- 结论速览：**blocker 1 / major 12 / minor 25**（共 38 条，详见文末总清单）

---

## 0. 先说三条方法学结论（影响如何解读后面的证据）

1. **`index-mid.png` / `gallery-mid.png` / `gallery-bottom.png` 三张 2,628B 空白图是同一个文件**（sha256 相同 = `04701700…`），内容为纯 `#0E0F13`。
   - `index-mid.png` 与 `index-full.png` 缩放后 **y=1624 处逐像素完全一致（mean diff = 0.0）** → 首页中段确实存在纯背景空白区（真实现象）。
   - `gallery-bottom.png` 与 `gallery-full.png` 缩放后 **y=33292 处逐像素完全一致（mean diff = 0.0）** → 画廊确实存在纯背景空白区。
   - 但 `gallery-mid.png` **与其标称偏移（y812）不符**（该处实际是 `#14161B` 空占位盒，mean diff 83.35）→ 该张 2.6KB 图不可作为"该位置无内容"的证据。故画廊空白现象另列为"需实机复核"，同时保留可核验的部分（空图占位盒、整页高度）。
2. **整页抓图高度超过 Chromium 单张纹理上限**：`gallery-full.png = 1170×251010`（DPR3），换算 375 空间 **整页高 ≈ 80,452px**。极长页面的整页抓图本身会产生拼接空白，因此空白区域需以实机滚动复核为准（下文已逐条标注可信度）。
3. **`diagnostics.json` 的小目标尺寸与当前线上 CSS 不一致**：diagnostics 记「出典：官方网站」类链接高 **16–17px**，但线上 CSS 对 `.src a / .mu-src a / .member__quote footer a / .footer__sources a` 明确声明 `min-height:44px; padding-block:12px; margin-block:-12px`，`.nav__toggle` 声明 `44px×44px`（diagnostics 记 36×44）。截图实测页脚链接行间距 50px，与 44px 盒模型吻合。**结论：小目标问题可能已在当前部署版本修复，必须以实机/最新构建复核后再决定是否放行**（见 major M8–M10）。

---

## 1. 首页 index

素材：`index-fold-375.png`（首屏）、`index-top.png`、`index-mid.png`、`index-bottom.png`

| # | 严重度 | 问题 | 位置（375 坐标） | 证据 |
|---|---|---|---|---|
| I-1 | **major** | **hero 立绘右边缘被裁，角色右脸/头发被切掉**。`img.hero__img` 实测宽 **398px** > 视口 375/390px，且 `body{overflow-x:hidden}` 使被裁部分永远不可见（不是可滚动的溢出）。 | hero 区 x≈240–375 全高；放大 `hero_right` 可见右眼以外面部被屏缘切断 | `index-fold-375.png`、`index-top.png`、`hero_right` 放大图；`diagnostics.json` wideCount=3 `img.hero__img w=398`；CSS `.hero{overflow:hidden}` |
| I-2 | **major** | **hero 主标题断行错误、词被拆开**：`怒りも、悲 / しみも、 / 全部ぶつけろ。` 把「悲しみ」拆到两行，第 1 行以「悲」结尾。根因：`--fs-display: clamp(2.5rem,8vw,5rem)` 在 375px 取 **40px**，可用内容宽仅 **327px**（375−2×24 `--container-pad`），作者用 `white-space:pre-line` 指定的换行被软换行打断。 | y≈200–316（3 行，字身 39px、行距≈44px） | `index-fold-375.png`、`hero_head` 3× 放大图；CSS `.hero__title{font-size:var(--fs-display);white-space:pre-line}` |
| I-3 | **major** | **轮播当前指示点渲染成 36×44 实心红块**，未选中项是 28×4 细灰条 → 面积差约 14 倍，看起来像一个"没有图标、坏掉的红色按钮"。根因（CSS bug）：`.hero__dot{background:#ffffff47;background-clip:content-box}` 被 `.hero__dot[aria-current=true]{background:var(--gbc-red)}` 的 `background` **简写重置为 `border-box`**，于是红色涂满 padding 区。 | y≈452–496，红块 x≈80–116（36×44） | `index-fold-375.png`、`carousel` 4× 放大图（红块 vs 两条 28×4 灰条）；CSS 规则原文见上 |
| I-4 | **major** | **首页中段约 1,270px 纯背景空白**（375 空间 y≈1218–2488）。`index-mid.png` 整张为 `#0E0F13`（与整页抓图逐像素一致）。按 HTML 该区域应含 `section.section.container > .grid.grid--5.cc-rail`（5 张角色卡：井芹仁菜/河原木桃香/安和昴/海老塚智/ルパ）与 `section.section.band`，抓图时连标题文字都未出现。 | `index-mid.png` 全图；整页内容带在 y≈815–1180、1218–2488 之间完全断裂 | `index-mid.png`；`index-full.png` 内容带扫描；`index.html` 结构 |
| I-5 | minor | hero 主标题行高 **1.02**（40px 字号 → 41px 行距），三行 CJK 几乎贴在一起（实测字身 39px、行距≈44px），笔画有相碰观感。 | y≈200–316 | `hero_head` 3× 放大图；CSS `.hero__title{line-height:1.02}` |
| I-6 | minor | 轮播控件整体靠左（`‹` x≈25–69、指示点、`›` x≈215–257），**右侧约 1/3 屏宽完全留空**，视觉重心失衡（经 CSS 核实为 `.hero__controls{display:flex}` 左对齐所致，非溢出）。 | y≈452–496，x 257–375 为空 | `carousel` 放大图；CSS `.hero__controls` |
| I-7 | minor | hero 小标「TV ANIME / 2024」为 **12px** 霓虹青 `#2dfec6`（对比度 9.2:1 合格，字号偏小）。 | y≈160–178 | `hero_head` 放大图；CSS `.hero__kicker` |
| I-8 | minor | 红色数据条 `413 ARTWORKS / 914 ASSETS`：数字白字约 24–28px 合格，但**标签 11px 白字压 `#F40000`，对比度 4.33:1**，低于小字号 AA 4.5:1。 | y≈639–707（红条），标签 y≈690–704 | `index-top.png`、`stats` 3× 放大图；白 `#FFFFFF` vs `#F40000` = 4.33:1 |
| I-9 | minor | CTA「查看剧情」按钮 **117×44 ✓ 尺寸合格**，但白字压 `#F40000` 同样为 **4.33:1**（约 15px 白字），未达 AA。 | x23–140，y≈388–432 | `index-fold-375.png`、`cta` 5× 放大图 |
| I-10 | minor | diagnostics 记录 hero 内存在一个 **2×204px 的 `<a>`**（宽度 2px，实际不可点）。 | hero 轮播区内 | `diagnostics.json`（`a "45 井芹仁菜 N" 2x204`） |

---

## 2. 角色 characters

素材：`characters-fold-375.png`、`characters-top.png`、`characters-mid.png`、`characters-bottom.png`

| # | 严重度 | 问题 | 位置 | 证据 |
|---|---|---|---|---|
| C-1 | **major** | **角色缩略图横滑轨道第 3 张在屏幕右缘被切断**：盒 1 x24–150、盒 2 x165–293、盒 3 从 **x308 起被视口截断**（仅剩 ~67px），无渐隐/露出提示、无滚动条；且抓图时 3 个缩略图**全是空深色块（图片未加载，无骨架）**。 | y≈440–560 | `characters-mid.png`、`thumb_row` 3× 放大图 |
| C-2 | **major** | **小目标 16 个**（diagnostics）：含 5×`girls-band-cry.com/…` 16px 高、5×`萌娘百科：…` 16px 高，均为行内纯文字链接、无按钮外观。**需与最新构建复核**（当前 CSS 对 `.member__quote footer a` 已声明 44px 高）。 | 每个角色档案引文块下方 | `diagnostics.json`；`characters-mid.png` 出典行 y333–386 |
| C-3 | minor | 简介段落中的行内链接「动画官方网站角色页」**跨行断裂**（第 1 行末尾只剩一个「动」字，第 2 行接「画官方网站角色页」），下划线随之断开。 | y205–262（左边距 23px，右边界 350px） | `characters-top.png`、`chars_intro_line` 4× 放大图 |
| C-4 | minor | 出典行的长 URL「girls-band-cry.com/character/subaru」**在行中断开**，字号仅 12px 灰字 `#9aa1ae`，可读性差。 | y≈340–386 | `characters-mid.png`、`source_row` 4× 放大图 |
| C-5 | minor | **同一"引文/来源"组件在全站使用三种强调色**：characters 引文块左侧竖线为**绿色 `#79C355`**（实测 x23–25、y211–411）；story 同组件竖线为**几乎不可见的 `#23252E`**；story「致敬」块又是**红色**。与全站强调色 `--neon-cyan #2dfec6` 也不一致。 | characters-mid x23–25 / story-mid x47–48 | 像素采样；`characters-mid.png`、`story-mid.png` |
| C-6 | minor | 档案表（声优/定位/团体）行分隔线对比度极低；「团体」值换行后第二行与首行对齐但层级弱（标签 14px 灰 5.6:1、值 14px 白 11:1，本身合格）。 | y≈15–180 | `characters-mid.png`、`dl_rows` 放大图 |
| C-7 | minor | 「角色 PV 30s」按钮 111×45 ✓ 尺寸合格，但 1px 边框对比度低（`--ink-600`），在深底上几乎看不到按钮边界。 | y≈680–730 | `characters-mid.png` |

---

## 3. 剧情 story

素材：`story-fold-375.png`、`story-top.png`、`story-mid.png`、`story-bottom.png`

| # | 严重度 | 问题 | 位置 | 证据 |
|---|---|---|---|---|
| S-1 | **major** | **小目标 33 个**（全站最多）：13 话 × 2 条「出典：官方网站」93×16 /「出典：萌娘百科」89×16，均为 `<p class="src"><a>` 行内链接（无 min-height 的旧构建下即为 16px 高）。**需与最新构建复核**（CSS 已对 `.src a` 声明 `min-height:44px;padding-block:12px;margin-block:-12px`）。 | 每话梗概下方 | `diagnostics.json`；`story-mid.png` 出典行 y425–434 |
| S-2 | minor | **日文原文与中文译文缺少视觉层级**：两段都是 ~16px、近白（JP 12.5:1 / CN 12.2:1），读者无法一眼区分"原文"与"译文"；且行距 **31px（≈1.9）** 使 13 话的长页更加冗长。 | story-top y390–800 | `story-fold-375.png`、`story-top.png`；行带测量 397/428/459/490/520/551 |
| S-3 | minor | **每个日文句号「。」后都多出一个空格**（放大可见「主人公。 仲間に裏切られて」「少女。 両親に捨て」），全篇观感不统一（日文排版惯例不加空格）。 | story-fold y395–545 | `body_spacing` 3× 放大图 |
| S-4 | minor | 元数据表（脚本 花田十輝 / 分镜 田辺泰裕 / 演出 田辺泰裕）面板底色 `#14161B` 与页底 `#0E0F13` 对比极低，几乎看不出是表格区块。 | story-mid y≈210–310 | `meta_table` 3× 放大图 |
| S-5 | minor | 时间轴节点「07」方框 + 标题「名前をつけてやる / 为它取名」层级正常（已放大核对，**不是缺图占位符**）；但节点方框边框对比度低。 | story-mid y≈500–545 | `logo_box` 4× 放大图 |

---

## 4. 画廊 gallery

素材：`gallery-fold-375.png`、`gallery-top.png`、`gallery-mid.png`、`gallery-bottom.png`

| # | 严重度 | 问题 | 位置 | 证据 |
|---|---|---|---|---|
| G-1 | **blocker** | **第 4 个分类 tab「收藏集 120」在 375px 下完全在屏幕外**：tab1 x23–132（全部 201）、tab2 x140–241（海报 30）、tab3 x250–350（贺图 51）、**tab4 从 x359 起，仅露出 ~16px 左边框，文字「收藏集 120」100% 不可见**。根因：`.gp-tabs{display:flex;overflow-x:auto;scrollbar-width:none}` + `::-webkit-scrollbar{display:none}` → 唯一的滚动提示被主动隐藏，且 4 个 tab 总宽 ≈459px > 375px。**该分类含 120/201 张图（占全站画廊 60%）**，用户基本不可能发现。 | tab 行 y292–333 | `gallery-fold-375.png`、`tabs_zoom` 4× 放大图；线上 HTML `data-gal-tab="collect"`「收藏集 120」；CSS `.gp-tabs` |
| G-2 | **major** | **整页长度失控**：375px 视口下 `gallery-full.png` 换算整页高 **≈80,452px（约 126 屏）**，196 张 `loading="lazy"` 图片、1 列 masonry、`--container-pad 24px` + 24px 行距，无分页/无限加载/虚拟化 → 长滚动、解码与内存压力。 | 整页 | `gallery-full.png` 尺寸 1170×251010（DPR3）；`gallery.html` lazy=196 / eager=7；CSS `.gal--masonry{columns:1}` |
| G-3 | **major**（需实机复核） | **画廊中段大面积空白/空图占位**：抓图中存在**成片的 `#14161B` 空图占位盒（有 1px 边框、无图、无骨架动画）**，以及 **≥812px 连续纯背景区**（`gallery-bottom.png` 与整页 y33292 逐像素一致）。`gallery-mid.png`/`gallery-bottom.png` 均为 2,628B 纯 `#0E0F13` 图。因整页抓图超出单张纹理上限（251,010px 高），空白成因含拼接伪影，**必须实机滚动复核**：若属实，属"图片未加载且无骨架"的可见缺陷。 | 画廊中段/下段多处 | `gallery-mid.png`、`gallery-bottom.png`、`gallery-full.png`；CSS `.gal__item{background:var(--ink-850)}`（= `#14161B`） |
| G-4 | minor | **缩略图说明与"放大"图标只在 hover 出现**：`.gal__hover{opacity:0}`，仅在 `:hover`/`:focus-visible` 变 1，且相关 hover 规则包在 `@media(hover:hover) and (pointer:fine)` 内 → **触摸设备永远看不到图片说明和放大提示**（说明仍可在灯箱 `.lb__caption` 中看到，故降为 minor）。 | 全部画廊项 | CSS `.gal__hover`、`.gal__zoom`；`gallery.html` 有 `data-lightbox-*` |
| G-5 | minor | 分类 tab 高度实测 **42px**（y292–333），略低于 44px 建议值。 | tab 行 | `gallery-fold-375.png` 边框扫描 |
| G-6 | minor | 未选中 tab 文字 14px `#9aa1ae`（5.7:1 ✓）、选中 tab 白字 + 红色计数；但 tab 面板底色 `#14161B` 与页底 `#0E0F13` 对比过低，卡片边界几乎不可见。 | tab 行 | `tabs_zoom` 放大图 |
| G-7 | ✅ 正面 | 图片**未变形**：首图渲染 325×217（比例 1.50）≈ 源图 1920×1263（1.52），masonry 1 列、左右各 24px 边距正确。 | gallery-top y382–598 | `gallery-top.png` 图像带扫描；`gallery.html` 有显式 `width/height` |

---

## 5. 音乐 music

素材：`music-fold-375.png`、`music-top.png`、`music-mid.png`、`music-bottom.png`

| # | 严重度 | 问题 | 位置 | 证据 |
|---|---|---|---|---|
| M-1 | **major** | **首屏专辑标题被底部播放条横向切断**：`名もなき何もかも` / `気鬱 白濁オ` 两行标题下半截被播放条覆盖（标题字身 y565–576，播放条上沿 y≈578，`overflow` 直接切掉字形下半部）。播放条固定高 60px（y578–638），`body.has-player{padding-bottom:64px}` 只保证页面**末尾**不被永久遮挡，首屏内容仍落在覆盖区。 | music-fold y565–576；播放条 y578–638 | `music-fold-375.png`、`music_fold_bottom` 4× 放大图、`music-top.png`（整页抓图同样被切） |
| M-2 | **major** | **小目标 23 个**：15×「出典：官方网站」89–93×16（曲目/单曲来源行）+ 页脚 2 条；均为 12px 灰字行内链接。**需与最新构建复核**。 | 每个单曲/专辑区块底部 | `diagnostics.json`；`music-mid.png` 出典行 y≈299 |
| M-3 | minor | 元信息灰字 12px（「2024 年 7 月 10 日 · CD 单曲盘: UMCK-5758」），对比度 5.5:1 合格但字号偏小、层级弱。 | music-mid y15–25 等 | `music-mid.png`；字身 11px |
| M-4 | minor | 曲目行行高 **39px**（<44px）；行内「※ 第7话动画插入 Live版本」换行后「Live版本」单独成行，中日拉丁混排无间隔。 | music-mid y58/97 | `music-mid.png` 行带扫描 |
| M-5 | ✅ 正面 | 2 列专辑卡 **153×152 ✓ 方形未变形**，列间距 24px、右边距 24px，网格正确。 | music-fold y394–545 | `music-fold-375.png` 卡片框扫描 |
| M-6 | minor | 区块头「SINGLES シングル」右侧计数「11 TITLES」12px 灰色 mono，偏小；日文副标与英文主标层级 OK。 | music-fold y≈145–165 | `music-fold-375.png` |

---

## 6. 全站共用（页头 / 底部播放条 / 页脚）

素材：5 张 `*-fold-375.png`、4 张 `*-bottom.png`（页脚）

| # | 严重度 | 问题 | 位置 | 证据 |
|---|---|---|---|---|
| X-1 | **major** | **底部迷你播放条遮挡正文**（全站固定 `z-index:90`，高 60px）：音乐页首屏把专辑标题切一半（M-1）；characters 首屏角色立绘卡下半部被盖；首页 hero 底部同样被盖。 | 视口底部 y578–638 | 5 张 fold 图；CSS `.mp{position:fixed;bottom:0}` |
| X-2 | minor | **页头品牌 logo 不可辨认**：`.nav__brand img{height:26px;width:auto}`，源图 1024×768 → 渲染约 **35×26px**，放大后笔画糊成一团、对比度极低。 | 页头 x≈20–55，y≈22–48 | `header` 6× 放大图；CSS `.nav__brand img` |
| X-3 | minor | **视口 meta 无 `viewport-fit=cover`**，而 `.mp` 使用 `padding-bottom:env(safe-area-inset-bottom,0)`：一旦启用 cover，播放条会多出 ~34px（home indicator），而 `body.has-player` 预留仍为 64px → 页脚最后一行（`© 2026 GBC FAN SITE`）会被永久遮住。当前未启用 cover，故暂不成灾。 | 全站 | `<meta name="viewport" content="width=device-width, initial-scale=1">`；CSS `.mp` / `body.has-player` |
| X-4 | minor | 播放条为半透明毛玻璃（`#08090bf0` + `backdrop-filter:blur(16px)`），**在不同页面底色上呈现不同色调**（首页实测 (23,8,10) 暗红、characters/music 近黑 (8,8,11)、story/gallery (14,15,19)），跨页观感不统一。 | 视口底部 | 像素采样；CSS `.mp{background:#08090bf0}` |
| X-5 | minor | 播放条副标题 `.mp__sub{font-size:10px}`（实测 x-height 7px，灰 `--ink-300`）——10px 在手机上过小。 | 播放条 y≈590–612 | `index-fold-375.png`、`player` 4× 放大图；CSS `.mp__sub` |
| X-6 | minor | 页脚 SOURCES 每条把日文标题与中文说明**无分隔符拼在一行**（「アニメ公式サイト 动画官方网站」「ゲーム公式サイト 游戏官方网站」「萌娘百科 · 少女乐队哭泣 中文条目」），中文说明还用更小的 12px，视觉上像重复文案/错字。 | 页脚 y≈420–540 | `index-bottom.png`、`story-bottom.png`；`index.html` 页脚 markup |
| X-7 | minor | 页脚 SITEMAP 链接点击盒实测 **29×44**（宽 29px < 44px，仅两字宽）；来源链接文字 14px 灰 `#9aa1ae`。 | 页脚 y206/257/307 | `index-bottom.png` 行带；`diagnostics.json` |
| X-8 | minor | 页脚免责声明 12px（`--fs-xs`）灰字，实测字形高 10–11px，手机上偏小（对比度 5.7:1 合格）。 | 页脚 y≈690–730 | `index-bottom.png`；CSS `.footer__note{font-size:var(--fs-xs)}` |
| X-9 | ✅ 正面 | 页脚**来源链接已具备 44px 点击高度**（`min-height:44px`，行间距实测 50px），`.nav__toggle` 为 **44×44**、轮播箭头 **44×44**、CTA 117×44、画廊 tab 42px——除 diagnostics 记录的旧值外，大部分触控目标尺寸达标。 | — | CSS + 截图测量 |

---

## 7. 已核实"正常"项（避免误伤，供开发对照）

- **无横向溢出**：5 个页面 `overflowX=0`、`scrollW == viewportW`；正文左边距实测 23–25px = `--container-pad:24px` ✓，正文右边界 340–350px（右边距 25–31px）✓，不存在"文字贴边/被裁"。
- **正文排版**：`--fs-body 1rem` 16px、行距 31px（1.9）偏松但可读；`--ink-300 #9aa1ae` on `#0E0F13` ≈ 7.3:1 ✓。
- **图片无变形**：音乐 2 列卡 153×152 方形 ✓；画廊 masonry 1 列、按源比例渲染 ✓（源 1.52 vs 渲染 1.50）。
- **无障碍基础**：有 `.skip-link`、tab/画廊项为 `<button>`（键盘可达）、轮播项有 `aria-label`、`aria-pressed`/`aria-current` 状态齐备、`prefers-reduced-motion` 有降级规则。
- **播放条与页头层级**：播放条 `z-index:90` < 页头 `z-index:100`，页头为 `position:sticky`（高 64px），不遮挡彼此；`body.has-player` 预留 64px ≈ 播放条实测 60px，页面末尾不会被永久遮挡。
- **汉堡按钮**：图标 24px 宽、3 条 2px 白条，按钮 44×44，可见性与尺寸均 ✓。

---

## 8. 问题总清单（按严重程度排序）

### BLOCKER（1）
1. **G-1** 画廊第 4 个分类 tab「收藏集 120」（占全站画廊 60% 的图片）在 375px 下完全不可见：tab 从 x359 起被裁，`.gp-tabs` 的滚动条被 `scrollbar-width:none` + `::-webkit-scrollbar{display:none}` 隐藏，无任何可滑动提示。修复：允许 tab 换行成两行 chips，或加右缘渐隐 + 露出下一 tab 的 20–30%；不要隐藏滚动提示。

### MAJOR（12）
2. **I-1** 首页 hero 立绘右侧被裁（`img.hero__img` 398px > 375px 视口，`body{overflow-x:hidden}` 使其不可见）：角色右脸/头发被切断。
3. **I-2** hero 主标题把「悲しみ」拆到两行（40px 字号 / 327px 可用宽 + `white-space:pre-line`）。
4. **I-3** 轮播当前指示点被渲染成 36×44 实心红块（`background` 简写重置 `background-clip:content-box` 的 CSS bug），与 28×4 未选中条形成 14 倍面积差。
5. **I-4** 首页中段约 1,270px 纯背景空白（`index-mid.png` 与整页逐像素一致）：角色横滑轨道与 band 区块未渲染。
6. **X-1 / M-1** 底部固定迷你播放条（60px）遮挡正文：音乐页首屏专辑标题被横向切断一半；characters 立绘卡、首页 hero 底部同样被盖。
7. **G-2** 画廊整页高 ≈80,452px（≈126 屏）、196 张 lazy 图、无分页/虚拟化。
8. **G-3** 画廊中段成片空图占位盒（`#14161B` 有框无图）与 ≥812px 纯背景空白（**需实机滚动复核**，抓图含拼接伪影）。
9. **C-1** characters 缩略图横滑轨道第 3 张在右缘被切断且无滑动提示；缩略图全部未加载（空块、无骨架）。
10. **C-2** characters 16 个小目标（出典/萌娘百科 16px 高）——**需与最新构建复核**。
11. **S-1** story 33 个小目标（出典链接 16px 高，全站最多）——**需复核**。
12. **M-2** music 23 个小目标（出典链接 16px 高）——**需复核**。
13. **C-5** 同一"引文/来源"组件使用三种强调色（characters 绿 `#79C355` / story 近不可见 `#23252E` / story 致敬块红色），与全站 `--neon-cyan #2dfec6` 也不统一。

### MINOR（25）
14. **I-5** hero 主标题行高 1.02，三行 CJK 几乎相碰。
15. **I-6** 轮播控件整体左对齐，右侧约 1/3 屏宽留空，视觉重心失衡。
16. **I-7** hero 小标 12px 偏小。
17. **I-8** 红条标签 11px 白字压 `#F40000`，对比度 4.33:1（< AA 4.5:1）。
18. **I-9** CTA「查看剧情」白字压 `#F40000`，4.33:1。
19. **I-10** hero 内存在 2×204px 的 `<a>`（不可点）。
20. **X-2** 页头品牌 logo 仅约 35×26px，不可辨认。
21. **X-3** 视口 meta 缺 `viewport-fit=cover` 而播放条用 `env(safe-area-inset-bottom)`：启用 cover 后页脚末行会被永久遮挡。
22. **X-4** 播放条半透明毛玻璃在不同页面呈现不同色调（首页偏暗红），跨页不统一。
23. **X-5** 播放条副标题 10px 过小。
24. **X-6** 页脚 SOURCES 日文标题 + 中文说明无分隔符拼接，像重复文案。
25. **X-7** 页脚 SITEMAP 链接点击盒宽仅 29px（<44px）。
26. **X-8** 页脚免责声明 12px（字形高 10–11px）偏小。
27. **C-3** characters 简介行内链接「动画官方网站角色页」跨行断裂（第 1 行末尾只剩「动」）。
28. **C-4** characters 出典长 URL 行中断开、12px 灰字，可读性差。
29. **C-6** characters 档案表分隔线与「角色 PV」按钮边框对比度过低。
30. **S-2** story 日文原文与中文译文无视觉层级；行距 1.9 使 13 话长页更冗长。
31. **S-3** story 每个日文「。」后多一个空格，全篇观感不统一。
32. **S-4** story 元数据表面板底色与页底对比极低。
33. **G-4** 画廊缩略图说明与放大图标仅 hover 可见（触摸设备永远看不到，说明需进灯箱）。
34. **G-5** 画廊分类 tab 高 42px（<44px）。
35. **G-6** 画廊 tab 面板底色 `#14161B` 与页底对比过低，卡片边界不可见。
36. **M-3** music 元信息灰字 12px 偏小。
37. **M-4** music 曲目行高 39px（<44px），「Live版本」换行混排无间隔。
38. **M-6** music 区块计数「11 TITLES」12px 偏小。

> 说明：清单中第 10–12 项（C-2/S-1/M-2）与第 27、33 项依赖构建版本，已在对应条目注明复核方式；第 8 项（G-3）已注明抓图伪影的可能性与实机复核步骤。

### 统计
| 严重度 | 数量 |
|---|---|
| **blocker** | **1** |
| **major** | **12** |
| **minor** | **25** |
| 合计 | **38** |

---

## 9. 建议修复优先级（上线前）

1. **P0（阻断）**：G-1 画廊分类 tab 换行/加渐隐提示（一行 CSS，影响 60% 内容可达性）。
2. **P0**：I-1 hero 立绘裁切 + I-2 标题断行（首屏第一印象，均为移动端专属问题）。
3. **P1**：I-3 指示点 CSS bug（`background-color` 代替 `background` 简写，一行修复）；X-1/M-1 首屏内容避开 60px 播放条覆盖区。
4. **P1**：C-2/S-1/M-2 用实机（或最新构建）复核出典链接触控高度；若仍为 16px，统一给 `.src a/.mu-src a/.cite a` 加 44px 命中区。
5. **P1**：G-2/G-3 画廊分页或无限加载 + 骨架占位 + 实机滚动复核空白区。
6. **P2**：C-1 缩略图轨道滑动提示与骨架；I-4 首页中段空白区渲染确认；C-5 统一引文块强调色；其余 minor 按页批量清理。
