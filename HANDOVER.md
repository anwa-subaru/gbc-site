# GBC 粉丝站 · 交接文档（HANDOVER.md）

> 最后更新：2026-10-13
> 对应提交：`063c09d` 歌词接上官方逐行时间轴（37/38 首）
> 仓库路径：`/workspace/gbc-site`（**本地 git，未配置 remote**）
> 配套文档：[DESIGN.md](./DESIGN.md) 设计规范（色板/字体/网格/组件）、[REVIEW.md](./REVIEW.md) 一次双端视觉审计报告

---

## 0. 30 秒速览

| 项 | 值 |
|---|---|
| 线上地址 | https://gbc.misakamikoto.xyz |
| 服务器 | `82.158.230.34`，Caddy 2.6.2 直接托管静态文件 |
| 站点根目录 | `/var/www/gbc`（328 MB） |
| 本地仓库 | `/workspace/gbc-site` |
| 技术栈 | Astro 5.18.2（纯静态 `output: 'static'`）+ 原生 TS，无框架、无运行时依赖 |
| 页面 | 5 页：`/` 首页、`/music/` 音乐、`/gallery/` 画廊、`/characters/` 角色、`/story/` 剧情 |
| 内容量 | 38 首曲（235 MB 音频）、914 个图片/视频素材、38 首歌词（37 首带官方时间轴，中文 1336 行 / 英文 1390 行）、画廊 530 项 |
| 构建 | `rm -rf dist && BASE_PATH=/ SITE_URL=https://gbc.misakamikoto.xyz pnpm build` |
| 部署 | `tar` 打包 `dist/` → ssh 解到 `/var/www/gbc`（见 §4） |
| 构建产物 | `dist/` 328 MB（其中 `assets/` 326 MB） |
| 页面 HTML | 首页 229 KB / 音乐 323 KB / 画廊 615 KB / 角色 149 KB / 剧情 132 KB（Caddy 走 gzip+zstd；音乐页 gzip 后 89 KB，**主要是内联的歌词数据**） |

**一句话现状**：站点功能完整、线上稳定，五个页面双端零报错；最近一轮工作集中在**播放器的全屏歌词**（全屏化、点播放器进入、逐字扫红、官方 LRC 时间轴）。

---

## 1. 项目定位与硬约束

这是 GIRLS BAND CRY（ガールズバンドクライ）的**粉丝站**，内容整理自官方公开资料。接手前必须知道的四条硬约束：

1. **文案只能来自官方来源**。角色页/剧情页的每一个字都来自 `content/*.md`，而 `content/*.md` 里逐条标注了出处 URL。**不要自己写描述性文案**——这是用户反复强调的红线。
2. **审美好是验收标准，不是加分项**。用户用真机（Android Edge）看，对"干巴巴的过渡""页面跳动""排版不齐"极度敏感。
3. **双端必须都验**。手机（iPhone 13 模拟 / 375–390 宽）与桌面（1440×900）都要过，任何改动都要跑一遍五页 × 双端的回归（见 §8）。
4. **版权敏感**。音频、图片、歌词都是版权物；用户已授权歌词并接受站点风险，站内有免责声明。**不要新增额外的版权说教文案**，也不要移除现有声明。

---

## 2. 目录结构

```
/workspace/gbc-site
├── astro.config.mjs          # site/base 推导（本地 '/'，CI 注入 BASE_PATH）
├── DESIGN.md                 # 设计规范：色板/字体/网格/组件/动效
├── REVIEW.md                 # 一次完整双端审计报告（含历史缺陷）
├── HANDOVER.md               # 本文档
├── content/                  # ★ 文案源（构建期 fs 读取并解析）
│   ├── about.md              #   站点说明
│   ├── characters.md         #   5 位角色（21 KB，逐条带出处 URL）
│   ├── music.md              #   发行物/曲目说明（20 KB）
│   └── story.md              #   13 话剧情（20 KB，日文原文 + 中文译名）
├── public/assets/            # ★ 全部静态素材（326 MB，见 §5.1）
│   ├── manifest.json         #   资产清单（914 条，构建期读取，勿手改）
│   ├── audio/                #   38 个 mp3（235 MB）
│   ├── artworks/  characters/ covers/ emoji/ logo/ posters/ videos/
├── scripts/
│   ├── optimize-assets.py    # 素材管线：源目录 → public/assets + manifest.json
│   ├── lyrics-lrc-align.py   # ★ 官方 LRC 时间轴 → src/data/lyrics/*.json
│   ├── mobile-audit.mjs      # 手机端截图 + 布局诊断（Playwright）
│   └── pc-audit.mjs          # 桌面端同上
├── src/
│   ├── assets/fonts/         # 自托管字体（7 个 woff2，见 §5.4）
│   ├── components/           # 12 个组件（见 §6）
│   ├── data/
│   │   ├── songs.json        # 38 首曲目元数据（n/file/title/artist/dur/cover/album）
│   │   ├── lyrics/NN.json    # 38 首歌词（lines[] + times[]）
│   │   └── gallery-labels.json
│   ├── layouts/Layout.astro  # 全局 head / 导航 / 页脚 / ClientRouter / PlayerBar
│   ├── lib/assets.ts         # ★ 资产访问层（assetUrl/url/category/...）
│   ├── pages/                # 5 个页面
│   └── styles/global.css     # 设计 token + 全局样式
├── mobile-shots/ pc-shots/ review-shots/   # 审计截图（gitignore）
└── dist/                     # 构建产物（gitignore）
```

---

## 3. 本地开发

```bash
cd /workspace/gbc-site
pnpm install                 # 依赖只有 astro + playwright
pnpm dev                     # http://localhost:4321
```

### 3.1 本地预览构建产物（重要坑）

```bash
fuser -k 8899/tcp 2>/dev/null; sleep 1
(cd dist && setsid python3 -m http.server 8899 >/tmp/httpd.log 2>&1 < /dev/null &)
```

⚠️ **`python3 -m http.server` 不支持 HTTP Range**，后果是：

- `audio.currentTime = x` 会被浏览器拒绝并弹回 0（表现为"seek 失败/时间重置"）
- 于是**本地测不了任何 seek 相关行为**：拖进度条、点歌词行跳转、切歌后的定位

**结论**：seek 相关验证必须部署到线上（Caddy 支持 Range）再测。本地只适合验证 DOM/CSS/交互流程。合成事件 `dispatchEvent(new Event('ended'))` 在本地是好的，可以用来测"放完一首"的逻辑。

### 3.2 构建

```bash
rm -rf dist && BASE_PATH=/ SITE_URL=https://gbc.misakamikoto.xyz timeout 300 pnpm build
```

- `BASE_PATH=/`：线上是根路径部署。**若改部署到子路径**（如 GitHub Pages 的 `/<repo>/`），必须传对应的 `BASE_PATH`，否则全部资源 404。
- `SITE_URL`：写进 canonical / OG 标签，必须与真实域名一致。
- `dist/` 是**全量**产物（328 MB，含音频），不是增量。

---

## 4. 构建与部署

### 4.1 部署命令（一条）

```bash
cd /workspace/gbc-site
rm -rf dist && BASE_PATH=/ SITE_URL=https://gbc.misakamikoto.xyz timeout 300 pnpm build
tar czf - -C dist . | sshpass -p "$GBC_SSH_PASS" ssh -o StrictHostKeyChecking=no root@82.158.230.34 \
  'rm -rf /var/www/gbc/* && tar xzf - -C /var/www/gbc && echo DEPLOYED'
```

