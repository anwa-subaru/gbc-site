/**
 * 站内搜索运行时
 * ---------------------------------------------------------------
 * 索引：/search-index.json（构建期生成，首次输入时才下载）
 * 交互：输入 120ms 防抖 → 过滤 → 排序 → 渲染；↑↓ 选择、Enter 打开、Esc 清空
 * 语言：结果里的类型标签走 t()，切换语言时重渲染当前结果
 */
import { t } from "./i18n";

/* base 在 GitHub Pages 下是 "/gbc-site"（不带尾斜杠），拼 URL 前必须补齐 */
const BASE = import.meta.env.BASE_URL.endsWith("/")
  ? import.meta.env.BASE_URL
  : `${import.meta.env.BASE_URL}/`;

type ItemType = "song" | "character" | "gallery" | "page";

interface Item {
  type: ItemType;
  title: string;
  sub: string;
  href: string;
  img?: string;
  keywords: string;
}

interface Payload {
  total: number;
  items: Item[];
}

const TYPE_KEY: Record<ItemType, string> = {
  song: "search.type.song",
  character: "search.type.character",
  gallery: "search.type.gallery",
  page: "search.type.page",
};

const input = document.querySelector<HTMLInputElement>("#search-input");
const resultsEl = document.querySelector<HTMLElement>("[data-search-results]");
const statusEl = document.querySelector<HTMLElement>("[data-search-status]");
const stateEl = document.querySelector<HTMLElement>("[data-search-state]");
const stateTitleEl = document.querySelector<HTMLElement>("[data-search-state-title]");
const stateHintEl = document.querySelector<HTMLElement>("[data-search-state-hint]");
const filterEls = Array.from(
  document.querySelectorAll<HTMLButtonElement>("[data-filter]"),
);

