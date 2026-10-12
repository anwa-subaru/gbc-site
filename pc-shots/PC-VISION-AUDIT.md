# GBC 粉丝站 · PC 桌面端（1440px）视觉/排版图像识别审查

- **审查对象**：https://gbc.misakamikoto.xyz （index / characters / story / gallery / music）
- **视口**：1440×900（PC 桌面端），截图缩放至 768 宽
- **审查方式**：逐张 `read_image` 目视识别 + 对原图（`*-fold.png` / `*-full.png`，1440px 原始分辨率）做像素级测量交叉验证
- **辅助产物（本次生成，可复用）**：
  - `overview/*-ov*.png`：各页整页缩略图（用于判断整体构图与留白分布）
  - `detail/*.png`：1440px 原始分辨率的局部放大图（页头、播放条、栏目标题、卡片、表格、正文、logo 素材）
- **结论口径**：本报告区分「真实缺陷」与「截图采集假象」。凡属采集假象的，均标注 `⚠️采集假象` 并说明为何仍需处理。

---

## 0. 先说清楚：截图的可信边界（影响后续所有判断）

这一点必须先讲，否则会把「截图没渲染出来」误判成「线上坏了」。

经核对线上 HTML/CSS/JS，本站的空白区域来自两套机制，**都不是线上用户会看到的静态缺陷**：

1. **`data-reveal` 滚动进场动画**
   - CSS：`[data-reveal]{opacity:0;transform:translateY(16px)}`，靠 `IntersectionObserver` 加 `.is-visible` 才显现（`Layout.astro` 脚本内 `T()`）。
   - 全页截图时视口外的元素 IO 未触发 → 整块 `opacity:0`。
2. **`loading="lazy"` 图片**
   - characters 页 214 处、gallery 页 196 处、index 15 处、music 13 处 `loading="lazy"`；全页截图不滚动 → 视口外图片不加载，只留卡片底板。

**因此下列区域在本批截图中不可作为「缺陷证据」，必须滚动后重拍才能审查**：

| 区域 | 文档 y 位置 | 截图表现 |
|---|---|---|
| index CHARACTER 5 卡网格 | ~1150–1700 | 纯黑（卡片 `opacity:0`，图片其实是 `loading="eager"`） |
| index EXPLORE 3 卡网格 | ~1800–2400 | 纯黑 |
| characters 02–05 立绘 + 全部换装缩略图条 | 各角色块内 | 只剩主题色渐变/空底板 |
| gallery 首屏以下全部图块 | y>900 | 只剩 `#14161b` 底板 + 1px 边框 |
| music ROLE PV 5 支视频 | ~11000–12100 | 纯黑 |

**但仍要处理**，理由（已在报告中计为 major）：
- 内容默认 `opacity:0`、**只由 JS 点亮**：JS 报错/被拦/超时 → 首页 42%（3354px 中的 ~1400px）永久空白，且没有任何 `<noscript>` 兜底。
- 无 JS 的抓取（社交预览、阅读模式、存档、搜索引擎渲染、设计评审截图）都会看到「半页空白」，品牌观感受损。
- 本批截图的 `top/mid/bottom` 并非严格连续切片：`fold` 为首屏（doc 0–900），`top/mid/bottom` 各为 1440×1688 文档像素，分别锚定 **页首 / 页中（H−1688)/2 / 页尾**。审查时已按此换算。

---

## 1. index（首页）

截图：`crops/index-fold.png`、`crops/index-top.png`、`crops/index-mid.png`、`crops/index-bottom.png`、`overview/index-ov1.png`、`detail/index-hero.png`、`detail/index-player.png`、`detail/index-header.png`、`detail/index-strip.png`、`detail/zoom-logo.png`、`detail/zoom-cover.png`

### I-1【blocker】首屏主标题在 1440px 下被挤成 4 行、且在词中折断
- **截图**：`crops/index-fold.png`、`crops/index-top.png`、`detail/index-hero.png`
- **现象**：源码里标题是**两行**（`white-space:pre-line` 显式换行）：
  `怒りも、悲しみも、\n全部ぶつけろ。`
  实际渲染成 **4 行**：
  `怒りも、悲` / `しみも、` / `全部ぶつけ` / `ろ。`
  「悲しみ」（悲伤）被从中间劈开成 `悲` + `しみも、`；`全部ぶつけろ。` 被劈成 `全部ぶつけ` + `ろ。`
