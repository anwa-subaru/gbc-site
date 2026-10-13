/**
 * 全曲播放器交互（全局播放条 + 音乐页曲目表）
 *  - 底栏与 <audio> 挂在 Layout 上（PlayerBar.astro）并 transition:persist，
 *    因此切到别的页面（比如主页）歌不会断，按「下一首」也仍能继续
 *  - 曲目数据由播放条内联的 JSON 提供：在没有曲目表的页面上同样能算下一首
 *  - 队列模型：从曲目表点歌 → 整个曲目表为队列；从专辑卡点歌 → 该专辑的
 *    曲目为队列，于是"一张专辑里好几首歌"会在卡面上依次轮播
 *  - 播放模式：列表循环 / 单曲循环 / 随机播放 / 顺序播放，一个按钮轮换
    （音乐页列表条右侧，每种模式有自己的图标）
 *  - Media Session：手机锁屏与通知栏可控制
 *  - 幂等：重复调用（astro:page-load）只绑定一次；页面级的曲目表与专辑卡
 *    每次导航后重新绑定（它们会被视图过渡替换掉）
 */

interface Song {
  n: number;
  t: string;
  a: string;
  src: string;
  cover: string;
  album: string;
  dur: number;
}

interface Core {
  refresh: () => void;
}

const fmt = (sec: number): string => {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
};

/* 播放模式：随机已并进这一个按钮里，四种模式轮换，各有各的图标 */
type PlayMode = "list" | "one" | "shuffle" | "off";
const MODE_ORDER: PlayMode[] = ["list", "one", "shuffle", "off"];
const MODE_LABEL: Record<PlayMode, string> = {
  list: "列表循环",
  one: "单曲循环",
  shuffle: "随机播放",
  off: "顺序播放",
};

/* 视图过渡时模块可能被重新执行，把实例挂在 window 上保证只有一份，
   否则 audio 上会叠上第二套事件监听（表现为暂停/播放各触发两次） */
interface PlayerWindow extends Window {
  __gbcPlayer?: { bar: HTMLElement; core: Core };
}

export function initPlayer(): void {
  const bar = document.querySelector<HTMLElement>("[data-player]");
  if (!bar) return;
  const w = window as PlayerWindow;
  if (!w.__gbcPlayer || w.__gbcPlayer.bar !== bar) {
    w.__gbcPlayer = { bar, core: createCore(bar) };
  }
  w.__gbcPlayer.core.refresh();
}

