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
  const setPlayingUI = (playing: boolean): void => {
    // SVGElement 没有 hidden 属性（那是 HTMLElement 的），必须用 class 切换
    iconPlay?.classList.toggle("is-off", playing);
    iconPause?.classList.toggle("is-off", !playing);
    toggleBtn?.setAttribute("aria-label", playing ? "暂停" : "播放");
    items.forEach((it) => it.classList.toggle("is-paused", !playing));
  };

  const highlight = (i: number): void => {
    items.forEach((it, k) => {
      it.classList.toggle("is-playing", k === i);
      it.classList.toggle("is-paused", k === i ? audio.paused : false);
    });
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