- **像素证据**：标题 4 条墨迹带（doc y）：`300–380`(x128–561) / `388–460` / `462–544`(x127–516) / `553–623`(x133–234)；行距 ≈85px，字号 = `--fs-display` 在 1440 被 clamp 到 `5rem = 80px`（字宽实测 ≈78–86px/字）。第 1 行仅 5 字 = 433px，而 8 字需 ≈640px。
- **成因**：`.hero__copy{max-width:34em}`（≈500–544px）是移动端阅读宽度，与 80px 的 display 字号互相打架；`word-break:keep-all` 又禁止在汉字间断行，于是只能走 `overflow-wrap:break-word` 的「紧急断字」，断点极丑。移动端 8vw 下字号只有 40px 左右，8 字 ≈310px，两行排版成立——**所以这是纯桌面端破版**。
- **修复建议**：`@media(min-width:1024px){.hero__copy{max-width:48em}}`（或给标题单独 `max-width:9em`，即 9×80px=720px，恰好容纳 8 字）；或 ≥1280 时把 `--fs-display` 降到 4.25rem。修复后必须确认两行 `怒りも、悲しみも、` / `全部ぶつけろ。` 各自不折行。

### I-2【blocker】页头/页脚品牌 logo 小到不可辨认（约 6px 高的字标）
- **截图**：`crops/index-fold.png`（左上角）、`crops/characters-fold.png`、`crops/story-fold.png`、`crops/gallery-fold.png`、`crops/music-fold.png`、`detail/index-header.png`、`detail/zoom-logo.png`、`detail/brand.png`
- **现象**：页头左上角的 GIRLS BAND CRY 字标在 1440px 下渲染为 **约 37×28px 的小方块**，其中真正的字标墨迹只有 **约 35×6–7px**，完全不可读，远看像一块脏点/破图。
- **像素/素材证据**：
  - CSS：`.nav__brand img{width:auto;height:28px;object-fit:contain}`；`.footer__brand img{height:24px}`
  - 素材：`/assets/logo/brand/01-brand.webp` 原生 **1024×768（4:3）**，但字标只占画面中间一条横带（约 y300–470 / 768，x10–1000），即字标自身比例约 **5.8:1**。
  - 于是 `height:28px` 下：容器 37×28，字标实际高 = 28×(170/768) ≈ **6.2px**；页脚 24px → 字标 ≈**5.3px**。
  - 实测页头 logo 墨迹：doc x[126..165] w=41、高约 6–7px —— 与推算完全吻合。
- **修复建议**：把素材裁到字标外接框（去掉上下透明留白）另存为专用 wordmark；页头 `height:28px` → 宽约 165px；页脚 `height:24px` → 宽约 140px。若必须复用 4:3 素材，则改为 `height:160px` 级别并配 `object-position` 裁剪。修完在 1440 下目视确认字标可读。

### I-3【major】CHARACTER / EXPLORE 两大区块在截图中整块不可见（`data-reveal` 默认 opacity:0）
- **截图**：`crops/index-mid.png`、`crops/index-bottom.png`、`overview/index-ov1.png`
- **现象**：`CHARACTER` 标题下有约 500px 纯黑，`EXPLORE` 标题下有约 600px 纯黑；整页 3354px 中约 1400px（42%）在截图里是空白。实测 doc y1150–1500（5 卡网格）与 y1800–2400（3 卡网格）**零内容像素**。
- **定性**：`⚠️采集假象`（IO 未触发）——线上滚动时会正常显现。但内容**默认不可见、完全依赖 JS 点亮**，无 `<noscript>` / 无 CSS 兜底，属于真实的健壮性与可抓取性风险。
- **修复建议**：① 重拍截图时逐屏滚动或加 `prefers-reduced-motion` 触发（该分支会把全部 `[data-reveal]` 置为可见）；② 线上加兜底：`<noscript><style>[data-reveal]{opacity:1!important;transform:none!important}</style></noscript>`，或把首屏下一屏的元素改为 CSS 动画（`@starting-style` / `animation-timeline:view()`），不依赖 IO。

### I-4【minor】红色数据条右侧约 190px 空档，整条偏左
- **截图**：`crops/index-top.png`、`detail/index-strip.png`
- **现象**：`5 MEMBERS / 50 RELEASES / 413 ARTWORKS / 914 ASSETS` 四列（`repeat(4,1fr)`）内容全部左对齐，实测起点 doc x = 129 / 431 / 733 / 1035（列宽 302px），第 4 列 `ASSETS` 结束于 ~1120，而容器右缘在 1311 → 右侧空 190px，左侧只空 128px，红条视觉上「没铺满」。
- **修复建议**：`justify-content:space-between`；或每列内容居中；或让首列左对齐容器左缘、末列右对齐容器右缘。