if (input && resultsEl && statusEl && stateEl) {
  let items: Item[] = [];
  let loaded = false;
  let loadPromise: Promise<boolean> | null = null;
  let filter: "all" | ItemType = "all";
  let query = "";
  let active = -1;
  let results: Item[] = [];
  let timer = 0;

  const norm = (s: string): string => s.toLowerCase().trim();

  const esc = (s: string): string =>
    s.replace(/[&<>"']/g, (c) => {
      const map: Record<string, string> = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      };
      return map[c] ?? c;
    });

  /** 只高亮第一处命中；标题里的命中率最高，副标题不标。 */
  const mark = (text: string, q: string): string => {
    if (!q) return esc(text);
    const at = text.toLowerCase().indexOf(q);
    if (at < 0) return esc(text);
    return (
      esc(text.slice(0, at)) +
      "<mark>" +
      esc(text.slice(at, at + q.length)) +
      "</mark>" +
      esc(text.slice(at + q.length))
    );
  };

  const showState = (title: string, hint = ""): void => {
    stateTitleEl && (stateTitleEl.textContent = title);
    stateHintEl && (stateHintEl.textContent = hint);
    stateEl.hidden = false;
  };

  const hideState = (): void => {
    stateEl.hidden = true;
  };

  const setStatus = (text: string): void => {
    statusEl.textContent = text;
  };

  const counts = (): Record<string, number> => {
    const c: Record<string, number> = { all: items.length };
    for (const it of items) c[it.type] = (c[it.type] ?? 0) + 1;
    return c;
  };

  const fillCounts = (): void => {
    const c = counts();
    document.querySelectorAll<HTMLElement>("[data-count]").forEach((el) => {
      const key = el.dataset.count ?? "all";
      el.textContent = String(c[key] ?? 0);
    });
  };

  const scoreOf = (item: Item, q: string): number => {
    const tokens = q.split(/\s+/).filter(Boolean);
    if (!tokens.length) return -1;
    const title = norm(item.title);
    const sub = norm(item.sub);
    let score = 0;
    for (const tok of tokens) {
      if (title.startsWith(tok)) score += 100;
      else if (title.includes(tok)) score += 80;
      else if (sub.includes(tok)) score += 40;
      else if (item.keywords.includes(tok)) score += 20;
      else return -1;
    }
    /* 同名时角色 > 歌曲 > 页面 > 画廊：搜「仁菜」应该先看到角色卡，
       而不是几十张亚克力立牌。 */
    const bonus: Record<ItemType, number> = {
      character: 80,
      song: 30,
      page: 15,
      gallery: 0,
    };
    return score + bonus[item.type];
  };

  const typeLabel = (type: ItemType): string => t(TYPE_KEY[type]);

  const makeThumb = (item: Item): HTMLElement => {
    const box = document.createElement("span");
    box.className = "sr__thumb";
    if (item.img) {
      const img = document.createElement("img");
      img.src = item.img;
      img.alt = "";
      img.loading = "lazy";
      img.decoding = "async";
      box.append(img);
    } else {
      box.textContent = typeLabel(item.type).slice(0, 4).toUpperCase();
    }
    return box;
  };

  const render = (): void => {
    resultsEl.textContent = "";
    active = -1;
    const q = norm(query);

    if (!q) {
      results = [];
      setStatus("");
      showState(t("search.hint.title"), t("search.hint.examples"));
      return;
    }

    const pool = filter === "all" ? items : items.filter((i) => i.type === filter);
    results = pool
      .map((item) => ({ item, score: scoreOf(item, q) }))
      .filter((x) => x.score >= 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 60)
      .map((x) => x.item);

    if (!results.length) {
      setStatus("");
      showState(t("search.empty"), t("search.empty.hint"));
      return;
    }

    hideState();
    setStatus(t("search.result.count", { n: results.length }));

    const frag = document.createDocumentFragment();
    results.forEach((item, i) => {
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.className = "sr__item";
      a.href = item.href;
      a.dataset.index = String(i);

      const body = document.createElement("span");
      body.className = "sr__body";

      const type = document.createElement("span");
      type.className = "sr__type";
      type.textContent = typeLabel(item.type);

      const title = document.createElement("span");
      title.className = "sr__title";
      title.innerHTML = mark(item.title, q);

      const sub = document.createElement("span");
      sub.className = "sr__sub";
      sub.textContent = item.sub;

      body.append(type, title, sub);

      const go = document.createElement("span");
      go.className = "sr__go";
      go.textContent = "→";

      a.append(makeThumb(item), body, go);
      li.append(a);
      frag.append(li);
    });
    resultsEl.append(frag);
  };

  const move = (delta: number): void => {
    const nodes = resultsEl.querySelectorAll<HTMLAnchorElement>(".sr__item");
    if (!nodes.length) return;
    active = (active + delta + nodes.length) % nodes.length;
    nodes.forEach((n, i) => n.classList.toggle("is-active", i === active));
    nodes[active]?.scrollIntoView({ block: "nearest" });
  };

  const load = (): Promise<boolean> => {
    if (loaded) return Promise.resolve(true);
    if (loadPromise) return loadPromise;
    loadPromise = (async () => {
      showState(t("search.loading"));
      try {
        const res = await fetch(`${BASE}search-index.json`);
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as Payload;
        items = Array.isArray(data.items) ? data.items : [];
        loaded = true;
        fillCounts();
        return true;
      } catch {
        showState(t("search.error"));
        return false;
      }
    })();
    return loadPromise;
  };

  const syncUrl = (): void => {
    const url = new URL(window.location.href);
    if (query) url.searchParams.set("q", query);
    else url.searchParams.delete("q");
    window.history.replaceState(null, "", url);
  };

  const schedule = (): void => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      syncUrl();
      void load().then((ok) => {
        if (ok) render();
      });
    }, 120);
  };

  input.addEventListener("input", () => {
    query = input.value;
    schedule();
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      move(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      move(-1);
    } else if (e.key === "Enter") {
      const nodes = resultsEl.querySelectorAll<HTMLAnchorElement>(".sr__item");
      if (active >= 0 && nodes[active]) {
        e.preventDefault();
        nodes[active].click();
      }
    } else if (e.key === "Escape") {
      input.value = "";
      query = "";
      syncUrl();
      render();
    }
  });

  filterEls.forEach((btn) => {
    btn.addEventListener("click", () => {
      filter = (btn.dataset.filter as typeof filter) || "all";
      filterEls.forEach((b) => {
        const on = b === btn;
        b.classList.toggle("is-on", on);
        b.setAttribute("aria-pressed", String(on));
      });
      render();
    });
  });

  document.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      input.focus();
      input.select();
    }
  });

  document.addEventListener("gbc:lang", () => render());

  // 进来就先拉索引：分类计数需要它，且第一次输入时不用再等网络
  const initial = new URLSearchParams(window.location.search).get("q") ?? "";
  if (initial) {
    input.value = initial;
    query = initial;
  }
  render();
  void load().then((ok) => {
    if (ok) render();
  });
}
