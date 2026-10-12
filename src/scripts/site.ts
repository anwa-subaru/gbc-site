/**
 * 站点共享客户端行为
 * ---------------------------------------------------------------------------
 * 全部动效 ≤400ms，且遵循 prefers-reduced-motion：
 * 降级时**直接呈现终态**，而不是把动画加速。
 *
 * 本模块同时兼容 Astro View Transitions —— 使用 `astro:page-load` 重新初始化，
 * 每个 init 函数自身幂等（用 dataset 打标），避免重复绑定监听。
 */


export const prefersReducedMotion = (): boolean =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* -------------------------------------------------------------------------- */
/* 导航抽屉（<1024px 汉堡 → 全屏抽屉）                                          */
/* -------------------------------------------------------------------------- */

function initNav(): void {
  const toggle = document.querySelector<HTMLButtonElement>("[data-nav-toggle]");
  const drawer = document.querySelector<HTMLElement>("[data-nav-drawer]");
  if (!toggle || !drawer) return;

  const setOpen = (open: boolean): void => {
    toggle.setAttribute("aria-expanded", String(open));
    drawer.toggleAttribute("data-open", open);
    document.body.classList.toggle("is-locked", open);
    // 抽屉打开时把焦点移入，关闭时归还给汉堡按钮
    if (open) {
      drawer.querySelector<HTMLElement>("a, button")?.focus();
    } else {
      toggle.focus();
    }
  };

  const isOpen = (): boolean => drawer.hasAttribute("data-open");

  if (toggle.dataset.bound !== "1") {
    toggle.dataset.bound = "1";
    toggle.addEventListener("click", () => setOpen(!isOpen()));

    // 点击遮罩关闭
    drawer.addEventListener("click", (e) => {
      if (e.target === drawer) setOpen(false);
    });

    // 点击链接后关闭
    drawer.querySelectorAll("a").forEach((a) => {
      a.addEventListener("click", () => setOpen(false));
    });

    // Esc 关闭 + 焦点锁在抽屉内
    document.addEventListener("keydown", (e) => {
      if (!isOpen()) return;
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        return;
      }
      if (e.key !== "Tab") return;
      const focusables = drawer.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    });

    // 回到桌面宽度时自动收起，避免抽屉状态残留
    window.matchMedia("(min-width: 1024px)").addEventListener("change", (e) => {
      if (e.matches && isOpen()) setOpen(false);
    });
  }

  // 每次页面切换后确保抽屉是关闭的
  drawer.removeAttribute("data-open");
  toggle.setAttribute("aria-expanded", "false");
  document.body.classList.remove("is-locked");
}

/* -------------------------------------------------------------------------- */
/* 滚动揭示                                                                     */
/* -------------------------------------------------------------------------- */

function initReveal(): void {
  const nodes = document.querySelectorAll<HTMLElement>("[data-reveal]");
  if (!nodes.length) return;

  // 降级：直接呈现终态
  if (prefersReducedMotion() || !("IntersectionObserver" in window)) {
    nodes.forEach((el) => el.classList.add("is-visible"));
    return;
  }

  // threshold 0 + 正 rootMargin：元素刚触及视口下缘前 80px 即淡入。
  // 原 threshold 0.15 配负 rootMargin -10% 对高约 500px 的角色卡滑轨太苛刻，
  // 未充分滚动时整块保持 opacity:0，看起来像「页面没加载出来」。
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        io.unobserve(entry.target); // 只播一次
      });
    },
    { threshold: 0, rootMargin: "0px 0px 80px 0px" },
  );

  nodes.forEach((el) => {
    if (!el.classList.contains("is-visible")) io.observe(el);
  });
}

/* -------------------------------------------------------------------------- */
/* Hero 轮播                                                                    */
/* -------------------------------------------------------------------------- */

