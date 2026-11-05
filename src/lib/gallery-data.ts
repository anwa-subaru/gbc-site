/**
 * 画廊数据层（页面与搜索索引共用）
 * ---------------------------------------------------------------
 * 从 public/assets/manifest.json 里按「海报 / 贺图 / 收藏集 / 表情」四分法
 * 收集条目。此前这段逻辑只写在 gallery.astro 里；搜索索引需要同一份数据，
 * 否则搜索结果会指向画廊页根本不存在的素材。抽到这里，一处修改两处生效。
 */
import { category, type AssetEntry } from "./assets";

export interface GroupDef {
  id: string;
  label: string;
  /** 词典 key：筛选按钮文案 */
  i18n: string;
  ja: string;
  note: string;
  /** 参与该组的子目录（空数组 = 该分类根目录） */
  subs: string[];
  /** 每个子目录最多取几张（0 = 不限） */
  cap: number;
  /** 素材来源分类，默认 artworks（海报组取 posters） */
  from?: "artworks" | "posters" | "emoji";
}

export const GROUPS: GroupDef[] = [
  {
    id: "poster",
    label: "海报",
    i18n: "gallery.tab.posters",
    ja: "宣伝ビジュアル",
    note: "宣发海报 / KV",
    subs: [],
    cap: 0,
    from: "posters",
  },
  {
    id: "art",
    label: "贺图",
    i18n: "gallery.tab.art",
    ja: "描き下ろし",
    note: "官方贺图与角色设定图",
    subs: [
      "anime",
      "nari-illust",
      "character-design",
      "movie",
      "solo",
      "cry-rose",
      "heisei-gyaru",
    ],
    cap: 0,
  },
  {
    id: "collect",
    label: "收藏集",
    i18n: "gallery.tab.collections",
    ja: "グッズ",
    note: "周边、联动与收藏用视觉资料",
    subs: [
      "gacha-art",
      "jellyfish",
      "mini",
      "mv-unmei",
      "merch-promo",
      "popup-shop",
      "shimamura",
      "shimamura-kawasaki",
      "acrylic-plate",
      "acrylic-strap",
      "badges",
      "card-sleeve",
      "plush",
      "sanrio",
      "work-cat",
      "work-cat-2",
      "misc",
    ],
    cap: 0,
  },
  {
    id: "sticker",
    label: "表情",
    i18n: "gallery.tab.stickers",
    ja: "スタンプ",
    note: "官方表情包（静图 / 动图）",
    subs: [],
    cap: 0,
    from: "emoji",
  },
];

const artworks = category("artworks");
const posters = category("posters");
/* 表情包：animated-1（静态 WebP 版）与 animated（GIF 版）是同一套贴纸，
   两套都放会重复，只保留动图那一套。 */
const emojis = category("emoji").filter(
  (e) => !e.path.includes("/emoji/animated-1/"),
);

const inSub = (e: AssetEntry, sub: string): boolean =>
  e.path.startsWith(`assets/artworks/${sub}/`);

function collect(g: GroupDef): AssetEntry[] {
  if (g.from === "emoji") return emojis;
  if (g.from === "posters" || g.subs.length === 0) return posters;
  if (g.cap === 0) {
    return g.subs.flatMap((s) => artworks.filter((e) => inSub(e, s)));
  }
  return g.subs.flatMap((s) =>
    artworks.filter((e) => inSub(e, s)).slice(0, g.cap),
  );
}

export interface GalleryItem extends AssetEntry {
  group: string;
}

export const GALLERY_ITEMS: GalleryItem[] = GROUPS.flatMap((g) =>
  collect(g).map((e) => ({ ...e, group: g.id })),
);

export const galleryCount = (id: string): number =>
  GALLERY_ITEMS.filter((i) => i.group === id).length;
