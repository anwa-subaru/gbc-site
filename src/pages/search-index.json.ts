import type { APIRoute } from "astro";
import songs from "../data/songs.json";
import labelsZh from "../data/gallery-labels.json";
import labelsEn from "../data/gallery-labels.en.json";
import labelsJa from "../data/gallery-labels.ja.json";
import {
  assetUrl,
  characterPrimary,
  charactersMeta,
  url,
  type AssetEntry,
} from "../lib/assets";
import { GALLERY_ITEMS, GROUPS } from "../lib/gallery-data";

/**
 * 站内搜索索引（构建期生成，跑一次全站共用）
 * ---------------------------------------------------------------
 * 纯静态站没有数据库，把「歌 / 角色 / 画廊 / 页面」在构建时拍平成
 * 一个 JSON，前端只在用户第一次搜索时 fetch 一次。
 * 530 张画廊只索引标题与三语图注，不带尺寸/色值等无用字段，gzip 后 ~40KB。
 */

type Item = {
  type: "song" | "character" | "gallery" | "page";
  title: string;
  sub: string;
  href: string;
  img?: string;
  /** 三语标题/别名，全部小写，供前端做包含匹配 */
  keywords: string;
};

const labelOf = (e: AssetEntry, lang: "zh" | "en" | "ja"): string => {
  const dict = lang === "en" ? labelsEn : lang === "ja" ? labelsJa : labelsZh;
  return (
    (dict as Record<string, string>)[e.path] ||
    (labelsZh as Record<string, string>)[e.path] ||
    e.source_name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ")
  );
};

const groupLabel = (id: string): string =>
  GROUPS.find((g) => g.id === id)?.label ?? "画廊";

const galleryItems: Item[] = GALLERY_ITEMS.map((e) => {
  const zh = labelOf(e, "zh");
  const en = labelOf(e, "en");
  const ja = labelOf(e, "ja");
  return {
    type: "gallery",
    title: zh || en || ja,
    sub: `画廊 · ${groupLabel(e.group)}`,
    href: `${url("/gallery/")}?photo=${encodeURIComponent(e.path)}`,
    img: assetUrl(e.path),
    keywords: [zh, en, ja, e.path, e.group].join(" ").toLowerCase(),
  };
});

const songItems: Item[] = songs.map((s) => ({
  type: "song",
  title: s.title,
  sub: `${s.artist} · ${s.album}`,
  href: url(`/music/#track-${s.n}`),
  img: assetUrl(s.cover),
  keywords: [s.title, s.artist, s.album, `track-${s.n}`]
    .join(" ")
    .toLowerCase(),
}));

const characterItems: Item[] = Object.entries(charactersMeta).map(
  ([slug, meta]) => {
    const art = characterPrimary(slug);
    return {
      type: "character",
      title: meta.ja,
      sub: `${meta.en} · ${meta.part.toUpperCase()}`,
      href: url(`/characters/#${slug}`),
      img: art ? assetUrl(art.path) : undefined,
      keywords: [meta.ja, meta.en, meta.romaji, slug, meta.part]
        .join(" ")
        .toLowerCase(),
    };
  },
);

const pageItems: Item[] = [
  { path: "/", title: "首页", sub: "HOME", zh: "首页" },
  { path: "/music/", title: "音乐", sub: "MUSIC", zh: "音乐" },
  { path: "/gallery/", title: "画廊", sub: "GALLERY", zh: "画廊" },
  { path: "/characters/", title: "角色", sub: "CHARACTER", zh: "角色" },
  { path: "/story/", title: "剧情", sub: "STORY", zh: "剧情" },
  { path: "/search/", title: "搜索", sub: "SEARCH", zh: "搜索" },
].map((p) => ({
  type: "page" as const,
  title: p.title,
  sub: p.sub,
  href: url(p.path),
  keywords: `${p.zh} ${p.sub} ${p.path} 页面 page`.toLowerCase(),
}));

const payload = {
  generated: new Date().toISOString(),
  total: galleryItems.length + songItems.length + characterItems.length + pageItems.length,
  items: [...pageItems, ...songItems, ...characterItems, ...galleryItems],
};

export const GET: APIRoute = () =>
  new Response(JSON.stringify(payload), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
