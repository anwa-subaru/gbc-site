/**
 * UI 语言运行时：把 [data-i18n] / [data-i18n-attr] 的文案换成当前语言。
 *
 *  - 时机：astro:after-swap（新 DOM 刚换进来、还没绘制）与 astro:page-load
 *    各跑一次，所以跨页导航不会闪一下中文。
 *  - 持久化：localStorage["gbc.lang"]，由 <head> 里的内联脚本提前写到
 *    <html data-lang> 上（那一步在首屏绘制前，避免整页闪）。
 *  - 切换：任何 [data-lang-set="zh|en|ja"] 的按钮都能切；切完派发 gbc:lang 事件，
 *    player.ts 等动态文案模块监听它重新取词。
 */
import {
  DICTS,
  DEFAULT_LANG,
  HTML_LANG,
  isLang,
  STORAGE_KEY,
  type Lang,
} from "../i18n";

let lang: Lang = DEFAULT_LANG;

/**
 * 只替换元素的**直属文本节点**，保留子元素。
 * 早期版本用 el.textContent = s，会把按钮里的 <span class="num">计数</span>
 * 一并抹掉；也有页面把 data-i18n 挂在 [hidden] 的空状态上，
 * 那时若再写 el.hidden 就会把空状态强行显示出来 —— 两个坑都在这儿堵掉：
 * 空文案改用 class 隐藏（见 global.css 的 .is-i18n-empty），不碰 hidden 属性。
 */
const setText = (el: HTMLElement, s: string): void => {
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) node.remove();
  }
  el.insertBefore(document.createTextNode(s), el.firstChild);
};

/** {name} / {current} 这类占位符：值来自 data-i18n-vars="name:放大查看,current:1"。
    用 "键:" 的位置来切分，值里带逗号（如曲名「A, B」）也不会切错。 */
const VAR_RE = /(?:^|,)\s*([A-Za-z0-9_-]+)\s*:/g;
const parseVars = (spec?: string): Record<string, string> => {
  const vars: Record<string, string> = {};
  if (!spec) return vars;
  const hits = [...spec.matchAll(VAR_RE)];
  hits.forEach((m, i) => {
    const from = (m.index ?? 0) + m[0].length;
    const to = i + 1 < hits.length ? (hits[i + 1].index ?? spec.length) : spec.length;
    vars[m[1]] = spec.slice(from, to).replace(/,\s*$/, "").trim();
  });
  return vars;
};

const subst = (s: string, spec?: string): string => {
  if (!spec || s.indexOf("{") < 0) return s;
  const vars = parseVars(spec);
  return s.replace(/\{(\w+)\}/g, (m, k: string) => vars[k] ?? m);
};

const fill = (el: HTMLElement, key: string, l: Lang): void => {
  const raw = DICTS[l]?.[key] ?? DICTS.zh[key];
  if (raw === undefined) return;
  const s = subst(raw, el.dataset.i18nVars);
  setText(el, s);
  el.classList.toggle("is-i18n-empty", s === "");
};

/** data-i18n-attr="aria-label:nav.open,title:nav.open" */
const fillAttrs = (el: HTMLElement, spec: string, l: Lang): void => {
  for (const pair of spec.split(",")) {
    const i = pair.indexOf(":");
    if (i < 0) continue;
    const attr = pair.slice(0, i).trim();
    const key = pair.slice(i + 1).trim();
    const v = DICTS[l]?.[key] ?? DICTS.zh[key];
    if (attr && v !== undefined) el.setAttribute(attr, subst(v, el.dataset.i18nVars));
  }
};

/** 给脚本用的取词（支持 {name} 占位符替换） */
export const t = (key: string, vars?: Record<string, string | number>): string => {
  const raw = DICTS[lang]?.[key] ?? DICTS.zh[key] ?? key;
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (m, k: string) => String(vars[k] ?? m));
};

export const getLang = (): Lang => lang;

/** 滑块定位 + 当前项标记。切换时按钮要立刻响应，所以点击时先调它、
    再走整页淡出（否则滑块是在页面全黑时滑的，用户看不到）。 */