### I-5【minor】播放条三段分区失衡：meta 固定 260px 但标题只占 103px，传输键偏左不在视觉中心
- **截图**：`detail/index-player.png`、`crops/index-fold.png`
- **现象**：桌面端 `.mp__meta{flex:0 1 260px}` 固定 260px，而标题「井芹仁菜 角色 PV」实测仅 doc x204–308（103px）→ 标题与传输键之间约 110px 死区；传输键（上一首/播放/下一首）落在 doc x≈426–544，视口中心是 720，**明显偏左**；进度条被 `flex:1 1 auto` 拉到约 460px 长，右侧又挤着音量与 `ALL PV`。
- **修复建议**：`.mp__inner` 改三区网格 `1fr auto 1fr`（左=曲目信息、中=传输键居中、右=进度/音量/更多）；`.mp__meta` 改 `flex:0 1 auto; max-width:320px`。

### I-6【minor】播放条封面缩略图大部分是空底色，立绘被压得很小
- **截图**：`detail/zoom-cover.png`、`detail/index-player.png`
- **现象**：`.mp__cover{width:56px;height:56px;object-fit:contain;object-position:center bottom}` 配 961×1600 的全身立绘 → 实际人物只占 56px 中的约 33px 宽，左右全是 `--ink-850` 深底；截图中人物下半身还被框底切掉，观感像「缩略图没加载好」。
- **修复建议**：改用方形/头像裁切素材，或 `object-fit:cover;object-position:top center`；必要时去掉 1px 边框改用主题色底。

### I-7【minor】播放条文字偏小（标题 14px / 副标题 12px + 0.08em 字距）
- **截图**：`detail/index-player.png`
- **现象**：`.mp__title{font-size:var(--fs-sm)=14px}`、`.mp__sub{font-size:12px;letter-spacing:.08em;color:var(--ink-300)}`。常驻底栏上 12px 灰字 + 大字距，可读性偏弱（对比度 7.4:1 达标，问题在字号与字距）。
- **修复建议**：副标题提到 13–14px、字距降到 .04em。

### I-8【minor】About/notice 框 727px，容器右侧空 38%
- **截图**：`crops/index-bottom.png`
- **现象**：`.notice{max-width:76ch}` → 实测框体 doc x128–855（727px），而容器宽 1184px（128–1311），右侧 456px 全空，读起来像「排版没收尾」。
- **修复建议**：≥1280 时把 notice 与「站点数据 / 友情链接」组成两栏，或让 notice 占 60% + 右侧放一个右对齐的 logo/统计块。

### I-9【minor】两套左右边界并存（栏目标题分隔线 80–1359 vs 内容 128–1311）
- **截图**：`crops/index-top.png`、`crops/characters-fold.png`、`crops/music-fold.png`
- **现象**：`sec-head--rule` 的分隔线实测横跨 doc x79–1359（= 容器 1280px 的 border-box），而正文/卡片一律 128–1311（= 容器 content-box）。同一屏出现 80 / 128 两个左缘，分隔线比内容宽出 48px。
- **修复建议**：统一到一套栅格（把分隔线放进 padding 内，或让所有内容也吃满 border-box）。

### I-10【minor】hero 上标 kicker 用霓虹青 `#2dfec6`，与红色主色并置显得零散
- **截图**：`detail/index-hero.png`、`crops/index-fold.png`
- **现象**：hero kicker「TV ANIME / 2024」为 12px 霓虹青大写宽字距，压在红/暗插画上；同一青色还散见于 gallery 放大镜图标、notice/页脚链接 hover。全站只出现 3–4 处，读起来像「没定下来的点缀色」。
- **修复建议**：要么把青色收敂为唯一的一处功能色（例如仅用于「可放大」提示），要么统一改用红色系（`#ff3b3b`）与白色。

### I-11【非问题】hero 图 1469px 宽
`--hero__img{transform:scale(1.02)}` + `overflow:hidden` 的设计性出血，1440×1.02=1469，`overflowX=0` 无横滚，属正常，不必修。

---

## 2. characters（角色）

截图：`crops/characters-fold.png`、`-top`、`-mid`、`-bottom`、`detail/characters-table.png`

### C-1【major】02–05 立绘与全部换装缩略图在截图中只剩空底板
- **截图**：`crops/characters-mid.png`、`crops/characters-bottom.png`、`crops/characters-top.png`（对照 01 仁菜正常）
- **现象**：01 仁菜立绘与 4 张换装缩略图正常；02 桃香 / 03 すばる / 04 智 / 05 ルパ 的 473×677 立绘框只剩主题色渐变（绿/品红/黄），下方 4 张 150×240 缩略图是**纯黑空框**（连渐变都没有）。
- **定性**：`⚠️采集假象`（该页 214 处 `loading="lazy"`，视口外未加载）。但两个可执行问题：① 换装缩略图条**没有任何占位/骨架**，慢网或加载失败时就是 4 个黑洞；② 立绘有渐变占位、缩略图没有，占位策略不一致。
- **修复建议**：重拍验证；为缩略图补统一的骨架/渐变占位（沿用 `--c` 主题色）；首屏 1–2 个角色立绘用 `loading="eager"`。

