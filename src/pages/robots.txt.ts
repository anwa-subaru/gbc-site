import type { APIRoute } from "astro";

/**
 * robots.txt：允许全站抓取，并指向构建时生成的 sitemap.xml。
 * 同样是静态端点，base 随部署路径变化。
 */
export const GET: APIRoute = ({ site }) => {
  const origin = site ?? new URL("https://gbc.misakamikoto.xyz");
  const base = import.meta.env.BASE_URL.endsWith("/")
    ? import.meta.env.BASE_URL
    : `${import.meta.env.BASE_URL}/`;
  const sitemap = new URL(`${base}sitemap.xml`, origin).href;
  return new Response(`User-agent: *\nAllow: /\n\nSitemap: ${sitemap}\n`, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
};
