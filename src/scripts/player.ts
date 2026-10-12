/**
 * 音乐播放器
 * ---------------------------------------------------------------------------
 * 数据源：页面内嵌的 <script type="application/json" data-player-tracks>。
 *
 * 说明：资产库中**没有独立音频文件**，但有 5 条带 Opus 音轨的角色 PV（.webm）。
 * 播放器因此以角色 PV 作为曲目来源，UI 与交互按完整音乐播放器实现，
 * 后续若有正式音源，只需替换 JSON 数据即可，无需改动本模块。
 *
 * 无障碍：所有控件均为原生 button / input[range]，带 aria-label；
 * 播放状态用 aria-pressed 暴露；进度用 aria-valuetext 朗读时间。
 */

interface Track {
  src: string;
  title: string;
  subtitle: string;
  color: string;
  slug: string;
  cover?: string;
  duration?: number;
}

const fmt = (sec: number): string => {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
};

export function initPlayer(): void {
  const root = document.querySelector<HTMLElement>("[data-player]");
  if (!root || root.dataset.bound === "1") return;
  root.dataset.bound = "1";

  const audio = root.querySelector<HTMLAudioElement>("[data-player-audio]");
  const tracksEl = document.querySelector<HTMLScriptElement>("[data-player-tracks]");
  if (!audio || !tracksEl) return;

  let tracks: Track[] = [];
  try {
    tracks = JSON.parse(tracksEl.textContent || "[]") as Track[];
  } catch {
    return;
  }
  if (!tracks.length) return;

  const $ = <T extends Element>(sel: string): T | null => root.querySelector<T>(sel);
  const cover = $<HTMLImageElement>("[data-player-cover]");
  const titleEl = $<HTMLElement>("[data-player-title]");
  const subEl = $<HTMLElement>("[data-player-subtitle]");
  const toggle = $<HTMLButtonElement>("[data-player-toggle]");
  const prev = $<HTMLButtonElement>("[data-player-prev]");
  const next = $<HTMLButtonElement>("[data-player-next]");
  const seek = $<HTMLInputElement>("[data-player-seek]");
  const currentEl = $<HTMLElement>("[data-player-current]");
  const durationEl = $<HTMLElement>("[data-player-duration]");
  const volume = $<HTMLInputElement>("[data-player-volume]");

  let index = 0;
  let seeking = false;

  const render = (): void => {
    const t = tracks[index];
    if (!t) return;
    root.style.setProperty("--track-color", t.color);
    if (cover) {
      cover.src = t.cover ?? "";
      cover.alt = "";
    }
    if (titleEl) titleEl.textContent = t.title;
    if (subEl) subEl.textContent = t.subtitle;
    if (durationEl) durationEl.textContent = fmt(t.duration || 0);
    if (currentEl) currentEl.textContent = "0:00";
    if (seek) seek.value = "0";
  };

  const load = (i: number, autoplay = false): void => {
    index = (i + tracks.length) % tracks.length;
    const t = tracks[index];
    if (!t) return;
    render();
    audio.src = t.src;
    audio.load();
    if (autoplay) void audio.play().catch(() => undefined);
  };

  const setPlaying = (playing: boolean): void => {
    root.toggleAttribute("data-playing", playing);
    toggle?.setAttribute("aria-pressed", String(playing));
    if (toggle) toggle.setAttribute("aria-label", playing ? "暂停" : "播放");
  };

  toggle?.addEventListener("click", () => {
    if (audio.paused) {
      if (!audio.src) load(index, true);
      else void audio.play().catch(() => undefined);
    } else {
      audio.pause();
    }
  });

  prev?.addEventListener("click", () => load(index - 1, !audio.paused));
  next?.addEventListener("click", () => load(index + 1, !audio.paused));

  audio.addEventListener("play", () => setPlaying(true));
  audio.addEventListener("pause", () => setPlaying(false));
  audio.addEventListener("ended", () => load(index + 1, true));

  audio.addEventListener("loadedmetadata", () => {
    if (durationEl && Number.isFinite(audio.duration)) {
      durationEl.textContent = fmt(audio.duration);
    }
  });

  audio.addEventListener("timeupdate", () => {
    if (seeking) return;
    const d = Number.isFinite(audio.duration) ? audio.duration : 0;
    if (currentEl) currentEl.textContent = fmt(audio.currentTime);
    if (seek && d > 0) {
      const pct = (audio.currentTime / d) * 100;
      seek.value = String(pct);
      seek.setAttribute(
        "aria-valuetext",
        `${fmt(audio.currentTime)} / ${fmt(d)}`,
      );
      root.style.setProperty("--progress", `${pct}%`);
    }
  });

  seek?.addEventListener("input", () => {
    seeking = true;
    root.style.setProperty("--progress", `${seek.value}%`);
  });
  seek?.addEventListener("change", () => {
    const d = Number.isFinite(audio.duration) ? audio.duration : 0;
    if (d > 0) audio.currentTime = (Number(seek.value) / 100) * d;
    seeking = false;
  });

  volume?.addEventListener("input", () => {
    audio.volume = Number(volume.value) / 100;
  });

  if (volume) {
    audio.volume = Number(volume.value) / 100;
  }

  // 空格键播放/暂停（输入控件内不拦截）
  document.addEventListener("keydown", (e) => {
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "BUTTON") return;
    if (e.code !== "Space") return;
    e.preventDefault();
    if (audio.paused) void audio.play().catch(() => undefined);
    else audio.pause();
  });

  // 允许页面其他元素通过 [data-play-pv] 触发特定角色 PV 试听
  document.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement)?.closest<HTMLElement>("[data-play-pv]");
    if (btn) {
      const slug = btn.dataset.playPv;
      const idx = tracks.findIndex((t) => t.slug === slug);
      if (idx !== -1) load(idx, true);
    }
  });

  window.addEventListener("gbc:play-track", ((e: CustomEvent<{ index?: number; slug?: string }>) => {
    if (typeof e.detail?.index === "number") {
      load(e.detail.index, true);
    } else if (e.detail?.slug) {
      const idx = tracks.findIndex((t) => t.slug === e.detail.slug);
      if (idx !== -1) load(idx, true);
    }
  }) as EventListener);

  load(0);
  setPlaying(false);
}