function initCarousel(): void {
  document.querySelectorAll<HTMLElement>("[data-carousel]").forEach((root) => {
    if (root.dataset.bound === "1") return;
    root.dataset.bound = "1";

    // 图片层与文案层各自带 data-slide，但必须分别采集：
    // 若合并查询会得到 6 个元素（图片 3 + 文案 3），索引错位导致
    // 文案永远落在后半段、长期处于 display:none。
    const imgSlides = Array.from(
      root.querySelectorAll<HTMLElement>(".hero__slide"),
    );
    const copySlides = Array.from(
      root.querySelectorAll<HTMLElement>(".hero__copy"),
    );
    const dots = Array.from(root.querySelectorAll<HTMLButtonElement>("[data-dot]"));
    const count = Math.min(imgSlides.length, copySlides.length);
    if (count <= 1) return;

    const interval = Number(root.dataset.interval || 6000);
    const reduce = prefersReducedMotion();
    let current = 0;
    let timer: number | undefined;

    const go = (next: number): void => {
      const idx = (next + count) % count;
      for (const group of [imgSlides, copySlides]) {
        group.forEach((s, i) => {
          s.toggleAttribute("data-active", i === idx);
          s.setAttribute("aria-hidden", String(i !== idx));
        });
      }
      dots.forEach((d, i) => d.setAttribute("aria-current", String(i === idx)));
      current = idx;
    };

    const start = (): void => {
      // 降级模式不自动轮播，避免打断阅读
      if (reduce || interval <= 0) return;
      stop();
      timer = window.setInterval(() => go(current + 1), interval);
    };
    const stop = (): void => {
      if (timer !== undefined) window.clearInterval(timer);
      timer = undefined;
    };

    root
      .querySelector("[data-carousel-prev]")
      ?.addEventListener("click", () => {
        go(current - 1);
        start();
      });
    root
      .querySelector("[data-carousel-next]")
      ?.addEventListener("click", () => {
        go(current + 1);
        start();
      });
    dots.forEach((d, i) =>
      d.addEventListener("click", () => {
        go(i);
        start();
      }),
    );

    // 悬停 / 聚焦时暂停
    root.addEventListener("mouseenter", stop);
    root.addEventListener("mouseleave", start);
    root.addEventListener("focusin", stop);
    root.addEventListener("focusout", start);

    // 标签页不可见时暂停，省电
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) stop();
      else start();
    });

    go(0);
    start();
  });
}

/* -------------------------------------------------------------------------- */
/* 画廊灯箱                                                                     */
/* -------------------------------------------------------------------------- */

interface LightboxItem {
  src: string;
  alt: string;
  w: number;
  h: number;
}

function initLightbox(): void {
  const root = document.querySelector<HTMLElement>("[data-lightbox]");
  if (!root || root.dataset.bound === "1") return;
  root.dataset.bound = "1";

  const imgEl = root.querySelector<HTMLImageElement>("[data-lightbox-img]");
  const captionEl = root.querySelector<HTMLElement>("[data-lightbox-caption]");
  const counterEl = root.querySelector<HTMLElement>("[data-lightbox-counter]");
  if (!imgEl) return;

  let items: LightboxItem[] = [];
  let index = 0;
  let lastFocused: HTMLElement | null = null;

  const render = (): void => {
    const item = items[index];
    if (!item) return;
    imgEl.src = item.src;
    imgEl.alt = item.alt;
    imgEl.width = item.w;
    imgEl.height = item.h;
    if (captionEl) captionEl.textContent = item.alt;
    if (counterEl)
      counterEl.textContent = `${index + 1} / ${items.length}`;
  };

  const open = (i: number): void => {
    index = i;
    lastFocused = document.activeElement as HTMLElement;
    render();
    root.toggleAttribute("data-open", true);
    document.body.classList.add("is-locked");
    root.querySelector<HTMLElement>("[data-lightbox-close]")?.focus();
  };

  const close = (): void => {
    root.removeAttribute("data-open");
    document.body.classList.remove("is-locked");
    lastFocused?.focus();
  };

  const step = (d: number): void => {
    if (!items.length) return;
    index = (index + d + items.length) % items.length;
    render();
  };

  root.querySelector("[data-lightbox-close]")?.addEventListener("click", close);
  root.querySelector("[data-lightbox-prev]")?.addEventListener("click", () => step(-1));
  root.querySelector("[data-lightbox-next]")?.addEventListener("click", () => step(1));
  root.addEventListener("click", (e) => {
    if (e.target === root) close();
  });
  document.addEventListener("keydown", (e) => {
    if (!root.hasAttribute("data-open")) return;
    if (e.key === "Escape") close();
    else if (e.key === "ArrowLeft") step(-1);
    else if (e.key === "ArrowRight") step(1);
  });

  // 任意 [data-lightbox-src] 触发（由 Gallery 组件渲染，带图集分组）
  document.addEventListener("click", (e) => {
    const trigger = (e.target as HTMLElement).closest<HTMLElement>(
      "[data-lightbox-src]",
    );
    if (!trigger) return;
    e.preventDefault();
    const group = trigger.dataset.lightboxGroup || "default";
    items = Array.from(
      document.querySelectorAll<HTMLElement>(
        `[data-lightbox-src][data-lightbox-group="${group}"]`,
      ),
    ).map((el) => ({
      src: el.dataset.lightboxSrc || "",
      alt: el.dataset.lightboxAlt || "",
      w: Number(el.dataset.lightboxW || 0),
      h: Number(el.dataset.lightboxH || 0),
    }));
    open(items.findIndex((it) => it.src === trigger.dataset.lightboxSrc));
  });
}

/* -------------------------------------------------------------------------- */
/* 启动                                                                         */
/* -------------------------------------------------------------------------- */

function initAll(): void {
  initNav();
  initReveal();
  initCarousel();
  initLightbox();
}

document.addEventListener("astro:page-load", initAll);

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initAll);
} else {
  initAll();
}