### C-2【minor】换装缩略图条右缘比上方表格分隔线短 15px
- **截图**：`crops/characters-top.png`、`detail/characters-table.png`
- **现象**：`担当/声优/定位/团体` 行分隔线实测 doc x649–1311（宽 663），而 4 张缩略图实测为 `[649..798][815..964][981..1130][1147..1296]`（各 150px、间距 17px），**右缘停在 1296**，比上方规则线短 15px。
- **修复建议**：缩略图网格改 `repeat(4,1fr)` 并去掉固定列宽，或 `justify-content:space-between` 使其吃满 662px。

### C-3【minor】每个角色块约 1240px 高，立绘只有 677px，左列下方约 520px 空置
- **截图**：`crops/characters-top.png`、`crops/characters-mid.png`
- **现象**：5 个角色块把 6199px 的页面撑得很长；右列（编号 01 → 手写体名 → 粗体名 + 英文 → 4 行表格 → 引用 → 缩略图 → PV 按钮）纵向内容明显长于左列立绘，左列下方留下大片空黑。
- **修复建议**：`position:sticky; top:calc(var(--nav-h) + 16px)` 让立绘在滚动中停留，或把引用/缩略图改到左列与立绘并排，压掉纵向空转。

### C-4【minor】编号「01」与名字之间留白过大，信息列节奏偏散
- **截图**：`detail/characters-table.png`
- **现象**：`01`（12px 红）→ 手写体「井芹 仁菜」→ 粗体「井芹仁菜」+ `NINA ISERI` 三段落之间各留 60–90px，而下方表格行距只有 ~50px，层级节奏不统一。
- **修复建议**：给编号/名字定义固定的间距刻度（如 8/16/24），别用大段 margin。

### C-5【非问题】右侧信息列宽 662px、左立绘 473px、间距 49px，合计 1184px 恰好等于容器 content-box
这是全站桌面端**最扎实的一处编辑式排版**：图片列 + 数据表列严格贴合容器，`担当/声优/定位/团体` 分隔线右缘 1311 与容器一致。值得作为其它页面的对齐基准。

---

## 3. story（剧情）

截图：`crops/story-fold.png`、`-top`、`-mid`、`-bottom`、`detail/story-text.png`

### S-1【major】1440px 下仍是「单窄栏」构图，约 57% 宽度长期空置，页面 13494px
- **截图**：`crops/story-fold.png`、`crops/story-mid.png`、`crops/story-bottom.png`
- **现象**：
  - 正文栏实测 doc x409–1029（620px），居中于 1184px 容器（左内缩 281、右内缩 282）→ 左右各空 ~280px；
  - 剧集列表的**时间轴竖线在 x447**、编号方块 407–487、文字列 519–1029 → 左侧 0–400px 除插画带外**全空**；
  - 列占用率实测：x1320–1440 段 0%，x480–1040 段仅 3–16%，x0–440 段 10–13%（插画带）；
  - 页面总高 **13494px ≈ 15 屏**，13 话单列排布。
- **修复建议**：≥1280 时剧集列表改**双列网格**（2×N，编号+标题+摘要一卡），可把页高砍掉近一半；时间轴竖线左移与容器左缘 128 对齐，左侧空档放每话的关键帧缩略图（素材站里已有 gallery/poster 资源）。

### S-2【major】同一区块出现三个不同左缘（128 / 409 / 447）
- **截图**：`crops/story-fold.png`、`detail/story-text.png`、`crops/story-mid.png`
- **现象**：`STORY` 大标题与顶部说明行起于容器左缘 **128**；引用块与正文段起于 **409**（引用块的红色 4px 竖线在 408）；剧集列表时间轴在 **447**。三套左缘互相不对齐，在 1440 宽屏上尤其明显（空档被放大成视觉断裂）。
- **修复建议**：正文栏与标题共用左缘（或明确「标题通栏 + 正文缩进 1 栏」并让缩进量等于一个栅格列宽，例如 128+296=424），时间轴与正文栏左缘对齐。

### S-3【minor】插画在**左边缘被硬切**（x=0），右侧 60% 空置
- **截图**：`crops/story-top.png`、`crops/story-fold.png`
- **现象**：doc y1350–2250 实测 `leftgap=0`（内容触及视口左缘 x=0），人物头发被视口左缘切断；同一横带右半（x≈700–1440）纯黑。左切 + 右空的组合看起来像「图放歪了」而不是设计性出血。
- **修复建议**：把出血方向改到右侧（`object-position:right`）与文案形成对角构图；或整体内缩到容器内并加 `--ink-850` 底板。

