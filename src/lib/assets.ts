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

/* ---------------------------------------------------------------------------
 * 立绘多尺寸（<img srcset>）
 *
 * 背景：角色页一条缩略图带 5 人共 209 张立绘，原图长边 1600px 而实际显示只有
 * 132~150 CSS px。实测预生成 400px 小图比把 1600px 丢给浏览器降采样**更清晰**
 * （与理想参考的 RMSE 19.65 → 16.78）且单张 74.8K → 12K。
 *
 * 变体由 scripts/char-variants.py 从**源 PNG** 生成（不是拿现有 webp 再压，
 * 避免二次有损），尺寸索引写在 public/assets/char-variants.json。
 * 索引不存在时 srcset() 返回 undefined，模板自动退回单图，构建不会失败。
 * ------------------------------------------------------------------------- */

interface Variant {
  edge: number;
  path: string;
  width: number;
  height: number;
}

const VARIANTS_PATH = path.resolve(
  process.cwd(),
  "public/assets/char-variants.json",
);

function loadVariants(): Record<string, Variant[]> {
  if (!fs.existsSync(VARIANTS_PATH)) return {};
  try {
    const raw = JSON.parse(fs.readFileSync(VARIANTS_PATH, "utf-8"));
    return (raw.variants ?? {}) as Record<string, Variant[]>;
  } catch {
    return {};
  }
}

const VARIANTS = loadVariants();

/** 原始文件宽高索引（srcset 里的最大档），来自 manifest。 */
const ORIGINAL_SIZE: Record<string, { width: number; height: number }> = {};
for (const list of Object.values(manifest.categories)) {
  for (const e of list) {
    if (e.width && e.height) {
      ORIGINAL_SIZE[e.path] = { width: e.width, height: e.height };
    }
  }
}

/**
 * 拼 `srcset`。没有变体数据时返回 undefined（此时 <img> 上不写 srcset 属性）。
 * @param p manifest 路径
 */
export function srcset(p: string): string | undefined {
  const variants = VARIANTS[p];
  if (!variants?.length) return undefined;
  const all: { path: string; width: number }[] = [...variants];
  const orig = ORIGINAL_SIZE[p];
  if (orig) all.push({ path: p, width: orig.width });
  return all
    .sort((a, b) => a.width - b.width)
    .map((v) => `${assetUrl(v.path)} ${v.width}w`)
    .join(", ");
}

/**
 * `sizes` 属性：图片在 `object-fit: contain` 容器里**内容实际占用的 CSS 宽度**。
 *
 * 不能直接写容器宽度——249 张立绘里 158 张宽高比 <0.5（瘦高，中位 0.43），
 * 瘦高图在 contain 下只占容器中间一条，若按容器宽度上报，浏览器会按
 * `sizes × DPR` 选档，白白拉一张远超所需的大图（实测手机端就是这么退回原图的）。
 *
 * @param e          manifest 条目（需要 width/height）
 * @param mobile     手机端容器 [宽, 高]（CSS px）
 * @param desktop    桌面端容器 [宽, 高]（CSS px）
 */
export function contentSizes(
  e: { width?: number; height?: number },
  mobile: [number, number],
  desktop: [number, number],
): string {
  const ar = (e.width ?? 1) / (e.height ?? 1);
  const fit = ([bw, bh]: [number, number]): number =>
    Math.round(Math.min(bw, bh * ar) * 100) / 100;
  return `(max-width: 1023px) ${fit(mobile)}px, ${fit(desktop)}px`;
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
