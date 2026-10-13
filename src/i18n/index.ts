/**
 * 全站 UI 三语（中文 / English / 日本語）
 *
 * 设计取舍：本站是纯静态站（SSG），且播放条靠 transition:persist 跨页保活，
 * 所以不做 /en /ja 路由，而是**客户端切换**：
 *   - SSR 出来的一律是中文（本站主要面向中文用户，也是默认语言），
 *     所以关掉 JS 或爬虫看到的仍然是完整中文页面；
 *   - 切到英/日只改 DOM 文案，不刷新、不跳转，音乐与歌词面板状态都不丢。
 * 文案在 src/i18n/{zh,en,ja}.json，key 用点分命名空间（nav.* / footer.* / <页面>.*）。
 */
import zh from "./zh.json";
import en from "./en.json";
import ja from "./ja.json";

export const LANGS = ["zh", "en", "ja"] as const;
export type Lang = (typeof LANGS)[number];
export type Dict = Record<string, string>;

export const DICTS: Record<Lang, Dict> = { zh, en, ja };

/** 切换器上显示的短标签 */
export const LANG_SHORT: Record<Lang, string> = { zh: "中", en: "EN", ja: "日" };
/** 切换器上的完整名称（title / aria-label 用） */
export const LANG_NAME: Record<Lang, string> = {
  zh: "中文",
  en: "English",
  ja: "日本語",
};
/** <html lang> 的值 */
export const HTML_LANG: Record<Lang, string> = { zh: "zh-CN", en: "en", ja: "ja" };

export const DEFAULT_LANG: Lang = "zh";
export const STORAGE_KEY = "gbc.lang";

export const isLang = (v: unknown): v is Lang => LANGS.includes(v as Lang);

/** 取词：缺词回落到中文，再缺就返回 key 本身（便于发现漏翻） */
export const t = (lang: Lang, key: string): string =>
  DICTS[lang]?.[key] ?? DICTS.zh[key] ?? key;