### S-4【非问题】正文行宽与字号
正文 `--fs-body-lg` 在 1440 = 17.3px，行宽 620px → **约 36 字/行**，属于中文/日文排版的健康区间（30–45 字），对比度也达标（`--ink-300 #9aa1ae` on `#0e0f13` = 7.4:1）。这一项不用改。

---

## 4. gallery（画廊）

截图：`crops/gallery-fold.png`、`-top`、`-mid`、`-bottom`、`detail/gallery-cell.png`

### G-1【major】1440px 只有 3 列，201 张图 → 页面高 31262px（≈35 屏）
- **截图**：`crops/gallery-fold.png`、`crops/gallery-top.png`、`crops/gallery-mid.png`、`crops/gallery-bottom.png`
- **现象**：`.gal--masonry{columns:2}` → `@media(min-width:1024px){columns:3}`，**没有 4/5 列断点**。实测三列各 379px、列距 25px、横跨 128–1311。201 张 ÷ 3 列 = 67 行，页高 **31262px**。
- **修复建议**：`@media(min-width:1280px){columns:4}`、`@media(min-width:1800px){columns:5}`；或改 CSS Grid masonry（`grid-template-columns:repeat(auto-fill,minmax(280px,1fr))`）并加「每页 48 张 / 加载更多」。1920/2560 屏当前会把单图放大到 510/680px，问题更严重。

### G-2【major】超长页面 + 196 张懒加载图，筛选条会滚走，没有分页/回到顶部
- **截图**：`crops/gallery-fold.png`（筛选 pills 在 y≈180）、`crops/gallery-mid.png`、`crops/gallery-bottom.png`
- **现象**：`全部 201 / 海报 30 / 画师 51 / 收藏 120` 四个筛选 pill 位于页面顶部，一旦下滚 35 屏就再也够不到；底部只有一块 727px 的 SOURCES 说明框，无分页、无「回到顶部」、无「加载更多」。`crops/gallery-mid.png` 整张 900px 里只有空底板。
- **修复建议**：筛选条 `position:sticky` 吸顶；底部加「回到顶部」与分页/加载更多；对超长 masonry 用 `content-visibility:auto` 提升滚动性能。

### G-3【minor】白底图（手办/模型照）在深色站点上形成刺眼白块
- **截图**：`crops/gallery-top.png`（第 3 列 3 张白底手办图）、`detail/gallery-cell.png`
- **现象**：深底 `#0E0F13` 的画廊里混入整块纯白矩形，与红色/黄色插画图并列时明度差极大，网格视觉被撕开；图片本身没有统一的底色/描边处理（只有 1px `--border #262932`）。
- **修复建议**：对白底素材加统一处理（内阴影/`filter:brightness(.96)`/统一 `--ink-850` letterbox 底板），或把「手办/收藏」类目默认底色改为深色卡片。

### G-4【minor】标题只在 hover/focus 出现，且被截断到 2 行，无法扫读
- **截图**：`crops/gallery-fold.png`、`detail/gallery-cell.png`
- **现象**：`.gal__hover{opacity:0}` 仅在 `:hover` / `:focus-visible` 显示（focus 支持是加分项），`.gal__label` 用 `-webkit-line-clamp:2` 截断。201 张图在首屏以下没有任何常驻说明，用户只能靠图认内容。
- **修复建议**：提供「显示标题」开关或常驻角标（取标题前 12 字）；hover 面板改为从底部渐显的常驻细条。

### G-5【minor】`columns` 多列布局导致键盘 Tab 顺序按列跳
- **截图**：不适用（代码层）——`columns:3` 下 DOM 顺序沿列排列，Tab 会先走完第 1 列 67 个按钮再到第 2 列。
- **修复建议**：若改 Grid masonry 可同时修正阅读/Tab 顺序（`grid-auto-flow:dense` + 行优先）。

---

## 5. music（音乐）

截图：`crops/music-fold.png`、`-top`、`-mid`、`-bottom`、`detail/music-cell.png`

### M-1【major】单曲详情行只用了 22% 的行宽，右侧 78% 全空
- **截图**：`crops/music-mid.png`、`crops/music-bottom.png`
- **现象**：每条 track 行（`01 誰にもなれない私だから` 等）实测内容仅 doc x128–390（262px），而该行的 1px 分隔线横跨 128–1311（1184px）→ **每行右侧 ~800px 是纯空黑**；13 张单曲 × 3–5 首 ≈ 50 行，累计约 7000px 页面高度都浪费在右侧空档。
- **修复建议**：≥1280 时 track 列表改**双列**（左 6 首 / 右 6 首）；或右对齐补元数据（时长、作词作曲、`试听` 按钮）；或左列固定 560px + 右半放专辑封面/发行信息 sticky 面板。

