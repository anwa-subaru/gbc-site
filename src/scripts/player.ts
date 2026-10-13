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

  /* ---------- 音频驱动的封面红刺环 ----------
     沿「方形」封面周界采样，每个采样点沿径向位移，再用 Catmull-Rom
     转三次贝塞尔连成一条平滑闭合路径：
       · 位移为 0 时整条路径正好是封面方框，又垫在封面下层 → 完全看不见
       · 位移量由实时频谱驱动：低频定整体强度，中高频（人声）给每个
         采样点各自的起伏，声越大刺越长
       · 频谱按相位取样 + 正弦包络随时间平移 → 刺围着封面流动
     只在「正在播放的那张封面」上跑 rAF，暂停时衰减收回再停帧。 */
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const RING_N = 192; // 周界采样点数（越高越平滑）
  const RING_HALF = 50; // 封面半边长：SVG 铺 124% ⇒ 1 单位 = 封面的 1%
  const RING_MAX = 13; // 刺最长伸出量（封面边长的 13%，约 20px）
  const RING_LOBES = 21; // 环形波瓣数：越多牙越窄，21 是「窄而分明」那一档

  // 预计算周界采样点 + 外法线。基座是「圆角方框」而不是尖角方框：
  // 尖角处外扩后曲线要在极短弧长内拐 90°，必然出现尖点（实测 74°）；
  // 圆角半径 12 的方框，外扩 11 后转角半径变 23，整圈平滑。
  // 圆角完全落在封面尖角内侧，静止时被封面挡住，看不出来。
  const RING = (() => {
    const H = RING_HALF;
    const r = 12; // 圆角半径
    const line = 2 * H - 2 * r; // 直线段长 76
    const arc = (Math.PI / 2) * r; // 每段圆角弧长
    const segs: { len: number; at: (t: number) => { x: number; y: number; nx: number; ny: number } }[] = [
      { len: line, at: (t) => ({ x: -H + r + line * t, y: -H, nx: 0, ny: -1 }) },
      { len: arc, at: (t) => { const a = -Math.PI / 2 + (Math.PI / 2) * t; return { x: H - r + r * Math.cos(a), y: -H + r + r * Math.sin(a), nx: Math.cos(a), ny: Math.sin(a) }; } },
      { len: line, at: (t) => ({ x: H, y: -H + r + line * t, nx: 1, ny: 0 }) },
      { len: arc, at: (t) => { const a = (Math.PI / 2) * t; return { x: H - r + r * Math.cos(a), y: H - r + r * Math.sin(a), nx: Math.cos(a), ny: Math.sin(a) }; } },
      { len: line, at: (t) => ({ x: H - r - line * t, y: H, nx: 0, ny: 1 }) },
      { len: arc, at: (t) => { const a = Math.PI / 2 + (Math.PI / 2) * t; return { x: -H + r + r * Math.cos(a), y: H - r + r * Math.sin(a), nx: Math.cos(a), ny: Math.sin(a) }; } },
      { len: line, at: (t) => ({ x: -H, y: H - r - line * t, nx: -1, ny: 0 }) },
      { len: arc, at: (t) => { const a = Math.PI + (Math.PI / 2) * t; return { x: -H + r + r * Math.cos(a), y: -H + r + r * Math.sin(a), nx: Math.cos(a), ny: Math.sin(a) }; } },
    ];
    const total = segs.reduce((s, g) => s + g.len, 0);
    const out: { x: number; y: number; nx: number; ny: number; edge: number }[] = [];
    for (let i = 0; i < RING_N; i++) {
      let s = (i / RING_N) * total;
      let g = segs[0];
      for (const seg of segs) {
        if (s <= seg.len) {
          g = seg;
          break;
        }
        s -= seg.len;
        g = seg;
      }
      const p = g.at(Math.min(1, s / g.len));
      /* 下边缘（曲名那侧）几乎不长刺：按法线 y 的 0.8 次方衰减，底边只留
         一条细红边（15% 高度）把环闭合，刺集中在顶边与两侧 —— 曲名区域
         始终干净，符合「刺只能在封面边缘」 */
      const nyPos = Math.max(0, p.ny);
      out.push({
        x: p.x,
        y: p.y,
        nx: p.nx,
        ny: p.ny,
        edge: 0.15 + 0.85 * (1 - Math.pow(nyPos, 0.8)),
      });
    }
    return out;
  })();

  let analyser: AnalyserNode | null = null;
  let audioCtx: AudioContext | null = null;
  let freqData: Uint8Array | null = null;
  let rafId = 0;

  const ensureAnalyser = (): void => {
    if (analyser || !audio.src) return;
    try {
      const AC = window.AudioContext ?? (window as any).webkitAudioContext;
      if (!AC) return;
      audioCtx = new AC();
      const src = audioCtx.createMediaElementSource(audio);
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      /* 0.75 会让频谱本身滞后约 4 帧，刺收不回来；0.5 保留少量
         抑制抖动，又能跟上歌声的起落 */
      analyser.smoothingTimeConstant = 0.5;
      src.connect(analyser);
      analyser.connect(audioCtx.destination);
      freqData = new Uint8Array(analyser.frequencyBinCount);
    } catch {
      analyser = null; // 极老浏览器：没有刺，只剩红描边
    }
  };

  /* 接了 MediaElementSource 后声音只走 Web Audio 图，
     iOS/Chrome 的 autoplay policy 要求手势里 resume，否则无声 */
  const wakeCtx = (): void => {
    if (audioCtx && audioCtx.state === "suspended") void audioCtx.resume();
  };

  // 每张卡一个 <path>，之后只重写 d
  const spikePaths = new Map<HTMLElement, SVGPathElement>();
  const pathOf = (card: HTMLElement): SVGPathElement | null => {
    const cached = spikePaths.get(card);
    if (cached) return cached;
    const p = card.querySelector<SVGPathElement>("[data-spike-path]");
    if (p) spikePaths.set(card, p);
    return p;
  };

  /* Catmull-Rom → 三次贝塞尔（闭合）。直接连采样点会是一圈折线尖角，
     过一遍样条后波峰波谷都是圆的 —— 就是"刺要平滑"那点 */
  const smoothClosed = (xy: number[]): string => {
    const n = xy.length / 2;
    const px = (i: number): number => xy[(((i % n) + n) % n) * 2];
    const py = (i: number): number => xy[(((i % n) + n) % n) * 2 + 1];
    let d = `M${px(0).toFixed(1)},${py(0).toFixed(1)}`;
    for (let i = 0; i < n; i++) {
      const c1x = px(i) + (px(i + 1) - px(i - 1)) / 6;
      const c1y = py(i) + (py(i + 1) - py(i - 1)) / 6;
      const c2x = px(i + 1) - (px(i + 2) - px(i)) / 6;
      const c2y = py(i + 1) - (py(i + 2) - py(i)) / 6;
      d += `C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${px(i + 1).toFixed(1)},${py(i + 1).toFixed(1)}`;
    }
    return `${d}Z`;
  };

  // 频谱 → 频段平均能量
  const level = (lo: number, hi: number): number => {
    if (!analyser || !freqData) return 0;
    let sum = 0;
    const a = Math.floor(lo * freqData.length);
    const b = Math.max(a + 1, Math.floor(hi * freqData.length));
    for (let i = a; i < b; i++) sum += freqData[i];
    return sum / ((b - a) * 255);
  };

  const FLAT = smoothClosed(RING.flatMap((r) => [r.x, r.y]));
  let amp = 0; // 快起慢落包络（像音量表）

  let burst = 0; // 爆发量：冲过均值就炸一次，然后衰减
  let phase = 0; // 流动相位
  /* 逐点能量。必须平滑后再用：频谱相邻 bin 差异极大，直接当位移
     会得到一圈锯齿（之前"太刺、不平滑"就是这个）。
     smooth[i] = 空间 3 抽头 + 时间低通，得到连续起伏 */
  const smooth = new Float32Array(RING_N);
  /* 频谱通量用的上一帧频谱：现代混音整体能量几乎恒定，靠能量均值
     检测不到鼓点，得看"频谱形状的突变"（onset） */
  const prevSpec = new Uint8Array(128);
  let fluxAvg = 0.04;

  const tick = (): void => {
    rafId = 0;
    const card = document.querySelector<HTMLElement>(".ac.is-playing");
    const path = card ? pathOf(card) : null;
    if (!card || !path) return;
    const decaying = audio.paused;
    if (analyser && !decaying) analyser.getByteFrequencyData(freqData!);

    /* 频段按 128 bin / 48kHz 折算（每 bin ≈187Hz）：
       bass  0~0.02    = 0~375Hz      底鼓、贝斯
       voice 0.035~0.22 = 0.8~5.3kHz  人声基频与共振峰，人声主要落这里 */
    const bass = decaying ? 0 : level(0, 0.02);
    const voice = decaying ? 0 : level(0.035, 0.22);
    // 人声权重最高：人声一起来刺立刻长
    const energy = Math.min(1, bass * 0.45 + voice * 1.15);
    // 起落都快：声音一落刺立刻收，实时跟着唱（落 0.5 / 起 0.85）
    amp += (energy - amp) * (energy > amp ? 0.85 : 0.68);

    /* onset 检测：频谱通量（只看正向增量）比能量均值灵敏得多，
       压缩过的混音里底鼓/军鼓一打，频谱形状就会突变。
       只统计 0.02~0.35：鼓与人声的起音都在这一段 */
    let flux = 0;
    if (freqData && !decaying) {
      const a = Math.floor(freqData.length * 0.02);
      const nb = Math.max(1, Math.floor(freqData.length * 0.35) - a);
      for (let i = a; i < a + nb; i++) {
        const d = freqData[i] - prevSpec[i];
        if (d > 0) flux += d;
      }
      prevSpec.set(freqData.subarray(0, prevSpec.length));
      flux /= nb * 255;
    }
    fluxAvg += (flux - fluxAvg) * 0.05; // 自适应底噪
    /* 增益按实测标的：本曲 flux 常年 0.007、鼓点峰值 0.025，
       ×75 后常态≈0、重音≈1 */
    const onset = decaying ? 0 : Math.min(1, Math.max(0, flux - fluxAvg) * 75);
    // 重音权重拉高：常态只到 60%，onset 直接顶满
    burst = Math.max(onset, burst * 0.6); // 衰减快 = 收得干脆
    const drive = Math.min(1, amp * 0.6 + burst);
    phase = (phase + 0.0012 + amp * 0.003 + burst * 0.01) % 1;

    const bins = freqData ? freqData.length : 0;
    // 1) 取频谱 + 时间低通（上冲比回落快，保住瞬态）；
    //    采样区间挪到 0.03~0.45，避开超低频与最高频，贴人声与乐器基音
    for (let i = 0; i < RING_N; i++) {
      const u = i / RING_N;
      const bin = bins ? Math.floor((0.03 + ((u + phase) % 1) * 0.42) * bins) : 0;
      const raw = bins && freqData ? freqData[bin] / 255 : 0;
      smooth[i] += (raw - smooth[i]) * (raw > smooth[i] ? 0.75 : 0.68);
    }
    // 2) 空间 3 抽头平滑（环状，首尾相接）
    const xy: number[] = [];
    for (let i = 0; i < RING_N; i++) {
      const r = RING[i];
      const u = i / RING_N;
      const lv =
        (smooth[(i - 1 + RING_N) % RING_N] + 2 * smooth[i] + smooth[(i + 1) % RING_N]) / 4;
      /* 只取正弦的正半周再抬到 2.6 次方：牙齿又窄又分明、谷底压平，相邻
         牙齿之间留一条细红边。指数 >1 保证接合处导数为 0（谷底不出尖点），
         指数越大牙越窄 —— 2.6 出来是细牙而不是圆包 */
      const s = Math.sin(2 * Math.PI * (RING_LOBES * u - phase * 3));
      const wave = s > 0 ? Math.pow(s, 2.6) : 0;
      /* lv 抬到 1.5 次方：安静处几乎贴边、重音处顶满，拉开动态范围 */
      const h = RING_MAX * drive * r.edge * (0.22 + 0.78 * Math.pow(lv, 1.5)) * (0.1 + 0.9 * wave);
      xy.push(r.x + r.nx * h, r.y + r.ny * h);
    }
    path.setAttribute("d", smoothClosed(xy));

    if (!decaying || amp > 0.006) rafId = requestAnimationFrame(tick);
    else {
      amp = 0;
      burst = 0;
      smooth.fill(0);
      path.setAttribute("d", FLAT); // 收干净，路径回到方框（藏在封面后）
    }
  };

  const startSpikes = (): void => {
    wakeCtx();
    if (reduceMotion.matches) return;
    ensureAnalyser();
    if (!rafId) rafId = requestAnimationFrame(tick);
  };

  audio.addEventListener("play", startSpikes);
  audio.addEventListener("pause", startSpikes); // 进衰减模式把刺收回

  /* ---------- 发行物封面 → 双击播放（音乐页 SINGLES / ALBUMS / EP） ----------
     用双击而不是单击：封面上不放播放按钮，单击留给滚动/误触，
     播放反馈就是上面的红刺环。 */
  const playCard = (hit: HTMLElement): void => {
    const idx = rows.findIndex((r) => r.dataset.track === hit.dataset.play);
    if (idx < 0) return;
    // Android 上给一次极短振动（iOS 不支持 vibrate，静默忽略）
    if (!reduceMotion.matches) navigator.vibrate?.(12);
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
      root.scrollIntoView({ behavior: reduceMotion.matches ? "auto" : "smooth", block: "start" });
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
