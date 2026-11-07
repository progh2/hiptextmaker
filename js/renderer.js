// 그래피티 텍스트 카드 렌더러 — 100% Canvas, 시드 기반이라 같은 spec 은 항상 같은 그림이 나온다
const TAU = Math.PI * 2;
const FALLBACK = '"Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif';

export const FONTS = [
  { id: 'Black Han Sans', label: '검은고딕 · 굵게', weight: 400 },
  { id: 'Dokdo', label: '독도 · 마커', weight: 400 },
  { id: 'East Sea Dokdo', label: '동해독도 · 붓터치', weight: 400 },
  { id: 'Do Hyeon', label: '도현 · 포스터', weight: 400 },
  { id: 'Jua', label: '주아 · 말랑', weight: 400 },
  { id: 'Gaegu', label: '개구 · 낙서', weight: 700 },
  { id: 'Nanum Pen Script', label: '나눔펜 · 손글씨', weight: 400 },
  { id: 'Yeon Sung', label: '연성 · 레트로', weight: 400 },
];

export const SIZES = {
  square: { label: '정사각 1080', w: 1080, h: 1080 },
  story: { label: '스토리 1080×1920', w: 1080, h: 1920 },
  wide: { label: '가로 1200×630', w: 1200, h: 630 },
  emoticon: { label: '이모티콘 360', w: 360, h: 360 },
};

export const TEMPLATES = [
  { id: 'spray', label: '스프레이 월', font: 'Black Han Sans' },
  { id: 'neon', label: '네온 나이트', font: 'Dokdo' },
  { id: 'sticker', label: '스티커 페이퍼', font: 'Black Han Sans' },
  { id: 'tag', label: '콘크리트 태그', font: 'East Sea Dokdo' },
  { id: 'poster', label: '찢긴 포스터', font: 'Do Hyeon' },
  { id: 'emoji', label: '이모티콘', font: 'Jua' },
];

export const MOOD_TEMPLATE = {
  fire: 'spray', rebel: 'tag', resolve: 'poster', joy: 'emoji',
  love: 'sticker', calm: 'neon', sad: 'neon', chill: 'sticker',
};

// ---------- utils ----------
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hexToRgb(hex) {
  const h = String(hex).replace('#', '');
  const n = parseInt(h.length === 3 ? h.replace(/./g, '$&$&') : h, 16) || 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgba(hex, a) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}
function shade(hex, amt) {
  const c = hexToRgb(hex).map((v) => Math.max(0, Math.min(255, Math.round(v + amt))));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}
function luminance(hex) {
  const [r, g, b] = hexToRgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}
function fontStr(fontId, px) {
  const f = FONTS.find((x) => x.id === fontId) || FONTS[0];
  return `${f.weight} ${Math.round(px)}px "${f.id}", ${FALLBACK}`;
}

export async function ensureFont(fontId, text = '가A') {
  if (!document.fonts?.load) return;
  try {
    await Promise.race([
      document.fonts.load(fontStr(fontId, 64), text),
      new Promise((r) => setTimeout(r, 4000)),
    ]);
  } catch {
    /* 폰트 실패 시 시스템 폰트로 그린다 */
  }
}

