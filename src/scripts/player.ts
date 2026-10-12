/**
 * 全曲播放器交互（音乐页）
 *  - 单一 <audio> 复用，切歌只换 src，避免多实例抢占播放
 *  - 曲目行 / 上一首 / 下一首 / 播放全部 / 随机 / 进度 / 音量
 *  - Media Session：手机锁屏与通知栏可控制
 *  - 幂等：重复调用（astro:page-load）只绑定一次
 */

const fmt = (sec: number): string => {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
};

export function initPlayer(): void {
  const root = document.querySelector<HTMLElement>("[data-player]");
  if (!root || root.dataset.plReady === "1") return;
  root.dataset.plReady = "1";

  const audio = root.querySelector<HTMLAudioElement>("[data-audio]");
  const rows = Array.from(root.querySelectorAll<HTMLButtonElement>(".pl__row"));
  if (!audio || !rows.length) return;

  const items = Array.from(root.querySelectorAll<HTMLElement>(".pl__item"));
  const titleEl = root.querySelector<HTMLElement>("[data-title]");
  const artistEl = root.querySelector<HTMLElement>("[data-artist]");
  const artEl = root.querySelector<HTMLImageElement>("[data-art]");
  const artNone = root.querySelector<HTMLElement>("[data-art-none]");
  const seek = root.querySelector<HTMLInputElement>("[data-seek]");
  const vol = root.querySelector<HTMLInputElement>("[data-vol]");
  const curEl = root.querySelector<HTMLElement>("[data-cur]");
  const totalEl = root.querySelector<HTMLElement>("[data-total]");
  const seekline = root.querySelector<HTMLElement>("[data-seekline]");
  const toggleBtn = root.querySelector<HTMLButtonElement>("[data-toggle]");
  const prevBtn = root.querySelector<HTMLButtonElement>("[data-prev]");
  const nextBtn = root.querySelector<HTMLButtonElement>("[data-next]");
  const playAllBtn = root.querySelector<HTMLButtonElement>("[data-play-all]");
  const shuffleBtn = root.querySelector<HTMLButtonElement>("[data-shuffle]");
  const iconPlay = root.querySelector<SVGElement>("[data-icon-play]");
  const iconPause = root.querySelector<SVGElement>("[data-icon-pause]");

  let index = -1; // 当前曲目下标
  let shuffle = false;
  let order: number[] = []; // 随机播放顺序（下标数组）

  /* ---------- 音量持久化 ---------- */
  // 注意：localStorage 无记录时 getItem 返回 null，Number(null) === 0，
  // 直接判断会把首次访问的音量设成 0（静音），必须先排除 null。
  const rawVol = localStorage.getItem("gbc.vol");
  const savedVol = rawVol === null ? Number.NaN : Number(rawVol);
  if (Number.isFinite(savedVol) && savedVol >= 0 && savedVol <= 100) {
    audio.volume = savedVol / 100;
    if (vol) vol.value = String(savedVol);
  } else {
    audio.volume = 0.9;
  }

  const paint = (el: HTMLInputElement | null, pct: number): void => {
    if (el) el.style.setProperty("--p", `${pct}%`);
  };
  paint(vol, Number(vol?.value ?? 90));
  paint(seek, 0);

  /* ---------- UI 同步 ---------- */
  /** 发行物封面卡（SINGLES / ALBUMS …）与当前曲目、播放状态联动 */
  const paintCards = (): void => {
    const track = index >= 0 ? (rows[index]?.dataset.track ?? null) : null;
    const playing = !audio.paused;
    document.querySelectorAll<HTMLElement>("[data-play]").forEach((el) => {
      const ac = el.closest(".ac");
      if (!ac) return;
      const on = el.dataset.play === track;
      ac.classList.toggle("is-playing", on);
      ac.classList.toggle("is-paused", on && !playing);
    });
  };

  const setPlayingUI = (playing: boolean): void => {
    // SVGElement 没有 hidden 属性（那是 HTMLElement 的），必须用 class 切换
    iconPlay?.classList.toggle("is-off", playing);
    iconPause?.classList.toggle("is-off", !playing);
    toggleBtn?.setAttribute("aria-label", playing ? "暂停" : "播放");
    items.forEach((it) => it.classList.toggle("is-paused", !playing));
    paintCards();
  };

  const highlight = (i: number): void => {
    items.forEach((it, k) => {
      it.classList.toggle("is-playing", k === i);
      it.classList.toggle("is-paused", k === i ? audio.paused : false);
    });
    paintCards();
  };

  const setNow = (i: number): void => {
    const row = rows[i];
    if (!row) return;
    const t = row.querySelector(".pl__t")?.textContent?.trim() ?? "";
    const a = row.querySelector(".pl__a")?.textContent?.trim() ?? "";
    const cover = row.dataset.cover ?? "";
    if (titleEl) titleEl.textContent = t;
    if (artistEl) artistEl.textContent = a;

    if (artEl && cover) {
      if (artEl.getAttribute("src") !== cover) artEl.setAttribute("src", cover);
      artEl.hidden = false;
      if (artNone) artNone.hidden = true;
    } else {
      artEl && (artEl.hidden = true);
      if (artNone) artNone.hidden = false;
    }

    if ("mediaSession" in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: t,
        artist: a,
        album: "GIRLS BAND CRY",
        artwork: cover ? [{ src: new URL(cover, location.href).href, sizes: "1000x1000", type: "image/webp" }] : [],
      });
    }
  };

  /* ---------- 播放控制 ---------- */
  const load = (i: number, play = true): void => {
    const row = rows[i];
    if (!row) return;
    index = i;
    audio.src = row.dataset.src ?? "";
    audio.currentTime = 0;
    setNow(i);
    highlight(i);
    // 手机端固定底栏"播放后才出现"
    root.dataset.live = "1";
    if (play) void audio.play().catch(() => setPlayingUI(false));
  };

  const step = (dir: 1 | -1): void => {
    if (index < 0) return load(0, true);
    if (shuffle) {
      if (!order.length) order = shuffled(rows.length);
      const at = order.indexOf(index);
      const nextIdx = order[(at + dir + order.length) % order.length] ?? 0;
      return load(nextIdx, true);
    }
    load((index + dir + rows.length) % rows.length, true);
  };

  const shuffled = (n: number): number[] => {
    const a = Array.from({ length: n }, (_, i) => i);
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  rows.forEach((row, i) => {
    row.addEventListener("click", () => {
      if (i === index) {
        if (audio.paused) void audio.play();
        else audio.pause();
        return;
      }
      load(i, true);
    });
  });

  toggleBtn?.addEventListener("click", () => {
    if (index < 0) return load(0, true);
    if (audio.paused) void audio.play();
    else audio.pause();
  });

  prevBtn?.addEventListener("click", () => {
    // 播放超过 3 秒时「上一首」先回到开头（与常见播放器一致）
    if (audio.currentTime > 3) {
      audio.currentTime = 0;
      return;
    }
    step(-1);
  });

  nextBtn?.addEventListener("click", () => step(1));

  /* ---------- 发行物封面 → 双击播放（音乐页 SINGLES / ALBUMS / EP） ----------
     用双击而不是单击：封面上不放播放按钮（用户嫌丑），单击留给滚动/误触，
     播放反馈靠外框"震"一下 + 手机短振动。 */
  const punch = (hit: HTMLElement): void => {
    const ac = hit.closest<HTMLElement>(".ac");
    if (!ac) return;
    // 先移除再强制回流，连点同一张也能重新播放动画
    ac.classList.remove("is-hit");
    void ac.offsetWidth;
    ac.classList.add("is-hit");
    ac.addEventListener(
      "animationend",
      () => ac.classList.remove("is-hit"),
      { once: true },
    );
    // Android 上给一次极短振动（iOS 不支持 vibrate，静默忽略）
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      navigator.vibrate?.(12);
    }
  };

  const playCard = (hit: HTMLElement): void => {
    const idx = rows.findIndex((r) => r.dataset.track === hit.dataset.play);
    if (idx < 0) return;
    punch(hit);
    // 双击的就是当前这首：切换播放/暂停，而不是从头重放
    if (idx === index) {
      if (audio.paused) void audio.play();
      else audio.pause();
      return;
    }
    load(idx, true);
    // 移动端面板是 fixed 底栏，播放后必定可见，不用滚；桌面端面板在页面上方，
    // 滚远了就看不到控制，此时把它带回视野。
    // 注意：不能直接量 rect —— 底栏此刻正在做滑入动画，量到的是屏幕外的中间态。
    const panel = root.querySelector<HTMLElement>("[data-now]") ?? root;
    if (getComputedStyle(panel).position === "fixed") return;
    const box = panel.getBoundingClientRect();
    if (box.bottom < 8 || box.top > window.innerHeight - 8) {
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      root.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    }
  };

  /* 自己判定双击：手机浏览器不一定派发 dblclick（双击缩放被 touch-action
     关掉后行为也不一致），统一用 pointerup 计时，鼠标和触摸同一条路径。 */
  let lastTapAt = 0;
  let lastTapEl: HTMLElement | null = null;
  let downX = 0;
  let downY = 0;

  document.addEventListener("pointerdown", (e) => {
    downX = e.clientX;
    downY = e.clientY;
  });

  document.addEventListener("pointerup", (e) => {
    const hit = (e.target as HTMLElement | null)?.closest?.(
      "[data-play]",
    ) as HTMLElement | null;
    if (!hit) {
      lastTapEl = null;
      return;
    }
    // 拖动 / 滚动后抬手不算点击
    if (Math.hypot(e.clientX - downX, e.clientY - downY) > 12) {
      lastTapEl = null;
      return;
    }
    const now = performance.now();
    if (lastTapEl === hit && now - lastTapAt < 420) {
      lastTapEl = null;
      lastTapAt = 0;
      e.preventDefault();
      playCard(hit);
      return;
    }
    lastTapEl = hit;
    lastTapAt = now;
  });

  playAllBtn?.addEventListener("click", () => {
    order = [];
    load(shuffle ? (order = shuffled(rows.length))[0] : 0, true);
  });

  shuffleBtn?.addEventListener("click", () => {
    shuffle = !shuffle;
    order = shuffle ? shuffled(rows.length) : [];
    shuffleBtn.setAttribute("aria-pressed", String(shuffle));
  });

  /* ---------- 进度 / 音量 ---------- */
  audio.addEventListener("timeupdate", () => {
    const d = audio.duration;
    if (!Number.isFinite(d) || d <= 0) return;
    const pct = (audio.currentTime / d) * 100;
    if (seek && document.activeElement !== seek) seek.value = String(Math.round(pct * 10));
    paint(seek, pct);
    if (curEl) curEl.textContent = fmt(audio.currentTime);
    if (seekline) seekline.style.width = `${pct}%`;
  });

  audio.addEventListener("loadedmetadata", () => {
    if (totalEl) totalEl.textContent = fmt(audio.duration);
  });

  audio.addEventListener("play", () => setPlayingUI(true));
  audio.addEventListener("pause", () => setPlayingUI(false));
  audio.addEventListener("ended", () => step(1));
  audio.addEventListener("error", () => setPlayingUI(false));

  seek?.addEventListener("input", () => {
    const d = audio.duration;
    paint(seek, Number(seek.value) / 10);
    if (Number.isFinite(d) && d > 0) audio.currentTime = (Number(seek.value) / 1000) * d;
  });

  vol?.addEventListener("input", () => {
    const v = Number(vol.value);
    audio.volume = v / 100;
    paint(vol, v);
    localStorage.setItem("gbc.vol", String(v));
  });

  /* ---------- 键盘：焦点在播放器内时 ← → 切歌 ---------- */
  root.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === "INPUT") return;
    e.preventDefault();
    step(e.key === "ArrowRight" ? 1 : -1);
  });

  /* ---------- Media Session 硬件按键 ---------- */
  if ("mediaSession" in navigator) {
    navigator.mediaSession.setActionHandler("play", () => void audio.play());
    navigator.mediaSession.setActionHandler("pause", () => audio.pause());
    navigator.mediaSession.setActionHandler("previoustrack", () => step(-1));
    navigator.mediaSession.setActionHandler("nexttrack", () => step(1));
  }

  setPlayingUI(false);
}
