/* Lumen Multi-Agent Studio
 * Fully free + local: no API keys, tokens, or cloud credits.
 * Modes: text→video, image gen, image/video reference, face composite.
 * "Agents" are local routing profiles inspired by modern model styles.
 * Proprietary cloud models (Seedance, Grok, etc.) cannot be unlocked free.
 */

(function () {
  "use strict";

  const MODES = [
    { id: "text2video", label: "Text → Video" },
    { id: "image2video", label: "Image → Video" },
    { id: "text2image", label: "Text → Image" },
    { id: "faceswap", label: "Face Composite" },
    { id: "refvideo", label: "Video Reference" },
  ];

  const AGENTS = [
    {
      id: "lumen",
      name: "Lumen Core",
      tag: "Local generalist",
      desc: "Balanced cinematic planner + renderer",
      motion: 1,
      colorBias: 0,
      grain: 0.06,
      bloom: 0.18,
      free: true,
    },
    {
      id: "seedance-local",
      name: "Seedance-style",
      tag: "Local motion profile",
      desc: "High motion, dancey camera energy (local emulation)",
      motion: 1.45,
      colorBias: 12,
      grain: 0.05,
      bloom: 0.28,
      free: true,
    },
    {
      id: "grok-local",
      name: "Grok-style",
      tag: "Local bold look",
      desc: "Punchy contrast, bold palette, snappy cuts (local emulation)",
      motion: 1.2,
      colorBias: -8,
      grain: 0.08,
      bloom: 0.14,
      free: true,
    },
    {
      id: "sora-local",
      name: "Sora-style",
      tag: "Local cinematic",
      desc: "Slow dramatic moves, filmic letterbox feel (local emulation)",
      motion: 0.75,
      colorBias: 4,
      grain: 0.1,
      bloom: 0.22,
      free: true,
    },
    {
      id: "runway-local",
      name: "Runway-style",
      tag: "Local product look",
      desc: "Clean commercial lighting + smooth pans (local emulation)",
      motion: 0.95,
      colorBias: 6,
      grain: 0.04,
      bloom: 0.2,
      free: true,
    },
    {
      id: "kling-local",
      name: "Kling-style",
      tag: "Local realism bias",
      desc: "Natural motion + grounded lighting (local emulation)",
      motion: 1.05,
      colorBias: 2,
      grain: 0.07,
      bloom: 0.16,
      free: true,
    },
  ];

  const STYLES = [
    { id: "cinematic", label: "Cinematic" },
    { id: "dreamy", label: "Dreamy" },
    { id: "noir", label: "Noir" },
    { id: "vivid", label: "Vivid" },
    { id: "documentary", label: "Documentary" },
  ];

  const ASPECTS = [
    { id: "16:9", label: "16:9 Landscape", w: 1280, h: 720 },
    { id: "9:16", label: "9:16 Portrait", w: 720, h: 1280 },
    { id: "1:1", label: "1:1 Square", w: 720, h: 720 },
  ];

  const state = {
    mode: "text2video",
    agents: ["lumen", "seedance-local"],
    prompt: "",
    style: "cinematic",
    aspect: "16:9",
    duration: 8,
    fps: 24,
    quality: "standard",
    seed: Math.floor(Math.random() * 1e9),
    faceStrength: 0.72,
    faceScale: 0.34,
    faceX: 0.5,
    faceY: 0.38,
    blendMode: "soft",
    refImage: null, // {name, url, img, w, h}
    faceImage: null,
    refVideo: null, // {name, url, video, w, h, duration}
    plan: null,
    agentLog: [],
    isPreviewing: false,
    isRecording: false,
    previewRaf: 0,
    previewStart: 0,
    recordedBlob: null,
    imageBlob: null,
    status: "Ready — free local multi-agent studio (no API keys)",
    progress: 0,
  };

  const els = {};

  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function smoothstep(t) {
    t = clamp(t, 0, 1);
    return t * t * (3 - 2 * t);
  }

  function hash(n) {
    n = (n ^ 61) ^ (n >>> 16);
    n = Math.imul(n, 0x45d9f3b);
    n = (n ^ (n >>> 16)) >>> 0;
    return n / 4294967296;
  }

  function noise2(x, y, seed) {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const u = xf * xf * (3 - 2 * xf);
    const v = yf * yf * (3 - 2 * yf);
    const a = hash(xi * 374761393 + yi * 668265263 + seed);
    const b = hash((xi + 1) * 374761393 + yi * 668265263 + seed);
    const c = hash(xi * 374761393 + (yi + 1) * 668265263 + seed);
    const d = hash((xi + 1) * 374761393 + (yi + 1) * 668265263 + seed);
    return lerp(lerp(a, b, u), lerp(c, d, u), v);
  }

  function fbm(x, y, seed, octaves) {
    let amp = 0.5;
    let freq = 1;
    let sum = 0;
    let norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += noise2(x * freq, y * freq, seed + i * 101) * amp;
      norm += amp;
      amp *= 0.5;
      freq *= 2;
    }
    return sum / norm;
  }

  function mulberry32(a) {
    return function () {
      let t = (a += 0x6d2b79f5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function escapeHtml(str) {
    const d = document.createElement("div");
    d.textContent = String(str);
    return d.innerHTML;
  }

  function selectedAgents() {
    return AGENTS.filter((a) => state.agents.includes(a.id));
  }

  function agentProfile() {
    const list = selectedAgents();
    if (!list.length) return AGENTS[0];
    // blend selected agent profiles
    const out = {
      id: list.map((a) => a.id).join("+"),
      name: list.map((a) => a.name).join(" + "),
      motion: 0,
      colorBias: 0,
      grain: 0,
      bloom: 0,
    };
    list.forEach((a) => {
      out.motion += a.motion;
      out.colorBias += a.colorBias;
      out.grain += a.grain;
      out.bloom += a.bloom;
    });
    const n = list.length;
    out.motion /= n;
    out.colorBias /= n;
    out.grain /= n;
    out.bloom /= n;
    return out;
  }

  function parseSubjects(text) {
    const t = String(text || "").toLowerCase();
    const subjects = [];
    const hasCouple = /\bcouple\b|\btwo people\b|\bpair\b/.test(t);
    const hasPeople = hasCouple || /\bpeople\b|\bpersons?\b|\bhumans?\b|\bman\b|\bwoman\b|\bgirl\b|\bboy\b|\bfriends?\b|\bfamily\b|\bcharacter\b|\banime\b/.test(t);
    const hasDog = /\bdogs?\b|\bpuppy\b|\bpuppies\b|\bhound\b|\bretriever\b/.test(t);
    const hasCat = /\bcats?\b|\bkitten\b/.test(t);
    const hasBird = /\bbirds?\b|\beagle\b/.test(t) && !hasDog;
    const hasHorse = /\bhorses?\b|\bpony\b/.test(t);
    const hasRobot = /\brobots?\b|\bandroid\b|\bmecha\b/.test(t);
    const hasCar = /\bcars?\b|\bvehicle\b|\btruck\b|\bbike\b|\bmotorcycle\b/.test(t);
    const walking = /\bwalk(ing|s|ed)?\b|\bstroll\b|\bpark\b|\bleash\b/.test(t);
    const running = /\brun(ning|s|ed)?\b|\bjogg(ing|er)?\b/.test(t);
    const sitting = /\bsit(ting|s|ed)?\b/.test(t);
    const action = running ? "run" : walking ? "walk" : sitting ? "sit" : "idle";

    if (hasCouple) {
      subjects.push({ type: "person", role: "left", scale: 1, action });
      subjects.push({ type: "person", role: "right", scale: 0.98, action });
    } else if (hasPeople) {
      subjects.push({ type: "person", role: "main", scale: 1.05, action });
      if (/\bfriends?\b|\bfamily\b|\bpeople\b/.test(t)) {
        subjects.push({ type: "person", role: "side", scale: 0.95, action });
      }
    }
    if (hasDog) subjects.push({ type: "dog", role: "pet", scale: 0.55, action: action === "sit" ? "walk" : action });
    if (hasCat) subjects.push({ type: "cat", role: "pet", scale: 0.42, action });
    if (hasHorse) subjects.push({ type: "horse", role: "animal", scale: 0.9, action });
    if (hasRobot) subjects.push({ type: "robot", role: "main", scale: 1, action });
    if (hasCar) subjects.push({ type: "car", role: "vehicle", scale: 1, action: "drive" });
    if (hasBird) subjects.push({ type: "bird", role: "pet", scale: 0.28, action: "fly" });

    // If only animals mentioned without people, keep animals.
    // If nothing matched, leave empty so landscape-only still works.
    return {
      subjects,
      action,
      hasSubjects: subjects.length > 0,
      walking: walking || running,
      outdoor: /\bpark\b|\bstreet\b|\bbeach\b|\bforest\b|\bmountain\b|\bcity\b|\boutdoor\b|\bfield\b|\bpath\b/.test(t) || walking || running,
    };
  }

  function detectTheme(text) {
    const t = String(text || "").toLowerCase();
    const parsed = parseSubjects(text);
    const scores = {
      ocean: 0,
      city: 0,
      mountain: 0,
      space: 0,
      forest: 0,
      desert: 0,
      portrait: 0,
      product: 0,
      abstract: 0,
      park: 0,
    };
    const rules = [
      [/ocean|sea|wave|beach|coast|underwater|aquarium|surf/, "ocean", 4],
      [/\blake\b|\briver\b|\bwater\b/, "ocean", 1],
      [/city|neon|cyber|street|skyscraper|urban|metropolis|tokyo|traffic|building/, "city", 3],
      [/mountain|peak|valley|alpine|cliff|ridge|hills|snow|glacier/, "mountain", 3],
      [/space|nebula|galaxy|star|cosmos|orbit|planet|sci-?fi|astronaut|rocket|alien/, "space", 3],
      [/forest|tree|woods|jungle|canopy|leaves|garden|nature/, "forest", 3],
      [/\bpark\b|\bpath\b|\btrail\b|\bgrass\b|\bfield\b/, "park", 4],
      [/desert|dune|sand|arid|canyon|heat|sahara|oasis/, "desert", 3],
      [/portrait|face|headshot|selfie|close-?up/, "portrait", 3],
      [/product|studio|commercial|packshot|brand|phone|shoe|bottle|gadget/, "product", 3],
      [/abstract|particle|energy|glow|surreal|dream|magic|fantasy/, "abstract", 2],
      [/rain|storm|thunder|lightning/, "city", 1],
      [/sunset|sunrise|golden hour|dusk|dawn/, "mountain", 1],
    ];
    rules.forEach(([re, theme, w]) => {
      if (re.test(t)) scores[theme] += w;
    });

    // Subject prompts should NOT fall into random landscapes.
    if (parsed.hasSubjects) {
      if (parsed.walking || /\bpark\b|\bpath\b|\bgrass\b|\bstroll\b/.test(t)) scores.park += 6;
      else if (/\bstreet\b|\bcity\b|\bneon\b/.test(t)) scores.city += 5;
      else if (/\bbeach\b|\bocean\b|\bsea\b/.test(t)) scores.ocean += 5;
      else if (/\bforest\b|\bwoods\b/.test(t)) scores.forest += 5;
      else scores.park += 5; // default for people/animals: park path
      // dampen pure landscape defaults when subjects exist
      scores.ocean = Math.min(scores.ocean, 2);
      scores.mountain = Math.min(scores.mountain, 2);
      scores.space = Math.min(scores.space, 1);
    }

    if (state.mode === "faceswap") scores.portrait += 2;
    if (state.refImage && state.mode === "image2video") scores.abstract += 1;

    let best = parsed.hasSubjects ? "park" : "mountain";
    let bestScore = -1;
    Object.keys(scores).forEach((k) => {
      if (scores[k] > bestScore) {
        bestScore = scores[k];
        best = k;
      }
    });
    return best;
  }

  function detectMood(text) {
    const t = text.toLowerCase();
    if (/calm|peaceful|gentle|soft|serene|quiet/.test(t)) return "calm";
    if (/epic|dramatic|intense|storm|powerful|dark/.test(t)) return "dramatic";
    if (/dream|ethereal|magical|glow/.test(t)) return "dreamy";
    if (/neon|cyber|electric|vivid|bright/.test(t)) return "electric";
    return "cinematic";
  }

  function extractTitle(text) {
    const clean = text.replace(/\s+/g, " ").trim();
    if (!clean) return "Untitled Scene";
    const words = clean.split(" ").slice(0, 6).join(" ");
    return words.length > 42 ? words.slice(0, 42) + "…" : words;
  }

  function paletteFor(theme, style, seed, colorBias) {
    const base = {
      ocean: {
        skyTop: [12, 24, 48],
        skyBot: [255, 140, 90],
        mid: [40, 90, 140],
        ground: [8, 30, 55],
        accent: [255, 190, 120],
        fog: [180, 200, 220],
      },
      city: {
        skyTop: [8, 6, 24],
        skyBot: [40, 12, 60],
        mid: [90, 40, 140],
        ground: [10, 10, 18],
        accent: [0, 240, 255],
        fog: [120, 80, 180],
      },
      mountain: {
        skyTop: [30, 50, 90],
        skyBot: [255, 170, 110],
        mid: [120, 140, 170],
        ground: [40, 50, 60],
        accent: [255, 210, 150],
        fog: [210, 220, 230],
      },
      space: {
        skyTop: [4, 2, 16],
        skyBot: [20, 8, 40],
        mid: [90, 40, 160],
        ground: [8, 4, 20],
        accent: [120, 255, 220],
        fog: [160, 100, 255],
      },
      forest: {
        skyTop: [20, 40, 35],
        skyBot: [120, 160, 100],
        mid: [40, 90, 55],
        ground: [12, 28, 18],
        accent: [200, 230, 140],
        fog: [160, 190, 160],
      },
      desert: {
        skyTop: [40, 80, 140],
        skyBot: [255, 160, 80],
        mid: [220, 140, 70],
        ground: [160, 100, 50],
        accent: [255, 220, 140],
        fog: [240, 200, 150],
      },
      portrait: {
        skyTop: [28, 24, 40],
        skyBot: [90, 70, 90],
        mid: [160, 120, 110],
        ground: [30, 24, 28],
        accent: [255, 200, 170],
        fog: [200, 180, 190],
      },
      product: {
        skyTop: [18, 22, 30],
        skyBot: [40, 48, 60],
        mid: [90, 110, 140],
        ground: [16, 18, 24],
        accent: [180, 220, 255],
        fog: [160, 180, 210],
      },
      park: {
        skyTop: [90, 150, 220],
        skyBot: [190, 220, 255],
        mid: [120, 180, 120],
        ground: [70, 120, 70],
        accent: [255, 210, 120],
        fog: [210, 230, 210],
      },
      abstract: {
        skyTop: [10, 10, 30],
        skyBot: [40, 20, 70],
        mid: [80, 50, 160],
        ground: [15, 10, 30],
        accent: [255, 120, 180],
        fog: [140, 160, 255],
      },
    }[theme] || {
      skyTop: [20, 24, 40],
      skyBot: [80, 90, 120],
      mid: [60, 70, 100],
      ground: [12, 14, 20],
      accent: [180, 200, 255],
      fog: [160, 170, 200],
    };

    const p = JSON.parse(JSON.stringify(base));
    if (style === "noir") {
      Object.keys(p).forEach((k) => {
        const [r, g, b] = p[k];
        const gray = Math.round(r * 0.3 + g * 0.5 + b * 0.2);
        p[k] = [gray, gray, gray + 8];
      });
      p.accent = [230, 230, 230];
    } else if (style === "dreamy") {
      p.skyTop = p.skyTop.map((v) => Math.min(255, v + 20));
      p.fog = p.fog.map((v) => Math.min(255, v + 25));
    } else if (style === "vivid") {
      p.accent = p.accent.map((v) => Math.min(255, Math.round(v * 1.15)));
      p.mid = p.mid.map((v) => Math.min(255, Math.round(v * 1.1)));
    } else if (style === "documentary") {
      p.skyTop = p.skyTop.map((v) => Math.round(v * 0.9));
      p.accent = p.accent.map((v) => Math.round(v * 0.85));
    }

    const shift = (hash(seed) - 0.5) * 18 + (colorBias || 0);
    Object.keys(p).forEach((k) => {
      p[k] = p[k].map((c, i) =>
        clamp(Math.round(c + shift * (i === 0 ? 1 : i === 2 ? -0.6 : 0.2)), 0, 255)
      );
    });
    return p;
  }

  function buildPlan() {
    const agent = agentProfile();
    const subjectsInfo = parseSubjects(state.prompt);
    const theme = detectTheme(state.prompt);
    const mood = detectMood(state.prompt);
    const title = extractTitle(state.prompt) || "Custom prompt";
    // Fold prompt text into seed so every unique prompt looks different
    let promptHash = state.seed >>> 0;
    const ptxt = String(state.prompt || "");
    for (let i = 0; i < ptxt.length; i++) {
      promptHash = Math.imul(promptHash ^ ptxt.charCodeAt(i), 0x9e3779b1) >>> 0;
    }
    const effectiveSeed = promptHash || state.seed;
    const palette = paletteFor(theme, state.style, effectiveSeed, agent.colorBias);
    const sceneCount =
      state.mode === "text2image" ? 1 : state.duration <= 6 ? 2 : state.duration <= 12 ? 3 : 4;
    const sceneDur = state.duration / sceneCount;
    const rng = mulberry32(effectiveSeed);

    const beatTemplates = {
      ocean: [
        ["Wide horizon", "Establishing shot over calm water"],
        ["Wave detail", "Closer motion across reflective surface"],
        ["Golden pullback", "Camera lifts as light softens"],
        ["Closing drift", "Slow drift toward the horizon line"],
      ],
      city: [
        ["Skyline reveal", "Neon towers emerge through rain haze"],
        ["Street glide", "Camera moves between glowing buildings"],
        ["Light trails", "Traffic streaks and reflections intensify"],
        ["Night settle", "City lights pulse into a final hold"],
      ],
      mountain: [
        ["Valley open", "Layered peaks fade through morning fog"],
        ["Ridge pass", "Camera glides above rocky silhouettes"],
        ["Light break", "Sun rays cut through cloud layers"],
        ["Wide rest", "Final expansive mountain hold"],
      ],
      space: [
        ["Star field", "Deep space opens with distant stars"],
        ["Nebula weave", "Color gas clouds swirl around camera"],
        ["Core glow", "Bright cosmic core intensifies"],
        ["Exit drift", "Camera drifts into quiet starlight"],
      ],
      forest: [
        ["Canopy entry", "Tall trees frame soft forest light"],
        ["Rain walk", "Gentle rain and leaf motion deepen"],
        ["Ray reveal", "Light shafts pierce the canopy"],
        ["Quiet close", "Forest settles into ambient calm"],
      ],
      desert: [
        ["Dune open", "Endless sand ridges under warm sky"],
        ["Heat glide", "Camera skims dune curves with haze"],
        ["Shadow stretch", "Long shadows sculpt the terrain"],
        ["Horizon hold", "Final wide desert silhouette"],
      ],
      park: [
        ["Path open", "Couple and dog enter a sunlit park path"],
        ["Walk cycle", "Subjects walk forward with natural motion"],
        ["Side pass", "Camera tracks beside the group"],
        ["Soft hold", "Final walking frame in warm light"],
      ],
      portrait: [
        ["Soft open", "Portrait lighting settles on subject"],
        ["Micro move", "Subtle camera push and catchlights"],
        ["Mood hold", "Background bokeh and tone lock in"],
        ["Final frame", "Clean portrait close"],
      ],
      product: [
        ["Hero reveal", "Product form emerges in clean light"],
        ["Orbit glide", "Camera circles with soft reflections"],
        ["Detail pass", "Surface highlights and edges pop"],
        ["Brand hold", "Final commercial composition"],
      ],
      abstract: [
        ["Form birth", "Soft shapes bloom from darkness"],
        ["Flow field", "Particles and ribbons weave motion"],
        ["Color bloom", "Palette expands into luminous forms"],
        ["Dissolve", "Scene dissolves into quiet glow"],
      ],
    };

    const beats = beatTemplates[theme] || beatTemplates.abstract;
    const scenes = [];
    for (let i = 0; i < sceneCount; i++) {
      const beat = beats[i % beats.length];
      const motion = agent.motion * (mood === "dramatic" ? 1.2 : mood === "calm" ? 0.75 : 1);
      scenes.push({
        index: i + 1,
        title: beat[0],
        description: beat[1],
        start: i * sceneDur,
        duration: sceneDur,
        camera: {
          pan: (rng() - 0.5) * 0.4 * motion,
          tilt: (rng() - 0.5) * 0.2 * motion,
          zoom: 1 + rng() * 0.22 * motion,
          roll: (rng() - 0.5) * 0.05 * motion,
        },
        energy: motion,
      });
    }

    const log = selectedAgents().map((a, i) => ({
      index: i + 1,
      title: a.name,
      description: `${a.tag} · ${a.desc}`,
      dur: "local",
    }));

    if (subjectsInfo.hasSubjects) {
      log.push({
        index: log.length + 1,
        title: "Subject parser",
        description: subjectsInfo.subjects.map((s) => s.type).join(", ") + " · action: " + subjectsInfo.action,
        dur: "on-device",
      });
    }

    if (state.refImage) {
      log.push({
        index: log.length + 1,
        title: "Reference image",
        description: `Using ${state.refImage.name} for color/motion guidance`,
        dur: "on-device",
      });
    }
    if (state.faceImage) {
      log.push({
        index: log.length + 1,
        title: "Face layer",
        description: `Compositing ${state.faceImage.name} (local blend, not identity model)`,
        dur: "on-device",
      });
    }
    if (state.refVideo) {
      log.push({
        index: log.length + 1,
        title: "Reference video",
        description: `Sampling ${state.refVideo.name} for temporal texture`,
        dur: "on-device",
      });
    }

    state.agentLog = log;

    return {
      prompt: state.prompt,
      title,
      theme,
      mood,
      style: state.style,
      mode: state.mode,
      duration: state.duration,
      seed: effectiveSeed,
      palette,
      scenes,
      caption: title,
      agent,
      subjects: subjectsInfo.subjects,
      subjectMeta: subjectsInfo,
      effects: {
        grain: Math.max(agent.grain, state.style === "documentary" || state.style === "noir" ? 0.12 : 0.05),
        bloom: Math.max(agent.bloom, state.style === "dreamy" || state.style === "vivid" ? 0.3 : 0.16),
        vignette: state.style === "cinematic" || state.style === "noir" ? 0.45 : 0.28,
        rain: /rain|storm|wet/.test(state.prompt.toLowerCase()) || (theme === "city" && /night|neon/.test(state.prompt.toLowerCase())),
        stars: theme === "space" || /star|night/.test(state.prompt.toLowerCase()),
      },
    };
  }

  function rgb(a) {
    return `rgb(${a[0]},${a[1]},${a[2]})`;
  }

  function rgba(a, alpha) {
    return `rgba(${a[0]},${a[1]},${a[2]},${alpha})`;
  }

  function drawSky(ctx, w, h, plan, t) {
    const p = plan.palette;
    const g = ctx.createLinearGradient(0, 0, 0, h);
    const pulse = 0.5 + 0.5 * Math.sin(t * 0.35);
    g.addColorStop(0, rgb(p.skyTop));
    g.addColorStop(0.45, rgb(p.mid.map((c, i) => Math.round(lerp(c, p.skyBot[i], 0.35 + pulse * 0.1)))));
    g.addColorStop(1, rgb(p.skyBot));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    const sunX = w * (0.65 + 0.05 * Math.sin(t * 0.12));
    const sunY = h * (plan.theme === "space" ? 0.42 : 0.28 + 0.03 * Math.sin(t * 0.08));
    const sunR = Math.min(w, h) * (plan.theme === "space" ? 0.18 : 0.22);
    const sg = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, sunR);
    sg.addColorStop(0, rgba(p.accent, plan.theme === "space" ? 0.55 : 0.75));
    sg.addColorStop(0.35, rgba(p.accent, 0.22));
    sg.addColorStop(1, rgba(p.accent, 0));
    ctx.fillStyle = sg;
    ctx.fillRect(0, 0, w, h);
  }

  function drawClouds(ctx, w, h, plan, t, seed) {
    if (plan.theme === "space") return;
    for (let i = 0; i < 7; i++) {
      const n = hash(seed + i * 17);
      const x = ((n * w * 1.4 + t * (8 + i * 3)) % (w * 1.4)) - w * 0.2;
      const y = h * (0.08 + hash(seed + i * 31) * 0.28);
      const rw = w * (0.18 + hash(seed + i * 47) * 0.22);
      const rh = h * (0.04 + hash(seed + i * 59) * 0.05);
      const g = ctx.createRadialGradient(x, y, 0, x, y, rw);
      g.addColorStop(0, rgba(plan.palette.fog, 0.18));
      g.addColorStop(1, rgba(plan.palette.fog, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(x, y, rw, rh, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawMountains(ctx, w, h, plan, t, seed, layer) {
    const baseY = h * (0.55 + layer * 0.08);
    const amp = h * (0.16 - layer * 0.03);
    const detail = 4 + layer * 2;
    const color = plan.palette.ground.map((c, i) => Math.round(lerp(c, plan.palette.mid[i], 0.25 * layer)));
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let x = 0; x <= w; x += 6) {
      const nx = x / w;
      const y =
        baseY -
        fbm(nx * detail + t * 0.02 + layer, layer * 2.2, seed + layer * 90, 4) * amp * 2 +
        Math.sin(nx * Math.PI * (2 + layer) + t * 0.15) * amp * 0.15;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(w, h);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, baseY - amp, 0, h);
    g.addColorStop(0, rgba(color, 0.95 - layer * 0.15));
    g.addColorStop(1, rgba(plan.palette.ground, 1));
    ctx.fillStyle = g;
    ctx.fill();
  }

  function drawOcean(ctx, w, h, plan, t, seed) {
    const horizon = h * 0.52;
    const water = ctx.createLinearGradient(0, horizon, 0, h);
    water.addColorStop(0, rgba(plan.palette.mid, 0.95));
    water.addColorStop(1, rgb(plan.palette.ground));
    ctx.fillStyle = water;
    ctx.fillRect(0, horizon, w, h - horizon);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, horizon, w, h - horizon);
    ctx.clip();
    for (let i = 0; i < 18; i++) {
      const y = horizon + (i / 18) * (h - horizon);
      const amp = (1 - i / 18) * 10 + 2;
      ctx.beginPath();
      for (let x = 0; x <= w; x += 8) {
        const yy =
          y +
          Math.sin(x * 0.01 + t * (1.2 + i * 0.05) + i) * amp +
          fbm(x * 0.004, i * 0.2 + t * 0.1, seed, 2) * amp * 0.8;
        if (x === 0) ctx.moveTo(x, yy);
        else ctx.lineTo(x, yy);
      }
      ctx.strokeStyle = rgba(plan.palette.fog, 0.05 + (1 - i / 18) * 0.08);
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
    const rx = w * 0.65;
    const rg = ctx.createLinearGradient(rx, horizon, rx, h);
    rg.addColorStop(0, rgba(plan.palette.accent, 0.28));
    rg.addColorStop(1, rgba(plan.palette.accent, 0));
    ctx.fillStyle = rg;
    ctx.fillRect(rx - w * 0.08, horizon, w * 0.16, h - horizon);
    ctx.restore();
  }

  function drawCity(ctx, w, h, plan, t, seed) {
    const ground = h * 0.72;
    ctx.fillStyle = rgb(plan.palette.ground);
    ctx.fillRect(0, ground, w, h - ground);
    const street = ctx.createLinearGradient(0, ground, 0, h);
    street.addColorStop(0, rgba([20, 24, 40], 0.9));
    street.addColorStop(1, rgba(plan.palette.mid, 0.35));
    ctx.fillStyle = street;
    ctx.fillRect(0, ground, w, h - ground);

    for (let i = 0; i < 18; i++) {
      const n = hash(seed + i * 13);
      const bw = w * (0.04 + n * 0.07);
      const bh = h * (0.18 + hash(seed + i * 29) * 0.42);
      const x = (i / 18) * w * 1.1 - w * 0.05 + Math.sin(t * 0.1 + i) * 2;
      const y = ground - bh;
      ctx.fillStyle = rgba(plan.palette.skyTop.map((c) => Math.min(255, c + 18)), 0.95);
      ctx.fillRect(x, y, bw, bh);
      const cols = Math.max(2, Math.floor(bw / 10));
      const rows = Math.max(3, Math.floor(bh / 12));
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (hash(seed + i * 100 + r * 20 + c) <= 0.45) continue;
          const flicker = 0.65 + 0.35 * Math.sin(t * 2 + i + r * 0.3 + c);
          const isAccent = hash(seed + i + c * 7 + r) > 0.82;
          ctx.fillStyle = isAccent
            ? rgba(plan.palette.accent, 0.55 * flicker)
            : rgba([255, 210, 140], 0.28 * flicker);
          ctx.fillRect(
            x + 3 + c * (bw / cols),
            y + 4 + r * (bh / rows),
            Math.max(2, bw / cols - 4),
            Math.max(2, bh / rows - 5)
          );
        }
      }
    }
  }

  function drawForest(ctx, w, h, plan, t, seed) {
    const ground = h * 0.78;
    ctx.fillStyle = rgb(plan.palette.ground);
    ctx.fillRect(0, ground, w, h - ground);
    for (let i = 0; i < 22; i++) {
      const n = hash(seed + i * 19);
      const x = n * w;
      const treeH = h * (0.28 + hash(seed + i * 23) * 0.4);
      const sway = Math.sin(t * 0.8 + i) * 4;
      ctx.strokeStyle = rgba([30, 50, 35], 0.9);
      ctx.lineWidth = 4 + hash(seed + i) * 6;
      ctx.beginPath();
      ctx.moveTo(x, ground);
      ctx.quadraticCurveTo(x + sway, ground - treeH * 0.5, x + sway * 0.4, ground - treeH);
      ctx.stroke();
      const canopyY = ground - treeH;
      const canopyR = 18 + hash(seed + i * 11) * 34;
      const cg = ctx.createRadialGradient(x + sway * 0.4, canopyY, 0, x + sway * 0.4, canopyY, canopyR);
      cg.addColorStop(0, rgba(plan.palette.accent, 0.35));
      cg.addColorStop(0.5, rgba(plan.palette.mid, 0.55));
      cg.addColorStop(1, rgba(plan.palette.ground, 0));
      ctx.fillStyle = cg;
      ctx.beginPath();
      ctx.arc(x + sway * 0.4, canopyY, canopyR, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawDesert(ctx, w, h, plan, t, seed) {
    const base = h * 0.55;
    for (let layer = 0; layer < 4; layer++) {
      ctx.beginPath();
      ctx.moveTo(0, h);
      for (let x = 0; x <= w; x += 5) {
        const nx = x / w;
        const y =
          base +
          layer * h * 0.08 +
          Math.sin(nx * Math.PI * (1.5 + layer) + t * 0.1 + layer) * h * 0.04 +
          fbm(nx * 2.5 + layer, t * 0.03, seed + layer * 20, 3) * h * 0.08;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(w, h);
      ctx.closePath();
      const col = plan.palette.ground.map((c, i) => Math.round(lerp(c, plan.palette.accent[i], 0.15 * layer)));
      ctx.fillStyle = rgba(col, 0.95);
      ctx.fill();
    }
  }

  function drawSpace(ctx, w, h, plan, t, seed) {
    for (let i = 0; i < 8; i++) {
      const x = w * hash(seed + i * 3) + Math.sin(t * 0.15 + i) * 30;
      const y = h * hash(seed + i * 5) + Math.cos(t * 0.12 + i) * 20;
      const r = Math.min(w, h) * (0.15 + hash(seed + i * 7) * 0.25);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      const col = i % 2 === 0 ? plan.palette.mid : plan.palette.fog;
      g.addColorStop(0, rgba(col, 0.28));
      g.addColorStop(0.5, rgba(plan.palette.accent, 0.08));
      g.addColorStop(1, rgba(col, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    for (let i = 0; i < 120; i++) {
      const x = hash(seed + i * 11) * w;
      const y = hash(seed + i * 13) * h;
      const tw = 0.4 + 0.6 * Math.abs(Math.sin(t * (1 + hash(seed + i)) + i));
      const s = 0.6 + hash(seed + i * 17) * 1.8;
      ctx.fillStyle = rgba([255, 255, 255], 0.35 + tw * 0.55);
      ctx.fillRect(x, y, s, s);
    }
  }

  function drawPortraitStudio(ctx, w, h, plan, t) {
    const g = ctx.createRadialGradient(w * 0.5, h * 0.35, 0, w * 0.5, h * 0.45, Math.max(w, h) * 0.55);
    g.addColorStop(0, rgba(plan.palette.accent, 0.25));
    g.addColorStop(0.45, rgba(plan.palette.mid, 0.35));
    g.addColorStop(1, rgb(plan.palette.ground));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    // soft bokeh
    for (let i = 0; i < 16; i++) {
      const x = hash(plan.seed + i * 3) * w;
      const y = hash(plan.seed + i * 5) * h;
      const r = 8 + hash(plan.seed + i * 7) * 28;
      const bg = ctx.createRadialGradient(x, y, 0, x, y, r);
      bg.addColorStop(0, rgba(plan.palette.fog, 0.18));
      bg.addColorStop(1, rgba(plan.palette.fog, 0));
      ctx.fillStyle = bg;
      ctx.beginPath();
      ctx.arc(x + Math.sin(t + i) * 4, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawProduct(ctx, w, h, plan, t) {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, rgb(plan.palette.skyTop));
    g.addColorStop(1, rgb(plan.palette.ground));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    // pedestal
    const cx = w * 0.5;
    const cy = h * 0.62;
    const rw = w * 0.22;
    const rh = h * 0.05;
    ctx.fillStyle = rgba(plan.palette.mid, 0.35);
    ctx.beginPath();
    ctx.ellipse(cx, cy + h * 0.08, rw, rh, 0, 0, Math.PI * 2);
    ctx.fill();
    // hero orb / product proxy
    const r = Math.min(w, h) * 0.16;
    const og = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.4, r * 0.1, cx, cy, r);
    og.addColorStop(0, rgba(plan.palette.accent, 0.95));
    og.addColorStop(0.55, rgba(plan.palette.mid, 0.9));
    og.addColorStop(1, rgba(plan.palette.ground, 1));
    ctx.fillStyle = og;
    ctx.beginPath();
    ctx.arc(cx + Math.sin(t * 0.6) * 4, cy + Math.cos(t * 0.5) * 2, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = rgba(plan.palette.fog, 0.35);
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  function drawAbstract(ctx, w, h, plan, t, seed) {
    for (let i = 0; i < 12; i++) {
      const x = w * (0.2 + 0.6 * hash(seed + i)) + Math.sin(t * 0.4 + i) * 40;
      const y = h * (0.2 + 0.6 * hash(seed + i * 3)) + Math.cos(t * 0.35 + i) * 30;
      const r = Math.min(w, h) * (0.08 + hash(seed + i * 5) * 0.16);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, rgba(i % 2 ? plan.palette.accent : plan.palette.fog, 0.4));
      g.addColorStop(1, rgba(plan.palette.mid, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawCoverImage(ctx, w, h, img, t, mode) {
    if (!img) return false;
    const iw = img.naturalWidth || img.videoWidth || img.width;
    const ih = img.naturalHeight || img.videoHeight || img.height;
    if (!iw || !ih) return false;
    const scale = Math.max(w / iw, h / ih) * (mode === "kenburns" ? 1.12 + 0.04 * Math.sin(t * 0.2) : 1.05);
    const dw = iw * scale;
    const dh = ih * scale;
    const dx = (w - dw) / 2 + Math.sin(t * 0.15) * w * 0.02;
    const dy = (h - dh) / 2 + Math.cos(t * 0.12) * h * 0.015;
    ctx.drawImage(img, dx, dy, dw, dh);
    return true;
  }

  function drawFaceComposite(ctx, w, h, plan, t) {
    if (!state.faceImage || !state.faceImage.img) return;
    const img = state.faceImage.img;
    const size = Math.min(w, h) * state.faceScale;
    const cx = w * state.faceX + Math.sin(t * 0.4) * 2;
    const cy = h * state.faceY + Math.cos(t * 0.35) * 1.5;
    const x = cx - size / 2;
    const y = cy - size / 2;

    // soft oval mask
    ctx.save();
    ctx.globalAlpha = state.faceStrength;
    ctx.beginPath();
    ctx.ellipse(cx, cy, size * 0.42, size * 0.52, 0, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();

    if (state.blendMode === "soft") ctx.globalCompositeOperation = "source-over";
    else if (state.blendMode === "screen") ctx.globalCompositeOperation = "screen";
    else if (state.blendMode === "overlay") ctx.globalCompositeOperation = "overlay";
    else ctx.globalCompositeOperation = "soft-light";

    // cover-draw face into oval
    const iw = img.naturalWidth || img.width;
    const ih = img.naturalHeight || img.height;
    const scale = Math.max(size / iw, size / ih) * 1.15;
    const dw = iw * scale;
    const dh = ih * scale;
    ctx.drawImage(img, cx - dw / 2, cy - dh / 2, dw, dh);

    // tone match wash
    ctx.globalCompositeOperation = "source-atop";
    const wash = ctx.createRadialGradient(cx, cy, size * 0.1, cx, cy, size * 0.55);
    wash.addColorStop(0, rgba(plan.palette.accent, 0.08));
    wash.addColorStop(1, rgba(plan.palette.mid, 0.18));
    ctx.fillStyle = wash;
    ctx.fillRect(x - 20, y - 20, size + 40, size + 40);
    ctx.restore();

    // edge softness ring
    ctx.save();
    ctx.globalAlpha = state.faceStrength * 0.55;
    const ring = ctx.createRadialGradient(cx, cy, size * 0.28, cx, cy, size * 0.55);
    ring.addColorStop(0, "rgba(0,0,0,0)");
    ring.addColorStop(1, rgba(plan.palette.ground, 0.35));
    ctx.fillStyle = ring;
    ctx.beginPath();
    ctx.ellipse(cx, cy, size * 0.55, size * 0.65, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawRain(ctx, w, h, t, seed) {
    ctx.strokeStyle = "rgba(200,220,255,0.22)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 90; i++) {
      const x = ((hash(seed + i) * w + t * (180 + hash(seed + i * 3) * 120)) % (w + 20)) - 10;
      const y = ((hash(seed + i * 5) * h + t * (350 + hash(seed + i * 7) * 200)) % (h + 30)) - 15;
      const len = 8 + hash(seed + i * 9) * 14;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - 2, y + len);
      ctx.stroke();
    }
  }

  function drawVignette(ctx, w, h, amount) {
    const g = ctx.createRadialGradient(
      w / 2,
      h / 2,
      Math.min(w, h) * 0.2,
      w / 2,
      h / 2,
      Math.max(w, h) * 0.72
    );
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, `rgba(0,0,0,${amount})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  function drawGrain(ctx, w, h, t, amount, seed) {
    if (amount <= 0) return;
    const rng = mulberry32((seed + Math.floor(t * 30)) >>> 0);
    ctx.fillStyle = `rgba(255,255,255,${amount * 0.35})`;
    for (let i = 0; i < 160; i++) ctx.fillRect(rng() * w, rng() * h, 1.2, 1.2);
    ctx.fillStyle = `rgba(0,0,0,${amount * 0.25})`;
    for (let i = 0; i < 100; i++) ctx.fillRect(rng() * w, rng() * h, 1.2, 1.2);
  }

  function drawCaption(ctx, w, h, plan, localT, scene) {
    const fadeIn = smoothstep(localT / 0.8);
    const fadeOut = smoothstep((scene.duration - localT) / 0.8);
    const alpha = Math.min(fadeIn, fadeOut) * 0.92;
    if (alpha <= 0.02) return;
    const title = plan.caption;
    const subjectsLabel = (plan.subjects && plan.subjects.length)
      ? plan.subjects.map((s) => s.type).join("+")
      : plan.theme;
    const sub = `${plan.agent.name} · ${subjectsLabel} · free local`;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    const boxW = Math.min(w * 0.78, 560);
    const boxH = 64;
    const bx = (w - boxW) / 2;
    const by = h * 0.78;
    roundRect(ctx, bx, by, boxW, boxH, 12);
    ctx.fill();
    ctx.fillStyle = "#f3f5fa";
    ctx.font = `600 ${Math.max(14, Math.floor(w * 0.022))}px Instrument Sans, system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(title, w / 2, by + 28, boxW - 24);
    ctx.fillStyle = "rgba(220,226,240,0.75)";
    ctx.font = `500 ${Math.max(10, Math.floor(w * 0.014))}px JetBrains Mono, monospace`;
    ctx.fillText(sub, w / 2, by + 48, boxW - 24);
    ctx.restore();
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function currentScene(plan, time) {
    for (let i = 0; i < plan.scenes.length; i++) {
      const s = plan.scenes[i];
      if (time >= s.start && time < s.start + s.duration) return s;
    }
    return plan.scenes[plan.scenes.length - 1];
  }

  function drawPark(ctx, w, h, plan, t, seed) {
    // sky
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, rgb(plan.palette.skyTop));
    g.addColorStop(0.55, rgb(plan.palette.skyBot));
    g.addColorStop(1, rgb(plan.palette.ground));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // sun
    const sunX = w * 0.78;
    const sunY = h * 0.18;
    const sg = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, Math.min(w, h) * 0.18);
    sg.addColorStop(0, rgba(plan.palette.accent, 0.85));
    sg.addColorStop(1, rgba(plan.palette.accent, 0));
    ctx.fillStyle = sg;
    ctx.fillRect(0, 0, w, h);

    // distant trees
    for (let i = 0; i < 14; i++) {
      const x = (i / 14) * w + Math.sin(t * 0.2 + i) * 2;
      const treeH = h * (0.16 + hash(seed + i * 9) * 0.12);
      const base = h * 0.58;
      ctx.fillStyle = rgba([40, 80, 50], 0.85);
      ctx.fillRect(x, base - treeH, 6, treeH);
      ctx.beginPath();
      ctx.fillStyle = rgba([50, 120, 70], 0.9);
      ctx.arc(x + 3, base - treeH, 16 + hash(seed + i) * 14, 0, Math.PI * 2);
      ctx.fill();
    }

    // grass field
    const grass = ctx.createLinearGradient(0, h * 0.55, 0, h);
    grass.addColorStop(0, rgba([90, 150, 80], 0.95));
    grass.addColorStop(1, rgba([40, 90, 50], 1));
    ctx.fillStyle = grass;
    ctx.fillRect(0, h * 0.55, w, h * 0.45);

    // path
    ctx.beginPath();
    ctx.moveTo(w * 0.28, h);
    ctx.quadraticCurveTo(w * 0.42, h * 0.72, w * 0.48, h * 0.58);
    ctx.quadraticCurveTo(w * 0.55, h * 0.72, w * 0.72, h);
    ctx.closePath();
    ctx.fillStyle = rgba([170, 150, 120], 0.95);
    ctx.fill();
    ctx.strokeStyle = rgba([140, 120, 90], 0.5);
    ctx.lineWidth = 2;
    ctx.stroke();

    // path dashes
    for (let i = 0; i < 8; i++) {
      const yy = h * (0.62 + i * 0.045);
      const xx = w * (0.49 + Math.sin(i + t * 0.2) * 0.01);
      ctx.fillStyle = rgba([210, 190, 150], 0.55);
      ctx.fillRect(xx - 8, yy, 16 - i, 4);
    }
  }

  function limb(ctx, x1, y1, x2, y2, width, color) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  function drawPersonFigure(ctx, x, groundY, scale, t, phase, colors) {
    const s = scale;
    const bob = Math.sin(t * 6 + phase) * 3 * s;
    const swing = Math.sin(t * 6 + phase) * 12 * s;
    const bodyColor = colors.body;
    const skin = colors.skin;
    const pants = colors.pants;

    const hipY = groundY - 46 * s + bob;
    const shoulderY = groundY - 88 * s + bob;
    const headY = groundY - 112 * s + bob;
    const headR = 12 * s;

    // legs
    limb(ctx, x, hipY, x - 10 * s - swing * 0.15, groundY - 2, 6 * s, pants);
    limb(ctx, x, hipY, x + 10 * s + swing * 0.15, groundY - 2, 6 * s, pants);
    // body
    limb(ctx, x, hipY, x, shoulderY, 10 * s, bodyColor);
    // arms
    limb(ctx, x, shoulderY + 6 * s, x - 16 * s + swing * 0.2, shoulderY + 34 * s, 5 * s, bodyColor);
    limb(ctx, x, shoulderY + 6 * s, x + 16 * s - swing * 0.2, shoulderY + 34 * s, 5 * s, bodyColor);
    // head
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.arc(x, headY, headR, 0, Math.PI * 2);
    ctx.fill();
    // hair
    ctx.fillStyle = colors.hair;
    ctx.beginPath();
    ctx.arc(x, headY - 2 * s, headR * 0.95, Math.PI * 1.05, Math.PI * 1.95);
    ctx.fill();
  }

  function drawDogFigure(ctx, x, groundY, scale, t, phase, color) {
    const s = scale;
    const bob = Math.abs(Math.sin(t * 8 + phase)) * 2 * s;
    const bodyY = groundY - 18 * s - bob;
    const legSwing = Math.sin(t * 8 + phase) * 6 * s;

    ctx.fillStyle = color;
    // body
    ctx.beginPath();
    ctx.ellipse(x, bodyY, 22 * s, 10 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    // head
    ctx.beginPath();
    ctx.ellipse(x + 22 * s, bodyY - 4 * s, 10 * s, 8 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    // ear
    ctx.beginPath();
    ctx.ellipse(x + 18 * s, bodyY - 10 * s, 4 * s, 7 * s, -0.4, 0, Math.PI * 2);
    ctx.fill();
    // snout
    ctx.fillStyle = rgba([40, 30, 25], 0.9);
    ctx.beginPath();
    ctx.ellipse(x + 30 * s, bodyY - 2 * s, 5 * s, 3.5 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    // legs
    ctx.strokeStyle = color;
    ctx.lineWidth = 3.5 * s;
    ctx.lineCap = "round";
    const legs = [
      [x - 12 * s, bodyY + 6 * s, x - 14 * s - legSwing * 0.2, groundY],
      [x - 2 * s, bodyY + 6 * s, x - 1 * s + legSwing * 0.2, groundY],
      [x + 8 * s, bodyY + 6 * s, x + 7 * s - legSwing * 0.15, groundY],
      [x + 16 * s, bodyY + 6 * s, x + 18 * s + legSwing * 0.15, groundY],
    ];
    legs.forEach(([x1, y1, x2, y2]) => {
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    });
    // tail
    ctx.beginPath();
    ctx.moveTo(x - 20 * s, bodyY - 2 * s);
    ctx.quadraticCurveTo(x - 30 * s, bodyY - 14 * s - Math.sin(t * 10 + phase) * 4 * s, x - 24 * s, bodyY - 8 * s);
    ctx.stroke();
  }

  function drawCatFigure(ctx, x, groundY, scale, t, phase, color) {
    const s = scale;
    const bob = Math.abs(Math.sin(t * 7 + phase)) * 1.5 * s;
    const bodyY = groundY - 14 * s - bob;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(x, bodyY, 16 * s, 8 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x + 16 * s, bodyY - 4 * s, 7 * s, 0, Math.PI * 2);
    ctx.fill();
    // ears
    ctx.beginPath();
    ctx.moveTo(x + 12 * s, bodyY - 8 * s);
    ctx.lineTo(x + 10 * s, bodyY - 16 * s);
    ctx.lineTo(x + 16 * s, bodyY - 9 * s);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x + 18 * s, bodyY - 8 * s);
    ctx.lineTo(x + 22 * s, bodyY - 16 * s);
    ctx.lineTo(x + 24 * s, bodyY - 8 * s);
    ctx.fill();
    // legs + tail
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.8 * s;
    ctx.lineCap = "round";
    const swing = Math.sin(t * 8 + phase) * 4 * s;
    [[x - 8 * s, x - 9 * s - swing], [x - 1 * s, x], [x + 6 * s, x + 5 * s + swing], [x + 11 * s, x + 12 * s - swing]].forEach(([x1, x2]) => {
      ctx.beginPath();
      ctx.moveTo(x1, bodyY + 5 * s);
      ctx.lineTo(x2, groundY);
      ctx.stroke();
    });
    ctx.beginPath();
    ctx.moveTo(x - 14 * s, bodyY);
    ctx.quadraticCurveTo(x - 24 * s, bodyY - 12 * s, x - 18 * s, bodyY - 18 * s + Math.sin(t * 6) * 3 * s);
    ctx.stroke();
  }

  function drawRobotFigure(ctx, x, groundY, scale, t, phase, color) {
    const s = scale;
    const bob = Math.sin(t * 5 + phase) * 2 * s;
    ctx.fillStyle = color;
    ctx.fillRect(x - 12 * s, groundY - 70 * s + bob, 24 * s, 40 * s);
    ctx.fillRect(x - 10 * s, groundY - 90 * s + bob, 20 * s, 16 * s);
    ctx.fillStyle = rgba([120, 220, 255], 0.9);
    ctx.fillRect(x - 6 * s, groundY - 86 * s + bob, 12 * s, 6 * s);
    ctx.strokeStyle = color;
    ctx.lineWidth = 5 * s;
    const swing = Math.sin(t * 5 + phase) * 8 * s;
    ctx.beginPath();
    ctx.moveTo(x - 12 * s, groundY - 60 * s + bob);
    ctx.lineTo(x - 22 * s, groundY - 40 * s + bob + swing);
    ctx.moveTo(x + 12 * s, groundY - 60 * s + bob);
    ctx.lineTo(x + 22 * s, groundY - 40 * s + bob - swing);
    ctx.moveTo(x - 6 * s, groundY - 30 * s + bob);
    ctx.lineTo(x - 8 * s - swing * 0.2, groundY);
    ctx.moveTo(x + 6 * s, groundY - 30 * s + bob);
    ctx.lineTo(x + 8 * s + swing * 0.2, groundY);
    ctx.stroke();
  }

  function drawCarFigure(ctx, x, groundY, scale, t, color) {
    const s = scale;
    const y = groundY - 18 * s;
    ctx.fillStyle = color;
    ctx.fillRect(x - 40 * s, y - 10 * s, 80 * s, 18 * s);
    ctx.fillRect(x - 22 * s, y - 26 * s, 44 * s, 16 * s);
    ctx.fillStyle = rgba([180, 220, 255], 0.8);
    ctx.fillRect(x - 16 * s, y - 24 * s, 32 * s, 10 * s);
    ctx.fillStyle = "#222";
    ctx.beginPath();
    ctx.arc(x - 24 * s, y + 8 * s, 8 * s, 0, Math.PI * 2);
    ctx.arc(x + 24 * s, y + 8 * s, 8 * s, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawSubjects(ctx, w, h, plan, t) {
    const subjects = plan.subjects || [];
    if (!subjects.length) return;
    const groundY = h * (plan.theme === "park" || plan.theme === "forest" || plan.theme === "desert" || plan.theme === "mountain" ? 0.78 : 0.82);
    // group walks across frame
    const progress = (t * 0.08) % 1.4;
    const baseX = w * (-0.15 + progress);
    const palette = plan.palette;
    const personColors = [
      { body: rgb([40, 90, 160]), pants: rgb([40, 45, 60]), skin: rgb([230, 190, 160]), hair: rgb([40, 30, 25]) },
      { body: rgb([180, 70, 90]), pants: rgb([50, 45, 55]), skin: rgb([235, 195, 165]), hair: rgb([70, 45, 30]) },
      { body: rgb([50, 130, 100]), pants: rgb([45, 50, 55]), skin: rgb([225, 185, 155]), hair: rgb([30, 30, 35]) },
    ];
    let personIdx = 0;
    let petIdx = 0;
    subjects.forEach((sub, i) => {
      const spacing = 54 + i * 8;
      let x = baseX + i * spacing;
      // keep visible-ish by wrapping a bit
      if (x > w + 80) x = ((x + 80) % (w + 160)) - 80;
      const phase = i * 1.3;
      const sc = (sub.scale || 1) * Math.min(w, h) / 720;
      if (sub.type === "person") {
        drawPersonFigure(ctx, x, groundY, sc * 1.15, t, phase, personColors[personIdx % personColors.length]);
        personIdx += 1;
      } else if (sub.type === "dog") {
        drawDogFigure(ctx, x + 10, groundY, sc * 1.2, t, phase, rgb([160, 110, 70]));
        petIdx += 1;
      } else if (sub.type === "cat") {
        drawCatFigure(ctx, x + 8, groundY, sc * 1.2, t, phase, rgb([200, 140, 80]));
      } else if (sub.type === "robot") {
        drawRobotFigure(ctx, x, groundY, sc * 1.1, t, phase, rgb(palette.mid));
      } else if (sub.type === "car") {
        drawCarFigure(ctx, x, groundY, sc, t, rgb(palette.accent));
      } else if (sub.type === "horse") {
        // simple horse proxy using stretched dog-like body + taller legs
        drawDogFigure(ctx, x, groundY, sc * 1.7, t, phase, rgb([120, 85, 55]));
      } else if (sub.type === "bird") {
        const by = groundY - 90 - Math.sin(t * 3 + i) * 10;
        ctx.fillStyle = rgb(palette.accent);
        ctx.beginPath();
        ctx.ellipse(x, by, 10, 4, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(x - 4, by);
        ctx.lineTo(x + 2, by - 10 - Math.sin(t * 10) * 4);
        ctx.lineTo(x + 8, by);
        ctx.fill();
      }
    });

    // leash for person+dog
    const hasPerson = subjects.some((s) => s.type === "person");
    const hasDog = subjects.some((s) => s.type === "dog");
    if (hasPerson && hasDog) {
      ctx.strokeStyle = rgba([40, 30, 20], 0.7);
      ctx.lineWidth = 2;
      ctx.beginPath();
      const px = baseX + 20;
      const dx = baseX + 70;
      ctx.moveTo(px + 16, groundY - 55);
      ctx.quadraticCurveTo((px + dx) / 2, groundY - 70, dx + 20, groundY - 22);
      ctx.stroke();
    }
  }

  function drawThemeScene(ctx, w, h, plan, t) {
    drawSky(ctx, w, h, plan, t);
    drawClouds(ctx, w, h, plan, t, plan.seed);
    switch (plan.theme) {
      case "ocean":
        drawMountains(ctx, w, h, plan, t, plan.seed, 0);
        drawOcean(ctx, w, h, plan, t, plan.seed);
        break;
      case "city":
        drawCity(ctx, w, h, plan, t, plan.seed);
        break;
      case "mountain":
        drawMountains(ctx, w, h, plan, t, plan.seed + 1, 0);
        drawMountains(ctx, w, h, plan, t, plan.seed + 2, 1);
        drawMountains(ctx, w, h, plan, t, plan.seed + 3, 2);
        break;
      case "forest":
        drawForest(ctx, w, h, plan, t, plan.seed);
        break;
      case "desert":
        drawDesert(ctx, w, h, plan, t, plan.seed);
        break;
      case "space":
        drawSpace(ctx, w, h, plan, t, plan.seed);
        break;
      case "portrait":
        drawPortraitStudio(ctx, w, h, plan, t);
        break;
      case "product":
        drawProduct(ctx, w, h, plan, t);
        break;
      case "park":
        drawPark(ctx, w, h, plan, t, plan.seed);
        break;
      default:
        drawAbstract(ctx, w, h, plan, t, plan.seed);
        break;
    }
    // Always overlay parsed subjects (people/animals/etc.)
    drawSubjects(ctx, w, h, plan, t);
  }

  function renderFrame(ctx, w, h, plan, time) {
    const scene = currentScene(plan, time);
    const localT = time - scene.start;
    const u = scene.duration > 0 ? localT / scene.duration : 0;
    const cam = scene.camera;
    const zoom = lerp(1, cam.zoom, smoothstep(u));
    const panX = cam.pan * u * w * 0.15;
    const panY = cam.tilt * u * h * 0.12;
    const t = time * scene.energy;

    ctx.save();
    ctx.clearRect(0, 0, w, h);
    ctx.translate(w / 2 + panX, h / 2 + panY);
    ctx.rotate(cam.roll * u);
    ctx.scale(zoom, zoom);
    ctx.translate(-w / 2, -h / 2);

    // base layer by mode
    let usedRef = false;
    if ((plan.mode === "image2video" || plan.mode === "faceswap") && state.refImage) {
      usedRef = drawCoverImage(ctx, w, h, state.refImage.img, t, "kenburns");
      // color grade overlay from plan palette
      ctx.fillStyle = rgba(plan.palette.mid, 0.12);
      ctx.fillRect(0, 0, w, h);
    } else if (plan.mode === "refvideo" && state.refVideo && state.refVideo.video) {
      const v = state.refVideo.video;
      if (v.readyState >= 2) {
        try {
          const dur = v.duration && isFinite(v.duration) ? v.duration : state.duration;
          v.currentTime = Math.min(Math.max(0, time % Math.max(dur, 0.1)), Math.max(dur - 0.05, 0));
        } catch (_) {
          /* seeking may throw while loading */
        }
        usedRef = drawCoverImage(ctx, w, h, v, t, "kenburns");
        ctx.fillStyle = rgba(plan.palette.skyTop, 0.18);
        ctx.fillRect(0, 0, w, h);
      }
    }

    if (!usedRef) {
      drawThemeScene(ctx, w, h, plan, t);
    } else if (plan.mode === "refvideo") {
      // mild generative overlay on top of video ref
      ctx.globalAlpha = 0.22;
      drawAbstract(ctx, w, h, plan, t, plan.seed);
      ctx.globalAlpha = 1;
    } else if (plan.mode === "image2video") {
      // motion particles over still
      ctx.globalAlpha = 0.2;
      drawAbstract(ctx, w, h, plan, t, plan.seed + 3);
      ctx.globalAlpha = 1;
    }

    // subjects over reference media too
    if (usedRef && plan.subjects && plan.subjects.length) {
      drawSubjects(ctx, w, h, plan, t);
    }

    // face composite for faceswap / optional overlay
    if (plan.mode === "faceswap" || (state.faceImage && plan.mode !== "text2image")) {
      drawFaceComposite(ctx, w, h, plan, t);
    }

    if (plan.effects.rain) drawRain(ctx, w, h, t, plan.seed + 99);
    if (plan.effects.stars && plan.theme !== "space") {
      for (let i = 0; i < 40; i++) {
        const x = hash(plan.seed + i * 51) * w;
        const y = hash(plan.seed + i * 53) * h * 0.45;
        ctx.fillStyle = rgba([255, 255, 255], 0.25 + 0.5 * Math.abs(Math.sin(t + i)));
        ctx.fillRect(x, y, 1.4, 1.4);
      }
    }

    if (plan.effects.bloom > 0) {
      const g = ctx.createRadialGradient(w * 0.6, h * 0.3, 0, w * 0.6, h * 0.3, Math.max(w, h) * 0.5);
      g.addColorStop(0, rgba(plan.palette.accent, plan.effects.bloom * 0.2));
      g.addColorStop(1, rgba(plan.palette.accent, 0));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }

    ctx.restore();

    drawVignette(ctx, w, h, plan.effects.vignette);
    drawGrain(ctx, w, h, time, plan.effects.grain, plan.seed);
    if (plan.mode !== "text2image") drawCaption(ctx, w, h, plan, localT, scene);

    if (plan.style === "cinematic" || plan.style === "noir") {
      const bar = h * 0.07;
      ctx.fillStyle = "rgba(0,0,0,0.85)";
      ctx.fillRect(0, 0, w, bar);
      ctx.fillRect(0, h - bar, w, bar);
    }
  }

  function getAspect() {
    return ASPECTS.find((a) => a.id === state.aspect) || ASPECTS[0];
  }

  function qualityScale() {
    if (state.quality === "draft") return 0.65;
    if (state.quality === "high") return 1;
    return 0.85;
  }

  function ensurePlan() {
    state.plan = buildPlan();
    renderSceneList();
    renderAgentLog();
    updateMeta();
    updateModeUI();
  }

  function toast(msg) {
    const el = document.getElementById("toast");
    if (!el) return;
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove("show"), 2800);
  }

  function setStatus(text, progress) {
    state.status = text;
    if (typeof progress === "number") state.progress = clamp(progress, 0, 100);
    if (els.statusText) els.statusText.textContent = state.status;
    if (els.progressBar) els.progressBar.style.width = `${state.progress}%`;
    if (els.progressPct) els.progressPct.textContent = `${Math.round(state.progress)}%`;
  }

  function updateMeta() {
    if (!state.plan) return;
    const a = getAspect();
    if (els.metaTheme) els.metaTheme.textContent = state.plan.theme;
    if (els.metaMood) els.metaMood.textContent = state.plan.agent.name.split(" ")[0];
    if (els.metaRes)
      els.metaRes.textContent = `${Math.round(a.w * qualityScale())}×${Math.round(a.h * qualityScale())}`;
    if (els.metaDur)
      els.metaDur.textContent =
        state.mode === "text2image" ? "still image" : `${state.duration.toFixed(1)}s · ${state.fps}fps`;
  }

  function renderSceneList() {
    if (!els.sceneList || !state.plan) return;
    els.sceneList.innerHTML = state.plan.scenes
      .map(
        (s) => `
      <div class="scene-item">
        <div class="idx">${s.index}</div>
        <div>
          <div class="title">${escapeHtml(s.title)}</div>
          <div class="desc">${escapeHtml(s.description)}</div>
        </div>
        <div class="dur mono">${s.duration.toFixed(1)}s</div>
      </div>`
      )
      .join("");
  }

  function renderAgentLog() {
    if (!els.agentLog) return;
    els.agentLog.innerHTML = (state.agentLog || [])
      .map(
        (s) => `
      <div class="log-item">
        <div class="idx">${s.index}</div>
        <div>
          <div class="title">${escapeHtml(s.title)}</div>
          <div class="desc">${escapeHtml(s.description)}</div>
        </div>
        <div class="dur mono">${escapeHtml(s.dur)}</div>
      </div>`
      )
      .join("");
  }

  function updateModeUI() {
    if (!els.faceControls) return;
    const needsFace = state.mode === "faceswap";
    const needsRefImg = state.mode === "image2video" || state.mode === "faceswap";
    const needsRefVid = state.mode === "refvideo";
    els.faceControls.classList.toggle("hidden", !needsFace && !state.faceImage);
    if (els.refImageCard) els.refImageCard.classList.toggle("dim", !needsRefImg && state.mode !== "text2video");
    if (els.refVideoCard) els.refVideoCard.classList.toggle("dim", !needsRefVid);
    if (els.btnGenerate) {
      els.btnGenerate.textContent =
        state.mode === "text2image" ? "Generate image" : "Generate video";
    }
    if (els.btnDownload) {
      els.btnDownload.textContent =
        state.mode === "text2image" ? "Download PNG" : "Download WebM";
    }
  }

  function stopPreview() {
    state.isPreviewing = false;
    if (state.previewRaf) cancelAnimationFrame(state.previewRaf);
    state.previewRaf = 0;
    if (els.btnPreview) els.btnPreview.textContent = "Preview";
  }

  function startPreview() {
    if (!state.plan) ensurePlan();
    if (state.isRecording) return;
    if (state.mode === "text2image") {
      drawStill();
      toast("Image mode — use Generate image");
      return;
    }
    state.isPreviewing = true;
    if (els.btnPreview) els.btnPreview.textContent = "Stop preview";
    if (els.overlay) els.overlay.classList.add("hidden");
    setStatus("Previewing local multi-agent render…", 0);
    state.previewStart = performance.now();

    const canvas = els.canvas;
    const ctx = canvas.getContext("2d", { alpha: false });
    const a = getAspect();
    const scale = qualityScale();
    canvas.width = Math.round(a.w * scale);
    canvas.height = Math.round(a.h * scale);

    const loop = (now) => {
      if (!state.isPreviewing) return;
      const elapsed = ((now - state.previewStart) / 1000) % state.duration;
      renderFrame(ctx, canvas.width, canvas.height, state.plan, elapsed);
      setStatus(
        `Preview · ${elapsed.toFixed(1)}s / ${state.duration.toFixed(1)}s · ${state.plan.agent.name}`,
        (elapsed / state.duration) * 100
      );
      state.previewRaf = requestAnimationFrame(loop);
    };
    state.previewRaf = requestAnimationFrame(loop);
  }

  function pickMimeType() {
    const types = [
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm;codecs=vp9",
      "video/webm;codecs=vp8",
      "video/webm",
    ];
    for (const t of types) {
      if (window.MediaRecorder && MediaRecorder.isTypeSupported(t)) return t;
    }
    return "";
  }

  async function generateImage() {
    stopPreview();
    ensurePlan();
    const canvas = els.canvas;
    const ctx = canvas.getContext("2d", { alpha: false });
    const a = getAspect();
    const scale = qualityScale();
    canvas.width = Math.round(a.w * scale);
    canvas.height = Math.round(a.h * scale);
    if (els.overlay) els.overlay.classList.add("hidden");

    // multi-pass "agent" refinement simulation
    const passes = selectedAgents().length || 1;
    for (let i = 0; i < passes; i++) {
      setStatus(`Agent pass ${i + 1}/${passes}: ${selectedAgents()[i]?.name || "Lumen"}`, ((i + 1) / passes) * 80);
      renderFrame(ctx, canvas.width, canvas.height, state.plan, 0.35 + i * 0.07);
      await new Promise((r) => setTimeout(r, 120));
    }
    renderFrame(ctx, canvas.width, canvas.height, state.plan, 0.42);

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    state.imageBlob = blob;
    state.recordedBlob = null;
    if (els.btnDownload) els.btnDownload.disabled = !blob;
    setStatus(`Image ready from your prompt · ${((blob?.size || 0) / 1024).toFixed(0)} KB PNG`, 100);
    toast("Custom image generated");
  }

  async function generateVideo() {
    if (state.isRecording) return;
    if (!window.MediaRecorder) {
      toast("MediaRecorder is not supported in this browser.");
      return;
    }
    const mimeType = pickMimeType();
    if (!mimeType) {
      toast("No supported WebM encoder found in this browser.");
      return;
    }

    stopPreview();
    ensurePlan();
    state.isRecording = true;
    state.recordedBlob = null;
    state.imageBlob = null;
    if (els.btnGenerate) els.btnGenerate.disabled = true;
    if (els.btnDownload) els.btnDownload.disabled = true;
    if (els.btnPreview) els.btnPreview.disabled = true;
    if (els.overlay) els.overlay.classList.add("hidden");

    const canvas = els.canvas;
    const ctx = canvas.getContext("2d", { alpha: false });
    const a = getAspect();
    const scale = qualityScale();
    canvas.width = Math.round(a.w * scale);
    canvas.height = Math.round(a.h * scale);

    // agent planning status
    const agents = selectedAgents();
    for (let i = 0; i < agents.length; i++) {
      setStatus(`Routing ${agents[i].name}…`, ((i + 1) / (agents.length + 1)) * 12);
      await new Promise((r) => setTimeout(r, 90));
    }

    const stream = canvas.captureStream(state.fps);
    const chunks = [];
    let recorder;
    try {
      recorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond:
          state.quality === "high" ? 6_000_000 : state.quality === "draft" ? 1_500_000 : 3_500_000,
      });
    } catch (err) {
      state.isRecording = false;
      els.btnGenerate.disabled = false;
      els.btnPreview.disabled = false;
      toast("Could not start recorder: " + err.message);
      return;
    }

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };
    const done = new Promise((resolve) => {
      recorder.onstop = () => resolve();
    });

    recorder.start(100);
    setStatus("Generating video locally…", 12);

    const totalFrames = Math.max(1, Math.round(state.duration * state.fps));
    const frameDuration = 1000 / state.fps;

    for (let i = 0; i < totalFrames; i++) {
      const time = i / state.fps;
      renderFrame(ctx, canvas.width, canvas.height, state.plan, time);
      setStatus(
        `Rendering ${i + 1}/${totalFrames} · ${state.plan.agent.name}`,
        12 + ((i + 1) / totalFrames) * 88
      );
      await new Promise((r) => setTimeout(r, frameDuration * 0.85));
    }

    await new Promise((r) => setTimeout(r, 120));
    recorder.stop();
    stream.getTracks().forEach((tr) => tr.stop());
    await done;

    state.recordedBlob = new Blob(chunks, { type: mimeType.split(";")[0] });
    state.isRecording = false;
    if (els.btnGenerate) els.btnGenerate.disabled = false;
    if (els.btnPreview) els.btnPreview.disabled = false;
    if (els.btnDownload) els.btnDownload.disabled = !state.recordedBlob;
    renderFrame(ctx, canvas.width, canvas.height, state.plan, state.duration - 0.001);
    setStatus(`Video ready · ${(state.recordedBlob.size / 1024 / 1024).toFixed(2)} MB WebM`, 100);
    toast("Custom video generated — ready to download");
  }

  async function generate() {
    try {
      state.prompt = (els.prompt ? els.prompt.value : state.prompt).trim();
      if (!state.prompt) {
        toast("Enter a prompt first");
        if (els.prompt) els.prompt.focus();
        return;
      }
      // Fresh seed each generate so custom prompts don't look stuck
      state.seed = Math.floor(Math.random() * 1e9);
      if (els.seedValue) els.seedValue.textContent = String(state.seed);
      ensurePlan();
      if (state.mode === "text2image") await generateImage();
      else await generateVideo();
    } catch (err) {
      console.error(err);
      state.isRecording = false;
      if (els.btnGenerate) els.btnGenerate.disabled = false;
      if (els.btnPreview) els.btnPreview.disabled = false;
      setStatus("Generation failed", 0);
      toast(err.message || "Generation failed");
    }
  }

  function downloadOutput() {
    if (state.mode === "text2image") {
      if (!state.imageBlob) {
        toast("Generate an image first.");
        return;
      }
      const url = URL.createObjectURL(state.imageBlob);
      const a = document.createElement("a");
      const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      a.href = url;
      a.download = `lumen-image-${stamp}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      toast("PNG download started");
      return;
    }
    if (!state.recordedBlob) {
      toast("Generate a video first.");
      return;
    }
    const url = URL.createObjectURL(state.recordedBlob);
    const a = document.createElement("a");
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    a.href = url;
    a.download = `lumen-${state.plan?.theme || "video"}-${stamp}.webm`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    toast("WebM download started");
  }

  function randomizeSeed() {
    state.seed = Math.floor(Math.random() * 1e9);
    if (els.seedValue) els.seedValue.textContent = String(state.seed);
    ensurePlan();
    drawStill();
    toast("New seed applied");
  }

  function drawStill() {
    if (!state.plan) ensurePlan();
    const canvas = els.canvas;
    const ctx = canvas.getContext("2d", { alpha: false });
    const a = getAspect();
    const scale = qualityScale();
    canvas.width = Math.round(a.w * scale);
    canvas.height = Math.round(a.h * scale);
    renderFrame(ctx, canvas.width, canvas.height, state.plan, state.duration * 0.35);
    if (els.overlay) els.overlay.classList.add("hidden");
    setStatus("Scene ready — preview or generate", 0);
  }

  function revokeAsset(asset) {
    if (asset && asset.url) URL.revokeObjectURL(asset.url);
  }

  function loadImageFile(file, slot) {
    return new Promise((resolve, reject) => {
      if (!file || !file.type.startsWith("image/")) {
        reject(new Error("Please choose an image file"));
        return;
      }
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const prev = state[slot];
        revokeAsset(prev);
        state[slot] = { name: file.name, url, img, w: img.naturalWidth, h: img.naturalHeight };
        resolve(state[slot]);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Could not load image"));
      };
      img.src = url;
    });
  }

  function loadVideoFile(file) {
    return new Promise((resolve, reject) => {
      if (!file || !file.type.startsWith("video/")) {
        reject(new Error("Please choose a video file"));
        return;
      }
      const url = URL.createObjectURL(file);
      const video = document.createElement("video");
      video.preload = "auto";
      video.muted = true;
      video.playsInline = true;
      video.src = url;
      video.onloadeddata = () => {
        revokeAsset(state.refVideo);
        state.refVideo = {
          name: file.name,
          url,
          video,
          w: video.videoWidth,
          h: video.videoHeight,
          duration: video.duration,
        };
        resolve(state.refVideo);
      };
      video.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Could not load video"));
      };
    });
  }

  function renderUploadCards() {
    if (!els.uploadGrid) return;
    const refThumb = state.refImage
      ? `<img class="upload-thumb" src="${state.refImage.url}" alt="Reference">`
      : `<div class="upload-thumb video-thumb">No image</div>`;
    const faceThumb = state.faceImage
      ? `<img class="upload-thumb" src="${state.faceImage.url}" alt="Face">`
      : `<div class="upload-thumb video-thumb">No face</div>`;
    const vidThumb = state.refVideo
      ? `<div class="upload-thumb video-thumb">VIDEO<br>${escapeHtml(state.refVideo.name.slice(0, 18))}</div>`
      : `<div class="upload-thumb video-thumb">No video</div>`;

    els.uploadGrid.innerHTML = `
      <div class="upload-card ${state.refImage ? "has-file" : ""}" id="refImageCard">
        <div class="upload-head"><strong>Reference image</strong><span>image→video / base plate</span></div>
        <div class="upload-preview">
          ${refThumb}
          <div>
            <div class="desc" style="color:var(--muted);font-size:0.72rem;margin-bottom:0.4rem">${
              state.refImage ? escapeHtml(state.refImage.name) : "PNG/JPG/WebP"
            }</div>
            <button class="drop-btn" type="button" id="btnRefImage">Upload image</button>
            <input class="file-input" id="inputRefImage" type="file" accept="image/*" />
          </div>
        </div>
      </div>
      <div class="upload-card ${state.faceImage ? "has-file" : ""}">
        <div class="upload-head"><strong>Face / subject image</strong><span>face composite layer</span></div>
        <div class="upload-preview">
          ${faceThumb}
          <div>
            <div class="desc" style="color:var(--muted);font-size:0.72rem;margin-bottom:0.4rem">${
              state.faceImage ? escapeHtml(state.faceImage.name) : "Clear face photo works best"
            }</div>
            <button class="drop-btn" type="button" id="btnFaceImage">Upload face</button>
            <input class="file-input" id="inputFaceImage" type="file" accept="image/*" />
          </div>
        </div>
      </div>
      <div class="upload-card ${state.refVideo ? "has-file" : ""}" id="refVideoCard">
        <div class="upload-head"><strong>Reference video</strong><span>motion / texture guide</span></div>
        <div class="upload-preview">
          ${vidThumb}
          <div>
            <div class="desc" style="color:var(--muted);font-size:0.72rem;margin-bottom:0.4rem">${
              state.refVideo ? escapeHtml(state.refVideo.name) : "MP4/WebM (local only)"
            }</div>
            <button class="drop-btn" type="button" id="btnRefVideo">Upload video</button>
            <input class="file-input" id="inputRefVideo" type="file" accept="video/*" />
          </div>
        </div>
      </div>
    `;

    els.refImageCard = document.getElementById("refImageCard");
    els.refVideoCard = document.getElementById("refVideoCard");

    const bind = (btnId, inputId, handler) => {
      const btn = document.getElementById(btnId);
      const input = document.getElementById(inputId);
      btn.addEventListener("click", () => input.click());
      input.addEventListener("change", async () => {
        const file = input.files && input.files[0];
        if (!file) return;
        try {
          await handler(file);
          renderUploadCards();
          ensurePlan();
          drawStill();
          toast(`${file.name} loaded locally`);
        } catch (err) {
          toast(err.message || "Upload failed");
        }
      });
    };

    bind("btnRefImage", "inputRefImage", (f) => loadImageFile(f, "refImage"));
    bind("btnFaceImage", "inputFaceImage", (f) => loadImageFile(f, "faceImage"));
    bind("btnRefVideo", "inputRefVideo", (f) => loadVideoFile(f));
  }

  function bindUI() {
    const app = document.getElementById("app");
    app.innerHTML = `
      <div class="shell">
        <header class="topbar">
          <div class="brand">
            <div class="brand-mark" aria-hidden="true"></div>
            <div>
              <h1>Lumen Multi-Agent</h1>
              <p>Free local studio · text/image/video refs · face composite · no API keys</p>
            </div>
          </div>
          <div class="badge"><span class="badge-dot"></span> 100% on-device</div>
        </header>

        <main class="layout">
          <section class="panel">
            <div class="warn-note">
              <strong>Honest free limit:</strong> this app cannot unlock real Seedance, Grok, Sora, Runway, or Kling cloud models without their paid APIs.
              Instead you get free <em>local agent profiles</em> inspired by those looks, plus real uploads, image/video export, and on-device face compositing.
            </div>

            <h2>Mode</h2>
            <div class="mode-row" id="modes"></div>

            <h2 class="section-gap">Free local agents</h2>
            <div class="agent-row" id="agents"></div>
            <p class="hint">Select one or more. Profiles blend motion, color, grain, and bloom on-device.</p>

            <h2 class="section-gap">Prompt</h2>
            <div class="field">
              <label for="prompt">Describe the shot / transform</label>
              <textarea id="prompt" placeholder="Describe anything: a golden retriever surfing at sunset, a robot making coffee, anime girl in rain...">${escapeHtml(state.prompt)}</textarea>
            </div>

            <p class="hint" id="promptHint">Type any custom prompt, then click Generate. Output is built from your text + selected agents (no presets).</p>

            <h2>References</h2>
            <div class="upload-grid" id="uploadGrid"></div>

            <div class="face-controls hidden" id="faceControls">
              <strong style="font-size:0.8rem">Face composite controls</strong>
              <div class="range-wrap">
                <div class="range-meta"><span>Strength</span><span id="faceStrengthVal" class="mono">72%</span></div>
                <input id="faceStrength" type="range" min="10" max="100" step="1" value="72" />
              </div>
              <div class="range-wrap">
                <div class="range-meta"><span>Scale</span><span id="faceScaleVal" class="mono">34%</span></div>
                <input id="faceScale" type="range" min="15" max="70" step="1" value="34" />
              </div>
              <div class="controls-row">
                <div class="range-wrap">
                  <div class="range-meta"><span>X</span><span id="faceXVal" class="mono">50%</span></div>
                  <input id="faceX" type="range" min="15" max="85" step="1" value="50" />
                </div>
                <div class="range-wrap">
                  <div class="range-meta"><span>Y</span><span id="faceYVal" class="mono">38%</span></div>
                  <input id="faceY" type="range" min="15" max="85" step="1" value="38" />
                </div>
              </div>
              <div class="field" style="margin:0">
                <label for="blendMode">Blend mode</label>
                <select id="blendMode">
                  <option value="soft">Soft mask</option>
                  <option value="soft-light">Soft light</option>
                  <option value="overlay">Overlay</option>
                  <option value="screen">Screen</option>
                </select>
              </div>
              <p class="hint">Local oval composite + color wash — not a neural identity swap model.</p>
            </div>

            <div class="controls-row section-gap">
              <div class="field">
                <label for="style">Visual style</label>
                <select id="style"></select>
              </div>
              <div class="field">
                <label for="aspect">Aspect ratio</label>
                <select id="aspect"></select>
              </div>
            </div>

            <div class="controls-row">
              <div class="field">
                <div class="range-wrap">
                  <div class="range-meta"><span>Duration</span><span id="durationVal" class="mono">${state.duration}s</span></div>
                  <input id="duration" type="range" min="4" max="20" step="1" value="${state.duration}" />
                </div>
              </div>
              <div class="field">
                <div class="range-wrap">
                  <div class="range-meta"><span>Frame rate</span><span id="fpsVal" class="mono">${state.fps} fps</span></div>
                  <input id="fps" type="range" min="12" max="30" step="1" value="${state.fps}" />
                </div>
              </div>
            </div>

            <div class="controls-row">
              <div class="field">
                <label for="quality">Quality</label>
                <select id="quality">
                  <option value="draft">Draft (faster)</option>
                  <option value="standard" selected>Standard</option>
                  <option value="high">High</option>
                </select>
              </div>
              <div class="field">
                <label>Seed</label>
                <div class="btn-row" style="margin-top:0">
                  <button class="btn btn-secondary" id="btnSeed" type="button">Randomize</button>
                  <span class="mono" id="seedValue" style="align-self:center;color:var(--muted);font-size:0.72rem">${state.seed}</span>
                </div>
              </div>
            </div>

            <div class="btn-row">
              <button class="btn btn-primary" id="btnGenerate" type="button">Generate video</button>
              <button class="btn btn-secondary" id="btnPreview" type="button">Preview</button>
              <button class="btn btn-ghost" id="btnPlan" type="button">Plan</button>
              <button class="btn btn-secondary" id="btnDownload" type="button" disabled>Download WebM</button>
            </div>
            <p class="footer-note">Uploads never leave your browser. No accounts, tokens, credits, or cloud model calls.</p>
          </section>

          <section class="panel preview-shell">
            <h2>Preview</h2>
            <div class="stage">
              <canvas id="stageCanvas" width="1280" height="720" aria-label="Preview canvas"></canvas>
              <div class="stage-overlay" id="overlay">
                <div class="stage-overlay-card">
                  <strong>Multi-agent canvas</strong>
                  <span>Pick agents + mode, add optional image/video/face refs, then preview or export offline.</span>
                </div>
              </div>
            </div>

            <div class="status-line">
              <span id="statusText">${escapeHtml(state.status)}</span>
              <span id="progressPct" class="mono">0%</span>
            </div>
            <div class="progress" aria-hidden="true"><span id="progressBar"></span></div>

            <div class="meta-grid">
              <div class="meta-card"><div class="k">Theme</div><div class="v" id="metaTheme">—</div></div>
              <div class="meta-card"><div class="k">Agent</div><div class="v" id="metaMood">—</div></div>
              <div class="meta-card"><div class="k">Resolution</div><div class="v" id="metaRes">—</div></div>
              <div class="meta-card"><div class="k">Timeline</div><div class="v" id="metaDur">—</div></div>
            </div>

            <h2 style="margin-top:0.6rem">Agent pipeline</h2>
            <div class="agent-log" id="agentLog"></div>

            <h2 style="margin-top:0.6rem">Scene plan</h2>
            <div class="scene-list" id="sceneList"></div>
          </section>
        </main>
      </div>
      <div class="toast" id="toast" role="status" aria-live="polite"></div>
    `;

    els.prompt = document.getElementById("prompt");
    els.style = document.getElementById("style");
    els.aspect = document.getElementById("aspect");
    els.duration = document.getElementById("duration");
    els.fps = document.getElementById("fps");
    els.quality = document.getElementById("quality");
    els.durationVal = document.getElementById("durationVal");
    els.fpsVal = document.getElementById("fpsVal");
    els.seedValue = document.getElementById("seedValue");
    els.modes = document.getElementById("modes");
    els.agents = document.getElementById("agents");
    els.uploadGrid = document.getElementById("uploadGrid");
    els.faceControls = document.getElementById("faceControls");
    els.btnGenerate = document.getElementById("btnGenerate");
    els.btnPreview = document.getElementById("btnPreview");
    els.btnPlan = document.getElementById("btnPlan");
    els.btnDownload = document.getElementById("btnDownload");
    els.btnSeed = document.getElementById("btnSeed");
    els.canvas = document.getElementById("stageCanvas");
    els.overlay = document.getElementById("overlay");
    els.statusText = document.getElementById("statusText");
    els.progressBar = document.getElementById("progressBar");
    els.progressPct = document.getElementById("progressPct");
    els.sceneList = document.getElementById("sceneList");
    els.agentLog = document.getElementById("agentLog");
    els.metaTheme = document.getElementById("metaTheme");
    els.metaMood = document.getElementById("metaMood");
    els.metaRes = document.getElementById("metaRes");
    els.metaDur = document.getElementById("metaDur");

    // modes
    MODES.forEach((m) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "mode-chip" + (m.id === state.mode ? " active" : "");
      b.textContent = m.label;
      b.addEventListener("click", () => {
        state.mode = m.id;
        document.querySelectorAll(".mode-chip").forEach((c) => c.classList.remove("active"));
        b.classList.add("active");
        if (m.id === "faceswap") {
          els.faceControls.classList.remove("hidden");
        }
        ensurePlan();
        drawStill();
      });
      els.modes.appendChild(b);
    });

    // agents multi-select
    AGENTS.forEach((a) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "agent-chip" + (state.agents.includes(a.id) ? " active" : "");
      b.innerHTML = `<strong>${escapeHtml(a.name)}</strong><span>${escapeHtml(a.tag)}</span>`;
      b.addEventListener("click", () => {
        if (state.agents.includes(a.id)) {
          if (state.agents.length === 1) {
            toast("Keep at least one agent");
            return;
          }
          state.agents = state.agents.filter((id) => id !== a.id);
          b.classList.remove("active");
        } else {
          state.agents.push(a.id);
          b.classList.add("active");
        }
        ensurePlan();
        drawStill();
      });
      els.agents.appendChild(b);
    });

    STYLES.forEach((s) => {
      const opt = document.createElement("option");
      opt.value = s.id;
      opt.textContent = s.label;
      if (s.id === state.style) opt.selected = true;
      els.style.appendChild(opt);
    });

    ASPECTS.forEach((a) => {
      const opt = document.createElement("option");
      opt.value = a.id;
      opt.textContent = a.label;
      if (a.id === state.aspect) opt.selected = true;
      els.aspect.appendChild(opt);
    });


    renderUploadCards();

    // face controls
    const faceStrength = document.getElementById("faceStrength");
    const faceScale = document.getElementById("faceScale");
    const faceX = document.getElementById("faceX");
    const faceY = document.getElementById("faceY");
    const blendMode = document.getElementById("blendMode");
    const faceStrengthVal = document.getElementById("faceStrengthVal");
    const faceScaleVal = document.getElementById("faceScaleVal");
    const faceXVal = document.getElementById("faceXVal");
    const faceYVal = document.getElementById("faceYVal");

    faceStrength.addEventListener("input", () => {
      state.faceStrength = Number(faceStrength.value) / 100;
      faceStrengthVal.textContent = `${faceStrength.value}%`;
      drawStill();
    });
    faceScale.addEventListener("input", () => {
      state.faceScale = Number(faceScale.value) / 100;
      faceScaleVal.textContent = `${faceScale.value}%`;
      drawStill();
    });
    faceX.addEventListener("input", () => {
      state.faceX = Number(faceX.value) / 100;
      faceXVal.textContent = `${faceX.value}%`;
      drawStill();
    });
    faceY.addEventListener("input", () => {
      state.faceY = Number(faceY.value) / 100;
      faceYVal.textContent = `${faceY.value}%`;
      drawStill();
    });
    blendMode.addEventListener("change", () => {
      state.blendMode = blendMode.value;
      drawStill();
    });

    els.prompt.addEventListener("input", () => {
      state.prompt = els.prompt.value;
    });
    els.prompt.addEventListener("change", () => {
      state.prompt = els.prompt.value.trim();
      ensurePlan();
      drawStill();
    });
    els.style.addEventListener("change", () => {
      state.style = els.style.value;
      ensurePlan();
      drawStill();
    });
    els.aspect.addEventListener("change", () => {
      state.aspect = els.aspect.value;
      updateMeta();
      drawStill();
    });
    els.duration.addEventListener("input", () => {
      state.duration = Number(els.duration.value);
      els.durationVal.textContent = `${state.duration}s`;
      ensurePlan();
    });
    els.fps.addEventListener("input", () => {
      state.fps = Number(els.fps.value);
      els.fpsVal.textContent = `${state.fps} fps`;
      updateMeta();
    });
    els.quality.addEventListener("change", () => {
      state.quality = els.quality.value;
      updateMeta();
      drawStill();
    });

    els.btnPlan.addEventListener("click", () => {
      ensurePlan();
      drawStill();
      toast("Pipeline planned");
    });
    els.btnPreview.addEventListener("click", () => {
      if (state.isPreviewing) stopPreview();
      else startPreview();
    });
    els.btnGenerate.addEventListener("click", () => generate());
    els.btnDownload.addEventListener("click", downloadOutput);
    els.btnSeed.addEventListener("click", randomizeSeed);
  }

  document.addEventListener("DOMContentLoaded", () => {
    bindUI();
    ensurePlan();
    if (state.prompt.trim()) drawStill();
    else {
      setStatus("Enter a custom prompt, then Generate", 0);
      if (els.overlay) els.overlay.classList.remove("hidden");
    }
  });
})();
