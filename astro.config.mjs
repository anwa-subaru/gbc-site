// @ts-check
import { defineConfig } from 'astro/config';

/**
 * GitHub Pages 部署配置
 * ---------------------------------------------------------------
 * base 路径必须是 `/<repo>`，否则子路径部署时全部资源 404。
 * 优先取 CI 注入的 BASE_PATH；其次从 GITHUB_REPOSITORY 推导；
 * 本地开发回退到 '/'（pnpm dev 时直接访问根路径）。
 */
const repoName = process.env.GITHUB_REPOSITORY?.split('/')[1];
const base = process.env.BASE_PATH ?? (repoName ? `/${repoName}` : '/');
const site =
  process.env.SITE_URL ??
  (process.env.GITHUB_REPOSITORY
    ? `https://${process.env.GITHUB_REPOSITORY.split('/')[0]}.github.io`
    : 'http://localhost:4321');

export default defineConfig({
  site,
  base,
  output: 'static',
  trailingSlash: 'ignore',
  build: {
    inlineStylesheets: 'auto',
  },
  devToolbar: { enabled: false },
});