// ---------- text layout ----------
function wrapPara(ctx, para, maxW) {
  const words = para.split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  const pushLong = (word) => {
    let chunk = '';
    for (const ch of word) {
      if (ctx.measureText(chunk + ch).width > maxW && chunk) {
        lines.push(chunk);
        chunk = ch;
      } else chunk += ch;
    }
    return chunk;
  };
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(test).width <= maxW) cur = test;
    else {
      if (cur) lines.push(cur);
      cur = ctx.measureText(w).width > maxW ? pushLong(w) : w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

function layoutText(ctx, text, fontId, maxW, maxH, minPx, maxPx, lh) {
  const paras = text.split('\n').map((p) => p.trim()).filter(Boolean);
  if (!paras.length) paras.push(' ');
  const attempt = (px, keepBreaks) => {
    ctx.font = fontStr(fontId, px);
    const lines = paras.flatMap((p) => wrapPara(ctx, p, maxW));
    const ok = lines.length * px * lh <= maxH && lines.every((l) => ctx.measureText(l).width <= maxW)
      && (!keepBreaks || lines.length === paras.length);
    return { ok, lines };
  };
  const search = (keepBreaks) => {
    let lo = minPx, hi = maxPx, best = null;
    while (hi - lo > 1) {
      const mid = (lo + hi) / 2;
      const r = attempt(mid, keepBreaks);
      if (r.ok) { lo = mid; best = { px: mid, lines: r.lines }; } else hi = mid;
    }
    return best;
  };
  let best = search(false);
  // 사용자가 직접 나눈 줄을 유지할 수 있으면 (글자가 너무 작아지지 않는 선에서) 그쪽을 우선
  const kept = search(true);
  if (kept && (!best || kept.px >= best.px * 0.62)) best = kept;
  if (!best) best = { px: minPx, lines: attempt(minPx).lines };
  ctx.font = fontStr(fontId, best.px);
  return best;
}

// ---------- paint primitives ----------
function grain(ctx, W, H, rnd, alpha, dark = false) {
  const n = document.createElement('canvas');
  n.width = n.height = 128;
  const nctx = n.getContext('2d');
  const img = nctx.createImageData(128, 128);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = dark ? 0 : rnd() * 255;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = rnd() * 255 * alpha;
  }
  nctx.putImageData(img, 0, 0);
  ctx.save();
  ctx.fillStyle = ctx.createPattern(n, 'repeat');
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

function brickWall(ctx, W, H, s, rnd, base, mortar, variance = 18) {
  ctx.fillStyle = mortar;
  ctx.fillRect(0, 0, W, H);
  const bh = 64 * s, bw = 160 * s, gap = 7 * s;
  for (let row = 0, y = 0; y < H; row++, y += bh) {
    const off = row % 2 ? bw / 2 : 0;
    for (let x = -off; x < W; x += bw) {
      ctx.fillStyle = shade(base, (rnd() - 0.5) * variance);
      ctx.fillRect(x + gap / 2, y + gap / 2, bw - gap, bh - gap);
    }
  }
}

function vignette(ctx, W, H, strength = 0.6) {
  const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.25, W / 2, H / 2, Math.max(W, H) * 0.75);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, `rgba(0,0,0,${strength})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

function dot(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
}

function drip(ctx, x, y, w, len, color, outline, ow) {
  ctx.save();
  ctx.lineCap = 'round';
  if (outline) {
    ctx.strokeStyle = outline;
    ctx.fillStyle = outline;
    ctx.lineWidth = w + ow * 2;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + len); ctx.stroke();
    dot(ctx, x, y + len, w * 0.75 + ow);
  }
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = w;
  ctx.beginPath(); ctx.moveTo(x, y - w); ctx.lineTo(x, y + len); ctx.stroke();
  dot(ctx, x, y + len, w * 0.75);
  ctx.restore();
}

function sprayBlob(ctx, x, y, r, color, rnd, alpha = 0.9, drips = 0) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba(color, alpha));
  g.addColorStop(0.45, rgba(color, alpha * 0.75));
  g.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  ctx.fillStyle = rgba(color, Math.min(1, alpha + 0.1));
  const n = Math.round(60 + r * 0.35);
  for (let i = 0; i < n; i++) {
    const a = rnd() * TAU;
    const d = r * (0.55 + Math.pow(rnd(), 2) * 0.85);
    dot(ctx, x + Math.cos(a) * d, y + Math.sin(a) * d, Math.pow(rnd(), 3) * r * 0.04 + r * 0.004);
  }
  for (let i = 0; i < drips; i++) {
    const dx = x + (rnd() - 0.5) * r * 0.9;
    drip(ctx, dx, y + r * 0.2, r * (0.02 + rnd() * 0.025), r * (0.3 + rnd() * 0.8), rgba(color, alpha));
  }
}

function splatter(ctx, W, H, rnd, colors, count, s) {
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = colors[i % colors.length];
    const x = rnd() * W, y = rnd() * H;
    const r = (Math.pow(rnd(), 4) * 18 + 2) * s;
    dot(ctx, x, y, r);
    for (let j = 0; j < 6; j++) {
      const a = rnd() * TAU, d = r * (1.5 + rnd() * 3);
      dot(ctx, x + Math.cos(a) * d, y + Math.sin(a) * d, r * rnd() * 0.3);
    }
  }
}

function tornRect(ctx, cx, cy, w, h, rot, color, rnd, jag, shadow = true) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rot);
  const pts = [];
  const step = Math.max(8, jag * 1.6);
  for (let x = -w / 2; x <= w / 2; x += step) pts.push([x, -h / 2 + (rnd() - 0.5) * jag]);
  for (let y = -h / 2; y <= h / 2; y += step * 2) pts.push([w / 2 + (rnd() - 0.5) * jag * 0.4, y]);
  for (let x = w / 2; x >= -w / 2; x -= step) pts.push([x, h / 2 + (rnd() - 0.5) * jag]);
  for (let y = h / 2; y >= -h / 2; y -= step * 2) pts.push([-w / 2 + (rnd() - 0.5) * jag * 0.4, y]);
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  if (shadow) {
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = jag * 1.5;
    ctx.shadowOffsetY = jag * 0.6;
  }
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

function tape(ctx, x, y, w, h, rot) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.fillStyle = 'rgba(245,238,200,0.72)';
  ctx.fillRect(-w / 2, -h / 2, w, h);
  ctx.restore();
}

// ---------- doodles ----------
function roughStroke(ctx, drawPath, color, lw, rnd, passes = 2) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (let p = 0; p < passes; p++) {
    const j = () => (rnd() - 0.5) * lw * 0.8;
    ctx.beginPath();
    drawPath(j);
    ctx.stroke();
  }
  ctx.restore();
}

function crown(ctx, x, y, size, color, rot, rnd) {
  const pts = [[-1, 0.5], [-1.05, -0.45], [-0.5, 0.05], [0, -0.65], [0.5, 0.05], [1.05, -0.45], [1, 0.5]];
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  roughStroke(ctx, (j) => {
    pts.forEach(([px, py], i) => {
      const X = px * size + j(), Y = py * size + j();
      i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y);
    });
    ctx.closePath();
  }, color, size * 0.13, rnd);
  ctx.fillStyle = color;
  [[-1.05, -0.45], [0, -0.65], [1.05, -0.45]].forEach(([px, py]) => dot(ctx, px * size, py * size - size * 0.12, size * 0.1));
  ctx.restore();
}

function heart(ctx, x, y, size, color, rot, rnd, fill = false) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  const path = (j) => {
    ctx.moveTo(0 + j(), size * 0.35);
    ctx.bezierCurveTo(-size * 1.1 + j(), -size * 0.35, -size * 0.45, -size * 1.0 + j(), 0, -size * 0.38);
    ctx.bezierCurveTo(size * 0.45, -size * 1.0 + j(), size * 1.1 + j(), -size * 0.35, 0, size * 0.35);
  };
  if (fill) {
    ctx.fillStyle = color;
    ctx.beginPath(); path(() => 0); ctx.fill();
  }
  roughStroke(ctx, path, color, size * 0.14, rnd);
  ctx.restore();
}

function sparkle(ctx, x, y, size, color, rot, rnd) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  roughStroke(ctx, (j) => {
    [-0.55, 0, 0.55].forEach((a) => {
      const ang = -Math.PI / 2 + a;
      ctx.moveTo(Math.cos(ang) * size * 0.35, Math.sin(ang) * size * 0.35);
      ctx.lineTo(Math.cos(ang) * size + j(), Math.sin(ang) * size + j());
    });
  }, color, size * 0.14, rnd, 1);
  ctx.restore();
}

function star(ctx, x, y, size, color, rot, rnd, fill = false) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  const path = (j) => {
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? size * 0.42 : size;
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const X = Math.cos(a) * r + j(), Y = Math.sin(a) * r + j();
      i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y);
    }
    ctx.closePath();
  };
  if (fill) { ctx.fillStyle = color; ctx.beginPath(); path(() => 0); ctx.fill(); }
  roughStroke(ctx, path, color, size * 0.12, rnd);
  ctx.restore();
}

function zigzag(ctx, x1, x2, y, amp, color, lw, rnd) {
  roughStroke(ctx, (j) => {
    const steps = Math.max(4, Math.round((x2 - x1) / (amp * 1.6)));
    for (let i = 0; i <= steps; i++) {
      const X = x1 + ((x2 - x1) * i) / steps;
      const Y = y + (i % 2 ? -amp : amp) * 0.5 + j();
      i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y);
    }
  }, color, lw, rnd, 1);
}

// ---------- graffiti text ----------
function paintText(ctx, str, x, y, px, o, rnd) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(o.rot || 0);
  ctx.font = fontStr(o.font, px);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;
  const w = ctx.measureText(str).width;

  if (o.extrude) {
    const depth = 6, dx = px * 0.012, dy = px * 0.014;
    ctx.fillStyle = o.extrude;
    ctx.strokeStyle = o.extrude;
    ctx.lineWidth = o.strokeW || 0;
    for (let i = depth; i > 0; i--) {
      if (o.strokeW) ctx.strokeText(str, i * dx, i * dy);
      ctx.fillText(str, i * dx, i * dy);
    }
  }
  if (o.outer) {
    ctx.strokeStyle = o.outer;
    ctx.lineWidth = o.outerW;
    ctx.strokeText(str, 0, 0);
  }
  if (o.glow) {
    ctx.shadowColor = o.glow;
    ctx.shadowBlur = px * 0.35;
    ctx.strokeStyle = o.glow;
    ctx.lineWidth = px * 0.07;
    ctx.strokeText(str, 0, 0);
    ctx.strokeText(str, 0, 0);
  }
  if (o.strokeW) {
    ctx.strokeStyle = o.stroke;
    ctx.lineWidth = o.strokeW;
    ctx.strokeText(str, 0, 0);
  }
  if (o.drips) {
    for (let i = 0; i < o.drips; i++) {
      const dx = -w / 2 + w * (0.08 + rnd() * 0.84);
      drip(ctx, dx, px * 0.22, px * (0.045 + rnd() * 0.035), px * (0.2 + rnd() * 0.75),
        o.dripColor || o.fill, o.strokeW ? o.stroke : null, o.strokeW ? px * 0.025 : 0);
    }
  }
  if (o.glow) {
    ctx.shadowColor = o.glow;
    ctx.shadowBlur = px * 0.18;
  }
  ctx.fillStyle = o.fill;
  ctx.fillText(str, 0, 0);
  if (o.shine) {
    const g = ctx.createLinearGradient(0, -px * 0.5, 0, px * 0.1);
    g.addColorStop(0, 'rgba(255,255,255,0.45)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.shadowBlur = 0;
    ctx.fillStyle = g;
    ctx.fillText(str, 0, 0);
  }
  ctx.restore();
  return w;
}

// ---------- templates ----------
// 각 템플릿: area(텍스트 영역 비율), bg(), decor(), line() 스타일, ink(출처 글자색)
const T = {
  spray: {
    area: { w: 0.84, h: 0.62 }, lh: 1.08,
    bg(c) {
      const { ctx, W, H, s, rnd, pal } = c;
      brickWall(ctx, W, H, s, rnd, '#2a2830', '#101014', 16);
      ctx.fillStyle = 'rgba(0,0,0,0.38)';
      ctx.fillRect(0, 0, W, H);
      const m = Math.min(W, H);
      sprayBlob(ctx, W * 0.1, H * 0.14, m * 0.42, pal[0], rnd, 0.85, 3);
      sprayBlob(ctx, W * 0.92, H * 0.88, m * 0.45, pal[2], rnd, 0.85, 0);
      sprayBlob(ctx, W * 0.9, H * 0.1, m * 0.22, pal[1], rnd, 0.7, 2);
      sprayBlob(ctx, W * 0.5, H * 0.5, m * 0.5, pal[0], rnd, 0.18, 0);
      splatter(ctx, W, H, rnd, [pal[1], '#ffffff', pal[0]], 14, s);
      vignette(ctx, W, H, 0.55);
      grain(ctx, W, H, rnd, 0.12);
    },
    decor(c, g) {
      const { ctx, W, H, s, rnd, pal } = c;
      const m = Math.min(W, H) / 1080;
      crown(ctx, Math.max(90 * m, g.left + 30 * m), Math.max(80 * m, g.top - 40 * m), 70 * m, pal[1], -0.25, rnd);
      sparkle(ctx, Math.min(W - 70 * m, g.right + 10 * m), Math.max(90 * m, g.top - 10 * m), 60 * m, pal[1], 0.35, rnd);
      heart(ctx, W - 120 * m, H - 120 * m, 60 * m, pal[0], 0.2, rnd);
      void s;
    },
    line(c, i, n, emph) {
      const { pal } = c;
      const fill = i === emph ? pal[0] : i % 2 ? pal[1] : '#ffffff';
      return {
        fill, stroke: '#0a0a0a', strokeWRatio: 0.17, extrude: '#000000', shine: true,
        drips: i === n - 1 ? 3 : i === emph ? 1 : 0, rot: (c.rnd() - 0.5) * 0.09,
      };
    },
    ink: '#ffffff',
  },

  neon: {
    area: { w: 0.82, h: 0.6 }, lh: 1.15,
    bg(c) {
      const { ctx, W, H, s, rnd, pal } = c;
      brickWall(ctx, W, H, s, rnd, '#1a1626', '#08060e', 10);
      ctx.fillStyle = 'rgba(6,4,14,0.72)';
      ctx.fillRect(0, 0, W, H);
      const m = Math.min(W, H);
      sprayBlob(ctx, W * 0.2, H * 0.25, m * 0.5, pal[0], rnd, 0.22);
      sprayBlob(ctx, W * 0.85, H * 0.8, m * 0.5, pal[2], rnd, 0.22);
      vignette(ctx, W, H, 0.7);
      grain(ctx, W, H, rnd, 0.08);
    },
    decor(c, g) {
      const { ctx, W, H, rnd, pal } = c;
      const m = Math.min(W, H) / 1080;
      ctx.save();
      ctx.shadowColor = pal[1];
      ctx.shadowBlur = 30 * m;
      zigzag(ctx, g.left + 20 * m, g.right - 20 * m, Math.min(H - 60 * m, g.bottom + 40 * m), 26 * m, pal[1], 8 * m, rnd);
      ctx.shadowColor = pal[0];
      star(ctx, Math.max(80 * m, g.left - 10 * m), Math.max(80 * m, g.top - 30 * m), 42 * m, pal[0], -0.2, rnd);
      ctx.shadowColor = pal[2];
      heart(ctx, Math.min(W - 80 * m, g.right + 10 * m), Math.max(90 * m, g.top - 20 * m), 40 * m, pal[2], 0.25, rnd);
      ctx.restore();
    },
    line(c, i) {
      const col = c.pal[i % 3];
      return { fill: '#fff8fe', glow: col, rot: (c.rnd() - 0.5) * 0.06 };
    },
    ink: '#f2e9ff',
  },

  sticker: {
    area: { w: 0.7, h: 0.54 }, lh: 1.12,
    bg(c, g) {
      const { ctx, W, H, s, rnd, pal } = c;
      ctx.fillStyle = '#121212';
      ctx.fillRect(0, 0, W, H);
      const m = Math.min(W, H);
      sprayBlob(ctx, W * 0.15, H * 0.85, m * 0.55, pal[1], rnd, 0.75, 0);
      sprayBlob(ctx, W * 0.88, H * 0.12, m * 0.45, pal[0], rnd, 0.7, 2);
      splatter(ctx, W, H, rnd, [pal[1], pal[0], '#ffffff'], 18, s);
      grain(ctx, W, H, rnd, 0.1);
      // 종이 스티커
      const pw = Math.min(W * 0.9, g.right - g.left + 120 * s);
      const ph = Math.min(H * 0.86, g.bottom - g.top + 120 * s);
      c.paperRot = (rnd() - 0.5) * 0.08;
      c.paper = { cx: W / 2, cy: (g.top + g.bottom) / 2, w: pw, h: ph };
      tornRect(ctx, W / 2, c.paper.cy, pw, ph, c.paperRot, '#f6f1e4', rnd, 10 * s);
      tape(ctx, W / 2 - pw / 2 + 20 * s, c.paper.cy - ph / 2 + 10 * s, 150 * s, 44 * s, -0.7);
      tape(ctx, W / 2 + pw / 2 - 20 * s, c.paper.cy + ph / 2 - 10 * s, 150 * s, 44 * s, -0.7);
    },
    decor(c) {
      const { ctx, rnd, pal, paper } = c;
      const m = Math.min(c.W, c.H) / 1080;
      crown(ctx, paper.cx + paper.w / 2 - 50 * m, paper.cy - paper.h / 2 - 5 * m, 55 * m, pal[0], 0.3, rnd);
      heart(ctx, paper.cx - paper.w / 2 + 45 * m, paper.cy + paper.h / 2 - 50 * m, 42 * m, pal[0], -0.25, rnd, true);
    },
    line(c, i, n, emph) {
      const { pal } = c;
      const hl = i === emph ? pal[1] : null;
      return { fill: i === emph ? '#111111' : i % 2 ? pal[0] : '#111111', stroke: '#111111', strokeWRatio: i % 2 && i !== emph ? 0.08 : 0, highlight: hl, rot: (c.paperRot || 0) + (c.rnd() - 0.5) * 0.04 };
    },
    ink: '#ffffff',
  },

  tag: {
    area: { w: 0.84, h: 0.6 }, lh: 1.05,
    bg(c) {
      const { ctx, W, H, s, rnd, pal } = c;
      ctx.fillStyle = '#d8d4cb';
      ctx.fillRect(0, 0, W, H);
      for (let i = 0; i < 40; i++) {
        const x = rnd() * W, y = rnd() * H, r = (40 + rnd() * 220) * s;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, `rgba(80,74,64,${0.04 + rnd() * 0.08})`);
        g.addColorStop(1, 'rgba(80,74,64,0)');
        ctx.fillStyle = g;
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
      }
      const m = Math.min(W, H);
      sprayBlob(ctx, W * 0.5, H * 0.5, m * 0.55, pal[2], rnd, 0.35);
      sprayBlob(ctx, W * 0.08, H * 0.92, m * 0.3, pal[0], rnd, 0.6, 2);
      splatter(ctx, W, H, rnd, ['#111111'], 10, s);
      grain(ctx, W, H, rnd, 0.22);
    },
    decor(c, g) {
      const { ctx, W, H, rnd, pal } = c;
      const m = Math.min(W, H) / 1080;
      crown(ctx, Math.max(90 * m, g.left + 40 * m), Math.max(80 * m, g.top - 40 * m), 65 * m, '#111111', -0.2, rnd);
      sparkle(ctx, Math.min(W - 70 * m, g.right), Math.max(90 * m, g.top - 10 * m), 55 * m, pal[0], 0.4, rnd);
      star(ctx, W - 110 * m, H - 110 * m, 40 * m, '#111111', 0.3, rnd);
    },
    line(c, i) {
      const { pal } = c;
      return {
        fill: i % 2 ? pal[1] : pal[0], stroke: '#111111', strokeWRatio: 0.16, outer: '#ffffff', outerWRatio: 0.3,
        extrude: '#111111', drips: 2, dripColor: '#111111', rot: (c.rnd() - 0.5) * 0.12,
      };
    },
    ink: '#1a1a1a',
  },

  poster: {
    area: { w: 0.8, h: 0.58 }, lh: 1.32,
    bg(c) {
      const { ctx, W, H, s, rnd, pal } = c;
      ctx.fillStyle = '#151515';
      ctx.fillRect(0, 0, W, H);
      grain(ctx, W, H, rnd, 0.15);
      tornRect(ctx, W * 0.15, H * 0.12, W * 0.7, H * 0.28, -0.12, pal[2], rnd, 16 * s);
      tornRect(ctx, W * 0.9, H * 0.9, W * 0.75, H * 0.3, -0.1, pal[0], rnd, 16 * s);
      tornRect(ctx, W * 0.5, H * 0.5, W * 0.92, H * 0.72, 0.02, '#f3f0ea', rnd, 14 * s);
      splatter(ctx, W, H, rnd, ['#111111', pal[0]], 10, s);
      grain(ctx, W, H, rnd, 0.1, true);
    },
    decor(c, g) {
      const { ctx, W, H, rnd, pal } = c;
      const m = Math.min(W, H) / 1080;
      crown(ctx, Math.max(100 * m, g.left + 20 * m), Math.max(90 * m, g.top - 50 * m), 60 * m, '#111111', -0.2, rnd);
      sparkle(ctx, Math.min(W - 80 * m, g.right + 20 * m), Math.max(100 * m, g.top - 20 * m), 55 * m, pal[0], 0.4, rnd);
      star(ctx, W * 0.14, H * 0.84, 34 * m, pal[0], 0.2, rnd, true);
    },
    line(c, i, n, emph) {
      const { pal } = c;
      const scheme = [
        { bar: pal[1], fill: '#111111' },
        { bar: '#111111', fill: '#ffffff' },
        { bar: pal[0], fill: '#ffffff' },
      ][i === emph ? 2 : i % 2];
      return { fill: scheme.fill, bar: scheme.bar, rot: (c.rnd() - 0.5) * 0.06 };
    },
    ink: '#151515',
  },

  emoji: {
    area: { w: 0.88, h: 0.78 }, lh: 1.02,
    bg(c) {
      const { ctx, W, H, rnd, pal, spec } = c;
      if (spec.transparent) return;
      const m = Math.min(W, H);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, W, H);
      sprayBlob(ctx, W * 0.5, H * 0.5, m * 0.62, pal[2], rnd, 0.45);
    },
    decor(c, g) {
      const { ctx, W, H, rnd, pal } = c;
      const m = Math.min(W, H) / 1080;
      heart(ctx, Math.min(W - 80 * m, g.right + 10 * m), Math.max(80 * m, g.top - 10 * m), 55 * m, pal[0], 0.25, rnd, true);
      sparkle(ctx, Math.max(80 * m, g.left - 10 * m), Math.max(90 * m, g.top - 10 * m), 60 * m, '#111111', -0.4, rnd);
    },
    line(c, i) {
      const { pal } = c;
      return {
        fill: pal[i % 3], stroke: '#111111', strokeWRatio: 0.14, outer: '#ffffff', outerWRatio: 0.34,
        shine: true, rot: (c.rnd() - 0.5) * 0.18,
      };
    },
    ink: '#111111',
  },
};

// ---------- main ----------
/**
 * spec: { text, source, template, font, size, palette[3], seed, showSource, transparent }
 * opts.maxDim: 썸네일용 축소 렌더
 */
export async function renderCard(canvas, spec, opts = {}) {
  const size = SIZES[spec.size] || SIZES.square;
  let W = size.w, H = size.h;
  if (opts.maxDim && Math.max(W, H) > opts.maxDim) {
    const k = opts.maxDim / Math.max(W, H);
    W = Math.round(W * k);
    H = Math.round(H * k);
  }
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const tpl = T[spec.template] || T.spray;
  const fontId = spec.font || 'Black Han Sans';
  const text = (spec.text || '').trim() || '...';
  const showSource = spec.showSource && spec.source && spec.size !== 'emoticon';

  await Promise.all([ensureFont(fontId, text), showSource ? ensureFont('Nanum Pen Script', spec.source) : null]);

  const s = Math.min(W, H) / 1080;
  const rnd = mulberry32(spec.seed || 1);
  const pal = (spec.palette && spec.palette.length >= 3 ? spec.palette : ['#ff2bd6', '#c6ff00', '#00d1ff']).slice(0, 3);
  const c = { ctx, W, H, s, rnd, pal, spec };

  ctx.clearRect(0, 0, W, H);

  // 1) 레이아웃 (배경·장식이 텍스트 위치를 알아야 하므로 먼저)
  const maxW = W * tpl.area.w;
  const maxH = H * tpl.area.h * (showSource ? 0.92 : 1);
  const { px, lines } = layoutText(ctx, text, fontId, maxW, maxH, 18 * s, 250 * s, tpl.lh);
  const lineH = px * tpl.lh;
  const cy = H * (showSource ? 0.47 : 0.5);
  const top = cy - (lines.length * lineH) / 2;
  const widths = lines.map((l) => ctx.measureText(l).width);
  const maxLineW = Math.max(...widths);
  const geom = { top, bottom: top + lines.length * lineH, left: W / 2 - maxLineW / 2, right: W / 2 + maxLineW / 2, px };

  // 2) 배경
  ctx.save(); tpl.bg(c, geom); ctx.restore();
  // 3) 장식
  ctx.save(); tpl.decor(c, geom); ctx.restore();

  // 4) 텍스트
  const emph = lines.length > 1 ? Math.floor(rnd() * lines.length) : -1;
  lines.forEach((line, i) => {
    const st = tpl.line(c, i, lines.length, emph);
    const y = top + lineH * (i + 0.5);
    if (st.bar || st.highlight) {
      ctx.save();
      const bw = widths[i] + px * 0.5, bh = px * (st.bar ? 1.12 : 0.55);
      const by = st.bar ? y : y + px * 0.12;
      if (st.bar) tornRect(ctx, W / 2, by, bw, bh, st.rot, st.bar, rnd, 5 * s, false);
      else tornRect(ctx, W / 2, by, bw, bh, st.rot - 0.02, rgba(st.highlight, 0.9), rnd, 4 * s, false);
      ctx.restore();
    }
    paintText(ctx, line, W / 2, y, px, {
      ...st,
      font: fontId,
      strokeW: st.strokeWRatio ? px * st.strokeWRatio : 0,
      outerW: st.outerWRatio ? px * st.outerWRatio : 0,
    }, rnd);
  });

  // 5) 출처
  if (showSource) {
    ctx.save();
    const fs = 44 * s;
    ctx.font = fontStr('Nanum Pen Script', fs);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const y = Math.min(H - 70 * s, geom.bottom + (H - geom.bottom) * 0.5);
    let label = `— ${spec.source}`;
    while (ctx.measureText(label).width > W * 0.86 && label.length > 4) label = label.slice(0, -2) + '…';
    const ink = tpl.ink;
    ctx.lineWidth = 8 * s;
    ctx.strokeStyle = luminance(ink) > 0.5 ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.6)';
    ctx.strokeText(label, W / 2, y);
    ctx.fillStyle = ink;
    ctx.fillText(label, W / 2, y);
    ctx.restore();
  }

  // 6) 워터마크
  if (spec.size !== 'emoticon' && !spec.transparent) {
    ctx.save();
    ctx.font = fontStr('Black Han Sans', 24 * s);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = luminance(tpl.ink) > 0.5 ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.4)';
    ctx.fillText('TEXT HiP', W - 24 * s, H - 18 * s);
    ctx.restore();
  }
  return canvas;
}

export function canvasToBlob(canvas) {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('이미지 변환 실패'))), 'image/png')
  );
}
