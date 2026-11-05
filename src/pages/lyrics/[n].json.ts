import type { APIRoute } from "astro";
import fs from "node:fs";
import path from "node:path";
import songs from "../../data/songs.json";

/**
 * 单曲歌词 API：/lyrics/01.json … /lyrics/38.json
 * ---------------------------------------------------------------
 * 过去 38 首歌词全部内联进 PlayerBar，导致每个页面（包括首页）都多背
 * 约 48KB gzip。改成按曲目拆成静态 JSON，只有真正打开歌词面板时才取当前曲。
 * 构建期读取 src/data/lyrics/NN.json，输出仍是纯静态文件，不引入运行时。
 */
const LYRICS_DIR = path.resolve(process.cwd(), "src/data/lyrics");

export function getStaticPaths(): { params: { n: string } }[] {
  return songs.map((s) => ({ params: { n: String(s.n).padStart(2, "0") } }));
}

export const GET: APIRoute = ({ params }) => {
  const n = String(params.n ?? "");
  const file = path.join(LYRICS_DIR, `${n}.json`);
  if (!fs.existsSync(file)) {
    return new Response("Not found", { status: 404 });
  }
  return new Response(fs.readFileSync(file, "utf-8"), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
};
