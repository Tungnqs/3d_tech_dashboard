/* ------------------------------------------------------------------
   Tech Pulse 3D — application logic (vanilla JS, no dependencies)
   Sections: data · state · KPIs · sphere (canvas 3D) · bars (CSS 3D)
             line chart (SVG) · feed · card tilt · wiring
------------------------------------------------------------------- */
(() => {
  'use strict';

  /* ---------- deterministic pseudo-random -------------------------- */
  const seeded = (seed) => () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  /* ---------- data ---------------------------------------------------- */
  const TECHS = [
    { id: 'ai',        name: 'AI & ML',        adoption: 86, investment: 212, nodes: 128, region: 'Global' },
    { id: 'cloud',     name: 'Cloud',          adoption: 92, investment: 318, nodes: 214, region: 'Global' },
    { id: 'cyber',     name: 'Cybersecurity',  adoption: 78, investment: 165, nodes:  96, region: 'Global' },
    { id: 'iot',       name: 'IoT',            adoption: 64, investment:  98, nodes: 181, region: 'APAC' },
    { id: 'edge',      name: 'Edge computing', adoption: 57, investment:  74, nodes:  77, region: 'EMEA' },
    { id: '5g',        name: '5G',             adoption: 61, investment: 141, nodes:  69, region: 'APAC' },
    { id: 'quantum',   name: 'Quantum',        adoption: 18, investment:  36, nodes:  12, region: 'Americas' },
    { id: 'blockchain',name: 'Blockchain',     adoption: 34, investment:  52, nodes:  44, region: 'Global' },
    { id: 'robotics',  name: 'Robotics',       adoption: 48, investment:  88, nodes:  58, region: 'APAC' },
    { id: 'xr',        name: 'AR / VR',        adoption: 29, investment:  41, nodes:  23, region: 'Americas' },
  ];

  const SERIES = [
    { key: 'compute', name: 'Compute', color: 'var(--s1)' },
    { key: 'storage', name: 'Storage', color: 'var(--s2)' },
    { key: 'network', name: 'Network', color: 'var(--s3)' },
  ];

  const RANGES = {
    '24h': { points: 24, label: 'last 24 hours', fmt: (i, n) => `${String((new Date().getHours() - (n - 1 - i) + 48) % 24).padStart(2, '0')}:00` },
    '7d':  { points: 7,  label: 'last 7 days',   fmt: (i, n) => dayLabel(n - 1 - i) },
    '30d': { points: 30, label: 'last 30 days',  fmt: (i, n) => dayLabel(n - 1 - i, true) },
  };
  function dayLabel(daysAgo, short) {
    const d = new Date(); d.setDate(d.getDate() - daysAgo);
    return short ? `${d.getMonth() + 1}/${d.getDate()}` : d.toLocaleDateString(undefined, { weekday: 'short' });
  }

  /** Generates throughput series for a tech filter and range. */
  function seriesData(techId, rangeKey) {
    const { points } = RANGES[rangeKey];
    const scale = techId === 'all' ? 1 : (TECHS.find(t => t.id === techId).adoption / 100) * 0.6;
    const rnd = seeded(hash(techId + rangeKey));
    const base = { compute: 1800, storage: 1100, network: 1450 };
    return SERIES.map(s => {
      let v = base[s.key] * scale;
      const vals = [];
      for (let i = 0; i < points; i++) {
        v += (rnd() - 0.48) * base[s.key] * scale * 0.12;
        v = Math.max(base[s.key] * scale * 0.4, v);
        vals.push(Math.round(v));
      }
      return { ...s, values: vals };
    });
  }
  function hash(str) { let h = 2166136261; for (const c of str) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; }

  /* ---------- state --------------------------------------------------- */
  const state = { range: '7d', tech: 'all', metric: 'adoption', autoRotate: true, table: false };
  const $ = (id) => document.getElementById(id);
  const fmt = (n) => n.toLocaleString(undefined, { maximumFractionDigits: 0 });

  /* ---------- KPI tiles ---------------------------------------------- */
  const KPIS = [
    { id: 'uptime',  label: 'Platform uptime', unit: '%',    base: 99.982, jitter: 0.004, decimals: 3, up: true },
    { id: 'rps',     label: 'Throughput',      unit: 'req/s', base: 4350,  jitter: 180,   decimals: 0, up: true },
    { id: 'nodes',   label: 'Active nodes',    unit: '',      base: 902,   jitter: 6,     decimals: 0, up: true },
    { id: 'latency', label: 'p95 latency',     unit: 'ms',    base: 128,   jitter: 14,    decimals: 0, up: false },
  ];
  const kpiHistory = {};

  // Numbers stay blank until the strip scrolls into view, then count up (see motion section).
  const kpiMotion = { revealed: false, counting: new Set() };

  function buildKpis() {
    const rnd = seeded(7);
    $('kpis').innerHTML = KPIS.map((k, i) => {
      kpiHistory[k.id] = Array.from({ length: 24 }, () => k.base + (rnd() - 0.5) * k.jitter * 2);
      return `
        <article class="kpi" id="kpi-${k.id}" style="--i:${i}">
          <div class="label"><span>${k.label}</span><span class="delta"></span></div>
          <div class="value"><span class="num"></span>${k.unit ? `<small>${k.unit}</small>` : ''}</div>
          <svg viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true">
            <path class="spark-fill"></path><path class="spark" pathLength="1"></path><circle class="spark-dot" r="3"></circle>
          </svg>
        </article>`;
    }).join('');
    updateKpis();
  }

  const fmtKpi = (k, v) => v.toLocaleString(undefined, { minimumFractionDigits: k.decimals, maximumFractionDigits: k.decimals });

  function updateKpis() {
    KPIS.forEach(k => {
      const h = kpiHistory[k.id];
      const next = k.base + (Math.random() - 0.5) * k.jitter * 2;
      h.push(next); h.shift();
      const el = $(`kpi-${k.id}`);
      const cur = h[h.length - 1], prev = h[h.length - 2];
      const diff = cur - prev;
      const good = k.up ? diff >= 0 : diff <= 0;
      if (kpiMotion.revealed && !kpiMotion.counting.has(k.id)) el.querySelector('.num').textContent = fmtKpi(k, cur);
      const d = el.querySelector('.delta');
      d.className = `delta ${good ? 'up' : 'down'}`;
      d.innerHTML = `<span aria-hidden="true">${diff >= 0 ? '▲' : '▼'}</span>${Math.abs(diff).toLocaleString(undefined, { maximumFractionDigits: k.decimals })}`;

      const min = Math.min(...h), max = Math.max(...h), span = (max - min) || 1;
      const pts = h.map((v, i) => [i / (h.length - 1) * 100, 36 - ((v - min) / span) * 30]);
      const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
      el.querySelector('.spark').setAttribute('d', line);
      el.querySelector('.spark-fill').setAttribute('d', `${line} L100 40 L0 40 Z`);
      const last = pts[pts.length - 1];
      const dot = el.querySelector('.spark-dot');
      dot.setAttribute('cx', last[0]); dot.setAttribute('cy', last[1]);
    });
  }

  /* ---------- sphere (canvas 3D) --------------------------------------- */
  const sphere = {
    canvas: $('sphere'), ctx: null, w: 0, h: 0, dpr: 1,
    rotX: -0.35, rotY: 0.6, velX: 0, velY: 0,
    dragging: false, moved: 0, lastX: 0, lastY: 0, hover: null, nodes: [], minor: [], edges: [],
    projected: [],
  };

  function buildSphere() {
    sphere.ctx = sphere.canvas.getContext('2d');
    // Major nodes: fibonacci sphere
    const n = TECHS.length, phi = Math.PI * (3 - Math.sqrt(5));
    sphere.nodes = TECHS.map((t, i) => {
      const y = 1 - (i / (n - 1)) * 2, r = Math.sqrt(1 - y * y), th = phi * i;
      return { tech: t, x: Math.cos(th) * r, y, z: Math.sin(th) * r };
    });
    // Minor nodes: decorative sub-nodes on the same sphere
    const rnd = seeded(42);
    sphere.minor = Array.from({ length: 260 }, () => {
      const u = rnd() * 2 - 1, th = rnd() * Math.PI * 2, r = Math.sqrt(1 - u * u);
      return { x: Math.cos(th) * r, y: u, z: Math.sin(th) * r };
    });
    // Edges: each major node to its 3 nearest majors
    sphere.edges = [];
    sphere.nodes.forEach((a, i) => {
      sphere.nodes.map((b, j) => ({ j, d: dist(a, b) })).filter(o => o.j !== i)
        .sort((p, q) => p.d - q.d).slice(0, 3)
        .forEach(o => { if (!sphere.edges.some(e => (e[0] === o.j && e[1] === i))) sphere.edges.push([i, o.j]); });
    });
    resizeSphere();
    window.addEventListener('resize', resizeSphere);

    const wrap = sphere.canvas.parentElement;
    const down = (x, y) => { sphere.dragging = true; sphere.moved = 0; sphere.lastX = x; sphere.lastY = y; wrap.classList.add('dragging'); };
    const move = (x, y) => {
      if (sphere.dragging) {
        sphere.moved += Math.abs(x - sphere.lastX) + Math.abs(y - sphere.lastY);
        sphere.velY = (x - sphere.lastX) * 0.006; sphere.velX = (y - sphere.lastY) * 0.006;
        sphere.rotY += sphere.velY; sphere.rotX += sphere.velX;
        sphere.lastX = x; sphere.lastY = y;
      }
    };
    const up = () => { sphere.dragging = false; wrap.classList.remove('dragging'); };

    sphere.canvas.addEventListener('pointerdown', e => { down(e.clientX, e.clientY); sphere.canvas.setPointerCapture(e.pointerId); });
    sphere.canvas.addEventListener('pointermove', e => {
      move(e.clientX, e.clientY);
      const r = sphere.canvas.getBoundingClientRect();
      pickNode(e.clientX - r.left, e.clientY - r.top);
    });
    sphere.canvas.addEventListener('pointerup', up);
    sphere.canvas.addEventListener('pointercancel', up);
    sphere.canvas.addEventListener('pointerleave', () => { sphere.hover = null; $('sphereTip').hidden = true; });
    sphere.canvas.addEventListener('click', () => {
      if (sphere.moved > 4) return; // was a drag, not a click
      if (sphere.hover != null) setTech(sphere.hover.tech.id === state.tech ? 'all' : sphere.hover.tech.id);
    });

    $('sphereLegend').innerHTML =
      `<span class="item"><span class="swatch" style="--c:var(--s1)"></span>Focused / all</span>` +
      `<span class="item"><span class="swatch" style="--c:var(--muted)"></span>Other technologies</span>` +
      `<span class="item"><span class="swatch" style="--c:var(--soft)"></span>Sub-nodes</span>`;
  }
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

  function resizeSphere() {
    const r = sphere.canvas.parentElement.getBoundingClientRect();
    sphere.dpr = Math.min(window.devicePixelRatio || 1, 2);
    sphere.w = r.width; sphere.h = r.height;
    sphere.canvas.width = r.width * sphere.dpr; sphere.canvas.height = r.height * sphere.dpr;
  }

  function project(p) {
    const cx = Math.cos(sphere.rotX), sx = Math.sin(sphere.rotX);
    const cy = Math.cos(sphere.rotY), sy = Math.sin(sphere.rotY);
    // rotate Y then X
    let x = p.x * cy + p.z * sy, z = -p.x * sy + p.z * cy, y = p.y;
    const y2 = y * cx - z * sx; z = y * sx + z * cx; y = y2;
    const R = Math.min(sphere.w * 0.7, sphere.h) * 0.5;
    const persp = 1 / (1.9 - z * 0.55);
    return { x: sphere.w / 2 + x * R * persp, y: sphere.h / 2 + y * R * persp, z, s: persp };
  }

  function pickNode(mx, my) {
    let best = null, bd = 18;
    sphere.projected.forEach((pp, i) => {
      const d = Math.hypot(pp.x - mx, pp.y - my);
      if (d < bd) { bd = d; best = i; }
    });
    sphere.hover = best == null ? null : sphere.nodes[best];
    const tip = $('sphereTip');
    if (sphere.hover) {
      const t = sphere.hover.tech, pp = sphere.projected[best];
      tip.innerHTML = `<div class="t-title">${t.name}</div>
        <div class="t-row"><span>Adoption</span><b>${t.adoption}%</b></div>
        <div class="t-row"><span>Investment</span><b>$${t.investment}B</b></div>
        <div class="t-row"><span>Nodes</span><b>${t.nodes}</b></div>
        <div class="t-row"><span>Lead region</span><b>${t.region}</b></div>`;
      tip.style.left = `${pp.x}px`; tip.style.top = `${pp.y - 10 * pp.s}px`;
      tip.hidden = false;
      sphere.canvas.style.cursor = 'pointer';
    } else { tip.hidden = true; sphere.canvas.style.cursor = ''; }
  }

  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  let palette = {};
  function readPalette() {
    palette = { s1: css('--s1'), s2: css('--s2'), s3: css('--s3'), ink: css('--ink'), grid: css('--grid'), axis: css('--axis'), page: css('--page') };
    // ink-2 / muted / soft are rgba() tokens; the canvas needs opaque hexes to blend from
    const dark = document.documentElement.dataset.theme !== 'light';
    palette.ink2 = dark ? '#b3b3b3' : '#2b2b2b';
    palette.muted = dark ? '#666666' : '#8a8a8a';
    palette.soft = dark ? '#999999' : '#4a4a4a';
  }

  function drawSphere() {
    const { ctx, w, h, dpr } = sphere;
    if (!sphere.dragging) {
      if (state.autoRotate) sphere.rotY += 0.0035;
      sphere.rotY += sphere.velY; sphere.rotX += sphere.velX;
      sphere.velX *= 0.92; sphere.velY *= 0.92;
    }
    sphere.rotX = Math.max(-1.2, Math.min(1.2, sphere.rotX));

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // wire rings (lat/long) for the globe feel — hairline, recessive
    ctx.lineWidth = 1; ctx.strokeStyle = hexA(palette.grid, 0.9);
    for (let lat = -60; lat <= 60; lat += 30) ring(ctx, lat);
    for (let lon = 0; lon < 180; lon += 45) meridian(ctx, lon);

    // minor nodes — dense dot field, monochrome, depth-faded
    sphere.minor.forEach(p => {
      const pp = project(p); const a = 0.12 + (pp.z + 1) * 0.30;
      ctx.fillStyle = hexA(palette.soft, a);
      ctx.beginPath(); ctx.arc(pp.x, pp.y, 1.2 * pp.s + 0.5, 0, Math.PI * 2); ctx.fill();
    });

    // major projected
    sphere.projected = sphere.nodes.map(project);

    // edges
    sphere.edges.forEach(([i, j]) => {
      const a = sphere.projected[i], b = sphere.projected[j];
      const focus = state.tech === 'all' || sphere.nodes[i].tech.id === state.tech || sphere.nodes[j].tech.id === state.tech;
      const depth = ((a.z + b.z) / 2 + 1) / 2;
      ctx.strokeStyle = hexA(focus ? palette.s1 : palette.muted, (0.15 + depth * 0.5) * (focus ? 1 : 0.45));
      ctx.lineWidth = focus ? 1.4 : 1;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    });

    // nodes (back to front)
    const order = sphere.projected.map((_, i) => i).sort((a, b) => sphere.projected[a].z - sphere.projected[b].z);
    ctx.font = '11px "JetBrains Mono", ui-monospace, Menlo, monospace';
    ctx.textBaseline = 'middle';
    order.forEach(i => {
      const pp = sphere.projected[i], t = sphere.nodes[i].tech;
      const focused = state.tech === 'all' || t.id === state.tech;
      const hovered = sphere.hover === sphere.nodes[i];
      const r = (4 + t.adoption / 14) * pp.s;
      const depthA = 0.45 + (pp.z + 1) * 0.275;
      const col = focused ? palette.s1 : palette.muted;
      if (focused && (hovered || t.id === state.tech)) {
        ctx.fillStyle = hexA(palette.s1, 0.25);
        ctx.beginPath(); ctx.arc(pp.x, pp.y, r + 8, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = hexA(col, focused ? depthA : depthA * 0.5);
      ctx.beginPath(); ctx.arc(pp.x, pp.y, r, 0, Math.PI * 2); ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = palette.page;   // 2px surface ring
      ctx.stroke();
      if (pp.z > -0.15 || hovered || t.id === state.tech) {
        ctx.fillStyle = hexA(focused ? palette.ink : palette.ink2, focused ? Math.min(1, depthA + 0.2) : 0.55);
        ctx.textAlign = 'left';
        ctx.fillText(t.name.toUpperCase(), pp.x + r + 6, pp.y);
      }
    });
  }
  function ring(ctx, latDeg) {
    const lat = latDeg * Math.PI / 180, y = Math.sin(lat), r = Math.cos(lat);
    ctx.beginPath();
    for (let a = 0; a <= 64; a++) {
      const th = a / 64 * Math.PI * 2; const pp = project({ x: Math.cos(th) * r, y, z: Math.sin(th) * r });
      a ? ctx.lineTo(pp.x, pp.y) : ctx.moveTo(pp.x, pp.y);
    }
    ctx.stroke();
  }
  function meridian(ctx, lonDeg) {
    const lon = lonDeg * Math.PI / 180;
    ctx.beginPath();
    for (let a = 0; a <= 64; a++) {
      const th = a / 64 * Math.PI * 2;
      const pp = project({ x: Math.cos(th) * Math.cos(lon), y: Math.sin(th), z: Math.cos(th) * Math.sin(lon) });
      a ? ctx.lineTo(pp.x, pp.y) : ctx.moveTo(pp.x, pp.y);
    }
    ctx.stroke();
  }
  function hexA(hex, a) {
    if (hex.startsWith('rgb')) {
      // rgba()/rgb() token: swap in the requested alpha
      const [r, g, b] = hex.match(/[\d.]+/g);
      return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, a)).toFixed(3)})`;
    }
    hex = hex.replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    const n = parseInt(hex, 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${Math.max(0, Math.min(1, a)).toFixed(3)})`;
  }

  /* ---------- hero globe (canvas: dotted earth · hubs · routes) ----------- */
  // Land mask: 1.5° lon/lat grid rasterised from public-domain country outlines (1 bit per cell).
  const LAND = { cell: 1.5, cols: 240, rows: 120, b64: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADAfwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPj/z////3EAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/++f///w8AAPADgAEAAOADAAAAAAAAAAAAAAAg3N4f/v///wcAAB8AAAAAAAA4AAAAAAAAAAAAAAADAOAH/P///wcAAA4AAAAAAAAwAAAAAAAAAAAAAAC8cQwBAP///wcAAAAAAIAHAMD/DwDwAAAAAAAAAOAAAAAAAPz//wMAAAAAAGAAAPz/AQAAAAAAAAAAAOBdc/MDAPj//wEAAAAAABjAwP///z9gAAAAA4AAAED8A/P/AOD//wEAAAAAADjg/v///z//HwCAAPj/A0/8X4PwB/D//wAAAOA/AADh/v///////wM+A/7///8Pw56BB+D/DwAAAPz/Y+zf/f//////////N/D///////+Bf/D/AQAAAP7/x////v//////////GP7//////7/wJ+AfAH4AAD9++P//////////////AOD//////88GH8AfAAwAwJ////////////////9/APz//////wNxDIAPAAAA8M///////////////98/APzf/////wHwAwAGAAAA+M///////////////+ADAPAB+P///wHwMwAAAAAA8A//////////////ZBgAAIACgP///wPgfwAAAAAQABf///////////8fAA4AACAAAP///z/gfwAAAAAwYMf///////////8PAB8AAAQAAP7////5/wMAAABoQOj///////////8DAA8AAAAAgPz////5/wcAAADs+P////////////9/AAcAAAAAAPj////7/wMAAADg+f////////////9/AAEAAAAAAPj/////zwAAAAAw/v////////////+/AAAAAAAAAPD/////Gw4AAACg//////////////8fAAAAAAAAAOD/////HxAAAADA//////////////8fAAAAAAAAAOD//////wAAAACA//9P/vj///////8PAAAAAAAAAOD/////EwAAAACA//wHfPz////////HAAAAAAAAAOD/////AQAAAAD8g/EH8Pj////////gAAAAAAAAAOD/////AAAAAAD8Aebn+fH//////z8AAAAAAAAAAOD///9/AAAAAAD8AGT8//H//////xpgAAAAAAAAAMD///8/AAAAAAD8AMT8//H/////fzggAAAAAAAAAID///8fAAAAAABwdAD8/////////zE4AAAAAAAAAID///8fAAAAAACwfwBD/////////zA/AAAAAAAAAAD+//8PAAAAAAD4fwAA/////////wAHAAAAAAAAAAD8//8DAAAAAAD8/2OA/////////4EAAAAAAAAAAADg//8DAAAAAAD8/+///////////wEAAAAAAAAAAADo/wkCAAAAAAD+//////z//////wEAAAAAAAAAAADYfwACAAAAAID///8///n//////wEAAAAAAAAAAACgfwAWAAAAAMD///9//+H//////wAAAAAAAAAAAAAgfwAAAAAAAMD///9//jPg////fwAAAAAAAAAAAAAAfgAAAAAAAOD//////H/A////PwEAAAAAAAAAAAAAfAAIAAAAAOD//////f/A/+f/BwAAAAAAAAAAAAAAfDBwAAAAAOD/////+X8A/sN/AAAAAAAAAAAAAAAA+DgAAwAAAOD/////+T8A/oB/AwAAAAAAAAAAAAAA4B8AAAAAAOD/////8x8AfoB/AAMAAAAAAAAAAAAAgPwAAAAAAOD/////8wcAPoD+AAEAAAAAAAAAAAAAAPgBAAAAAOD/////7wEAHAD+AQEAAAAAAAAAAAAAAMAAAAAAAOD/////PwAAHAD8AQQAAAAAAAAAAAAAAICAAgAAAMD/////HwMAGADgAAoAAAAAAAAAAAAAAADBfgAAAID//////wMAGABAAAAAAAAAAAAAAAAAAADy/wAAAID//////wEAIAAGAAwAAAAAAAAAAAAAAADw/wEAAAD//////wEAIAAIAAgAAAAAAAAAAAAAAADw/x8AAAD8+P///wAAAAAZYAAAAAAAAAAAAAAAAADg/z8AAAAAwP///wAAAAAbMAAAAAAAAAAAAAAAAADw/z8AAAAAwP//fwAAAAAWfAAAAAAAAAAAAAAAAAD4/38AAAAAwP//HwAAAAAcficAAAAAAAAAAAAAAAD8//8BAAAAwP//DwAAAAAYPiABAAAAAAAAAAAAAAD8//8DAAAAwP//BwAAAAA4vgEaAAAAAAAAAAAAAAD8//8/AAAAgP//BwAAAABwEBL+AAAAAAAAAAAAAAD8////AAAAAP//AwAAAABgAADwAQAAAAAAAAAAAAD8////AQAAAP//AwAAAADABADyAwEAAAAAAAAAAAD4////AQAAAP7/AwAAAAAAHADwBgQAAAAAAAAAAADw////AAAAAP7/BwAAAAAAAAQADAAAAAAAAAAAAADw//9/AAAAAP7/BwAAAAAAAAAAAAAAAAAAAAAAAADg//9/AAAAAP7/BwAAAAAAAICHAAAAAAAAAAAAAADg//8/AAAAAP//BwEAAAAAANDHAAAAAAAAAAAAAADA//8/AAAAAP//hwMAAAAAAPjHAQAAAAAAAAAAAAAA//8/AAAAAP//4QEAAAAAAPzfAQAAAAAAAAAAAAAA/v8/AAAAAP//4AEAAAAAAP7/AwAAAAAAAAAAAAAA/v8fAAAAAP5/wAAAAAAAgP//ByAAAAAAAAAAAAAA/v8fAAAAAP7/4AAAAAAA4P//D0AAAAAAAAAAAAAA/v8HAAAAAPz/4AAAAAAA8P//HwAAAAAAAAAAAAAA/v8AAAAAAPx/YAAAAAAA8P//PwAAAAAAAAAAAAAA/v8AAAAAAPw/AAAAAAAA8P//PwAAAAAAAAAAAAAA/v8AAAAAAPw/AAAAAAAA8P//PwAAAAAAAAAAAAAA/38AAAAAAPgfAAAAAAAA4P//PwAAAAAAAAAAAAAA/z8AAAAAAPAPAAAAAAAA4P//PwAAAAAAAAAAAAAA/x8AAAAAAPAHAAAAAAAA4B/+PwAAAAAAAAAAAAAA/w8AAAAAAPABAAAAAAAA4Af0HwAAAAAAAAAAAAAA/wMAAAAAAAAAAAAAAAAAAADwDwAIAAAAAAAAAACA/wMAAAAAAAAAAAAAAAAAAADgDwAQAAAAAAAAAACA/wEAAAAAAAAAAAAAAAAAAADAAgBwAAAAAAAAAACAfwAAAAAAAAAAAAAAAAAAAAAAAAAwAAAAAAAAAACAHwAAAAAAAAAAAAAAAAAAAAAABgAQAAAAAAAAAACAHwAAAAAAAAAAAAAAAAAAAAAABgAMAAAAAAAAAADADwAAAAAAAAAAAAAAAAAAAAAAAAADAAAAAAAAAADABwAAAAAAAAAAAAAAAAAAAAAAAIADAAAAAAAAAADADwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADABwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADAAwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADAgwEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACABwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGAAAAAAAAAAAADwAAAR4Pv4HAAAAAAAAAAAAAAAACAAAAAAAAAAA4P8/4P//////BwAAAAAAAAAAAAAAPwAAAAAAAADg//8//P///////wMAAAAAAAAAAACAewAAAADI/v////8///////////8BAAAAAAAAABAAeAAAAID///////////////////8DAAAAAAAe4P//fwAAAMD//////////////////38AAADA////////BwAAAPz//////////////////x8AAEDz//////8/AAAA8P///////////////////x8AABj///////8PAIAH/////////////////////38AAADA//////8/gPAD4P///////////////////wcAAAD+////////P4Dx/////////////////////w8AAAD8//////////////////////////////////8AAPz/AQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' };

  const HUBS = [
    { id: 'iad', name: 'Virginia',     lat: 39.04,  lon: -77.49,  nodes: 232, primary: true },
    { id: 'pdx', name: 'Oregon',       lat: 45.52,  lon: -122.68, nodes: 158 },
    { id: 'gru', name: 'São Paulo',    lat: -23.55, lon: -46.63,  nodes: 77 },
    { id: 'lon', name: 'London',       lat: 51.51,  lon: -0.13,   nodes: 142 },
    { id: 'fra', name: 'Frankfurt',    lat: 50.11,  lon: 8.68,    nodes: 189, primary: true },
    { id: 'dxb', name: 'Dubai',        lat: 25.20,  lon: 55.27,   nodes: 64 },
    { id: 'jnb', name: 'Johannesburg', lat: -26.20, lon: 28.05,   nodes: 41 },
    { id: 'bom', name: 'Mumbai',       lat: 19.08,  lon: 72.88,   nodes: 121 },
    { id: 'sin', name: 'Singapore',    lat: 1.35,   lon: 103.82,  nodes: 214, primary: true },
    { id: 'tyo', name: 'Tokyo',        lat: 35.68,  lon: 139.69,  nodes: 168, primary: true },
    { id: 'syd', name: 'Sydney',       lat: -33.87, lon: 151.21,  nodes: 96 },
  ];
  const ROUTE_IDS = [['iad','fra'],['fra','sin'],['sin','tyo'],['sin','syd'],['iad','pdx'],['pdx','tyo'],['fra','bom'],['bom','sin'],['iad','gru'],['fra','dxb'],['dxb','jnb'],['lon','iad'],['gru','jnb']];

  const globe = {
    canvas: null, ctx: null, size: 0, dpr: 1,
    phi: 3.9, tilt: 0.42, vel: 0, dragging: false, moved: 0, lastX: 0, lastY: 0,
    visible: true, pts: null, routes: [], labels: new Map(),
  };
  const ll2v = (lat, lon) => {
    const la = lat * Math.PI / 180, lo = lon * Math.PI / 180;
    return [Math.cos(la) * Math.sin(lo), Math.sin(la), Math.cos(la) * Math.cos(lo)];
  };
  /** Great-circle samples from a to b, lifted off the surface in the middle so the arc reads as a route. */
  function greatCircle(a, b, n) {
    const dot = Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
    const om = Math.acos(dot), so = Math.sin(om) || 1e-6, out = new Float32Array((n + 1) * 3);
    for (let i = 0; i <= n; i++) {
      const t = i / n, wa = Math.sin((1 - t) * om) / so, wb = Math.sin(t * om) / so, e = 1 + 0.18 * Math.sin(Math.PI * t);
      out[i * 3] = (a[0] * wa + b[0] * wb) * e; out[i * 3 + 1] = (a[1] * wa + b[1] * wb) * e; out[i * 3 + 2] = (a[2] * wa + b[2] * wb) * e;
    }
    return out;
  }

  function buildGlobe() {
    const c = $('globe'); if (!c) return;
    globe.canvas = c; globe.ctx = c.getContext('2d');

    // decode the land mask; thin longitudes toward the poles so dot density stays even
    const bin = atob(LAND.b64), pts = [];
    for (let r = 0; r < LAND.rows; r++) {
      const lat = (90 - (r + 0.5) * LAND.cell) * Math.PI / 180;
      const step = Math.max(1, Math.round(1 / Math.max(0.05, Math.cos(lat))));
      for (let col = 0; col < LAND.cols; col += step) {
        const idx = r * LAND.cols + col;
        if (!(bin.charCodeAt(idx >> 3) & (1 << (idx & 7)))) continue;
        const lon = (-180 + (col + 0.5) * LAND.cell) * Math.PI / 180;
        pts.push(Math.cos(lat) * Math.sin(lon), Math.sin(lat), Math.cos(lat) * Math.cos(lon));
      }
    }
    globe.pts = new Float32Array(pts);

    HUBS.forEach(h => { h.v = ll2v(h.lat, h.lon); h.seed = hash(h.id) / 4294967296; });
    globe.routes = ROUTE_IDS.map(([a, b], i) => {
      const A = HUBS.find(h => h.id === a), B = HUBS.find(h => h.id === b);
      return { pts: greatCircle(A.v, B.v, 48), n: 48, offset: hash(a + b) / 4294967296, speed: 0.045 + (i % 4) * 0.012 };
    });

    const labels = $('globeLabels');
    HUBS.filter(h => h.primary).forEach(h => {
      const el = document.createElement('span');
      el.className = 'globe-label'; el.textContent = `${h.name} · ${h.nodes} nodes`;
      labels.append(el); globe.labels.set(h.id, el);
    });

    const resize = () => {
      const r = c.getBoundingClientRect();
      globe.dpr = Math.min(window.devicePixelRatio || 1, 2);
      globe.size = r.width; c.width = c.height = Math.round(r.width * globe.dpr);
    };
    resize(); window.addEventListener('resize', resize);

    c.addEventListener('pointerdown', e => { globe.dragging = true; globe.moved = 0; globe.lastX = e.clientX; globe.lastY = e.clientY; c.classList.add('dragging'); c.setPointerCapture(e.pointerId); });
    c.addEventListener('pointermove', e => {
      if (!globe.dragging) return;
      const dx = e.clientX - globe.lastX, dy = e.clientY - globe.lastY;
      globe.phi += dx * 0.005; globe.tilt = Math.max(-0.6, Math.min(1.0, globe.tilt + dy * 0.003));
      globe.vel = dx * 0.0015; globe.lastX = e.clientX; globe.lastY = e.clientY;
    });
    const up = () => { globe.dragging = false; c.classList.remove('dragging'); };
    c.addEventListener('pointerup', up); c.addEventListener('pointercancel', up);

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(es => { globe.visible = es[0].isIntersecting; }, { rootMargin: '120px' }).observe($('heroGlobe'));
    }
  }

  function drawGlobe(now) {
    if (!globe.ctx || !globe.visible || !globe.size) return;
    const { ctx, size, dpr } = globe;
    if (!globe.dragging) { globe.phi += 0.0022 + globe.vel; globe.vel *= 0.94; }
    const cp = Math.cos(globe.phi), sp = Math.sin(globe.phi), ct = Math.cos(globe.tilt), st = Math.sin(globe.tilt);
    const R = size / 2 * 0.985, cx = size / 2, cy = size / 2;
    // rotate about Y (spin), then X (tilt); returns screen x, y and depth z (towards camera > 0)
    const proj = (x, y, z) => {
      const x1 = x * cp + z * sp, z1 = -x * sp + z * cp;
      const y1 = y * ct - z1 * st, z2 = y * st + z1 * ct;
      return [cx + x1 * R, cy - y1 * R, z2];
    };

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);

    // land dots, bucketed by depth so fillStyle changes stay few
    const P = globe.pts, buckets = [[], [], [], []];
    for (let i = 0; i < P.length; i += 3) {
      const [px, py, z] = proj(P[i], P[i + 1], P[i + 2]);
      if (z <= 0.02) continue;
      buckets[Math.min(3, Math.floor(z * 4))].push(px, py);
    }
    const alphas = [0.16, 0.32, 0.55, 0.82], sizes = [1.0, 1.25, 1.5, 1.75];
    buckets.forEach((b, k) => {
      ctx.fillStyle = `rgba(255,255,255,${alphas[k]})`; const s = sizes[k] * (size / 800 + 0.4), h = s / 2;
      for (let i = 0; i < b.length; i += 2) ctx.fillRect(b[i] - h, b[i + 1] - h, s, s);
    });

    // routes: arcs drawn only where not occluded by the sphere
    ctx.lineWidth = 1.1; ctx.strokeStyle = 'rgba(91,116,255,0.6)'; ctx.lineCap = 'round';
    const visibleAt = (px, py, z) => z > 0 || ((px - cx) ** 2 + (py - cy) ** 2) > R * R;
    const t = now / 1000;
    globe.routes.forEach(r => {
      const q = r.pts; let open = false; ctx.beginPath();
      for (let i = 0; i <= r.n; i++) {
        const [px, py, z] = proj(q[i * 3], q[i * 3 + 1], q[i * 3 + 2]);
        if (visibleAt(px, py, z)) { open ? ctx.lineTo(px, py) : ctx.moveTo(px, py); open = true; } else open = false;
      }
      ctx.stroke();
      // travelling packet with a short trail
      const f = ((t * r.speed) + r.offset) % 1;
      for (let k = 0; k < 7; k++) {
        const ff = f - k * 0.012; if (ff < 0) break;
        const fi = ff * r.n, i0 = Math.floor(fi), i1 = Math.min(r.n, i0 + 1), u = fi - i0;
        const [px, py, z] = proj(q[i0 * 3] + (q[i1 * 3] - q[i0 * 3]) * u, q[i0 * 3 + 1] + (q[i1 * 3 + 1] - q[i0 * 3 + 1]) * u, q[i0 * 3 + 2] + (q[i1 * 3 + 2] - q[i0 * 3 + 2]) * u);
        if (!visibleAt(px, py, z)) continue;
        ctx.fillStyle = `rgba(255,85,0,${(1 - k / 7) * 0.95})`;
        ctx.beginPath(); ctx.arc(px, py, k === 0 ? 2.6 : 1.6, 0, Math.PI * 2); ctx.fill();
      }
    });

    // hubs: pulse ring + dot; primary hubs get an HTML label when facing the camera
    HUBS.forEach(h => {
      const [px, py, z] = proj(h.v[0], h.v[1], h.v[2]);
      const label = globe.labels.get(h.id);
      if (z <= 0) { if (label) label.classList.remove('is-on'); return; }
      const ph = (t * 0.55 + h.seed) % 1;
      ctx.strokeStyle = `rgba(91,116,255,${(1 - ph) * 0.55})`; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(px, py, 3 + ph * 14, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#5b74ff'; ctx.beginPath(); ctx.arc(px, py, h.primary ? 3.6 : 2.8, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(px, py, 1.3, 0, Math.PI * 2); ctx.fill();
      if (label) { label.style.left = `${px}px`; label.style.top = `${py}px`; label.classList.toggle('is-on', z > 0.35); }
    });

    // rim
    ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
  }

  /* ---------- freight scene (pinned section, scrubbed by scroll) ------------ */
  function initFreight() {
    const sec = $('freight'); if (!sec) return;
    const stage = $('freightStage'), scene = $('freightScene');
    const el = {
      cargo: $('frCargo'), trolley: $('frTrolley'), cable: $('frCable'), spreader: $('frSpreader'),
      truck: $('frTruck'), plane: $('frPlane'), shadow: $('frPlaneShadow'),
      value: $('freightValue'), label: $('freightLabel'), unit: $('freightUnit'),
    };
    const steps = [...sec.querySelectorAll('.step')];
    steps.forEach(s => s.querySelectorAll('.line').forEach((l, i) => l.style.setProperty('--i', i)));
    // billboard angles for the plane (inverse of the scene rotation)
    scene.style.setProperty('--irx', '20deg'); scene.style.setProperty('--iry', '26deg');

    // scene constants (px, scene units)
    const STACK_X = -270, TRUCK_X0 = 120, BED_Y = 36, CARGO_TOP = 104, LIFT_Y = 190, SPREADER_REST = 224, TROLLEY_Y = 266, CARGO_ON_TRUCK = -20, DRIVE = 720;
    const clamp01 = v => Math.max(0, Math.min(1, v));
    const seg = (p, a, b) => clamp01((p - a) / (b - a));
    const smooth = v => v * v * (3 - 2 * v);
    const lerp = (a, b, v) => a + (b - a) * v;
    const setPos = (node, x, y) => { node.style.setProperty('--x', `${x.toFixed(1)}px`); node.style.setProperty('--y', `${y.toFixed(1)}px`); };

    let phase = -1;
    function render(p) {
      const grab = smooth(seg(p, 0.00, 0.14));   // spreader drops onto the top container
      const lift = smooth(seg(p, 0.14, 0.30));   // container rises to travel height
      const move = smooth(seg(p, 0.30, 0.58));   // trolley carries it to the truck
      const lower = smooth(seg(p, 0.58, 0.72));  // container settles on the flatbed
      const release = smooth(seg(p, 0.72, 0.82)); // spreader lets go and retracts
      const drive = smooth(seg(p, 0.82, 1.00));  // truck leaves, camera pans after it
      const fly = seg(p, 0.50, 1.00);            // plane crosses overhead

      const truckX = TRUCK_X0 + drive * DRIVE;
      const trolleyX = lerp(STACK_X, TRUCK_X0 + CARGO_ON_TRUCK, move);
      let cargoY = lerp(CARGO_TOP, LIFT_Y, lift); cargoY = lerp(cargoY, BED_Y, lower);
      const cargoX = drive > 0 ? truckX + CARGO_ON_TRUCK : trolleyX;
      let spreaderY = lerp(SPREADER_REST, CARGO_TOP + 52, grab);
      if (lift > 0) spreaderY = cargoY + 52;
      if (release > 0) spreaderY = lerp(BED_Y + 52, SPREADER_REST, release);

      setPos(el.cargo, cargoX, cargoY);
      setPos(el.trolley, trolleyX, TROLLEY_Y);
      setPos(el.spreader, trolleyX, spreaderY);
      setPos(el.cable, trolleyX, spreaderY + 8);
      el.cable.firstElementChild.style.setProperty('--len', `${Math.max(0, TROLLEY_Y - spreaderY - 8).toFixed(1)}px`);
      setPos(el.truck, truckX, 0);
      el.truck.style.setProperty('--wr', `${(drive * DRIVE / 14 * 57.3).toFixed(1)}deg`);
      scene.style.setProperty('--pan', `${(-drive * 220).toFixed(1)}px`);

      const planeX = lerp(-760, 760, fly), planeY = 300 + Math.sin(fly * Math.PI) * 50;
      setPos(el.plane, planeX, planeY); setPos(el.shadow, planeX + 30, 1);
      el.plane.style.opacity = fly > 0 && fly < 1 ? 1 : 0;
      el.shadow.style.setProperty('--so', fly > 0 && fly < 1 ? (0.55 - (planeY - 300) / 400).toFixed(2) : '0');
      el.shadow.style.setProperty('--ss', (1 - (planeY - 300) / 300).toFixed(2));

      // readout + headline step
      if (p < 0.78) { el.label.textContent = 'Load'; el.unit.textContent = '%'; el.value.textContent = String(Math.round(seg(p, 0, 0.72) * 100)).padStart(3, '0'); }
      else { el.label.textContent = 'Speed'; el.unit.textContent = 'km/h'; el.value.textContent = String(Math.round(drive * 88)).padStart(3, '0'); }
      const ph = p < 0.30 ? 0 : p < 0.76 ? 1 : 2;
      if (ph !== phase) {
        phase = ph; sec.dataset.phase = String(ph);
        steps.forEach((s, i) => { s.classList.toggle('is-active', i === ph); s.classList.toggle('is-past', i < ph); });
      }
    }

    const fit = () => { scene.style.setProperty('--scale', Math.max(0.42, Math.min(1, stage.clientWidth / 1000)).toFixed(3)); };
    fit(); window.addEventListener('resize', fit);

    if (!motionOK) { render(0.72); return; }
    render(0);
    let ticking = false;
    const onScroll = () => {
      ticking = false;
      const r = sec.getBoundingClientRect(), vh = window.innerHeight;
      if (r.bottom < 0 || r.top > vh) return;
      render(clamp01(-r.top / Math.max(1, sec.offsetHeight - vh)));
    };
    window.addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
    onScroll();
  }

  /* ---------- 3D bars (CSS) -------------------------------------------- */
  const bars = { rx: -22, ry: -28, dragging: false, lx: 0, ly: 0 };
  function buildBars() {
    const row = $('barsRow');
    const W = 26, GAP = 8, n = TECHS.length, total = n * W + (n - 1) * GAP;
    row.innerHTML = TECHS.map((t, i) => {
      const x = -total / 2 + i * (W + GAP);
      return `<div class="bar" data-tech="${t.id}" style="--w:${W}px;--x:${x}px;--z:0px;--h:0px;--c:var(--s1);--i:${i}">
        <div class="face front"></div><div class="face back"></div>
        <div class="face left"></div><div class="face right"></div><div class="face top"></div>
        <span class="bar-value"></span>
        <span class="bar-label">${t.name}</span>
      </div>`;
    }).join('');

    const stage = $('barsStage'), scene = $('barsScene'), tip = $('barsTip');
    const apply = () => {
      scene.style.setProperty('--rx', `${bars.rx}deg`);  scene.style.setProperty('--ry', `${bars.ry}deg`);
      scene.style.setProperty('--irx', `${-bars.rx}deg`); scene.style.setProperty('--iry', `${-bars.ry}deg`);
    };
    apply();
    stage.addEventListener('pointerdown', e => { bars.dragging = true; bars.lx = e.clientX; bars.ly = e.clientY; stage.classList.add('dragging'); stage.setPointerCapture(e.pointerId); });
    stage.addEventListener('pointermove', e => {
      if (!bars.dragging) return;
      bars.ry += (e.clientX - bars.lx) * 0.4; bars.rx = Math.max(-70, Math.min(-5, bars.rx - (e.clientY - bars.ly) * 0.3));
      bars.lx = e.clientX; bars.ly = e.clientY; apply();
    });
    const stop = () => { bars.dragging = false; stage.classList.remove('dragging'); };
    stage.addEventListener('pointerup', stop); stage.addEventListener('pointercancel', stop);

    row.querySelectorAll('.bar').forEach(b => {
      const t = TECHS.find(x => x.id === b.dataset.tech);
      b.addEventListener('pointerenter', () => {
        tip.innerHTML = `<div class="t-title">${t.name}</div>
          <div class="t-row"><span>Adoption</span><b>${t.adoption}%</b></div>
          <div class="t-row"><span>Investment</span><b>$${t.investment}B</b></div>`;
        const br = b.querySelector('.top').getBoundingClientRect(), sr = stage.getBoundingClientRect();
        tip.style.left = `${br.left + br.width / 2 - sr.left}px`; tip.style.top = `${br.top - sr.top}px`;
        tip.hidden = false;
      });
      b.addEventListener('pointerleave', () => { tip.hidden = true; });
      b.addEventListener('click', e => { e.stopPropagation(); setTech(t.id === state.tech ? 'all' : t.id); });
    });
    requestAnimationFrame(updateBars);
  }
  let barsShown = false;   // bars stay flat until the panel scrolls into view
  function updateBars() {
    const m = state.metric, max = Math.max(...TECHS.map(t => t[m]));
    $('barsTitle').textContent = m === 'adoption' ? 'Adoption index' : 'Investment (USD billions)';
    document.querySelectorAll('#barsRow .bar').forEach(b => {
      const t = TECHS.find(x => x.id === b.dataset.tech);
      b.style.setProperty('--h', `${barsShown ? (t[m] / max) * 190 : 0}px`);
      b.querySelector('.bar-value').textContent = m === 'adoption' ? `${t.adoption}%` : `$${t.investment}B`;
      b.classList.toggle('selected', state.tech === t.id);
      b.classList.toggle('dim', state.tech !== 'all' && state.tech !== t.id);
    });
  }

  /* ---------- line chart (SVG) ----------------------------------------- */
  let lineData = [];
  function drawLine() {
    const svg = $('lineChart'), wrap = $('lineWrap');
    const W = wrap.clientWidth || 600, H = wrap.clientHeight || 260;
    const pad = { l: 44, r: 84, t: 12, b: 28 };
    const range = RANGES[state.range];
    lineData = seriesData(state.tech, state.range);
    const n = range.points;
    const all = lineData.flatMap(s => s.values);
    const max = niceCeil(Math.max(...all)), min = 0;
    const x = i => pad.l + (i / (n - 1)) * (W - pad.l - pad.r);
    const y = v => pad.t + (1 - (v - min) / (max - min)) * (H - pad.t - pad.b);

    const techName = state.tech === 'all' ? 'all technologies' : TECHS.find(t => t.id === state.tech).name;
    $('lineHint').textContent = `Requests per second · ${techName} · ${range.label}`;

    let out = '';
    const ticks = 4;
    for (let k = 0; k <= ticks; k++) {
      const v = min + (max - min) * k / ticks, yy = y(v);
      out += `<line class="${k ? 'gridline' : 'baseline'}" x1="${pad.l}" x2="${W - pad.r}" y1="${yy}" y2="${yy}"/>`;
      out += `<text class="tick" x="${pad.l - 8}" y="${yy + 4}" text-anchor="end">${fmt(v)}</text>`;
    }
    const step = Math.ceil(n / 8);
    for (let i = 0; i < n; i += step) out += `<text class="tick" x="${x(i)}" y="${H - 8}" text-anchor="middle">${range.fmt(i, n)}</text>`;

    lineData.forEach(s => {
      const d = s.values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
      out += `<path class="series-area" style="--c:${s.color}" d="${d} L${x(n - 1)} ${y(min)} L${x(0)} ${y(min)} Z"/>`;
      out += `<path class="series" style="--c:${s.color}" pathLength="1" d="${d}"/>`;
    });
    // direct end labels, nudged apart
    const labels = lineData.map(s => ({ s, y: y(s.values[n - 1]) })).sort((a, b) => a.y - b.y);
    for (let i = 1; i < labels.length; i++) if (labels[i].y - labels[i - 1].y < 14) labels[i].y = labels[i - 1].y + 14;
    labels.forEach(l => { out += `<text class="end-label" x="${x(n - 1) + 8}" y="${l.y + 4}">${l.s.name}</text>`; });

    out += `<g id="hoverLayer" style="display:none"><line class="crosshair" y1="${pad.t}" y2="${H - pad.b}"/>` +
      lineData.map(s => `<circle class="hover-dot" r="4" style="--c:${s.color}"/>`).join('') + `</g>`;
    out += `<rect class="hit" x="${pad.l}" y="${pad.t}" width="${W - pad.l - pad.r}" height="${H - pad.t - pad.b}"/>`;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.innerHTML = out;

    const hit = svg.querySelector('.hit'), layer = svg.querySelector('#hoverLayer'), tip = $('lineTip');
    const dots = layer.querySelectorAll('circle'), cross = layer.querySelector('line');
    hit.addEventListener('pointermove', e => {
      const r = svg.getBoundingClientRect();
      const mx = (e.clientX - r.left) * (W / r.width);
      const i = Math.round(((mx - pad.l) / (W - pad.l - pad.r)) * (n - 1));
      const ci = Math.max(0, Math.min(n - 1, i)), xx = x(ci);
      layer.style.display = '';
      cross.setAttribute('x1', xx); cross.setAttribute('x2', xx);
      lineData.forEach((s, k) => { dots[k].setAttribute('cx', xx); dots[k].setAttribute('cy', y(s.values[ci])); });
      tip.innerHTML = `<div class="t-title">${range.fmt(ci, n)}</div>` +
        lineData.map(s => `<div class="t-row"><span><span class="sw" style="--c:${s.color}"></span>${s.name}</span><b>${fmt(s.values[ci])}</b></div>`).join('');
      const top = Math.min(...lineData.map(s => y(s.values[ci])));
      tip.style.left = `${xx * (r.width / W)}px`; tip.style.top = `${top * (r.height / H)}px`;
      tip.hidden = false;
    });
    hit.addEventListener('pointerleave', () => { layer.style.display = 'none'; tip.hidden = true; });

    $('lineLegend').innerHTML = lineData.map(s => `<span class="item"><span class="swatch" style="--c:${s.color}"></span>${s.name}</span>`).join('');
    drawTable();
  }
  function niceCeil(v) { const p = Math.pow(10, Math.floor(Math.log10(v))); return Math.ceil(v / (p / 2)) * (p / 2); }
  function drawTable() {
    const range = RANGES[state.range], n = range.points;
    let html = `<table><thead><tr><th>Period</th>${lineData.map(s => `<th>${s.name}</th>`).join('')}</tr></thead><tbody>`;
    for (let i = 0; i < n; i++) html += `<tr><td>${range.fmt(i, n)}</td>${lineData.map(s => `<td>${fmt(s.values[i])}</td>`).join('')}</tr>`;
    $('lineTable').innerHTML = html + '</tbody></table>';
  }

  /* ---------- event feed ------------------------------------------------- */
  const EVENTS = [
    ['good',     'Deploy succeeded', 'edge cluster eu-west-2 · 42 nodes'],
    ['good',     'Autoscale up', 'inference pool +6 GPUs'],
    ['warning',  'Latency spike', 'p95 above 180 ms on 5G gateway'],
    ['good',     'Model rollout', 'recommendation v3.2 at 100%'],
    ['serious',  'Certificate expiring', 'blockchain relay · 3 days left'],
    ['good',     'Backup completed', 'object storage snapshot 4.1 TB'],
    ['warning',  'Packet loss', 'IoT mesh apac-south 0.8%'],
    ['critical', 'Node unreachable', 'quantum sim qs-07 · failover engaged'],
    ['good',     'Recovered', 'qs-07 back online after 41 s'],
    ['good',     'Security scan clean', '0 critical, 2 low findings'],
  ];
  const ICON = { good: '✓', warning: '!', serious: '!', critical: '×' };
  let feedIdx = 0;
  function pushEvent() {
    const [lvl, title, detail] = EVENTS[feedIdx++ % EVENTS.length];
    const li = document.createElement('li');
    const t = new Date().toLocaleTimeString(undefined, { hour12: false });
    li.innerHTML = `<span class="ico ${lvl}" aria-label="${lvl}">${ICON[lvl]}</span><div class="msg"><b>${title}</b><br><span>${detail}</span></div><time>${t}</time>`;
    const feed = $('feed');
    feed.prepend(li);
    while (feed.children.length > 8) feed.lastChild.remove();
  }

  /* ---------- motion: loader · scroll reveals · count-up · parallax · nav ---- */
  const motionOK = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Set synchronously (script sits at the end of <body>) so hidden states apply before first paint.
  if (motionOK) document.documentElement.classList.add('motion');
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);

  /** Animates a number from 0 to `to` in `el`, then hands the tile back to updateKpis. */
  function countUp(k, el, to, duration = 1100) {
    kpiMotion.counting.add(k.id);
    const t0 = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - t0) / duration);
      el.textContent = fmtKpi(k, to * easeOut(p));
      if (p < 1) requestAnimationFrame(step); else kpiMotion.counting.delete(k.id);
    };
    requestAnimationFrame(step);
  }

  /** Per-reveal hooks that need script, keyed by data-reveal value. */
  const onReveal = {
    stats() {
      kpiMotion.revealed = true;
      KPIS.forEach((k, i) => {
        const h = kpiHistory[k.id], el = $(`kpi-${k.id}`).querySelector('.num');
        if (motionOK) setTimeout(() => countUp(k, el, h[h.length - 1]), i * 100);
        else el.textContent = fmtKpi(k, h[h.length - 1]);
      });
    },
    bars() {
      const row = $('barsRow');
      row.classList.add('is-entering');
      barsShown = true; updateBars();
      setTimeout(() => row.classList.remove('is-entering'), 1500);
    },
  };

  function initReveals() {
    // stagger indices for children
    document.querySelectorAll('[data-reveal="lines"]').forEach(el => el.querySelectorAll('.line').forEach((l, i) => l.style.setProperty('--i', i)));
    document.querySelectorAll('[data-reveal="stagger"]').forEach(el => [...el.children].forEach((c, i) => c.style.setProperty('--i', i)));

    const targets = [...document.querySelectorAll('[data-reveal]')];
    const show = (el) => {
      if (el.classList.contains('is-in')) return;
      el.classList.add('is-in');
      const hook = onReveal[el.dataset.reveal]; if (hook) hook(el);
    };
    if (!motionOK || !('IntersectionObserver' in window)) { targets.forEach(show); return; }

    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => { if (e.isIntersecting) { show(e.target); io.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.05 });
    targets.forEach(el => io.observe(el));

    // The bottom margin can leave the last elements unreachable at max scroll: reveal them there.
    window.addEventListener('scroll', () => {
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2) {
        targets.forEach(el => { if (!el.classList.contains('is-in')) { show(el); io.unobserve(el); } });
      }
    }, { passive: true });
  }

  function initScrollEffects() {
    if (!motionOK) return;
    const hero = $('hero'), nav = $('nav');
    let lastY = window.scrollY, ticking = false;
    const apply = () => {
      ticking = false;
      const y = window.scrollY;
      // hero scrub: 0 at top → 1 when the hero has scrolled ~75% out
      const p = Math.max(0, Math.min(1, y / (hero.offsetHeight * 0.75)));
      hero.style.setProperty('--hero-p', p.toFixed(3));
      // nav: hide on scroll down, show on scroll up
      if (y > 140 && y > lastY + 4) nav.classList.add('is-hidden');
      else if (y < lastY - 4 || y < 140) nav.classList.remove('is-hidden');
      lastY = y;
    };
    window.addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(apply); } }, { passive: true });
    apply();
  }

  function buildTicker() {
    const items = TECHS.map(t => `<span>${t.name} <b>${t.adoption}%</b></span>`)
      .concat(['<span>Operating across APAC · EMEA · Americas</span>', '<span>One operator · every layer of the stack</span>']);
    const half = items.join('<span class="sep">/</span>');
    $('ticker').innerHTML = half + '<span class="sep">/</span>' + half + '<span class="sep">/</span>';
  }

  /** Short curtain loader on first visit per session; resolves when it starts lifting. */
  function runLoader() {
    const loader = $('loader');
    let seen = false; try { seen = sessionStorage.getItem('techpulse-loaded') === '1'; } catch (_) {}
    if (!motionOK || seen) { loader.classList.add('is-removed'); return Promise.resolve(); }
    try { sessionStorage.setItem('techpulse-loaded', '1'); } catch (_) {}

    document.body.classList.add('is-loading');
    const count = $('loaderCount'), bar = $('loaderBar'), list = $('loaderList');
    const regions = ['Global', 'APAC', 'EMEA', 'Americas', 'Edge', 'Core'];
    list.innerHTML = regions.map(r => `<li>${r}</li>`).join('');
    const lis = list.querySelectorAll('li');

    // piecewise "fake loading" curve: quick start, hesitation, finish
    const curve = (t) => t < 0.35 ? t * 1.1 : t < 0.7 ? 0.385 + (t - 0.35) * 0.9 : 0.7 + (t - 0.7) * 1.0;
    return new Promise(resolve => {
      const dur = 1250, t0 = performance.now();
      const step = (now) => {
        const t = Math.min(1, (now - t0) / dur), v = Math.min(1, curve(t));
        count.textContent = String(Math.round(v * 100)).padStart(3, '0');
        bar.style.width = `${(v * 100).toFixed(1)}%`;
        const idx = Math.min(regions.length - 1, Math.floor(v * regions.length));
        lis.forEach(li => { li.style.transform = `translateY(${-idx * 100}%)`; });
        if (t < 1) return requestAnimationFrame(step);
        setTimeout(() => {
          loader.classList.add('is-done');
          document.body.classList.remove('is-loading');
          resolve();
          setTimeout(() => loader.classList.add('is-removed'), 900);
        }, 150);
      };
      requestAnimationFrame(step);
    });
  }

  /* ---------- state changes ------------------------------------------------ */
  function setTech(id) {
    state.tech = id;
    $('techSelect').value = id;
    updateBars(); drawLine();
    $('resetFocus').hidden = id === 'all';
  }
  function setRange(r) {
    state.range = r;
    $('rangeControl').querySelectorAll('button').forEach(b => b.setAttribute('aria-checked', String(b.dataset.range === r)));
    drawLine();
  }
  function setMetric(m) {
    state.metric = m;
    $('metricControl').querySelectorAll('button').forEach(b => b.setAttribute('aria-checked', String(b.dataset.metric === m)));
    updateBars();
  }

  /* ---------- wiring --------------------------------------------------------- */
  function init() {
    const sel = $('techSelect');
    TECHS.forEach(t => { const o = document.createElement('option'); o.value = t.id; o.textContent = t.name; sel.append(o); });
    sel.addEventListener('change', () => setTech(sel.value));
    $('rangeControl').addEventListener('click', e => { const b = e.target.closest('button'); if (b) setRange(b.dataset.range); });
    $('metricControl').addEventListener('click', e => { const b = e.target.closest('button'); if (b) setMetric(b.dataset.metric); });
    $('autoRotate').addEventListener('click', e => { state.autoRotate = !state.autoRotate; e.currentTarget.setAttribute('aria-pressed', String(state.autoRotate)); });
    $('resetFocus').addEventListener('click', () => setTech('all'));
    $('resetFocus').hidden = true;
    $('tableToggle').addEventListener('click', e => {
      state.table = !state.table;
      e.currentTarget.setAttribute('aria-pressed', String(state.table));
      $('lineWrap').hidden = state.table; $('lineTable').hidden = !state.table;
    });
    $('themeToggle').addEventListener('click', () => {
      const root = document.documentElement;
      root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem('techpulse-theme', root.dataset.theme); } catch (_) {}
      readPalette();
    });
    try { const saved = localStorage.getItem('techpulse-theme'); if (saved) document.documentElement.dataset.theme = saved; } catch (_) {}

    readPalette();
    buildKpis(); buildSphere(); buildGlobe(); buildBars(); drawLine(); buildTicker();
    for (let i = 0; i < 4; i++) pushEvent();

    runLoader().then(() => { initReveals(); initScrollEffects(); initFreight(); });

    const tick = () => { $('clock').textContent = new Date().toLocaleTimeString(undefined, { hour12: false }); };
    tick(); setInterval(tick, 1000);
    setInterval(updateKpis, 2000);
    setInterval(pushEvent, 3500);

    let resizeT; window.addEventListener('resize', () => { clearTimeout(resizeT); resizeT = setTimeout(drawLine, 120); });

    // render loop + fps meter
    let frames = 0, last = performance.now();
    const loop = (now) => {
      drawSphere(); drawGlobe(now);
      frames++;
      if (now - last > 1000) { $('fps').textContent = `${frames} fps`; frames = 0; last = now; }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
