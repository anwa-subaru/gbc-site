import type { APIRoute } from "astro";

/**
 * 静态站点地图：5 个内容页 + 搜索页。
 * 走 Astro 的静态端点，构建时生成 dist/sitemap.xml；base 由 BASE_URL 注入，
 * 所以根路径（Caddy）与 /gbc-site（GitHub Pages）都能得到正确的绝对地址。
 */
const PAGES = ["/", "/music/", "/gallery/", "/characters/", "/story/", "/search/"];

export const GET: APIRoute = ({ site }) => {
  const origin = site ?? new URL("https://gbc.misakamikoto.xyz");
  const base = import.meta.env.BASE_URL.endsWith("/")
    ? import.meta.env.BASE_URL
    : `${import.meta.env.BASE_URL}/`;

  const urls = PAGES.map((p) => {
    const href = new URL(`${base}${p.replace(/^\/+/, "")}`, origin).href;
    return `<url><loc>${href}</loc></url>`;
  }).join("");

  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`,
    {
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
      },
    },
  );
};