let pillsArmed = false;
const syncPills = (): void => {
  document.querySelectorAll<HTMLElement>(".lang").forEach((box) => {
    const on = box.querySelector<HTMLElement>(".lang__btn.is-on");
    const pill = box.querySelector<HTMLElement>(".lang__pill");
    if (!on || !pill) return;
    pill.style.width = `${on.offsetWidth}px`;
    pill.style.height = `${on.offsetHeight}px`;
    pill.style.transform = `translate(${on.offsetLeft}px, ${on.offsetTop}px)`;
  });
};
const armPills = (): void => {
  if (pillsArmed) return;
  pillsArmed = true;
  requestAnimationFrame(() => {
    document.querySelectorAll<HTMLElement>(".lang").forEach((b) => b.classList.add("is-ready"));
  });
};
export const markActive = (next: Lang): void => {
  document.querySelectorAll<HTMLElement>("[data-lang-set]").forEach((b) => {
    const on = b.dataset.langSet === next;
    b.classList.toggle("is-on", on);
    b.setAttribute("aria-pressed", String(on));
  });
  syncPills();
  armPills();
};

export const applyLang = (next: Lang = lang): void => {
  lang = next;
  const root = document.documentElement;
  root.lang = HTML_LANG[next];
  root.dataset.lang = next;

  document.querySelectorAll<HTMLElement>("[data-i18n]").forEach((el) => {
    const key = el.dataset.i18n;
    if (key) fill(el, key, next);
  });
  document.querySelectorAll<HTMLElement>("[data-i18n-attr]").forEach((el) => {
    const spec = el.dataset.i18nAttr;
    if (spec) fillAttrs(el, spec, next);
  });
  markActive(next);

  // <title> 与 meta description（由 Layout 在 <body> 上挂 key）
  const tk = document.body?.dataset.i18nTitle;
  if (tk) document.title = DICTS[next]?.[tk] ?? DICTS.zh[tk] ?? document.title;
  const dk = document.body?.dataset.i18nDesc;
  if (dk) {
    const desc = DICTS[next]?.[dk] ?? DICTS.zh[dk];
    const meta = document.querySelector('meta[name="description"]');
    if (desc && meta) meta.setAttribute("content", desc);
  }

  document.dispatchEvent(new CustomEvent("gbc:lang", { detail: { lang: next } }));
};

/** 切换过场：正文淡出 → 换语言 → 淡入（见 global.css 的 html.lang-swap）。
    直接替换会"啪"地全页换字，很硬：先整页淡出 170ms，在全透明时换字，
    再按 CSS 里配好的延迟错开淡入（导航→正文→页脚/播放条）。
    只在用户主动切换时走动画，首屏与跨页导航是直接应用，不闪。 */
let swapTimer = 0;
export const setLang = (next: Lang): void => {
  if (next === lang) return;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    /* 隐私模式存不了，不影响本次切换 */
  }
  const root = document.documentElement;
  if (swapTimer) window.clearTimeout(swapTimer);
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduced) {
    applyLang(next);
    return;
  }
  root.classList.add("lang-swap");
  swapTimer = window.setTimeout(() => {
    applyLang(next); // 页面此刻是全透明的，换字过程看不见
    root.classList.remove("lang-swap"); // 去掉后由 CSS 错开淡入
    swapTimer = 0;
  }, 215); // 比 CSS 的 170ms 淡出多留一点，保证换字时已经全透明
};

const readStored = (): void => {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (isLang(v)) lang = v;
  } catch {
    /* 用默认语言 */
  }
};

readStored();

// 事件委托：切换器可能由抽屉/导航动态出现，绑在 document 上最稳
document.addEventListener("click", (e) => {
  const btn = (e.target as HTMLElement | null)?.closest<HTMLElement>("[data-lang-set]");
  if (!btn) return;
  const v = btn.dataset.langSet;
  if (!isLang(v) || v === getLang()) return;
  markActive(v); // 滑块先滑过去，页面这时还在淡出，用户看得见
  setLang(v);
});

window.addEventListener("resize", syncPills);

// ClientRouter：after-swap 早于绘制，先应用一次；page-load 再兜一次（幂等）
document.addEventListener("astro:after-swap", () => {
  readStored();
  applyLang();
});
document.addEventListener("astro:page-load", () => applyLang());
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => applyLang());
} else {
  applyLang();
}