> **敏感信息**：`$GBC_SSH_PASS` 是服务器 root 密码，**只存在部署机的环境变量里，
> 不写进本仓库、不写进本文档**（`export GBC_SSH_PASS=...`，或用 `~/.gbc-env` 且确保被 gitignore）。
> 本仓库可以公开；历史里曾经有一版把密码写在本文档中的提交，已在开源前用
> `git filter-branch` 抹掉（见 §4.3），并已轮换服务器密码。
> 更稳的做法是改用 SSH 密钥登录、关掉 root 密码登录。

### 4.1.1 开源前的凭据清理（已执行）

本仓库准备推到 GitHub 时做了一次体检，发现 `HANDOVER.md` 里写过服务器 root 密码
明文（只在 `36100c5` 这一个提交里）。处理：

```bash
# 全历史扫描，确认只有一处
git grep -nI -e 'sshpass +-p +[^"$]' -e 'BEGIN.*PRIVATE KEY' -e 'ghp_' $(git rev-list --all)

# 重写历史（无 remote，安全）
git branch backup-before-purge            # 先留后路
git filter-branch -f --index-filter '
  if git ls-files --error-unmatch HANDOVER.md >/dev/null 2>&1; then
    B=$(git show :HANDOVER.md | sed "s/<旧密码>/<已移除>/g" | git hash-object -w --stdin)
    git update-index --cacheinfo 100644,$B,HANDOVER.md
  fi' -- --all
```

**密码本身要轮换**：它进过 git 历史、也进过对话记录，删历史不等于没泄露。

### 4.2 服务器现状

- Caddy 2.6.2，systemd 服务名 `caddy`，配置文件 `/etc/caddy/Caddyfile`
- 该站点的 Caddy 块（**已启用 gzip + zstd，且对指纹资源做一年强缓存**）：

```caddyfile
gbc.misakamikoto.xyz {
	root * /var/www/gbc
	encode gzip zstd
	file_server
	# 静态资源长缓存（指纹化文件）
	@immutable path /_astro/* /assets/*
	header @immutable Cache-Control "public, max-age=31536000, immutable"
	handle_errors {
		respond "{err.status_code} {err.status_text}" {err.status_code}
	}
}
```

- 磁盘：`/` 30 G，已用 16 G（站点占 328 M），余量充足
- **注意**：`/assets/*` 是一年强缓存。若替换了**同名**素材（例如换了 `assets/covers/album/25.webp` 的内容但不改文件名），用户端会长期看到旧图。换素材要么改文件名，要么让用户强刷。

### 4.3 回滚

服务器上没有历史版本，`dist/` 也不入库。回滚方式：

```bash
cd /workspace/gbc-site
git log --oneline            # 找到目标提交
git checkout <commit>        # 或 git revert
# 重新构建 + 部署（§4.1）
git checkout main
```

因为每次部署都是 `rm -rf /var/www/gbc/*` 全量覆盖，**没有"只回滚一个文件"的路径**。

### 4.4 CI（存在但未启用）

`.github/workflows/deploy.yml` 是给 GitHub Pages 用的（`pnpm build` → 上传 `dist/`）。当前仓库**没有 remote**，所以这条流水线从未运行。若将来推 GitHub：

- `astro.config.mjs` 会自动从 `GITHUB_REPOSITORY` 推导 `base=/<repo>`，**不要改这段推导逻辑**（它同时服务本地与 CI）
- 但线上是 `gbc.misakamikoto.xyz` 根路径 + Caddy，与 Pages 是两套部署，别混淆

---

## 5. 内容与数据管线

### 5.1 素材管线 `scripts/optimize-assets.py`

- **输入**：`/workspace/gbcc/gbc/gbc`（991 个文件 / 2.3 GB，原始目录名是字面量 `#Uxxxx` 转义）
- **输出**：`public/assets/{characters,logo,posters,covers,artworks,emoji,videos}/` + `public/assets/manifest.json`
- **做四件事**：① 解码 `#Uxxxx` 转义文件名 ② 分类归档 ③ 转 WebP / 压缩 / 生成响应式尺寸 ④ 写 manifest
- **实测结果**：914 个文件、输出 90.7 MB（源 2.29 GB），耗时 370 s，失败 0
- 重新生成后**必须** `pnpm build`，因为 `src/lib/assets.ts` 在构建期读 manifest

`src/lib/assets.ts` 是唯一允许拼素材路径的地方：

```ts
assetUrl("assets/covers/album/25.webp")  // → /assets/covers/album/25.webp
url("/characters")                       // → /characters（自动带 base 前缀）
category("covers") / characterArt("nina") / characterPrimary("nina") / groupShots() ...
```

> **禁止**在组件里手拼 `"/assets/..."`——manifest 里的 path 不带前导斜杠，手拼会在子路径部署时全部 404。

### 5.1.1 立绘多尺寸 `scripts/char-variants.py` + `srcset`

角色页每位角色下方是一整条立绘缩略图带（5 人共 **209 张 `<img>`**），原图长边
1600px，而缩略图元素只有 132~150 CSS px。实测（拿源 PNG 用 LANCZOS 缩到显示
尺寸当理想参考，用 Playwright 在 DPR 3 下渲染比对）：

| 做法 | 与理想参考 RMSE | 单张体积 |
|---|---|---|
| 把 1600px 原图丢给浏览器降采样 | 19.65 | 74.8K |
| 预生成合适尺寸的小图 | **16.78** | **12K** |

也就是预生成小图**既更清晰又省 84%**。落地方式：

- `scripts/char-variants.py` 读 `manifest.json` 反查源 PNG，按**图片宽度**生成
  `@240w / @480w / @800w` 三档（`quality=80, method=5`，alpha 用 Pillow 默认的
  `alpha_quality=100` 无损），索引写 `public/assets/char-variants.json`。
- 模板侧 `srcset(path)` + `contentSizes(entry, 手机容器, 桌面容器)`（都在
  `src/lib/assets.ts`）拼 `<img srcset sizes>`。
- 索引文件缺失时 `srcset()` 返回 `undefined`，模板自动退回单图，构建不会失败。

**两个必踩的坑（都实测过）**：

1. **必须按宽度切，不能按长边切。** `srcset` 的 `w` 描述符比的是图片**宽度**，
   而 249 张立绘里 **158 张宽高比 <0.5**（瘦高，中位 0.43）。按长边 400px 切的话
   瘦高图只有 154px 宽，浏览器按 `sizes × DPR` 一算直接跳过它去拿原图——第一版
   就是这么翻车的（手机端选档 @400w:0 原图:16）。
2. **`sizes` 要写 contain 之后内容实际占的宽度，不能写容器宽度。** 容器 132×190
   里，0.43 宽高比的立绘内容只有 73px 宽；写容器宽度会让浏览器按 132×DPR 选档，
   白白拉大图。`contentSizes()` 就是干这个的。

**收益（线上实测）**：手机端 `/characters/` 立绘 1.85 MB → **1.03 MB**；
桌面端 2.34 MB → 1.13 MB；首页 hero 5 张 658.6K → 444.3K。
（变体文件本身占仓库 26.5 MB / 528 个，不进 dist 之外的任何地方。）

> 补充结论：**立绘保留 alpha 是对的**。508 个带 alpha 的 webp 里 507 个真在用
> （立绘是抠图，40~73% 全透明）；alpha 是无损存的（与源 PNG 逐像素差异 0），
> 透明区 RGB 虽然 216 黑 / 17 白 / 16 灰，但只存在于 `alpha=0` 的像素上，
> 用无损 PNG 做对照实验确认浏览器渲染**逐像素完全相同**（0/640000），
> 所以既不出白边也不影响画质。降 `alpha_quality` 到 80 只省 8.9% 且会轻微
> 损失 alpha 精度，为了显示效果最好**没有采用**。