### M-2【minor】第 8 张单曲无封面，在 4 列封面网格里留了一个「黑洞」
- **截图**：`crops/music-top.png`（第 2 行第 4 格）、`detail/music-cell.png`
- **现象**：`視界の隅 朽ちる音` 在素材库中无封面，站点渲染 `.mu-miss` 占位（唱片圆环 SVG + 「素材库无对应封面」）。占位本身是**有意设计**、文案诚实，但在 4 列纯封面网格里它是一个暗块，破坏了整行节奏（同行另外 3 张都是高饱和彩色封面）。
- **修复建议**：补一张封面；或把占位做成与网格同调的「品牌纸套」（红底 + 曲名 + 站点 logo），使其读起来像设计元素而非缺图。

### M-3【minor】4 列封面网格与栏目标题右对齐关系正确，但标题行 `11 TITLES` 仅 9.4px 高
- **截图**：`detail/music-cell.png`、`crops/music-fold.png`
- **现象**：`SINGLES`(40px) + `シングル`(12px) + 右端 `11 TITLES`（`--fs-label` 12px，实测墨迹高 9.4px）——右端计数标签在 1440 下过小，容易被忽略。封面网格本身实测 4×281px、间距 23px、横跨 126–1312，与容器完全对齐，**无对齐问题**。
- **修复建议**：计数标签提到 13px 或加红色前缀点。

### M-4【非问题】封面清晰度与不变形
4 列 281px 方形封面在 1440 下清晰、无拉伸（素材 1000×1000），`SINGLE` 角标为白底黑字胶囊，在红/黄封面上均可读。此项通过。

---

## 6. 跨页面问题（页头 / 播放条 / 页脚）

截图：`detail/{index,characters,story,gallery,music}-header.png`、`detail/index-player.png`、`crops/*-bottom.png`

### X-1【major】导航日文副标签 10px + opacity .7 → 对比度 4.20:1，未过 WCAG AA
- **截图**：`detail/index-header.png`、`detail/characters-header.png`、`detail/zoom-nav.png`
- **现象**：`.nav__link-ja{font-size:10px;letter-spacing:.06em;opacity:.7}`，颜色 `--ink-300 #9aa1ae` 叠加 0.7 透明度后等效 `#707580`，在 `#0e0f13` 上对比度 = **4.20:1**（小字需 ≥4.5:1），且字号只有 10px。5 个页面 × 5 个导航项全部受影响。
- **修复建议**：字号 11–12px、去掉 opacity（`--ink-300` 原色为 7.4:1，达标），或换 `--ink-100 #e6e8ec`。

### X-2【major】红色栏目标签 12px `#f40000` → 对比度 4.44:1，同样卡在 AA 线下
- **截图**：`detail/index-header.png`（`キャラクター` 等）、`detail/music-cell.png`（`シングル`）、各页 `sec-head__ja`
- **现象**：`.sec-head__ja{font-size:var(--fs-xs)=12px;color:var(--accent)=#f40000}`；`#f40000` on `#0e0f13` = **4.44:1**，差 0.06 达标，且 12px 属于小字。
- **修复建议**：文字用亮一档的红（如 `#ff3b3b` ≈ 5.6:1）或加粗到 600/700 并提到 13px；纯装饰性的红线/红块可继续用 `#f40000`。

### X-3【minor】页脚三栏右半空置、底行中段空置
- **截图**：`crops/index-bottom.png`、`crops/characters-bottom.png`、`crops/story-bottom.png`、`crops/gallery-bottom.png`、`crops/music-bottom.png`
- **现象**：`.footer__inner{grid-template-columns:1.4fr 1fr 1.4fr}`，SOURCES 列内容短，右缘约停在 x1050 而容器到 1311 → 右侧约 260px 空；底部法务行文字 128–520、版权 1256–1309，中间约 700px 空。
- **修复建议**：右栏补一列（关注/友链/站点地图延伸），或把版权行改成 `space-between` 三区；页脚 logo 同样受 I-2 影响，必须一起修。

### X-4【非问题】播放条交互尺寸与 hover 覆盖
`.mp__btn` 44×44、`.mp__btn--play` 48×48、导航项 `min-height:44px`、卡片 hover 有主题色描边 + 立绘 `translateY(-8px)` + 底板展开、gallery 图块 hover 有红描边 + 缩放 + `:focus-visible` 同步、`prefers-reduced-motion` 全站有兜底。桌面 hover 体系完整，无需返工。

---

## 7. 问题总清单（按严重程度排序）