function createCore(bar: HTMLElement): Core {
  const audio = bar.querySelector<HTMLAudioElement>("[data-audio]");
  if (!audio) return { refresh: () => {} };

  let songs: Song[] = [];
  try {
    songs = JSON.parse(bar.querySelector<HTMLScriptElement>("[data-songs]")?.textContent ?? "[]");
  } catch {
    songs = [];
  }
  const byN = new Map(songs.map((s) => [s.n, s]));
  let LYRICS = new Map<string, unknown>();
  try {
    LYRICS = new Map(Object.entries(JSON.parse(bar.querySelector<HTMLScriptElement>("[data-lyrics]")?.textContent ?? "{}")));
  } catch { LYRICS = new Map(); }
  const byAlbum = new Map<string, Song[]>();
  for (const s of songs) {
    const arr = byAlbum.get(s.album);
    if (arr) arr.push(s);
    else byAlbum.set(s.album, [s]);
  }
  const allN = songs.map((s) => s.n);

  const titleEl = bar.querySelector<HTMLElement>("[data-title]");
  const artistEl = bar.querySelector<HTMLElement>("[data-artist]");
  const artEl = bar.querySelector<HTMLImageElement>("[data-art]");
  const artNone = bar.querySelector<HTMLElement>("[data-art-none]");
  const seek = bar.querySelector<HTMLInputElement>("[data-seek]");
  const vol = bar.querySelector<HTMLInputElement>("[data-vol]");
  const curEl = bar.querySelector<HTMLElement>("[data-cur]");
  const totalEl = bar.querySelector<HTMLElement>("[data-total]");
  const seekline = bar.querySelector<HTMLElement>("[data-seekline]");
  const toggleBtn = bar.querySelector<HTMLButtonElement>("[data-toggle]");
  const prevBtn = bar.querySelector<HTMLButtonElement>("[data-prev]");
  const nextBtn = bar.querySelector<HTMLButtonElement>("[data-next]");
  const iconPlay = bar.querySelector<SVGElement>("[data-icon-play]");
  const iconPause = bar.querySelector<SVGElement>("[data-icon-pause]");
  // 两个折叠按钮：条子里的"收起" + 完全收起后浮在右下角的"展开"
  const foldBtns = bar.querySelectorAll<HTMLButtonElement>("[data-fold]");
  const miniBtn = bar.querySelector<HTMLButtonElement>(".plbar__mini");

  let current: number | null = null; // 当前曲目号（songs.json 的 n）
  let queue: number[] = []; // 播放队列（曲目号）
  let mode: PlayMode = "list";

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

  /* ---------- 折叠 ----------
     完全收起后条子整条滑出屏幕，只留右下角一个浮动按钮叫它回来。
     状态只放内存、不落 localStorage：
       · 视图过渡切页时脚本实例还在（挂在 window 上），所以切页保持折叠；
       · 刷新页面时音乐本来就断了，此时若还记着"收起"，用户再点歌会看不到
         播放条、只剩一个悬浮箭头，容易懵 —— 所以刷新即复位为展开 */
  let folded = false;

  const paintFold = (): void => {
    if (folded) bar.dataset.folded = "1";
    else delete bar.dataset.folded;
    const label = folded ? "展开播放器" : "收起播放器";
    foldBtns.forEach((btn) => {
      btn.setAttribute("aria-expanded", String(!folded));
      btn.setAttribute("aria-label", label);
      btn.setAttribute("title", label);
    });
    // 折叠后条子矮一截，页面留白跟着换（否则底部会空一大块）
    const live = bar.dataset.live === "1";
    document.body.classList.toggle("has-plbar", live);
    document.body.classList.toggle("has-plbar-folded", live && folded);
  };

  foldBtns.forEach((btn) =>
    btn.addEventListener("click", () => {
      folded = !folded;
      paintFold();
    }),
  );

  const paint = (el: HTMLInputElement | null, pct: number): void => {
    if (el) el.style.setProperty("--p", `${pct}%`);
  };
  paint(vol, Number(vol?.value ?? 90));
  paint(seek, 0);

  /* ---------- UI 同步 ---------- */
  const songOf = (n: number | null): Song | null => (n == null ? null : (byN.get(n) ?? null));

  /** 发行物封面卡（SINGLES / ALBUMS …）与当前曲目、播放状态联动。
      专辑正在播放时，卡面标题轮播该专辑内正在放的那首曲名 */
  const paintCards = (): void => {
    const cur = songOf(current);
    const playing = !audio.paused;
    document.querySelectorAll<HTMLElement>("[data-play]").forEach((el) => {
      const ac = el.closest(".ac");
      if (!ac) return;
      const album = el.dataset.album ?? "";
      const on = !!cur && (album ? cur.album === album : el.dataset.play === String(cur.n));
      ac.classList.toggle("is-playing", on);
      ac.classList.toggle("is-paused", on && !playing);
      const title = el.querySelector<HTMLElement>(".ac__title");
      if (title) {
        const want = on && cur ? cur.t : (el.dataset.albumTitle ?? "");
        if (want && title.textContent !== want) title.textContent = want;
      }
    });
  };

  /** 曲目表高亮：与当前曲目对应（曲目表只存在于音乐页） */
  const paintList = (): void => {
    const playing = !audio.paused;
    document.querySelectorAll<HTMLElement>(".pl__item").forEach((it) => {
      const on = it.dataset.item === String(current ?? "");
      it.classList.toggle("is-playing", on);
      it.classList.toggle("is-paused", on && !playing);
    });
  };

  const setPlayingUI = (playing: boolean): void => {
    // SVGElement 没有 hidden 属性（那是 HTMLElement 的），必须用 class 切换
    iconPlay?.classList.toggle("is-off", playing);
    iconPause?.classList.toggle("is-off", !playing);
    toggleBtn?.setAttribute("aria-label", playing ? "暂停" : "播放");
    // 完全收起时条子看不见，靠浮动按钮的描边颜色提示"还在放"
    miniBtn?.classList.toggle("is-playing", playing);
    paintCards();
    paintList();
  };

  const setNow = (s: Song): void => {
    if (titleEl) titleEl.textContent = s.t;
    if (artistEl) artistEl.textContent = s.a;
    if (artEl && s.cover) {
      if (artEl.getAttribute("src") !== s.cover) artEl.setAttribute("src", s.cover);
      artEl.hidden = false;
      if (artNone) artNone.hidden = true;
    } else {
      if (artEl) artEl.hidden = true;
      if (artNone) artNone.hidden = false;
    }
    if ("mediaSession" in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: s.t,
        artist: s.a,
        album: s.album,
        artwork: s.cover
          ? [{ src: new URL(s.cover, location.href).href, sizes: "1000x1000", type: "image/webp" }]
          : [],
      });
    }
  };

  /* ---------- 播放控制 ---------- */
  const markLive = (): void => {
    bar.dataset.live = "1";
    paintFold();
  };

  let load = (n: number, play = true): void => {
    const s = byN.get(n);
    if (!s) return;
    current = n;
    audio.src = s.src;
    audio.currentTime = 0;
    setNow(s);
    markLive();
    paintCards();
    paintList();
    if (play) void audio.play().catch(() => setPlayingUI(false));
  };

  const shuffledFrom = (list: number[], first: number): number[] => {
    const rest = list.filter((n) => n !== first);
    for (let i = rest.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [rest[i], rest[j]] = [rest[j], rest[i]];
    }
    return [first, ...rest];
  };

  /** 用给定队列播放其中某一首（随机开启时把这首放在队首、其余打乱） */
  const playQueue = (list: number[], start: number): void => {
    if (!list.length || !byN.has(start)) return;
    queue = mode === "shuffle" ? shuffledFrom(list, start) : [...list];
    load(start, true);
  };

  const advance = (dir: 1 | -1): void => {
    if (current == null || !queue.length) {
      if (allN.length) playQueue(allN, allN[0]);
      return;
    }
    const at = queue.indexOf(current);
    let next = at + dir;
    const wrap = mode !== "off"; // 只有"顺序播放"到头就停，其余都会绕回去
    if (next >= queue.length) next = wrap ? 0 : queue.length - 1;
    if (next < 0) next = wrap ? queue.length - 1 : 0;
    if (next === at) {
      // 队列里只有一首且不循环：重头再放
      audio.currentTime = 0;
      void audio.play();
      return;
    }
    load(queue[next], true);
  };

  /** 音乐页曲目行点歌：队列 = 整个曲目表 */
  const playRow = (n: number): void => {
    if (!byN.has(n)) return;
    if (n === current) {
      if (audio.paused) void audio.play();
      else audio.pause();
      return;
    }
    playQueue(allN, n);
  };

  /** 专辑卡双击：队列 = 这张专辑的曲目，卡面随之轮播曲名 */
  const playCard = (hit: HTMLElement): void => {
    const n = Number(hit.dataset.play);
    if (!Number.isFinite(n) || !byN.has(n)) return;
    if (!reduceMotion.matches) navigator.vibrate?.(12);
    const album = hit.dataset.album ?? "";
    const cur = songOf(current);
    if (cur && album && cur.album === album) {
      // 这张专辑正在播：双击 = 暂停/继续，而不是重头再来
      if (audio.paused) void audio.play();
      else audio.pause();
      return;
    }
    const list = album && byAlbum.has(album) ? byAlbum.get(album)!.map((s) => s.n) : allN;
    playQueue(list, n);
  };

  /* ---------- 频谱引擎（音频驱动的专辑环形频谱） ---------- */
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
  const RAY_SCORE = new Float32Array(RAY_COUNT); // 每帧每根刺的"激励"分（白化后）
  const RAY_REF = new Float32Array(RAY_COUNT); // 每根刺的慢参考：本频段的常态水平
  const RAY_ABS = new Float32Array(RAY_COUNT); // 每根刺的绝对强度：安静时不让刺冒高
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
  const ABS_FULL = 0.16; // 绝对强度达到此值就算"满"（再响也不会更长）
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

    /* 第一步：每根刺的"激励"分 —— 白化处理。
       音乐能量天然随频率下降，如果直接比绝对响度，每条边里频率最低的那根
       永远是本边最强：顶边就表现为左右上角两根"虚长"的刺一直挂着，跟音乐
       没关系（用户报的就是这个）。
       所以除以本频段的慢参考（它自己的常态），比的是"比常态强多少"：
       谁在动谁冒头，固有倾斜被抵消掉。
       另外单独留一个绝对强度 RAY_ABS，安静段落里不让刺凭空长满。 */
    for (let k = 0; k < RAY_COUNT; k++) {
      const lv = spectrum[BIN_OF_RAY[k]];
      RAY_REF[k] += (lv - RAY_REF[k]) * (lv > RAY_REF[k] ? 0.18 : 0.012);
      RAY_ABS[k] = lv < ABS_FLOOR ? 0 : Math.min(1, lv / ABS_FULL);
      RAY_SCORE[k] = RAY_ABS[k] <= 0 ? 0 : lv / Math.max(RAY_REF[k], 0.03);
    }

    /* 第二步：每条边内部排名，只留最强的 PER_SIDE_MAX 根，并用"该边最强
       的那根"归一化。关键在"边内排名"：每条边跟自己比，低频段就不会被
       高频段挤掉名额，四条边都保证有刺；而最后的频率权重再把低频压矮、
       把高频拔高 —— 底矮顶高，同时整圈最多 12 根，不拥挤 */
    for (let side = 0; side < 4; side++) {
      const from = side * RAY_PER_SIDE;
      let hi = -1;
      let lo = 1e9;
      let sideAbs = 0; // 本边最强的绝对强度：整边都没声音时不冒头
      for (let j = 0; j < RAY_PER_SIDE; j++) {
        const i = from + j;
        const v = RAY_SCORE[i];
        if (v > hi) hi = v;
        if (v < lo) lo = v;
        if (RAY_ABS[i] > sideAbs) sideAbs = RAY_ABS[i];
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
          sideAbs > 0
        ) {
          kept++;
        } else {
          RAY_LEVEL[i] = 0;
        }
      }
      /* 选完再按绝对强度衰减：相对激励决定"谁冒头"，绝对强度决定"冒多高"，
         两者分开，安静段落就不会出现满格的假刺 */
      for (let j = 0; j < RAY_PER_SIDE; j++) {
        const i = from + j;
        RAY_LEVEL[i] *= RAY_ABS[i];
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
      RAY_REF.fill(0);
      RAY_ABS.fill(0);
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
    if (!rafId) rafId = requestAnimationFrame(tick);
  };

  /* resize 只绑一次：startSpikes 每次 play/pause 都会被调用，
     监听写在里面会越叠越多 */
  window.addEventListener("resize", measureAmp, { passive: true });

  audio.addEventListener("play", startSpikes);
  audio.addEventListener("pause", startSpikes); // 进衰减模式把刺收回

  /* ---------- 循环 / 随机 ---------- */
  const paintMode = (): void => {
    const btn = document.querySelector<HTMLElement>("[data-playmode]");
    if (!btn) return;
    btn.dataset.mode = mode;
    // 四个图标叠在同一个按钮里，只显示当前模式那个
    btn.querySelectorAll<SVGElement>("[data-mode-icon]").forEach((ic) => {
      ic.classList.toggle("is-off", ic.dataset.modeIcon !== mode);
    });
    const label = btn.querySelector<HTMLElement>("[data-playmode-label]");
    if (label) label.textContent = MODE_LABEL[mode];
    const tip = `播放模式：${MODE_LABEL[mode]}（点击切换）`;
    btn.setAttribute("title", tip);
    btn.setAttribute("aria-label", tip);
  };

  const cycleMode = (): void => {
    const at = MODE_ORDER.indexOf(mode);
    mode = MODE_ORDER[(at + 1) % MODE_ORDER.length];
    /* 切到随机就重排成乱序，切回其它模式恢复原顺序
       （队列是曲目表的子集时，升序即原本的专辑顺序） */
    if (current != null && queue.length) {
      queue = mode === "shuffle" ? shuffledFrom(queue, current) : [...queue].sort((a, b) => a - b);
    }
    paintMode();
  };

  /* ---------- 双击播放（鼠标与触摸同一条路径） ---------- */
  /* 手机浏览器不一定派发 dblclick（双击缩放被 touch-action 关掉后行为也不一致），
     所以统一用 pointerup 计时自己判定。监听挂在 document 上，只绑一次，
     每次按下时再实时查 [data-play] —— 页面切换后卡片换了也能命中。 */
  let lastTapAt = 0;
  let lastTapEl: HTMLElement | null = null;
  let downX = 0;
  let downY = 0;

  document.addEventListener("pointerdown", (e) => {
    downX = e.clientX;
    downY = e.clientY;
  });

  document.addEventListener("pointerup", (e) => {
    const hit = (e.target as HTMLElement | null)?.closest?.("[data-play]") as HTMLElement | null;
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

  /* ---------- 底栏按钮 ---------- */
  toggleBtn?.addEventListener("click", () => {
    if (current == null) {
      if (allN.length) playQueue(allN, allN[0]);
      return;
    }
    if (audio.paused) void audio.play();
    else audio.pause();
  });

  prevBtn?.addEventListener("click", () => {
    // 播放超过 3 秒时「上一首」先回到开头（与常见播放器一致）
    if (audio.currentTime > 3) {
      audio.currentTime = 0;
      return;
    }
    advance(-1);
  });

  nextBtn?.addEventListener("click", () => advance(1));

  /* ---------- 进度 / 音量 ---------- */
  audio.addEventListener("timeupdate", () => {
    /* 全屏歌词里的进度条/时间跟着主播放器走 */
    syncLyricBar();
    const d = audio.duration;
    if (!Number.isFinite(d) || d <= 0) return;
    const pct = (audio.currentTime / d) * 100;
    if (seek && document.activeElement !== seek) seek.value = String(Math.round(pct * 10));
    paint(seek, pct);
    if (curEl) curEl.textContent = fmt(audio.currentTime);
    if (seekline) seekline.style.width = `${pct}%`;
  });

  audio.addEventListener("loadedmetadata", () => {
    syncLyricBar(true);
    if (totalEl) totalEl.textContent = fmt(audio.duration);
  });

  audio.addEventListener("play", () => { setPlayingUI(true); syncLyricBar(); });
  audio.addEventListener("pause", () => { setPlayingUI(false); syncLyricBar(); });
  audio.addEventListener("error", () => setPlayingUI(false));

  /* 放完一首：单曲循环就重来，否则按队列往后走 */
  audio.addEventListener("ended", () => {
    if (mode === "one" && current != null) {
      audio.currentTime = 0;
      void audio.play();
      return;
    }
    const at = current == null ? -1 : queue.indexOf(current);
    if (at + 1 < queue.length) {
      load(queue[at + 1], true);
      return;
    }
    if (mode !== "off" && queue.length) {
      load(queue[0], true);
      return;
    }
    // 不循环：放完就停住（显式 pause，别依赖浏览器自己停）
    audio.pause();
    setPlayingUI(false);
  });

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

  /* ---------- 键盘：焦点在播放条内时 ← → 切歌 ---------- */
  bar.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === "INPUT") return;
    e.preventDefault();
    advance(e.key === "ArrowRight" ? 1 : -1);
  });

  /* ---------- Media Session 硬件按键 ---------- */
  if ("mediaSession" in navigator) {
    navigator.mediaSession.setActionHandler("play", () => void audio.play());
    navigator.mediaSession.setActionHandler("pause", () => audio.pause());
    navigator.mediaSession.setActionHandler("previoustrack", () => advance(-1));
    navigator.mediaSession.setActionHandler("nexttrack", () => advance(1));
  }

  /* ---------- 每次导航后重新绑定本页元素 ----------
     播放条本身被 transition:persist 保留（监听还在），但曲目表与列表条上的
     按钮属于页面内容，会被视图过渡替换成新节点，必须重新绑。 */
  const bindOnce = (el: HTMLElement | null, fn: () => void): void => {
    if (!el || el.dataset.bound === "1") return;
    el.dataset.bound = "1";
    el.addEventListener("click", fn);
  };

  const refresh = (): void => {
    paintFold();
    paintMode();
    if (lyrOpen) renderLyrics();
    /* 卡片是新的 DOM，刺环的 <path> 缓存要作废（旧节点已经不在文档里） */
    spikePaths.clear();
    paintCards();
    paintList();
    /* 切页回来要重新点火：离开音乐页时没有 .ac.is-playing，
       tick 会自己停帧（rafId 归零），而 audio 一直在放、不会再触发 play 事件，
       所以必须在这里主动把循环拉起来，否则刺环要等下次播放才出现 */
    if (bar.dataset.live === "1" && !reduceMotion.matches && document.querySelector(".ac.is-playing")) {
      startSpikes();
    }
    document.querySelectorAll<HTMLButtonElement>(".pl__row").forEach((row) => {
      if (row.dataset.bound === "1") return;
      row.dataset.bound = "1";
      row.addEventListener("click", () => {
        const n = Number(row.dataset.track);
        if (Number.isFinite(n)) playRow(n);
      });
    });
    bindOnce(document.querySelector<HTMLElement>("[data-playmode]"), cycleMode);
    bindOnce(document.querySelector<HTMLElement>("[data-play-all]"), () => {
      if (allN.length)
        playQueue(allN, mode === "shuffle" ? allN[Math.floor(Math.random() * allN.length)] : allN[0]);
    });
  };


  /* ---------- 歌词面板 ---------- */
  const lyrDoc = bar.querySelector<HTMLDialogElement>("dialog[data-lyrics]");
  const lyrTitle = bar.querySelector<HTMLElement>("[data-lyr-title]");
  const lyrArtist = bar.querySelector<HTMLElement>("[data-lyr-artist]");
  const lyrDur = bar.querySelector<HTMLElement>("[data-lyr-dur]");
  const lyrCover = bar.querySelector<HTMLImageElement>("[data-lyr-cover]");
  const lyrCred = bar.querySelector<HTMLElement>("[data-lyr-cred]");
  const lyrBody = bar.querySelector<HTMLElement>("[data-lyr-body]");
  const lyrList = bar.querySelector<HTMLElement>("[data-lyr-lines]");
  const lyrEmpty = bar.querySelector<HTMLElement>("[data-lyr-empty]");
  const lyrClose = bar.querySelector<HTMLButtonElement>("[data-lyr-close]");
  /* 全屏里自带的进度条与传输键：全屏后播放条被盖住，操作要能在全屏内完成 */
  const lyrSeek = bar.querySelector<HTMLInputElement>("[data-lyr-seek]");
  const lyrCurEl = bar.querySelector<HTMLElement>("[data-lyr-cur]");
  const lyrTotalEl = bar.querySelector<HTMLElement>("[data-lyr-total]");
  const lyrToggle = bar.querySelector<HTMLButtonElement>("[data-lyr-toggle]");
  const lyrIconPlay = bar.querySelector<SVGElement>("[data-lyr-icon-play]");
  const lyrIconPause = bar.querySelector<SVGElement>("[data-lyr-icon-pause]");
  const lyrEntries = bar.querySelectorAll<HTMLElement>("[data-lyrics-open]");

  interface LyricLine {
    el: HTMLLIElement;
    top: number;
  }
  let lyrOpen = false;
  let lyrLines: LyricLine[] = [];
  let lyrCur = -1;
  let lyrTimer = 0;

  /** 打开面板时按当前曲目渲染歌词（等距时间轴：纯文本歌词没有时间标签，
      按行数均分曲目时长；以后拿到带时间的 LRC 直接换数据源即可） */
  const renderLyrics = (): void => {
    if (!lyrList || !lyrEmpty) return;
    const song = songOf(current);
    lyrLines = [];
    lyrCur = -1;
    if (!song) {
      if (lyrTitle) lyrTitle.textContent = "未选择曲目";
      if (lyrArtist) lyrArtist.textContent = "点击任意曲目开始播放";
      if (lyrDur) lyrDur.textContent = "0:00";
      if (lyrCred) lyrCred.textContent = "";
      lyrList.innerHTML = "";
      lyrEmpty.hidden = false;
      return;
    }
    const doc = LYRICS.get(String(song.n)) as
      | { title: string; artist: string; lyricist: string; composer: string; use?: string; source?: string; lines: string[] }
      | undefined;
    lyrTitle!.textContent = song.t;
    if (lyrArtist) lyrArtist.textContent = song.a;
    if (lyrDur)
      lyrDur.textContent = `${song.dur ? Math.floor(song.dur / 60) : 0}:${String((song.dur ?? 0) % 60).padStart(2, "0")}`;
    if (lyrCover) {
      if (song.cover && lyrCover.getAttribute("src") !== song.cover) lyrCover.src = song.cover;
      lyrCover.hidden = !song.cover;
    }
    if (!doc || !doc.lines.length) {
      lyrList.innerHTML = "";
      lyrEmpty.hidden = false;
      lyrCred!.textContent = "";
      return;
    }
    lyrEmpty.hidden = true;
    if (lyrCred) {
      const li = doc.lyricist?.trim();
      const co = doc.composer?.trim();
      lyrCred.textContent =
        li && co
          ? li === co
            ? `作詞・作曲 ${li}`
            : `作詞 ${li}　作曲 ${co}`
          : `作詞・作曲 ${li || co || ""}`.trim();
    }
    const frag = document.createDocumentFragment();
    for (const text of doc.lines) {
      const li = document.createElement("li");
      li.className = "lyr__line";
      li.textContent = text;
      frag.appendChild(li);
    }
    lyrList.innerHTML = "";
    lyrList.appendChild(frag);
    // 等距时间轴：每行起止时间
    const dur = song.dur || audio.duration || 180;
    const per = dur / doc.lines.length;
    lyrLines = [...lyrList.children].map((el, i) => ({
      el: el as HTMLLIElement,
      top: i * per,
    }));
    // 点击行 → seek 到那一句（双向交互）
    lyrLines.forEach((ln, i) => {
      ln.el.addEventListener("click", () => {
        if (current == null) return;
        audio.currentTime = Math.min(ln.top + 0.01, Math.max(0, (song.dur || audio.duration) - 0.5));
        paintLyric(true);
      });
    });
    paintLyric(true);
  };

  /** 高亮当前句 + 容器内滚动（绝不滚整页——用户明确否过页面跳转） */
  const paintLyric = (force = false): void => {
    if (!lyrOpen || !lyrLines.length || !lyrBody) return;
    if (!lyrBody.clientHeight) return;
    const dur = songOf(current)?.dur || audio.duration || 180;
    const pos = audio.currentTime;
    // 二分找当前行
    let lo = 0, hi = lyrLines.length - 1, at = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (lyrLines[mid].top <= pos) { at = mid; lo = mid + 1; } else hi = mid - 1;
    }
    if (at === lyrCur && !force) return;
    lyrCur = at;
    /* 锚点取 42% 而不是正中间：歌词视觉重心略偏上更耐看 */
    const center = lyrBody.clientHeight * 0.42;
    lyrLines.forEach((ln, i) => {
      const d = Math.abs(i - at);
      ln.el.classList.toggle("is-cur", i === at);
      /* 亮度按距离线性衰减：邻句最亮，6 句外几乎沉底，
         上下对称（上一句和下一句一样亮，视线有来路） */
      ln.el.style.setProperty("--d", String(Math.min(1, d / 7)));
    });
    if (at >= 0) {
      const y = lyrLines[at].el.offsetTop - center + lyrLines[at].el.offsetHeight / 2;
      lyrBody.scrollTo({ top: Math.max(0, y), behavior: "smooth" });
    }
  };

  const openLyrics = (): void => {
    if (!lyrDoc || current == null) return;
    lyrOpen = true;
    renderLyrics();
    syncLyricBar(true);
    lyrDoc.showModal();
    /* 必须等 dialog 显示后再定位：隐藏时 clientHeight 为 0，
       算出来的滚动量是错的，而且之后"当前行没变"会一直提前返回 */
    requestAnimationFrame(() => paintLyric(true));
    lyrEntries.forEach((el) => el.setAttribute("aria-expanded", "true"));
    // rAF 跟随：暂停时也停帧（与频谱同款节流），避免空转
    const loop = (): void => {
      if (!lyrOpen) { lyrTimer = 0; return; }
      paintLyric();
      lyrTimer = requestAnimationFrame(loop);
    };
    if (!lyrTimer) lyrTimer = requestAnimationFrame(loop);
  };

  const closeLyrics = (): void => {
    if (!lyrDoc) return;
    lyrOpen = false;
    if (lyrTimer) { cancelAnimationFrame(lyrTimer); lyrTimer = 0; }
    lyrDoc.close();
    lyrEntries.forEach((el) => el.setAttribute("aria-expanded", "false"));
  };

  /* 入口：点播放条上的封面或曲名区进全屏歌词（键盘 Enter/Space 同样可用） */
  lyrEntries.forEach((el) => {
    el.addEventListener("click", () => openLyrics());
    el.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      openLyrics();
    });
  });
  lyrClose?.addEventListener("click", closeLyrics);
  lyrDoc?.addEventListener("cancel", (e) => { e.preventDefault(); closeLyrics(); });

  /* 全屏内的进度条与传输键 */
  const syncLyricBar = (force = false): void => {
    if (!lyrOpen) return;
    const d = audio.duration;
    if (Number.isFinite(d) && d > 0) {
      const p = (audio.currentTime / d) * 100;
      if (lyrSeek && document.activeElement !== lyrSeek) {
        if (force) lyrSeek.value = String(Math.round(p * 10));
        else lyrSeek.value = String(Math.round(p * 10));
      }
      if (lyrSeek) lyrSeek.style.setProperty("--p", `${p}%`);
      if (lyrCurEl) lyrCurEl.textContent = fmt(audio.currentTime);
      if (lyrTotalEl) lyrTotalEl.textContent = fmt(d);
    }
    const playing = !audio.paused;
    lyrIconPlay?.classList.toggle("is-off", playing);
    lyrIconPause?.classList.toggle("is-off", !playing);
    lyrToggle?.setAttribute("aria-label", playing ? "暂停" : "播放");
  };

  lyrSeek?.addEventListener("input", () => {
    const d = audio.duration;
    if (!Number.isFinite(d) || d <= 0) return;
    audio.currentTime = (Number(lyrSeek.value) / 1000) * d;
    syncLyricBar();
    paintLyric(true);
  });
  lyrToggle?.addEventListener("click", () => {
    if (current == null) { if (allN.length) playQueue(allN, allN[0]); return; }
    if (audio.paused) void audio.play();
    else audio.pause();
  });
  bar.querySelector<HTMLButtonElement>("[data-lyr-prev]")?.addEventListener("click", () => advance(-1));
  bar.querySelector<HTMLButtonElement>("[data-lyr-next]")?.addEventListener("click", () => advance(1));

  // 切歌时若面板开着 → 重渲染（重载 load 本体，避免二次包装）
  const origLoad = load;
  load = (n: number, play = true): void => {
    origLoad(n, play);
    if (lyrOpen) renderLyrics();
  };

  setPlayingUI(false);
  return { refresh };
}
