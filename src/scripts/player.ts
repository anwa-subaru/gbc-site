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

  /* ---------- 音频驱动的专辑环形频谱 ----------
     正方形封面的四条边上长出 64 根独立的尖刺（每边 16 根）：
       · 刺根贴在封面边线上，位移为 0 时整圈藏在封面下层，完全看不见
       · 刺尖沿所在边的外法线向外指（顶边朝上、右边朝右…），轮廓永远
         是「正方形在长刺」，不会糊成一团圆
       · 64 根刺 = 64 个频谱 bin，镜像布局：环的两端是低频、中点是高频，
         闭环无缝 —— 底鼓只在自己那段边上爆刺，人声、镲片各有地段，
         整张专辑就是这台环形频谱仪
     只在「正在播放的那张封面」上跑 rAF，暂停时衰减收回再停帧。 */
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const RING_HALF = 50; // 封面半边长：SVG 铺 148% ⇒ 1 单位 = 封面的 1%
  /* 振幅（封面边长的百分比）。手机上封面只有 160px 左右，13% 的刺看着
     太小，实测后加大到 17.5%；画布已同步放大到 ±74，不会裁切。
     220px 是分界：手机竖屏两列时单卡约 159~183px，桌面单卡 220px 起 */
  const ampUnitsFor = (coverWidth: number): number =>
    coverWidth > 0 && coverWidth < 220 ? 17.5 : 13;
  const RAY_PER_SIDE = 8; // 每边 8 根 → 整圈 32 根：少而清楚，不拥挤
  const RAY_COUNT = RAY_PER_SIDE * 4;
  /* 每根刺的轮廓（单位：槽宽的比例）。刺占槽宽约一半，两侧留空 ——
     这样才是一根根分明的刺，而不是连成一片的波浪。
     收尖但顶端留一点圆：0.30 → 0.70 → 0.92 → 0.70 → 0.30，
     过 Catmull-Rom 之后是"尖头微圆"的刺，既不是针也不是圆包 */
  const DOME = [0.3, 0.7, 0.92, 0.7, 0.3];
  const DOME_OFFSET = [-0.26, -0.11, 0, 0.11, 0.26];
  const RING: { x: number; y: number; nx: number; ny: number; ray: number; w: number }[] = [];
  for (let s = 0; s < 4; s++) {
    for (let j = 0; j < RAY_PER_SIDE; j++) {
      const ray = s * RAY_PER_SIDE + j;
      const at = (t: number): { x: number; y: number; nx: number; ny: number } => {
        if (s === 0) return { x: -RING_HALF + 2 * RING_HALF * t, y: -RING_HALF, nx: 0, ny: -1 };
        if (s === 1) return { x: RING_HALF, y: -RING_HALF + 2 * RING_HALF * t, nx: 1, ny: 0 };
        if (s === 2) return { x: RING_HALF - 2 * RING_HALF * t, y: RING_HALF, nx: 0, ny: 1 };
        return { x: -RING_HALF, y: RING_HALF - 2 * RING_HALF * t, nx: -1, ny: 0 };
      };
      RING.push({ ...at(j / RAY_PER_SIDE), ray: -1, w: 0 }); // 谷底（贴着封面边线）
      for (let d = 0; d < DOME.length; d++) {
        RING.push({
          ...at((j + 0.5 + DOME_OFFSET[d]) / RAY_PER_SIDE),
          ray,
          w: DOME[d],
        });
      }
    }
  }
  const RING_N = RING.length; // 32 根 × 5 点 = 160

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

  const FLAT = smoothClosed(RING.flatMap((r) => [r.x, r.y]));

  const SPECTRUM_BINS = 64;
  /* 每条边最多 4 根，而且不是"取最高的 4 根"——那 4 根必然彼此接近，
     看着一样高。改成先卡一条门限（明显高于本边平均值才算一个峰），
     高度再按"超出多少"给：刚过线的矮、冲到峰值的高，同一条边上
     自然一高一低 */
  const PER_SIDE_MAX = 4;
  /* 刺尖伸出上限跟着振幅走：桌面 13 → 上限 13.1（维持原有观感），
     手机 17.5 → 上限 17.7。画布 ±70、封面边 50，留 2 单位余量不裁切 */
  const H_MAX_OF = (amp: number): number => amp * 1.01;
  const SPECTRUM_MAX = 0.72; // 只取 0~17.3kHz 的音乐主体，避开极高频噪声
  const spectrum = new Float32Array(SPECTRUM_BINS);
  const burst = new Float32Array(SPECTRUM_BINS);
  const fluxFloor = new Float32Array(SPECTRUM_BINS).fill(0.004);
  const prevSpec = new Uint8Array(128);
  let amp = 0; // 全体电平均值：只用来判断"该不该收干净"和流光速度
  let phase = 0; // 流光相位（只调制亮度，不移动频率归属）

  /* 每根刺 ↔ 频谱 bin 的镜像映射：整体旋转 0.375，使低频落在底边中点、
     高频落在顶边中点 —— 底矮顶高，符合"低频刺低、高频刺高"的读法；
     镜像布局让左右两半对称，闭环处（低频）无缝衔接 */
  const BIN_OF_RAY = (() => {
    const map = new Uint8Array(RAY_COUNT);
    for (let k = 0; k < RAY_COUNT; k++) {
      const u = ((k + 0.5) / RAY_COUNT + 0.375) % 1;
      const f = u <= 0.5 ? u * 2 : (1 - u) * 2;
      map[k] = Math.min(SPECTRUM_BINS - 1, Math.floor(f * SPECTRUM_BINS));
    }
    return map;
  })();
  /* 刺高随频率递增：底边低频只有约 45%，顶部高频顶到 100% */
  /* 手机上再陡一点：短刺更短、长刺更长，"上下幅度"才看得出来 */
  let ampUnits = 13; // 每帧的振幅（单位 = 封面边长的 1%），随封面宽度更新
  let levelCurve = 1.3; // 手机上用 1.9：短刺更短、长刺更长，幅度更明显
  const measureAmp = (): void => {
    const el = document.querySelector<HTMLElement>(".ac.is-playing .ac__frame");
    const w = el ? el.getBoundingClientRect().width : 240;
    ampUnits = ampUnitsFor(w);
    levelCurve = ampUnits > 13 ? 1.9 : 1.3;
  };
  const RAY_SCORE = new Float32Array(RAY_COUNT); // 每帧每根刺的响度分
  const RAY_LEVEL = new Float32Array(RAY_COUNT); // 边内归一化后的相对强弱
  const RAY_SMOOTH = new Float32Array(RAY_COUNT); // 平滑后的实际高度系数
  /* 每条边"最近峰值"的慢参考（约 1 秒半衰）。用它而不是"本帧最强"来
     归一化：本帧最强会让每秒都强行有一根顶格、其余跟在后面，一圈看
     下来全都差不多高；用慢参考，响的段落整体拔高、安静段落整体回落，
     同一条边上三根也能真正拉开高低 */
  const SIDE_REF = new Float32Array(4).fill(0.15);
  const SIDE_SCRATCH = new Float32Array(RAY_PER_SIDE); // 取前几名用的排序副本
  /* 归一化用的上下界也做平滑（快跟高、慢跟低）：直接用瞬时 hi/lo 的话，
     分母每帧都在跳，所有刺的高度会跟着一起抖 */
  const SIDE_HI = new Float32Array(4);
  const SIDE_LO = new Float32Array(4).fill(1);
  const FREQ_OF_RAY = (() => {
    const map = new Float32Array(RAY_COUNT);
    for (let k = 0; k < RAY_COUNT; k++) {
      map[k] = ((BIN_OF_RAY[k] + 0.5) / SPECTRUM_BINS) * SPECTRUM_MAX;
    }
    return map;
  })();
  /* 低频短、高频高：底边（f≈0~0.22）只有 20%~48%，顶边（f≈0.75）到 95%，
     差 4 倍左右，一眼看得出"底下矮、顶上高"的走向 */
  const heightForFrequency = (f: number): number =>
    Math.min(1.15, 0.2 + 0.95 * Math.pow(f, 0.8));
  const ABS_FLOOR = 0.06; // 绝对底噪：低于此值就是"没声音"，不参与
  /* 相对门限：平时各频段 rel≈1（等于自己的常态）就不冒头；某频段冲到自己
     常态的 1.12 倍以上才开始冒头，1.62 倍长满 —— "等那个声音到了才冒头" */

  /* 分频段增益：人声所在的 0.045~0.24 刻意提高，镲片段压低防噪刺 */
  const gainForFrequency = (f: number): number => {
    if (f < 0.045) return 1.08; // 底鼓 / 贝斯
    if (f < 0.24) return 1.26; // 人声基频与共振峰
    if (f < 0.42) return 1.08; // 钢琴、吉他、军鼓主体
    return 0.9; // 镲片与空气感
  };

  const updateSpectrum = (bins: number, decaying: boolean): void => {
    if (bins && !decaying && freqData) {
      const usable = Math.max(1, Math.floor(bins * SPECTRUM_MAX));
      for (let b = 0; b < SPECTRUM_BINS; b++) {
        const a = Math.floor((b / SPECTRUM_BINS) * usable);
        const e = Math.max(a + 1, Math.floor(((b + 1) / SPECTRUM_BINS) * usable));
        let sum = 0;
        let flux = 0;
        for (let i = a; i < e; i++) {
          sum += freqData[i];
          const delta = freqData[i] - prevSpec[i];
          if (delta > 0) flux += delta;
        }
        const width = (e - a) * 255;
        const f = ((b + 0.5) / SPECTRUM_BINS) * SPECTRUM_MAX;
        const level = Math.min(1, (sum / width) * gainForFrequency(f));
        const onset = flux / width;
        fluxFloor[b] += (onset - fluxFloor[b]) * 0.05;
        burst[b] = Math.max(
          Math.min(1, Math.max(0, onset - fluxFloor[b]) * 90),
          burst[b] * 0.88, // 衰减放慢：重音推高后多留几帧，不再一闪就没
        );
        /* 起音 0.6 / 回落 0.3：放慢一档，刺是"长出来"的而不是跳出来的 */
        spectrum[b] += (level - spectrum[b]) * (level > spectrum[b] ? 0.45 : 0.2);
      }
      prevSpec.set(freqData.subarray(0, prevSpec.length));
    } else {
      // 暂停/无分析器：整体回落，直到收干净
      for (let b = 0; b < SPECTRUM_BINS; b++) {
        spectrum[b] *= 0.62;
        burst[b] *= 0.58;
      }
    }
    let sum = 0;
    for (let b = 0; b < SPECTRUM_BINS; b++) sum += spectrum[b];
    amp = sum / SPECTRUM_BINS;
  };

  const tick = (): void => {
    rafId = 0;
    const card = document.querySelector<HTMLElement>(".ac.is-playing");
    const path = card ? pathOf(card) : null;
    if (!card || !path) return;
    const decaying = audio.paused;
    if (analyser && !decaying) analyser.getByteFrequencyData(freqData!);
    updateSpectrum(freqData ? freqData.length : 0, decaying);
    phase = (phase + 0.001 + amp * 0.004) % 1;

    /* 第一步：每根刺的响度分。高频乘一个温和的补偿 —— 音乐能量天然往
       低频堆，不补一点的话高频段永远争不过低频段 */
    for (let k = 0; k < RAY_COUNT; k++) {
      const lv = spectrum[BIN_OF_RAY[k]];
      RAY_SCORE[k] = lv < ABS_FLOOR ? 0 : lv * (1 + 0.5 * FREQ_OF_RAY[k]);
    }

    /* 第二步：每条边内部排名，只留最强的 PER_SIDE_MAX 根，并用"该边最强
       的那根"归一化。关键在"边内排名"：每条边跟自己比，低频段就不会被
       高频段挤掉名额，四条边都保证有刺；而最后的频率权重再把低频压矮、
       把高频拔高 —— 底矮顶高，同时整圈最多 12 根，不拥挤 */
    for (let side = 0; side < 4; side++) {
      const from = side * RAY_PER_SIDE;
      let hi = -1;
      let lo = 1e9;
      for (let j = 0; j < RAY_PER_SIDE; j++) {
        const v = RAY_SCORE[from + j];
        if (v > hi) hi = v;
        if (v < lo) lo = v;
      }
      SIDE_REF[side] = Math.max(hi, SIDE_REF[side] * 0.992);
      /* 把这条边自己的动态范围拉满：本边最弱→0、最强→1。
         这一步是"有高有低"的关键 —— 若按"取最高的 4 根"来选，这 4 根
         天然彼此接近，看着就一样高；拉满范围之后，同一条边上的刺会
         铺开在 0~1 之间，明显一高一低。
         0.06 是护栏：本边频谱本来就很平时不要做除法放大噪声 */
      SIDE_HI[side] = Math.max(hi, SIDE_HI[side] * 0.94);
      SIDE_LO[side] += (lo - SIDE_LO[side]) * 0.06;
      const span = Math.max(SIDE_HI[side] - SIDE_LO[side], 0.06);
      for (let j = 0; j < RAY_PER_SIDE; j++) {
        const i = from + j;
        RAY_LEVEL[i] = Math.pow(
          Math.min(1, Math.max(0, (RAY_SCORE[i] - SIDE_LO[side]) / span)),
          levelCurve,
        );
      }
      // 再挑出本边最高的 4 根，且弱的（<0.2）直接缩回，不出场
      for (let j = 0; j < RAY_PER_SIDE; j++) SIDE_SCRATCH[j] = RAY_LEVEL[from + j];
      SIDE_SCRATCH.sort(); // 升序，末尾即最强
      const c4 = SIDE_SCRATCH[RAY_PER_SIDE - PER_SIDE_MAX];
      let kept = 0;
      for (let j = 0; j < RAY_PER_SIDE; j++) {
        const i = from + j;
        if (
          RAY_LEVEL[i] > 0.2 &&
          RAY_LEVEL[i] >= c4 - 1e-6 &&
          kept < PER_SIDE_MAX &&
          hi > ABS_FLOOR
        ) {
          kept++;
        } else {
          RAY_LEVEL[i] = 0;
        }
      }
    }

    /* 刺根位移恒 0（贴在封面边线上，被封面挡住），刺尖位移 =
       该刺负责频段的电平 × 频率高度权重 × 它自己的 onset 重音 */
    const xy: number[] = [];
    for (let i = 0; i < RING_N; i++) {
      const r = RING[i];
      let h = 0;
      if (r.ray >= 0) {
        const u = (r.ray + 0.5) / RAY_COUNT;
        /* onset 只负责把已经冒头的刺推得更高，绝不参与"谁能冒头" ——
           否则没入场的声音也会被 onset 顶出一点点，整圈又变挤 */
        // 进出都平滑：排名换位时不会"啪"地弹出来
        const target = RAY_LEVEL[r.ray];
        const cur = RAY_SMOOTH[r.ray];
        RAY_SMOOTH[r.ray] = cur + (target - cur) * (target > cur ? 0.16 : 0.06);
        /* 重音把命中的那根明显推高（×1.9 上限），段落之间就有起伏 */
        const gated = RAY_SMOOTH[r.ray] * (1 + burst[BIN_OF_RAY[r.ray]] * 1.1);
        // 轻微流光：整圈像有光在转，但不改变"哪根刺管哪个频率"
        const shimmer = 0.94 + 0.06 * Math.sin(2 * Math.PI * (u * 8 - phase * 2));
        h = Math.min(
          H_MAX_OF(ampUnits),
          ampUnits * heightForFrequency(FREQ_OF_RAY[r.ray]) * gated * shimmer,
        ) * r.w; // 圆顶轮廓：谷底 0 → 顶 0.97
      }
      xy.push(r.x + r.nx * h, r.y + r.ny * h);
    }
    path.setAttribute("d", smoothClosed(xy));

    if (!decaying || amp > 0.006) rafId = requestAnimationFrame(tick);
    else {
      amp = 0;
      spectrum.fill(0);
      burst.fill(0);
      RAY_SMOOTH.fill(0);
      SIDE_REF.fill(0.15);
      SIDE_HI.fill(0);
      SIDE_LO.fill(1);
      fluxFloor.fill(0.004);
      prevSpec.fill(0);
      path.setAttribute("d", FLAT);
    }
  };

  const startSpikes = (): void => {
    wakeCtx();
    if (reduceMotion.matches) return;
    ensureAnalyser();
    measureAmp();
    window.addEventListener("resize", measureAmp, { passive: true });
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
