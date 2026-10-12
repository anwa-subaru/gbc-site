/**
 * 资产清单访问层
 * ---------------------------------------------------------------------------
 * 数据源：public/assets/manifest.json（由 scripts/optimize-assets.py 生成）
 *
 * 关键约束（GitHub Pages 子路径部署）：
 *   manifest 里的 `path` **不带前导斜杠**（如 `assets/characters/nina/01-spring.webp`），
 *   必须经 `import.meta.env.BASE_URL` 拼接，否则部署到 /<repo>/ 子路径时全部 404。
 *   统一走本模块的 `assetUrl()`，不要在组件里手拼路径。
 */

import fs from "node:fs";
import path from "node:path";

export interface AssetEntry {
  path: string;
  category: string;
  index: number;
  source: string;
  source_name: string;
  source_bytes: number;
  bytes: number;
  kind: string;
  width?: number;
  height?: number;
  source_width?: number;
  source_height?: number;
  alpha?: boolean;
  animated?: boolean;
  frames?: number;
  duration?: number;
  character?: string;
  label?: string;
}

export interface CharacterMeta {
  ja: string;
  en: string;
  romaji: string;
  part: string;
  color: string;
}

interface Manifest {
  totals: Record<string, number>;
  summary: Record<string, { files: number; bytes: number; source_bytes: number }>;
  characters: Record<string, CharacterMeta>;
  categories: Record<string, AssetEntry[]>;
}

const MANIFEST_PATH = path.resolve(
  process.cwd(),
  "public/assets/manifest.json",
);

function loadManifest(): Manifest {
  if (!fs.existsSync(MANIFEST_PATH)) {
    throw new Error(
      `[assets] 找不到资产清单：${MANIFEST_PATH}\n` +
        `请先运行：python3 scripts/optimize-assets.py`,
    );
  }
  return JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf-8")) as Manifest;
}

export const manifest: Manifest = loadManifest();

/** BASE_URL 归一化为「以 / 结尾」的前缀。 */
const BASE = import.meta.env.BASE_URL.endsWith("/")
  ? import.meta.env.BASE_URL
  : `${import.meta.env.BASE_URL}/`;

/**
 * manifest 路径 → 可直接放进 <img src> 的站内 URL。
 * 同时兼容误传带前导斜杠的路径。
 */
export function assetUrl(p: string): string {
  return BASE + p.replace(/^\/+/, "");
}

/**
 * 站内路由 → 带 base 前缀的 href。
 * 用法：url('/characters') → '/gbc-site/characters'（CI）或 '/characters'（本地）
 */
export function url(pathname: string): string {
  return BASE + pathname.replace(/^\/+/, "");
}

/** 当前路径是否命中某导航项（用于高亮）。 */
export function isActive(current: string, href: string): boolean {
  const norm = (s: string): string => s.replace(/\/+$/, "") || "/";
  const c = norm(current);
  const h = norm(href);
  if (h === "/") return c === "/";
  return c === h || c.startsWith(`${h}/`);
}

export function category(name: string): AssetEntry[] {
  return manifest.categories[name] ?? [];
}

export const charactersMeta = manifest.characters;

export const characterSlugs = Object.keys(manifest.characters);

export const characterBySlug = (slug: string): CharacterMeta | undefined =>
  manifest.characters[slug];

/**
 * 某角色的「常规立绘」——排除 `_group` / `_bd` / `_archive` / `_diamond-dust`
 * 等下划线前缀的辅助目录，只取语义化命名的主立绘。
 */
export function characterArt(slug: string): AssetEntry[] {
  return category("characters").filter(
    (e) => e.character === slug && e.path.startsWith(`assets/characters/${slug}/`),
  );
}

/** 角色卡代表图：优先「立小指」（乐队标志性手势），否则取第一张。 */
export function characterPrimary(slug: string): AssetEntry | undefined {
  const art = characterArt(slug);
  return art.find((e) => e.label === "koyubi") ?? art[0];
}

/** 组合图（5 人合影，首页 Hero 用）。 */
export function groupShots(): AssetEntry[] {
  return category("characters").filter((e) =>
    e.path.startsWith("assets/characters/_group/"),
  );
}

export const albums = (): AssetEntry[] => category("covers");
export const artworks = (): AssetEntry[] => category("artworks");
export const posters = (): AssetEntry[] => category("posters");
export const logos = (): AssetEntry[] => category("logo");
export const emojis = (): AssetEntry[] => category("emoji");
export const videos = (): AssetEntry[] => category("videos");

/** 按 label 取一张特定素材（找不到返回 undefined）。 */
export function findByLabel(
  cat: string,
  label: string,
): AssetEntry | undefined {
  return category(cat).find((e) => e.label === label);
}

/** 从 videos 生成 MusicPlayer 可用的曲目（角色 PV 带 Opus 音轨）。 */
export function pvTracks() {
  return category("videos").map((v) => {
    const meta = v.character ? manifest.characters[v.character] : undefined;
    return {
      src: assetUrl(v.path),
      title: meta ? `${meta.ja} 角色 PV` : "角色 PV",
      subtitle: meta ? `${meta.en} · ${meta.part.toUpperCase()}` : "",
      color: meta?.color ?? "var(--gbc-red)",
      slug: v.character ?? "pv",
      duration: v.duration ?? 0,
    };
  });
}

export const totals = manifest.totals;

/**
 * 担当（乐器）元数据 —— 图标与文字标签均取自官方素材库 `logo 元素素材/`。
 * 主唱/吉他/贝斯/键盘/鼓 的官方图标与 txt_part-* 标签图。
 */
export const PART_META: Record<
  string,
  { en: string; zh: string; icon: string; label: string }
> = {
  vo: {
    en: "Vocal",
    zh: "主唱",
    icon: "assets/logo/icon/01-brand.webp",
    label: "assets/logo/parts/06-txt-part-vo.webp",
  },
  gt: {
    en: "Guitar",
    zh: "吉他",
    icon: "assets/logo/icon/03-brand.webp",
    label: "assets/logo/parts/04-txt-part-gt.webp",
  },
  ba: {
    en: "Bass",
    zh: "贝斯",
    icon: "assets/logo/icon/05-brand.webp",
    label: "assets/logo/parts/02-txt-part-ba.webp",
  },
  key: {
    en: "Keyboard",
    zh: "键盘",
    icon: "assets/logo/icon/07-brand.webp",
    label: "assets/logo/parts/05-txt-part-key.webp",
  },
  dr: {
    en: "Drums",
    zh: "鼓",
    icon: "assets/logo/icon/09-brand.webp",
    label: "assets/logo/parts/03-txt-part-dr.webp",
  },
};

export const partMeta = (part: string) =>
  PART_META[part] ?? PART_META.vo;
