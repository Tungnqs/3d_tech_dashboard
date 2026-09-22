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

  function buildKpis() {
    const rnd = seeded(7);
    $('kpis').innerHTML = KPIS.map(k => {
      kpiHistory[k.id] = Array.from({ length: 24 }, () => k.base + (rnd() - 0.5) * k.jitter * 2);
      return `
        <article class="card card-3d kpi" id="kpi-${k.id}">
          <div class="label"><span>${k.label}</span><span class="delta"></span></div>
          <div class="value"><span class="num"></span>${k.unit ? `<small>${k.unit}</small>` : ''}</div>
          <svg viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true">
            <path class="spark-fill"></path><path class="spark"></path><circle class="spark-dot" r="3"></circle>
          </svg>
        </article>`;
    }).join('');
    updateKpis();
  }

  function updateKpis() {
    KPIS.forEach(k => {
      const h = kpiHistory[k.id];
      const next = k.base + (Math.random() - 0.5) * k.jitter * 2;
      h.push(next); h.shift();
      const el = $(`kpi-${k.id}`);
      const cur = h[h.length - 1], prev = h[h.length - 2];
      const diff = cur - prev;
      const good = k.up ? diff >= 0 : diff <= 0;
      el.querySelector('.num').textContent = cur.toLocaleString(undefined, { minimumFractionDigits: k.decimals, maximumFractionDigits: k.decimals });
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
    sphere.minor = Array.from({ length: 70 }, () => {
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
      `<span class="item"><span class="swatch" style="--c:var(--s3)"></span>Sub-nodes</span>`;
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
    const R = Math.min(sphere.w * 0.7, sphere.h) * 0.46;
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
    palette = { s1: css('--s1'), s2: css('--s2'), s3: css('--s3'), ink: css('--ink'), ink2: css('--ink-2'), muted: css('--muted'), grid: css('--grid'), axis: css('--axis'), surface: css('--surface') };
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

    // halo
    const R = Math.min(w * 0.7, h) * 0.46;
    const g = ctx.createRadialGradient(w / 2, h / 2, R * 0.2, w / 2, h / 2, R * 1.25);
    g.addColorStop(0, hexA(palette.s1, 0.10)); g.addColorStop(1, hexA(palette.s1, 0));
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);

    // wire rings (lat/long) for the globe feel
    ctx.lineWidth = 1; ctx.strokeStyle = hexA(palette.grid, 0.9);
    for (let lat = -60; lat <= 60; lat += 30) ring(ctx, lat);
    for (let lon = 0; lon < 180; lon += 45) meridian(ctx, lon);

    // minor nodes
    sphere.minor.forEach(p => {
      const pp = project(p); const a = 0.25 + (pp.z + 1) * 0.35;
      ctx.fillStyle = hexA(palette.s3, a);
      ctx.beginPath(); ctx.arc(pp.x, pp.y, 1.6 * pp.s + 0.6, 0, Math.PI * 2); ctx.fill();
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
    ctx.font = '12px system-ui, -apple-system, "Segoe UI", sans-serif';
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
      ctx.lineWidth = 2; ctx.strokeStyle = palette.surface;   // 2px surface ring
      ctx.stroke();
      if (pp.z > -0.15 || hovered || t.id === state.tech) {
        ctx.fillStyle = hexA(focused ? palette.ink : palette.ink2, focused ? Math.min(1, depthA + 0.2) : 0.55);
        ctx.textAlign = 'left';
        ctx.fillText(t.name, pp.x + r + 6, pp.y);
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
    hex = hex.replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    const n = parseInt(hex, 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${Math.max(0, Math.min(1, a)).toFixed(3)})`;
  }

  /* ---------- 3D bars (CSS) -------------------------------------------- */
  const bars = { rx: -22, ry: -28, dragging: false, lx: 0, ly: 0 };
  function buildBars() {
    const row = $('barsRow');
    const W = 26, GAP = 8, n = TECHS.length, total = n * W + (n - 1) * GAP;
    row.innerHTML = TECHS.map((t, i) => {
      const x = -total / 2 + i * (W + GAP);
      return `<div class="bar" data-tech="${t.id}" style="--w:${W}px;--x:${x}px;--z:0px;--h:0px;--c:var(--s1)">
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
  function updateBars() {
    const m = state.metric, max = Math.max(...TECHS.map(t => t[m]));
    $('barsTitle').textContent = m === 'adoption' ? 'Adoption index' : 'Investment (USD billions)';
    document.querySelectorAll('#barsRow .bar').forEach(b => {
      const t = TECHS.find(x => x.id === b.dataset.tech);
      b.style.setProperty('--h', `${(t[m] / max) * 190}px`);
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
      out += `<path class="series" style="--c:${s.color}" d="${d}"/>`;
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

  /* ---------- card tilt (mouse-following 3D) ------------------------------ */
  function initTilt() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    document.querySelectorAll('.card-3d').forEach(card => {
      const noTilt = card.id === 'sphereCard' || card.id === 'barsCard'; // those have their own 3D interaction
      if (noTilt) return;
      card.addEventListener('pointermove', e => {
        const r = card.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - 0.5, py = (e.clientY - r.top) / r.height - 0.5;
        card.style.transform = `rotateX(${(-py * 6).toFixed(2)}deg) rotateY(${(px * 8).toFixed(2)}deg) translateZ(6px)`;
      });
      card.addEventListener('pointerleave', () => { card.style.transform = ''; });
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
    buildKpis(); buildSphere(); buildBars(); drawLine(); initTilt();
    for (let i = 0; i < 4; i++) pushEvent();

    const tick = () => { $('clock').textContent = new Date().toLocaleTimeString(undefined, { hour12: false }); };
    tick(); setInterval(tick, 1000);
    setInterval(updateKpis, 2000);
    setInterval(pushEvent, 3500);

    let resizeT; window.addEventListener('resize', () => { clearTimeout(resizeT); resizeT = setTimeout(drawLine, 120); });

    // render loop + fps meter
    let frames = 0, last = performance.now();
    const loop = (now) => {
      drawSphere();
      frames++;
      if (now - last > 1000) { $('fps').textContent = `${frames} fps`; frames = 0; last = now; }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