### blocker（2）
| # | 页面 | 截图 | 问题 | 位置 |
|---|---|---|---|---|
| B1 | index | `crops/index-fold.png` `detail/index-hero.png` | 首屏主标题在 1440 被挤成 4 行并在词中折断（`悲`/`しみも、`），两行设计意图丢失 | `.hero__copy{max-width:34em}` × `.hero__title{font-size:5rem}` |
| B2 | 全站（页头/页脚） | `crops/*-fold.png` `detail/zoom-logo.png` `detail/brand.png` | 品牌 logo 渲染约 37×28px、字标实际仅 6px 高，完全不可辨认 | `.nav__brand img{height:28px}` / `.footer__brand img{height:24px}` + 4:3 素材 |

### major（8）
| # | 页面 | 截图 | 问题 |
|---|---|---|---|
| M1 | index | `crops/index-mid.png` `-bottom` | CHARACTER/EXPLORE 整块 `data-reveal` 默认 opacity:0，截图空白；无 JS 兜底 → 首页 42% 内容可永久不可见 |
| M2 | characters | `crops/characters-mid.png` `-bottom` | 02–05 立绘与全部换装缩略图只剩空底板（lazy 采集假象），且缩略图无任何占位/骨架 |
| M3 | gallery | `crops/gallery-fold/top/mid/bottom.png` | 1440 仅 3 列且无 4/5 列断点 → 201 张图 = 31262px（≈35 屏） |
| M4 | gallery | `crops/gallery-fold.png` `-bottom` | 超长页 + 196 张懒加载，筛选条滚走，无分页/回到顶部 |
| M5 | story | `crops/story-fold/mid/bottom.png` | 620px 居中单栏，57% 宽度长期空置，页高 13494px；正文栏/时间轴/标题三套左缘（128/409/447） |
| M6 | music | `crops/music-mid.png` | 单曲 track 行内容仅占 x128–390（22% 行宽），右侧 78% 全空，累计约 7000px 页高浪费 |
| M7 | 全站 | `detail/*-header.png` | 导航日文副标签 10px + opacity .7 → 4.20:1，未过 WCAG AA |
| M8 | 全站 | `detail/music-cell.png` `detail/index-header.png` | 红色栏目标签 12px `#f40000` → 4.44:1，未过 AA |

### minor（15）
| # | 页面 | 截图 | 问题 |
|---|---|---|---|
| m1 | index | `detail/index-strip.png` | 红色数据条四列左对齐，右侧空 190px，整条偏左 |
| m2 | 全站播放条 | `detail/index-player.png` | meta 固定 260px 而标题仅 103px，传输键偏左（x≈426–544 vs 中心 720） |
| m3 | 全站播放条 | `detail/zoom-cover.png` | 封面 56px 盒内人物仅约 33px 宽，四周深底，且底部被切 |
| m4 | 全站播放条 | `detail/index-player.png` | 标题 14px / 副标题 12px + 0.08em 字距，常驻底栏可读性偏弱 |
| m5 | characters | `crops/characters-top.png` | 换装缩略图条右缘 1296 vs 表格分隔线 1311，差 15px |
| m6 | characters | `crops/characters-mid.png` | 每角色块 1240px 高而立绘仅 677px，左列下方约 520px 空置 |
| m7 | characters | `detail/characters-table.png` | 编号/手写名/粗体名之间 60–90px 间距，节奏不统一 |
| m8 | 全站 | `crops/characters-fold.png` | 两套左右边界：`sec-head--rule` 分隔线 80–1359 vs 内容 128–1311 |
| m9 | index | `detail/index-hero.png` | hero kicker 用霓虹青 `#2dfec6`，与红主色并置且全站仅 3–4 处，点缀色不统一 |
| m10 | index | `crops/index-bottom.png` | notice 框 727px（76ch），容器右侧空 38% |
| m11 | story | `crops/story-top.png` | 插画在视口左缘 x=0 被硬切，右侧 60% 空置，像放歪 |
| m12 | gallery | `crops/gallery-top.png` | 白底手办图在深色站点形成刺眼白块，无统一底色处理 |
| m13 | gallery | `crops/gallery-fold.png` | 标题仅 hover/focus 显示且截断 2 行，无常驻标签可扫读 |
| m14 | music | `crops/music-top.png` | 第 8 张单曲无封面，4 列封面网格留黑洞（占位为有意设计但破坏节奏） |
| m15 | 全站 | 多张 | 10–12px 小字偏多：`SINGLE` 角标、`30s` 时长徽标、`cc__count`、`gal__label`、`mp__time`、`11 TITLES`（实测 9.4px） |

**合计 25 个问题：blocker 2 / major 8 / minor 15。**
（另有 6 项经测量判定为**非问题**，已在正文标注：hero 图 1.02 出血、story 正文 36 字/行行宽、music 4 列网格对齐、characters 473+49+662 栅格、播放条 44/48px 触达尺寸与 hover 体系、全站 `overflowX=0` 无横滚。）

---

