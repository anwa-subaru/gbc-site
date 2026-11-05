# 后端 / 边缘层现状与本次改动

> 审计时间：2026-11-05  
> 对象：`https://gbc.misakamikoto.xyz`（Astro 静态站 + Caddy）  
> 结论：**站点没有应用后端**，只有 Caddy 静态文件服务。所谓“后端”实际由三层组成：构建期数据管线、Caddy 托管层、GitHub Actions 发布层。

---

## 1. 线上黑盒体检（实测）

| 项 | 结果 | 评价 |
|---|---|---|
| HTTP | HTTP/2 + `alt-svc: h3` | 正常，支持 HTTP/3 |
| TLS | Caddy 自动证书 | 正常 |
| 压缩 | `Content-Encoding: gzip`（`encode gzip zstd`） | 可用；Brotli 未启用（Caddy 2.6 无内置 br） |
| HTML 缓存 | 无 `Cache-Control`，仅 `ETag` / `Last-Modified` | 每次回源校验，功能正确但缺少显式策略 |
| 静态资源 | `/assets/*`、`/_astro/*` → `max-age=31536000, immutable` | 正确 |
| Range | 音频返回 206（Caddy） | 正确，播放器 seek 依赖它 |
| 安全头 | **无 HSTS / CSP / X-Content-Type-Options / Referrer-Policy / Permissions-Policy** | 缺失，需补 |
| `robots.txt` | 404 | 缺失（本次已补构建端点） |
| `sitemap.xml` | 404 | 缺失（本次已补构建端点） |
| 404 页面 | Caddy `handle_errors` 返回纯文本 | 体验差（本次已加 `404.astro`） |
| 目录/源码泄露 | `/.git/`、`/.env`、`/HANDOVER.md`、`/package.json`、`/src/...` 均 404 | 正常（root 指向 `dist`） |

---

## 2. 本次在仓库里落地的“后端”能力

### 2.1 构建期索引 / 静态 API

- `src/pages/lyrics/[n].json.ts` → `/lyrics/01.json … /lyrics/38.json`
  - 38 首歌词从“每页内联”改为按曲静态 JSON，只有打开歌词面板才取当前曲；
  - 首页 HTML 304KB → 52KB（gzip 约 48KB → 11KB），音乐页 396KB → 148KB，搜索页 284KB → 36KB。

- `src/pages/search-index.json.ts` → `/search-index.json`
  - 构建时把 38 首歌、5 位角色、530 张画廊、6 个页面拍平成 602 条索引；
  - 三语图注合并进 `keywords`，一次搜索覆盖中日英；
  - 页面首次输入时才 fetch，不增加首屏负担。
- `src/pages/robots.txt.ts` → `/robots.txt`
- `src/pages/sitemap.xml.ts` → `/sitemap.xml`
  - 两者都按 `BASE_URL` 推导绝对地址，根路径与 `/gbc-site` 子路径都正确。
- `src/pages/status.json.ts` → `/status.json`
  - 输出构建时间、commit（CI 的 `GITHUB_SHA`）、页数、曲目数、画廊数；
  - 部署后 `curl /status.json` 就能确认“这次上的是哪一版”。

### 2.2 安全 / 缓存配置

- `public/_headers`：Cloudflare Pages / Netlify 可直接识别的安全头 + 缓存策略。
- `deploy/Caddyfile.gbc`：线上 Caddy 的同款片段（HSTS、CSP、nosniff、Referrer-Policy、Permissions-Policy、移除 `Server` 头、HTML `must-revalidate`、静态资源一年缓存）。

### 2.3 数据层复用

- `src/lib/gallery-data.ts`：把画廊“海报 / 贺图 / 收藏集 / 表情”的收集逻辑从页面里抽出来。
  - `gallery.astro` 与 `search-index.json.ts` 共用同一份 `GALLERY_ITEMS`；
  - 避免搜索结果指向画廊页不存在的素材（此前索引会多出 23 条不可见项）。

### 2.4 SEO

- `Layout.astro` 注入 `WebSite` + `SearchAction` JSON-LD；
- `sitemap.xml` 纳入 6 个页面；
- `404.astro` 提供品牌化 404（GitHub Pages 直接使用 `404.html`；Caddy 需在 `handle_errors` 里显式指向，见 `deploy/Caddyfile.gbc`）。
- 站内搜索页 `/search/`：⌘K/Ctrl+K 聚焦、↑↓ 选择、Enter 打开、Esc 清空、三语类型标签、`?q=` 可分享；索引只在搜索页加载，不影响其他页面首屏。

---

## 3. 仍需在服务器上执行（当前环境没有 SSH 凭据）

本次**没有**改动线上 Caddy（`GBC_SSH_PASS` 未注入、`root@82.158.230.34` 公钥被拒）。要让安全头/HTML 缓存真正生效，需要：

1. 把 `deploy/Caddyfile.gbc` 的 `header` 段并入 `/etc/caddy/Caddyfile` 的 `gbc` 块；
2. `caddy validate --config /etc/caddy/Caddyfile`；
3. `systemctl reload caddy`（reload 不断连接，不需要重启整个 Caddy）；
4. 重新构建并全量部署 `dist/`（见 `HANDOVER.md §4.1`）。

回滚：`/etc/caddy/Caddyfile.bak_*` 已由历史运维保留；本次修改前请再备份一份。

---

## 4. 如果以后要“真后端”

纯静态站做不了播放计数、评论、歌单同步这类能力。可选：

| 方案 | 成本 | 适用 |
|---|---|---|
| Cloudflare Worker + KV/D1 | 免费额度足够，需 CF Token | 播放计数、点赞、短评 |
| 现有 HK 服务器加一个小 Go/Node 服务 + Caddy 反代 | 需 SSH；注意内存只剩 1.8G | 需要自己掌控数据 |
| 继续纯静态 + 构建期生成 | 0 运行时 | 搜索、歌词、分享卡（本次采用） |

当前站点内容量（38 首歌 / 530 张图）用构建期索引 + 静态 API 已经够用，不建议为了“有后端”而上常驻服务。