### 5.2 曲目数据 `src/data/songs.json`

38 条，字段：`{ n, file, title, artist, dur, cover, album }`

- `n`：曲目编号 1–38，**是 lyrics/*.json 与音频文件名的连接键**
- `file`：`assets/audio/NN.mp3`；`cover`：`assets/covers/album/NN.webp`
- `dur`：秒（用于等距时间轴兜底、歌词面板显示）

### 5.3 歌词：三层结构

歌词是这个项目里最复杂的一条链，分三层，**改动任何一层都要重跑后一层**：

```
① 文本     用户收集的官方歌词页（纯文本，无时间轴）
            ↓ 已固化进仓库
② 数据     src/data/lyrics/NN.json
            { n, title, artist, lyricist, composer, use, source,
              lines: string[],          ← ①的文本，按行（日文原文）
              times: number[],          ← 每行起始秒（37/38 首有）
              kch: string[],            ← 逐字时间轴：每行一个逗号分隔串，
                                          是"每个字相对 times[i] 的厘秒偏移"
                                          （"" = 这行没有逐字数据）
              zh: string[],             ← 网易云 tlyric 中文翻译（1336/1354 行）
              en: string[] }            ← 本站英文翻译（1390/1390 行）
            ↓ scripts/lyrics-lrc-align.py 从官方 LRC 生成
③ 运行时   PlayerBar.astro 构建期 fs 读取全部 38 个 JSON →
           内联成 <script type="application/json" data-lyrics>
           → player.ts 解析 → 渲染 + 高亮 + 逐字扫红
```

**时间轴来源**：

| 层 | 源文件 | 精度 | 生成脚本 |
|---|---|---|---|
| 行级 `times` | `/workspace/GBC-all-lyrics-lrc.txt`（网易云 LRC） | 逐行 | `scripts/lyrics-lrc-align.py` |
| 逐字 `kch` | `/workspace/gbc-lyrics/output/*.json`（酷狗 KRC 解包） | **逐字** | `scripts/lyrics-krc-chars.py` |

**为什么行锚点用网易云、逐字用 KRC**：两家的行起始时间**互有偏差**（同一首能差 100–500 ms，
例：`Cycle Of Sorrow` 网易云比 KRC 晚约 498 ms，`碧いif` 早约 85 ms），
且用音频 RMS/频谱分析判不出谁对（摇滚混音太密）。
所以**行高亮沿用已验证过的网易云 `times`（零回归）**，
`kch` 只把 KRC 的绝对逐字时间**平移**到 `times[i]` 上，保证扫红精确、行高亮不动。

**逐字对齐算法**（`scripts/lyrics-krc-chars.py`）：

1. 读 KRC 解包出的 `output/*.json`：`{ls: 行起始ms, ld: 行时长ms, chars: [[相对ms, 时长ms, "字或词"], ...]}`
2. 展平成**整首**的逐字序列（KRC 会把多个字合成一个词、也会拆行，逐行对齐会错位）
3. 用 `difflib.SequenceMatcher` 做**整首字符级**对齐（站内 `lines` 拼接 vs KRC 拼接）
4. 按行切回，行内做单调钳制（保证偏移非递减）
5. 写 `kch[k] = (krc绝对ms − times[i]*1000)`，负值钳到 0；KRC 缺字的行留 `""`

**顺带修掉「插值假时间」**：站内 `times` 来自网易云 LRC，而站内文本来自 j-lyric，
两边**断句不同**——站内把 LRC 两行并成一行时，这行取到的是后半句的时间（偏晚约 3 s）；
把一行拆成两行时，拆出来的那行只能插值（实测最离谱的一行偏了 13.8 s）。
逐字数据给了判据：`|KRC行起始 − 站内times| > 0.8s`（37 首的 |中位差| 全部 ≤0.49 s、
MAD ≤0.22 s，所以超过 0.8 s 的必是断句产物）。脚本对这类行**直接用 KRC 的第一字时间
改写 `times`**，行高亮与扫红一起变准，共修 **46 处**（例：`臆病な白夜` 末行 196.061 → 182.303）。
只重算逐字、不想动 `times` 时把脚本里的 `FIX_THRESHOLD` 调大即可。

另有一条：如果第一个字落在行起始之前超过 `SHIFT_OVER_MS`(350 ms)，整行**顺延**
（保留 KRC 的字间隔），否则行首会有一串字同时变红。

**运行时**：`player.ts` 的 `paint()` 里
`while (n < ln.offs.length && ln.offs[n] <= elapsed) n++;`
有 `offs`（即 `kch` 解析结果）就走真实逐字；没有就退回原来的线性估算。

**实测**：37 首 / 1354 行 / 18353 字，字符命中率 87–100%，原始数据 +57 KB。
线上用 `audio.currentTime` 精确 seek 到 6 个时间点核对"已红字数"，**全部与数据一致**。

- 网易云标准 LRC，**逐行**时间戳，1751 行 / 38 首
- ⚠️ **不是逐字时间轴**（没有 `<mm:ss.xxx>` 内联标记）。用户曾以为是逐字，实际只有逐行
- 文件里还带了中文翻译（tlyric），**当前未使用**（可作为后续"日/中切换"的数据源）

**对齐算法**（`scripts/lyrics-lrc-align.py`，已固化、幂等，可重复跑）：

1. 解析段落，剔除 `作词/作曲/编曲` 元数据行与纯空行
2. 标题归一化匹配（抹平全半角/装饰符号/大小写，含 `arrow` ↔ `箭` 这类异名）
3. **动态规划单调对齐**：行文本相似度 ×2−0.4 为匹配分，跳过得 −0.7，相似度 <0.34 不允许匹配
4. 未对齐行按前后邻居线性插值 → 单调化（保证时间严格递增）
5. **只写 `times`，不动 `lines`**——站内文本比 LRC 干净（LRC 里有 `抜け殼`/`じや`/`せがい`/`疑神暗鬼` 这类错字）

**跳过规则**：

- LRC 末行时间 < 曲长 × 0.6 → 判定 short ver.，保留等距估算
- 对齐率 < 50% → 判定匹配错歌，保留等距估算
- 当前唯一被跳过：`n=8 さよならあの日のメロディ`（网易云只有 4 行 / 15.5 s 的 short ver.，站内是 267 s 完整版）

**为什么必须做这一步**：等距估算（曲长 ÷ 行数）会让整首高亮**抢跑**。例：`碧いif` 首句实际在 **13.477 s**，等距估算从 0 s 就开始高亮，整首歌错一句；前奏期间还会一直亮着第一句。接入真实时间轴后，前奏 1.6–9.7 s 完全不高亮，13.7 s 才亮第一句。

### 5.3.1 译文（中文 / 英文）

面板支持 **日 / 中 / 英** 三种显示（`日` = 只原文，`中` = 原文 + 中文，`英` = 原文 + English），
译文行在原文下方小一档、暗一档。数据来源不同，UI 上分开署名：

| 语言 | 来源 | 覆盖 | 生成方式 |
|---|---|---|---|
| 中文 `zh` | 网易云音乐 tlyric（译者投稿） | 1336/1354 行（37/38 首） | `scripts/lyrics-translations.py` |
| 英文 `en` | **本站翻译**（非官方） | 1390/1390 行 | 8 个子代理按曲分工翻译后写回 |

**中文**：LRC 文件每首段落头部有 `# 来源: 网易云音乐 id=NNN`，
用它调 `https://music.163.com/api/song/lyric?id=NNN&lv=-1&tv=-1` 拿 `tlyric`。
tlyric 的时间戳与 lrc 完全一致，而站内每行的 `times[i]` 就是从 lrc 来的，
所以**直接按时间戳配对**（容差 20ms）即可，不需要再做文本对齐；
插值出来的行没有锚点，留空字符串。原始响应缓存在 `content/tlyric-raw.json`，
重复执行不打网络（`--refresh` 可强制刷新）。

```bash
python3 scripts/lyrics-translations.py          # 抓取并写入 zh
python3 scripts/lyrics-translations.py --refresh # 忽略缓存重新抓
```

**英文**：没有官方英译，是本站自己译的（数据里没有单独标记，UI 署名写"英文译词：本站翻译"）。
要改英文，直接改 `src/data/lyrics/NN.json` 的 `en` 数组即可，**长度必须与 `lines` 相等**。

> ⚠️ `n=8 さよならあの日のメロディ` 没有 `times`，因此也没有 `zh`（空数组）。
> 面板里 `zh[i]` 取到 `undefined` 时会跳过译文行，不会报错。

### 5.4 字体子集化（歌词用的官方同款字体）

`src/assets/fonts/`：

| 文件 | 大小 | 用途 |
|---|---|---|
| `barlow-{400,600,900}.woff2` | 各 22 KB | 全站西文/数字 |
| `tektur-var.woff2` | 12 KB | 编号/标签 |
| `nsjp-{500,700,900}.woff2` | 各 ~160 KB | **歌词面板**（`--font-lyric`） |

`nsjp-*` 是 Noto Sans CJK JP 的**文本子集**：

- 源：`noto-cjk` release `Sans2.004` 的 `06_NotoSansCJKjp.zip`（94 MB）
- 用 `fonttools` + `brotli` 的 `Subsetter` API 子集到 **1118 个字符**（38 首歌词全文 + 元数据 + UI 字符串 + 全假名 + 符号）
- 三档字重 500/700/900，合计 ~487 KB
- **不要**换成 Google Fonts 的 unicode-range 分片方案：早期试过 79 分片 × 3 字重 = 237 文件 / 7.9 MB，被否

> 如果新增了歌词（出现 1118 字符集之外的汉字），必须**重新子集化**，否则新字会掉回系统字体，同一行里字形不一致。子集化脚本当时是一次性执行、未入库；重建方法见 `git log` 里 `5d8497d` 的说明，或按上面两步重跑。

### 5.5 文案源 `content/*.md`

`story.astro` / `characters.astro` 在**构建期** `fs.readFileSync` 解析 Markdown：

- `content/story.md`：13 话，官网日文原文 + 萌娘百科中文译名/Staff/致敬典故，逐条带出处
- `characters.astro` 读 `content/characters.md`：5 位角色（nina/momoka/subaru/tomo/rupa），逐条带出处 URL
- 解析是**正则**的，改了 Markdown 结构要同步改页面里的解析逻辑
- 已知历史缺陷：第 4 话标题因日文嵌套括号导致中文译名丢失（REVIEW.md M2），已修，注意别回归

---

### 5.6 全站界面三语（中 / 英 / 日）

**这不是歌词的日/中/英切换**，是两套互相独立的机制：

| | 界面语言（本节） | 歌词显示语言（§5.3.1） |
|---|---|---|
| 作用范围 | 导航、按钮、aria、meta、标题……全站 chrome | 只影响歌词面板里的译文行 |
| 入口 | 导航 / 抽屉 / 页脚的三颗按钮（中 / EN / 日） | 歌词面板右上角 日 / 中 / 英 |
| 持久化 | `localStorage["gbc.lang"]` | 不持久化 |
| 默认 | **中文**（受众是中文用户） | 日文原文 |

**实现（客户端换字，不做路由）**：

- 词典 `src/i18n/{zh,en,ja}.json`，各 **230 键**，三语 key 集合必须完全一致
  （`content/i18n-frag/*.json` 是当初按区块分给子代理翻译的 14 个碎片，**只是存档**，
  运行时不读；要改文案请直接改 `src/i18n/*.json`）
  - 键按 `区块.元素[.子项]` 命名，如 `playerbar.empty.title`、`gallery.item.zoom`
  - 值可带占位符 `{name}`；带逗号的参数要用 `key:value,key2:value2` 形式（正则按 `,` 切但要求 `名字:` 前缀）
- `src/i18n/index.ts`：`LANGS` / `DICTS` / `t()` / `isLang()` / `HTML_LANG` / `DEFAULT_LANG="zh"`
- `src/scripts/i18n.ts`（运行时）：`applyLang()` 扫 `[data-i18n]`（文本）与
  `[data-i18n-attr="attr:key,attr2:key2"]`（属性），切完派发 `gbc:lang` 事件；
  `setLang()` 走 `html.lang-swap` 过场（150 ms 淡出 → 换字 → 200 ms 淡入，`prefers-reduced-motion` 时跳过）
- `<head>` 里有一段**内联**脚本，在首屏绘制前把 `localStorage` 的语言写到 `<html lang>` / `data-lang`，避免闪一下中文
- 静态站 + ClientRouter：`applyLang()` 挂在 `astro:after-swap`（早于绘制）与 `astro:page-load`（幂等兜底）

**写文案时的坑（都踩过）**：

- `setText()` 只替换**直接文本节点**，保留子元素（否则 `textContent=` 会抹掉 `<span class="num">`）
- 译文为空串 ⇒ 打 `is-i18n-empty` 类（CSS `display:none`），**不要**用 `hidden` 属性：
  `player.ts` 要控制空状态元素的 `hidden`，i18n 一改就把它顶回来了
- **JS 自己写的节点不要挂 `data-i18n`**（曲名 / 歌手 / 歌词标题 / 播放暂停 / 折叠按钮）：
  切语言时 i18n 会把它们刷回初始文案。这些节点由 `player.ts` 监听 `gbc:lang` 后重写；
  又因为 i18n 运行时是 `player.ts` 的依赖（模块求值顺序），**首次派发的事件它收不到**，
  所以 `player.ts` 初始化时要自己 `uiLang = getLang(); applyUiLang();` 跑一遍
- 数据驱动的文案（剧情简介、角色介绍、画廊图注）**以词典为准**：改了 `content/*.md` 要同步改 `src/i18n/*.json`
- 故意不翻译：日文设计标签（`ギャラリー` / `CHARACTER` / `STORY`）、徽章（`ALBUM` / `PV`）、
  歌名 / 展会名 / 角色名等专有名词、官网日文标语（Hero 的 `怒りも、悲しみも、全部ぶつけろ`）
- 曲目署名里的 `作词 / 作曲 / 编曲` 标签在构建期被切成 `<span data-i18n="music.credit.*">`
  （`music.astro` 的 `creditParts()`），人名不动

**画廊图注三语**：`src/data/gallery-labels{,.en,.ja}.json`（各 **479** 条），
`gallery.astro` 把三语都写进 `data-alt-{zh,en,ja}`，`site.ts` 的 `applyGalleryLang()` 按语言换；
词典里没有的素材会**回落成原始文件名**（还剩 51 张，都是日文原名或无意义 ID，可接受）。
新增素材时记得补这三份 JSON。

**验收方式**：用 Playwright 起三语 × 手机/桌面各扫 5 个页面，
逐元素核对 `[data-i18n]` 文本是否等于词典值，再用"中文词典原文"反查 DOM 里有没有漏刷的节点
（zh / ja 各 0 处；en 剩 23 处，全是日文歌名与官方标语）。

---

#### 5.6.1 中文必须真的是中文（踩过的坑）

「SSR 输出中文 + 客户端换字」这套结构有个隐蔽的坑：**词典里 zh 的值可能是日文**。
最初把 5 位角色介绍、13 话剧情简介、剧情总览的 zh 值直接留成了官方日文原文
（想的是"官方原文更权威"），结果中文用户看到的是满屏日文——用户直接截图报错。

现在的中文来源与检查方式：
- 角色介绍 zh = `content/characters.md` 里的「官方中文翻译」（萌娘百科译），
  用中文引号 “” 包起来；日文原文仍保留在 ja 词典里。
- 剧情页是**原文 + 译文**的双语设计：`synopsis.ja` 恒为日文原文，
  `synopsis.zh` 随界面语言变（zh 中文 / en 英文）。日文模式下 `.zh` 值为空，
  由 `is-i18n-empty` 隐藏，否则同一段日文会出现两次。
- 检查手段：把三语词典注入页面，逐个数 `[data-i18n]` 元素的 `textContent`
  是否等于该语言词典值（zh/en/ja × 5 页全绿）；再单独扫"中文模式下含假名的
  文本节点"，剩下的应该只有专有名词（乐队名、曲名、角色名）与设计用的日文
  小标题（キャラクター / ミュージック 等）。

用户会看的，别自己觉得"官方原文更好"就留着。

#### 5.6.1.1 手机端 Hero 标语的宽度陷阱

Hero 在手机端是"文案列 + 立绘"叠在同一格（`.hero__copy` 占 62%，立绘从约 49%
处压上来）。日文标语短（11 字）看不出来，一换成英文/中文长句就伸到立绘底下
**被整块盖住**（实测文案列 24→366px、立绘左缘 192px）。
现在手机端 `.hero__tagline { max-width: 47% }`（≈161px，右缘 185 < 192）+
`text-wrap: balance`，三语都不再重叠。改任何语言的标语长度后都要复测这个边界。

#### 5.6.2 语言切换过场（用户说"没做完整"）

第一版只淡 `main` 与 `.footer`，导航和播放条是"啪"地直接换字，看着像只做了
一半。现在 `global.css` 里对 `body > *` 统一过场：

| 阶段 | 时长 | 说明 |
| --- | --- | --- |
| 淡出 | 180ms ease-in | 所有顶层区块同时到 opacity 0（含导航、页脚、播放条） |
| 换字 | — | 在全透明时调 `applyLang()`，换字过程看不见 |
| 淡入 | 320ms | 按 `transition-delay` 错开：导航 0 / 正文 45ms / 页脚与播放条 85ms |

要点：
- **只动 opacity、不动 transform**：播放条与歌词面板是 `fixed`，给它们的祖先
  加 transform 会把定位基准换成该祖先，容易出怪问题。
- 播放条根类名是 `.plbar`（不是 `.player-bar`，第一次写错没生效）。
- 错开的 `transition-delay` 写在**非** `.lang-swap` 状态下，`html.lang-swap`
  里统一 `transition-delay: 0ms`，这样淡出是齐的、淡入才有层次。
- `prefers-reduced-motion` 下整段禁用。

#### 5.6.3 语言切换器只留一个 + 滑块动画

一页上原来有三组切换器（导航、抽屉、页脚），桌面上同时能看到两组，太吵。
现在**全站只有顶部条里那一个**（桌面与手机都在这里）：删掉了抽屉里和页脚里的
两处。320px 窄屏要同时放品牌标 + 切换器 + 汉堡，所以 `.nav__brand img` 收到
20px、切换器按钮收到 29px（都在 `max-width: 359.98px` 里）。

动画：红底不再由按钮自己切换，而是一个 `.lang__pill` 滑块滑过去
（360ms `--ease-out-expo`，transform/width/height 一起动）。两个要点：
- **首帧不能有动画**：先 `syncPills()` 定位，下一帧再加 `.is-ready` 打开过渡，
  否则刚加载时滑块会从左上角滑进来。
- **点击时先 `markActive()` 再 `setLang()`**：整页淡出会把换字过程藏起来，
  滑块必须在这之前就滑到位，用户才看得见。

#### 5.6.4 角色 PV 归位到角色页

原来音乐页底部有个 "ROLE PV / キャラクター PV" 区块，把 5 段角色 PV 和发行物、
曲目表堆在一起；角色页只有一个跳去 `/music` 的链接。现在每段 PV 内嵌在**该角色
自己的卡片**里（`.member__pv`，16:9 + `controls`），音乐页整块删除。

⚠️ 视频必须 `preload="none"`：试过 `preload="metadata"`，实测一进角色页就下载
了 **19MB**（5 段全下）。改为 none + 首帧海报（`scripts/optimize-assets.py` 里
编码完顺手抽第 1.5 秒一帧成 `<name>-poster.webp`，每张约 10KB，整页 56KB）。
海报文件不存在时角色页会自动不挂 `poster`（`fs.existsSync` 判断），不会 404。

#### 5.7 交互补动画：四处"打开有动画、关闭/切换没有"的硬切

对称性是这类动效的关键——只在打开时做动画，关一次就露馅。四处都改成
"淡出 → 在透明期换内容 → 淡入"，并且全部遵循 `prefers-reduced-motion`
（降级时直接换，不留 class）。

| 位置 | 原状 | 现在 |
| --- | --- | --- |
| 歌词面板关闭 | 原生 `dialog.close()` 瞬间消失（打开却有 320ms） | 先播 `lyr-out` 200ms 再 `close()` |
| 画廊切分类 | `[hidden]` 硬切，530 → 30 张 | 整格淡出 120ms → 换分类 → 淡入 170ms |
| 播放条换歌 | 直接改 `img.src` / `textContent` | `.pl__art` + `.pl__text` 交叉淡化 130/220ms |
| 灯箱翻页 | 直接换 `src`，"啪"地跳一张 | 淡出 130ms → 换图 → 图解码完再淡入 200ms |

要点：
* **歌词面板**必须处理"关闭动画播到一半又点开"：`closeToken` 代次计数让挂着
  的那次 `close()` 作废，并把 `afterOpen()` 重跑一遍（rAF 跟随循环是幂等的）。
  400ms 兜底 `setTimeout`，系统掐掉动画时也要收干净。
* **灯箱**等 `img.complete` / `load` 再淡入，否则大图会露半截白；600ms 兜底。
* **换歌**只延迟视觉，`audio.src` 照旧立刻换、立刻播（实测换歌时音频不断）。
* **播放条折叠本来就是动画的**（`.pl__now` 320ms 滑出 + 悬浮按钮错峰长出）。
  之前误判成"没有动画"，是因为采样采了 `.plbar` 而真正动的是子元素 `.pl__now`。

#### 5.8 懒加载图片淡入（含一个 Chrome 陷阱）

`loading="lazy"` 的图是"啪"地出现，滚画廊时 525 张一起闪。做法：
`<head>` 内联脚本先给 `<html>` 加 `js` 类（首屏绘制之前），CSS 才把
`html.js img[loading="lazy"]` 的 opacity 归零，加载完加 `.is-loaded` 淡入。

* **`load` / `error` 必须挂在 `document` 上，挂 `window` 收不到。**
  实测：同一批图片，`window` 捕获收到 **0** 次，`document` 捕获收到 12/12。
  这是本次踩到最费时间的坑（图片明明 `complete`、`naturalWidth` 也有，
  就是一直 opacity:0）。
* 三层兜底：DOMContentLoaded / astro:after-swap / astro:page-load 各扫一遍
  `img.complete`，再加 8 秒定时全显形。宁可没有淡入，也不留空洞。
* 没有 JS 时 `js` 类不存在 → 图片普通显示（实测 `javaScriptEnabled:false`
  下 opacity = 1），绝不会白板。

验收：桌面五页滚到底、手机画廊滚到底，视口内透明图 **0**；角色页 213 张
立绘最终 213 张全部显形；淡入曲线 0 → 0.13 → 0.49 → 0.78 → 0.92 → 0.99。

## 6. 运行时架构

### 6.1 入口与初始化

```
Layout.astro
  ├─ <ClientRouter />           Astro View Transitions（无整页刷新）
  ├─ <Nav /> <slot /> <Footer /> <Lightbox />
  └─ <PlayerBar transition:persist />   ★ 底栏播放器，跨页不销毁
src/scripts/site.ts   → astro:page-load → initAll()
src/scripts/player.ts → astro:page-load → 取 window.__gbcPlayer，没有就 createCore()
```

关键机制：

- **`transition:persist`**：PlayerBar 的 DOM（含 `<audio>`、`<dialog>`、歌词数据）在站内导航时**不重建**，所以音频不断、歌词面板不关
- **`window.__gbcPlayer = { bar, core }`**：核心实例只创建一次；每次 `astro:page-load` 只调 `core.refresh()` 重新绑定**页面局部**元素（曲目列表、专辑卡）
- **`dataset.bound`**：所有 `addEventListener` 都用它做幂等守卫，防止跨页重复绑定
- **测试时必须用页内链接点击**（`<a>`）来验证跨页行为；`page.goto()` 是整页刷新，会杀掉音频，测出来的"断了"是假象

### 6.2 全局播放器

| 文件 | 行数 | 职责 |
|---|---|---|
| `src/scripts/player.ts` | 1147 | 播放核心：队列、模式、进度、频谱、折叠、歌词 |
| `src/components/PlayerBar.astro` | 669 | 底栏 DOM + 样式 + 歌词 JSON 内联 |
| `src/components/LyricsPanel.astro` | 518 | 全屏歌词面板（`<style is:global>`） |
| `src/components/SongPlayer.astro` | 466 | 音乐页的曲目列表条 + 模式按钮 |
| `src/components/AlbumCard.astro` | 288 | 专辑卡（封面 + 卡内轮播 + 刺环挂载点） |

`player.ts` 内部分段（行号为当前提交，改动后会漂移）：

| 行 | 段 |
|---|---|
| ~107 | 音量持久化（`localStorage["gbc.vol"]`） |
| ~155 | UI 同步（标题/封面/播放态） |
| ~222 | 播放控制（load/play/advance） |
| ~304 | **频谱引擎**（环形刺） |
| ~668 | 循环/随机模式 |
| ~695 | 双击播放（鼠标与触摸同一条路径） |
| ~732 | 底栏按钮 |
| ~753 | 进度/音量（`timeupdate`） |
| ~809 | 键盘 ←/→ 切歌 |
| ~818 | Media Session 硬件按键 |
| ~865 | **歌词面板** |

**状态**：`mode`（list/one/shuffle/off）与折叠状态**只放内存**，刷新即重置（这是刻意的，别改成 localStorage）。

### 6.3 环形频谱（专辑封面上的音频可视化）

- `RAY_PER_SIDE = 8` → 每边 8 根、整圈 32 根刺，贴合正方形封面四边
- `AnalyserNode`，`fftSize = 256`，`smoothingTimeConstant = 0.5`
- 核心是**白化**：`RAY_REF`（每根刺的慢参考，本频段常态水平）与 `RAY_SCORE`（本帧激励分 = 当前/参考），保证"有动态范围、有高低差"而不是一起跳
- `prefers-reduced-motion` 时降级（不跑刺，只留红描边）
- 无 Web Audio 的极老浏览器：`analyser = null`，静默降级
- 历史调优结论（用户逐轮反馈）：刺要**长出来**不是跳出来；圆顶；低频矮高频高；人声主导；手机端振幅加大
- 曾修过的 bug：切页返回后刺环不出现（`refresh()` 里要清刺的缓存）

### 6.4 折叠

- 底栏可完整收起（滑出屏幕外，body padding 归 0），右下角浮出圆形还原按钮
- 状态在内存里（`let folded`），刷新即展开
- 动画用 spring 曲线，`prefers-reduced-motion` 下关闭

### 6.5 播放模式

`MODE_ORDER = ["list", "one", "shuffle", "off"]`，一个按钮循环切换，四种模式各有专属图标：

| 模式 | 文案 | 颜色 |
|---|---|---|
| `list` | 列表循环 | 青 `--neon-cyan` |
| `one` | 单曲循环 | 红 `--accent` |
| `shuffle` | 随机播放 | 粉 `--neon-pink` |
| `off` | 顺序播放 | 灰 |

语义：`list` 顺序循环；`one` 单曲重来；`shuffle` 随机带环绕；`off` 顺序播完即停。

### 6.6 全屏歌词（最近一轮的重点）

**入口**：点底栏上的**封面**或**曲名区**（`[data-lyrics-open]`），或底栏除控件外的任何空白处（`bar` 上的委托点击，会排除 `button/input/a/label`）。手机上有一个常驻的 `^` 提示箭头（有曲目时 75% 透明）——**没有它用户找不到入口**（这是踩过的坑）。

**面板**：`<dialog class="lyr" data-lyrics>`，`showModal()`，**铺满整屏**（手机与桌面一致，无圆角无边距）。内含：

- 背景：**桌面用该曲所属专辑的封面**（`img[data-lyr-cover]`，`blur(7px) saturate(1.18)`，不透明度 1）+ 遮罩渐变；
  **手机（<1024px）不用封面**（`display:none`），改深色渐变（`#12141b` 中段提亮 → `#07080c`），
  歌词的 `text-shadow` 也调轻一档。手机上封面做背景画面太花、压不住字，用户明确要求改掉。
  桌面端这里调过两轮：`blur(56px)` + 0.72 遮罩会糊成一片黑、**等于没有封面**；
  18px + 0.9 也只剩灰底。现在 7px 保留构图与配色，中段用径向遮罩压暗保证歌词可读，
  歌词与署名各加一层 `text-shadow`。改参数时**必须截图量像素**，别凭感觉。
  ⚠️ 手机端的覆盖规则（`.lyr__cover` / `.lyr__scrim` / `.lyr__line`）要写在**样式表靠后**的位置，
  否则同优先级下会被后面的基础规则盖掉（踩过）
- 顶部：收起键 `⌄` + 居中歌名/歌手/时长（右侧有等宽占位，否则标题会被挤右 22 px）
- 顶部歌名下方：**作词・作曲署名在歌词上方**（`[data-lyr-cred]`，切语言时由 `player.ts` 重写）
- 中部：歌词区（`mask-image` 上下渐隐 + 内部滚动，**绝不滚整页**）
- 底部：**全屏自带的**进度条 + 上一首/播放暂停/下一首 + 作词作曲署名（全屏后底栏被盖住，操作必须能在全屏内完成）

**排版（对齐 QQ 音乐歌词页的读法）**：

- **不做按距离的亮度渐变**。早期版本给每行算一个 `--d`（与当前句的距离）并用
  `color-mix()` 把远处压暗到接近背景，结果是"上下几行糊成一片"。
  现在所有非当前句**统一一种中灰**（`--ink-300`），只靠"当前句白字 + 逐字变红"区分。
- **字号统一**，当前句不再放大。早期把当前句放到 24px（手机）/ 36px（桌面），
  换句时整列高度跳动；现在所有行同字号（手机 19px / 桌面 25px），
  当前句只加粗到 900 + 变白。
- **逐字扫红**：当前句的字**逐个变红**，时间来自 `kch`（酷狗逐字，见 §5.3）；
  没有逐字数据的行退回按行时长线性估算。`player.ts` 用
  `while (n < ln.offs.length && ln.offs[n] <= elapsed) n++;` 推已红字数
- **译文行**：原文下方 `margin-top: 5px`，小一档（手机 14px / 桌面 16px）、
  暗一档（非当前句 `rgb(154 161 174 / .62)`）。两种语言的 `<span>` **都常驻 DOM**，
  切语言只改 `<dialog>` 上的 `data-lang` 属性，由 CSS 决定显示哪个：
  不重建列表 → 滚动位置与当前句状态都不丢。

**语言切换**：面板右上角 `日 / 中 / 英` 三段控件（`[data-lyr-lang]`），
选择存 `localStorage["gbc.lyrlang"]`，下次打开保持。署名行跟着语言走
（中文→"中文译词：网易云音乐"，英文→"英文译词：本站翻译"，日文→只留作詞・作曲）。

**逐字扫红（卡拉OK）**：

- 每行在渲染时按**字**拆成 `<span class="lyr__ch">`
- 当前行整句**白字**，已唱到的字加 `.is-on` → 红色 + `0 0 14px` 红晕
- 推进：`n = round(clamp((pos - top) / sweep) * 字数)`
- `sweep = min(到下一句的间隔 × 0.85, max(0.9, 字数 × 0.17))`
  —— 前者保证不拖过下一句，后者是按"约 6 字/秒"估的人声速度
- 只在**字数变化时**写 DOM，不逐帧重排

**位置算法**：

- 二分查找当前行（`times` 单调递增，可直接二分）
- 当前行居中锚点取容器高度的 **42%**（视觉重心略偏上更耐看）
- `lyrBody.scrollTo({ top, behavior: "smooth" })`，**只在换行时**调用
- 点任意一句 → `audio.currentTime = 该句 top`

### 6.7 `site.ts` 的页面级行为

`initNav`（抽屉导航）/ `initReveal`（滚动揭示）/ `initCarousel`（首页轮播）/ `initLightbox`（画廊灯箱），全部挂在 `astro:page-load` 上并用 `dataset.bound` 守卫。

---

## 7. 关键约定与坑（踩过的，务必读）

### 7.1 Astro

| 坑 | 现象 | 做法 |
|---|---|---|
| **scoped style 不作用于 JS 创建的元素** | 给歌词 `<li>` 写的样式完全无效（字体/字重/颜色全是默认） | Astro 的 `<style>` 会被加上 `data-astro-cid-*` 属性选择器，JS 动态创建的元素没有该属性。**动态内容的样式必须写在 `<style is:global>` 里**（LyricsPanel 就是这么做的） |
| **同优先级媒体查询写在基础规则之前** | 断点样式静默失效 | CSS 里 `@media` 必须放在它要覆盖的基础规则**之后**（这个坑踩过两次） |
| **`[data-lyrics]` 会匹配到 JSON script** | `showModal is not a function` | 页面上同时存在 `<script type="application/json" data-lyrics>` 和 `<dialog data-lyrics>`，选择器必须写成 **`dialog[data-lyrics]`** |
| **`<script>` 里的 JSON 要 `is:inline`** | 构建后 JSON 被当模块处理 | `PlayerBar.astro` 用的是 `<script type="application/json" data-lyrics is:inline set:html={...}>` |

### 7.2 CSS / 布局

| 坑 | 现象 | 做法 |
|---|---|---|
| **`display: grid` 会把每个 `<span>` 变成独立网格项** | 逐字歌词变成"一个字一行" | 歌词行用 `display: block` + 固定 `line-height` 做行盒，不要用 grid 居中 |
| **`font-size` 加 transition = 逐帧重排** | 换句时"卡一下" | 只过渡 `color`。当前句放大靠**固定行盒**（手机 52 px / 桌面 68 px）吸收，不用字号过渡 |
| **`color-mix()` 需要兜底** | 不支持的浏览器整行颜色异常 | 先写 `color: var(--ink-300)`，再写 `color: color-mix(...)` |
| **`max-width/height` 被 dialog 的 UA 样式压制** | 全屏面板左右各留 3 px | `dialog` 要显式 `max-width:100%; max-height:100%` |
| **CSS `columns` 布局下 DOM 顺序 ≠ 视觉阅读顺序** | 灯箱"下一张"跳序（**未修**，见 §9） | 若要修，需要按视觉位置重排 `items` |
| **全角 `｜` 在等宽字体栈里会 fallback** | 歌词副标题竖线粗细不一 | 换成 1 px 的 `<i>` 元素 |

### 7.3 播放器 / 媒体

| 坑 | 现象 | 做法 |
|---|---|---|
| 本地 `python3 -m http.server` 不支持 Range | 一切 seek 测试失败 | seek 只能上线上测（§3.1） |
| `page.goto()` 是整页刷新 | 测"跨页不断播"必然失败 | 用页内 `<a>` 点击做导航 |
| 手机端无曲目时底栏 `visibility: hidden` | 空状态下点不到播放条 | 这是**刻意设计**（不占屏），不是 bug；桌面端底栏常驻 |
| `current == null` 时点歌词入口 | 以前静默无反应 | 现在允许打开空态面板（有反馈胜过没反应） |
| `renderLyrics()` 在 `showModal()` 之前跑 | `lyrBody.clientHeight === 0`，首次定位算错且被"当前行没变"提前返回卡死 | **先 `showModal()`，再 `requestAnimationFrame(() => paintLyric(true))`** |
| 全屏进度条不动 | 只更新了主进度条 | `timeupdate` 里要显式调 `syncLyricBar()`（注意源文件里变量名是 `d` 不是 `t`，字符串替换容易漏） |

### 7.4 工程习惯

- **临时脚本放 `scripts/_*.mjs`，提交前删掉**（`git status` 必须是干净的）
- **提交信息用文件传**：`git -c user.name=... commit -q -F /tmp/msgN.txt`
  —— 内联 `-m` 遇到信息里的引号会炸
- 改动前先 `git log --oneline` 看上下文，提交信息是中文、写"为什么"而不只是"改了什么"

---

## 8. 验证方法（这套流程是被用户验收逼出来的）

### 8.1 原则

1. **数值探针优先于肉眼**：用 Playwright `evaluate` 读 `getBoundingClientRect` / `getComputedStyle` / class 状态 / `window.scrollY`，不要只靠截图
2. **截图用于审美**：数值对了但"不好看"一样不通过，审美问题交给能读图的子代理审查
3. **双端 × 五页回归**：每次改动都要跑

### 8.2 标准回归脚本骨架

```js
import { chromium, devices } from 'playwright';
const b = await chromium.launch();
const errs = [];
for (const [name, opt] of [
  ['手机', { ...devices['iPhone 13'], hasTouch: true }],
  ['桌面', { viewport: { width: 1440, height: 900 } }],
]) {
  const p = await (await b.newContext(opt)).newPage();
  p.on('pageerror', e => errs.push(name + ':' + e));
  for (const path of ['', 'music/', 'gallery/', 'characters/', 'story/']) {
    await p.goto('http://localhost:8899/' + path, { waitUntil: 'load' });
    // 断言：无横向溢出
    const over = await p.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (over > 0) console.log('!! 横向溢出', name, path, over);
  }
  // …交互断言…
}
console.log('错误:', errs.length ? errs.join(' | ') : '无');
```

### 8.3 必须过的验收项

- [ ] 五页 × 双端：**零 `pageerror`**、**零横向溢出**
- [ ] 播放：双击曲目 → 出封面/标题/进度；播放条进度与时间在走
- [ ] 模式按钮：四种模式循环，图标/颜色正确
- [ ] 折叠：收起 → 底栏滑出 + body padding 归零 + 还原按钮出现；再点还原
- [ ] 歌词：点封面/曲名/空白 → 全屏打开；`dialog` 尺寸 == 视口尺寸
- [ ] 歌词：当前句**白字**、已唱字**红字**、扫红在推进
- [ ] 歌词：非当前句**颜色完全一致**（没有按距离的渐变）、所有行**字号一致**
- [ ] 歌词：原文下方有译文行（默认中文），切 日/中/英 三种状态都正确
- [ ] 歌词：署名随语言变化；刷新后语言被记住
- [ ] 歌词：点某句 → seek 到该句（**线上测**），当前行号正确
- [ ] 歌词：`window.scrollY` 全程不变（绝不滚整页）
- [ ] 换句时相邻行**位移为 0**（无布局抖动）
- [ ] 跨页：开着歌词点页内链接 → 面板仍在、音频仍在放
- [ ] 点大红播放键**不会**误开歌词

### 8.4 最近一轮的实测基线（可作回归对照）

| 项 | 数值 |
|---|---|
| 歌词时间轴覆盖 | 38 首中 **37 首**，共 1390 行 |
| `碧いif` 首句时间 | **13.477 s**（前奏 1.6–9.7 s 无高亮，13.7 s 亮第一句） |
| 全屏尺寸 | 手机 `390×664` / 桌面 `1440×900`（== 视口） |
| 点第 6 句 | 音频落在 36.7 s，当前行号 5，15/15 字全红 |
| 换句布局位移 | 相邻 6 行全部 `0` |
| 点击耗时 | 手机 ~12 ms / 桌面 ~18 ms（线上含 seek 约 26 ms） |
| 标题居中偏差 | `0 px`（修之前是 +22 px） |
| 署名对比度 | `#9aa1ae` on `#07080c` ≈ 7:1（修之前 3.6:1） |

---

## 9. 已知问题 / 待办

### 9.1 已知缺陷（未修）

1. **画廊灯箱顺序 ≠ 视觉顺序**
   `Gallery.astro` 用 CSS `columns` 多列布局，`site.ts` 的 `initLightbox` 按 DOM 顺序取 `items`，导致"下一张"在视觉上是跳的。
   修法：按 `getBoundingClientRect()` 的 `top/left` 重排 items（注意窗口 resize 要重算）。
2. **`n=8 さよならあの日のメロディ` 没有时间轴**
   网易云只有 short ver.（4 行 / 15.5 s），站内是 267 s 完整版。目前退回等距估算（这首会抢跑）。拿到完整版 LRC 即可用 `scripts/lyrics-lrc-align.py` 重跑。
3. **歌词字体子集是静态的 1118 字符**
   新增歌词若出现集外汉字，会掉回系统字体。需要重新子集化（§5.4）。
4. **中文译文有 18 行缺口**
   1336/1354 行有中文（`n=8` 整首没有，另有 11 首各有 1–4 行没配上）。
   原因是那些行是插值出来的、没有 lrc 时间戳锚点，tlyric 自然也对不上。
   要补的话得人工翻译那 18 行，写进对应 JSON 的 `zh` 数组。
5. **英文译文是本站翻译，不是官方**
   官方从未发行英译歌词。UI 已标注"英文译词：本站翻译"。
6. **歌词数据内联在每个页面里，页面变重**
   `PlayerBar.astro` 构建期把 38 首歌词全部 `JSON.stringify` 进
   `<script type="application/json" data-lyrics>`，于是每个页面（包括首页）
   都要多传约 48 KB gzip。音乐页 gzip 后 89 KB。
   优化方向：把歌词改成 `public/lyrics/NN.json` 按需 `fetch`（打开面板时加载），
   代价是引入异步与竞态处理。

7. **画廊还有 51 张图没有人工图注**
   页面会把这些素材的**原始文件名**当说明显示（例：`assets/posters/01.webp` → `【ゲーム】…ティザーPV【ガルリフ】`，
   `assets/posters/19.webp` → `GeBzXCEboAAAUOg`）。目前剩下的都是日文原名或无意义 ID，
   不影响三语（没有中文），但补上更好。补法：往 `gallery-labels{,.en,.ja}.json` 三份里加同一个 key。
8. **Hero 的日文标语没翻译**
   `怒りも、悲しみも、全部ぶつけろ` 等 5 句是官网日文原句，三语下都显示日文（当作设计元素保留）。
   若要翻译，加 5 个词典键即可。

### 9.2 可做但没做的优化（用户提过或明显可做）

- Media Session 元数据完善（锁屏显示封面/歌手）
- 灯箱相邻图预加载
- 画廊 **530 项**（HTML 615 KB，主要是内联的清单数据）的回到顶部按钮
- 图片 blur-up 占位
- 手机端歌词入口的首次引导（现在靠常驻 `^` 箭头）

---

## 10. 未决问题（需要用户拍板）

1. **音乐页的 ROLE PV 区块要不要删？**
   已问过两次，用户没回答。该区块内嵌 5 支官方角色 PV（`assets/videos/`，20 MB），位于 `src/pages/music.astro` 的 `PVS`（~line 197/335）。
2. 歌词是否需要日/中双语切换（数据现成）。
3. 歌词扫红速度是否合适（用户还没在真机上给过反馈）。

---

## 11. 关键提交历史（由近及远）

| 提交 | 内容 |
|---|---|
| 本次 | 歌词加中文/英文译文 + 日/中/英切换；去掉距离渐变、统一字号 |
| `063c09d` | 歌词接上官方逐行时间轴（37/38 首） |
| `cc53a74` | 歌词改成逐字扫红 + 修掉换句卡顿 |
| `aa8ce81` | 歌词入口更好找：加提示箭头 + 播放条空白处也能点 |
| `7ee230d` | 歌词改成全屏，入口改为点播放器 |
| `5d8497d` | 新增歌词面板：点「词」看歌词，随进度高亮居中，官方同款字体 |
| `a11e497` | 播放模式合并成一个按钮：随机并进来，四种模式各有专属图标 |
| `171885e` | 播放器折叠改成完全收起 + 补上折叠动画 |
| `a760fdf` | 播放器重构：全局底栏 + 专辑内轮播 + 循环模式 + 跨页不断播 |
| `86675de` | 专辑封面环形频谱：正方形四边各 3 根圆顶刺，低频矮高频高 |

（完整历史：`git log --oneline`）

---

## 12. 版权与出处

- 音频、图片、视频、角色设定均为 GIRLS BAND CRY 官方版权物，本站为非官方粉丝站
- 站内**所有文案逐条带出处 URL**（官网 / 萌娘百科 / 官方 X），出处标注是强制组件（见 DESIGN.md §5.6）
- 歌词：**用户已授权使用**，站内有免责声明（"如果有侵权，我就立刻下架网站"）。**不要新增额外的版权说教文案，也不要删除现有声明**
- 素材管线来源目录：`/workspace/gbcc/gbc/gbc`（2.3 GB 原始素材）

---

## 13. 交接检查清单

接手后建议按顺序做：

1. `pnpm install && pnpm dev` 起本地，五个页面点一遍
2. 读 [DESIGN.md](./DESIGN.md)（色板/字体/网格是硬规范，别自由发挥）
3. 读本文档 §7（坑）——**能省掉至少半天返工**
4. 跑一次 §8.2 的回归脚本，确认当前线上/本地基线
5. 若要改歌词：改 `src/data/lyrics/*.json` → `python3 scripts/lyrics-lrc-align.py` → `pnpm build`
6. 若要改素材：改 `scripts/optimize-assets.py` 的输入 → 重跑 → `pnpm build`
7. 任何改动：**双端五页回归 → 视觉审查 → 部署 → 线上复验（尤其 seek）→ 提交**
8. 部署凭据见 §4.1（**不要把仓库推到公开远端**）