## 8. 特别评价：整体排版美学是否配得上「高审美」定位

**结论：设计系统是「高审美」的，桌面端落地不是。** 现在这套 1440px 表现，更像「移动/平板版 + 放大字号」，而不是为宽屏重新构图过的桌面站。

### 已经很好的部分（系统层面确实专业）
- **有真正的设计 token**：4px 步进的间距刻度（`--sp-1..9`）、clamp 型字阶（display 80 / h2 40 / h3 24 / body 16 / body-lg 17.3 / sm 14 / xs 12）、完整的 ink 明度梯度（`#ffffff → #08090b`），而不是随手写死的数值。
- **栅格纪律**：`max-width:1280px + padding-inline:48px` → 内容 1184px 居中，实测每页都在 128–1311，gallery 三列（379px/25px 间距）与 music 四列（281px/23px 间距）**两端严丝合缝**，没有一处「差几像素」的糙活。
- **编辑式排版语言**：栏目标题「小号红色日文 + 80px 黑色英文大写 + 负字距」、双语并列（`CHARACTER / キャラクター`、`SINGLES / シングル`）、红色数据条（halftone）、细描边卡片（`#262932`）——这是很标准的日系动画官网语汇，克制、有格调。
- **characters 页是全站审美高点**：473px 立绘列 + 49px 间距 + 662px 信息表列 = 1184px，编号「01」→ 手写体名 → 粗体名 + 拉丁名 → 四行属性表 → 引用块（红竖线）→ 换装缩略图 → PV 按钮，层级清晰、留白有呼吸，完全撑得起「高审美」。
- **story 正文 36 字/行的行宽控制**、**44/48px 的交互尺寸**、**hover/focus 双通道**、**prefers-reduced-motion 兜底**，都是成熟团队的细节。

### 让它掉档的地方（也正是最该补的设计感）
1. **最重要的排版时刻被自己的 max-width 毁了**。hero 是全站唯一的「display 80px」大字舞台，结果被 34em 的移动端阅读宽度逼成 4 行锯齿、词中断字。高审美项目在 hero 上不允许出现「悲/しみも、」这种断法——这是全站最刺眼的一处。
2. **身份层失效**。品牌 logo 只有 6px 高的字标，页头页脚都一样。一个把 red `#F40000` 当主色、把双语排版当卖点的站，自己的名字却读不出来，观感直接掉到「半成品」。
3. **宽屏从未重新构图**。1440px 得到的只是「更大的字、更多的黑」：story 是 620px 居中单栏（57% 宽度空置、13494px 长），music track 行只用 22% 行宽，gallery 永远 3 列（31262px 长）。真正的桌面端高审美应该给出**桌面专属构图**——不对称双栏、sticky 索引列、更大的图像时刻、横向滚动的时间轴——而不是把移动端竖着拉长。
4. **常驻播放条是「功能件」不是「设计件」**。260px 的 meta 盒里只放 103px 的标题、传输键偏在中心左侧、进度条被拉到 460px、封面盒里人物只占 33px。它是全站唯一常驻元素，却最不像被设计过。
5. **色彩点缀没收敛**。霓虹青 `#2dfec6` 只在 hero kicker / gallery 放大镜 / 链接 hover 出现 3–4 次，既不足以成为第二主色，又足以让红色体系显得不纯粹。

### 可以更有设计感的 5 个具体方向
1. **hero 做真正的字体海报**：把「怒りも、悲しみも、全部ぶつけろ。」改成**竖排（tategaki, `writing-mode:vertical-rl`）**，压在右侧立绘旁、让立绘从右缘出血——这是 GBC 这类作品最有记忆点的处理，也彻底绕开横向折行问题。
2. **给全站一套「章节编号」系统**：characters 已有 01–05，把它推广到 story（01–13 话）、music（01–11 单曲）、gallery（分组编号），让五个页面读起来是同一本书的章节。
3. **story 桌面双栏 + 左列关键帧**：≥1280 用 2×N 剧集卡，时间轴竖线归位到容器左缘 128，左侧空档放每话关键帧缩略图（gallery 素材已有），页高直接砍半。
4. **music 双列 track + 右侧 sticky 封面**：左半 6 首、右半 sticky 展示当前单曲封面与发行信息，把 78% 的空行宽变成版面信息密度。
5. **gallery 给「策展感」**：4/5 列密度断点 + 吸顶筛选条 + 常驻细标签 + 「手办/收藏」类目深色底板，让 201 张图看起来是被编排过的展墙，而不是一次倒出来的图库。

> 一句话：**这套设计系统的审美在线，缺的是「为 1440px 单独设计一遍」的那一层。** 修掉 B1/B2 两个 blocker、补上 story/music/gallery 的桌面构图，这个站就能真正对得起它的视觉定位。
