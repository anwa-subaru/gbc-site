import type { APIRoute } from "astro";
import { manifest } from "../lib/assets";
import { GALLERY_ITEMS } from "../lib/gallery-data";
import songs from "../data/songs.json";

/**
 * 构建产物状态端点：给部署脚本/监控一个"这次到底上了什么"的凭据。
 * 纯构建期生成，不依赖运行时；部署后 curl /status.json 即可核对 commit 与素材量。
 */
export const GET: APIRoute = () =>
  new Response(
    JSON.stringify(
      {
        status: "ok",
        service: "gbc-site",
        builtAt: new Date().toISOString(),
        commit: process.env.GITHUB_SHA ?? "local",
        pages: 7,
        songs: songs.length,
        gallery: GALLERY_ITEMS.length,
        assets: manifest.totals ?? {},
      },
      null,
      2,
    ),
    {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-cache",
      },
    },
  );
