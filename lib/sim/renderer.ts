import { ARENA, FONT, GOAL_DEPTH, GOAL_HALF, H, POST_R, RIM_WIDTH, W } from "./constants";
import type { Ball, MatchConfig, Overlay, Particle, Phase, Team } from "./types";

export interface RenderState {
  config: MatchConfig;
  balls: Ball[];
  goalAngle: number;
  score: [number, number];
  phase: Phase;
  clockLabel: string;
  phaseLabel: string;
  particles: Particle[];
  overlays: Overlay[];
  shake: number;
  postFlash: [number, number];
  scorePulse: [number, number];
  netFlash: number;
  netFlashColor: string;
  time: number;
}

const upper = (s: string) => s.toLocaleUpperCase("tr-TR");

function font(size: number, weight = 900) {
  return `${weight} ${size}px ${FONT}`;
}

/** Metni verilen genişliğe sığacak şekilde küçültür */
function fitFont(ctx: CanvasRenderingContext2D, text: string, maxW: number, size: number, weight = 900) {
  let s = size;
  ctx.font = font(s, weight);
  while (s > 12 && ctx.measureText(text).width > maxW) {
    s -= 2;
    ctx.font = font(s, weight);
  }
  return s;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return upper(parts[0].slice(0, 3));
  return upper(parts.slice(0, 3).map((p) => p[0]).join(""));
}

/** Takım rozeti: logo daire içine maskelenmiş (cover), yoksa baş harfler */
export function drawBadge(ctx: CanvasRenderingContext2D, team: Team, x: number, y: number, r: number, angle = 0, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);

  // Dış halka + parlama
  ctx.shadowColor = team.color;
  ctx.shadowBlur = r * 0.5;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fillStyle = team.color;
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.rotate(angle);
  const inner = r - Math.max(4, r * 0.1);
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, inner, 0, Math.PI * 2);
  ctx.clip();
  const img = team.logo;
  if (img && img.complete && img.naturalWidth > 0) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(-inner, -inner, inner * 2, inner * 2);
    const s = Math.max((inner * 2) / img.naturalWidth, (inner * 2) / img.naturalHeight);
    const w = img.naturalWidth * s;
    const h = img.naturalHeight * s;
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
  } else {
    const g = ctx.createRadialGradient(-inner * 0.3, -inner * 0.4, inner * 0.1, 0, 0, inner);
    g.addColorStop(0, "#ffffff");
    g.addColorStop(0.15, team.color);
    g.addColorStop(1, shade(team.color, -0.45));
    ctx.fillStyle = g;
    ctx.fillRect(-inner, -inner, inner * 2, inner * 2);
    const text = initials(team.name);
    fitFont(ctx, text, inner * 1.5, inner * 0.8);
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = inner * 0.08;
    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.strokeText(text, 0, inner * 0.05);
    ctx.fillText(text, 0, inner * 0.05);
  }
  // Parlak yansıma
  const hl = ctx.createLinearGradient(0, -inner, 0, inner);
  hl.addColorStop(0, "rgba(255,255,255,0.28)");
  hl.addColorStop(0.45, "rgba(255,255,255,0)");
  ctx.fillStyle = hl;
  ctx.fillRect(-inner, -inner, inner * 2, inner * 2);
  ctx.restore();

  ctx.lineWidth = Math.max(2, r * 0.05);
  ctx.strokeStyle = "rgba(255,255,255,0.9)";
  ctx.beginPath();
  ctx.arc(0, 0, r - ctx.lineWidth / 2, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

/** #rrggbb rengini aydınlat/karart (amt: -1..1) */
export function shade(hex: string, amt: number) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  let r = (n >> 16) & 255,
    g = (n >> 8) & 255,
    b = n & 255;
  const t = amt < 0 ? 0 : 255;
  const p = Math.abs(amt);
  r = Math.round((t - r) * p + r);
  g = Math.round((t - g) * p + g);
  b = Math.round((t - b) * p + b);
  return `rgb(${r},${g},${b})`;
}

function withAlpha(hex: string, a: number) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

// ---------------------------------------------------------------------------

function drawBackground(ctx: CanvasRenderingContext2D, s: RenderState) {
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#07060f");
  bg.addColorStop(0.5, "#0d0b22");
  bg.addColorStop(1, "#05040b");
  ctx.fillStyle = bg;
  ctx.fillRect(-60, -60, W + 120, H + 120);

  // Takım renklerinde yan ışıklar
  const [a, b] = s.config.teams;
  const l = ctx.createRadialGradient(0, ARENA.cy, 0, 0, ARENA.cy, 700);
  l.addColorStop(0, withAlpha(a.color, 0.28));
  l.addColorStop(1, withAlpha(a.color, 0));
  ctx.fillStyle = l;
  ctx.fillRect(0, 0, W, H);
  const r = ctx.createRadialGradient(W, ARENA.cy, 0, W, ARENA.cy, 700);
  r.addColorStop(0, withAlpha(b.color, 0.28));
  r.addColorStop(1, withAlpha(b.color, 0));
  ctx.fillStyle = r;
  ctx.fillRect(0, 0, W, H);

  // Hafif ızgara
  ctx.strokeStyle = "rgba(255,255,255,0.035)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let x = 0; x <= W; x += 60) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
  }
  for (let y = 0; y <= H; y += 60) {
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
  }
  ctx.stroke();
}

function drawHeader(ctx: CanvasRenderingContext2D, s: RenderState) {
  const { config, score } = s;
  const title = upper(config.title.trim());
  if (title) {
    const size = fitFont(ctx, title, W - 160, 52);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const g = ctx.createLinearGradient(W / 2 - 300, 0, W / 2 + 300, 0);
    g.addColorStop(0, "#facc15");
    g.addColorStop(0.5, "#ffffff");
    g.addColorStop(1, "#22d3ee");
    ctx.fillStyle = g;
    ctx.font = font(size);
    ctx.fillText(title, W / 2, 100);
  }

  // Skorboard paneli
  const px = 50,
    py = 160,
    pw = W - 100,
    ph = 390;
  ctx.save();
  roundRect(ctx, px, py, pw, ph, 44);
  const pg = ctx.createLinearGradient(0, py, 0, py + ph);
  pg.addColorStop(0, "rgba(255,255,255,0.10)");
  pg.addColorStop(1, "rgba(255,255,255,0.03)");
  ctx.fillStyle = pg;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(255,255,255,0.14)";
  ctx.stroke();
  ctx.restore();

  const teamX = [215, W - 215];
  for (const i of [0, 1] as const) {
    const t = config.teams[i];
    const pulse = s.scorePulse[i];
    drawBadge(ctx, t, teamX[i], 300, 92 * (1 + pulse * 0.12));
    const name = upper(t.name.trim() || `TAKIM ${i + 1}`);
    const size = fitFont(ctx, name, 300, 44);
    ctx.font = font(size);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#ffffff";
    ctx.fillText(name, teamX[i], 450);
    // Renk çizgisi
    ctx.fillStyle = t.color;
    roundRect(ctx, teamX[i] - 60, 485, 120, 10, 5);
    ctx.fill();
  }

  // Faz etiketi
  ctx.font = font(34, 800);
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.textAlign = "center";
  ctx.fillText(s.phaseLabel, W / 2, 205);

  // Skor
  ctx.textBaseline = "middle";
  for (const i of [0, 1] as const) {
    const pulse = s.scorePulse[i];
    ctx.save();
    ctx.translate(W / 2 + (i === 0 ? -85 : 85), 315);
    ctx.scale(1 + pulse * 0.35, 1 + pulse * 0.35);
    ctx.font = font(150);
    ctx.fillStyle = pulse > 0.05 ? config.teams[i].color : "#ffffff";
    ctx.shadowColor = config.teams[i].color;
    ctx.shadowBlur = 30 * pulse;
    ctx.fillText(String(score[i]), 0, 0);
    ctx.restore();
  }
  ctx.font = font(110);
  ctx.fillStyle = "rgba(255,255,255,0.6)";
  ctx.fillText("-", W / 2, 308);

  // Dakika
  const label = s.clockLabel;
  ctx.font = font(52);
  const tw = Math.max(150, ctx.measureText(label).width + 60);
  roundRect(ctx, W / 2 - tw / 2, 420, tw, 78, 39);
  const live = s.phase === "first" || s.phase === "second" || s.phase === "extra" || s.phase === "golden";
  ctx.fillStyle = live ? "#e11d48" : "#334155";
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.fillText(label, W / 2, 461);
  if (live && Math.floor(s.time * 2) % 2 === 0) {
    ctx.beginPath();
    ctx.arc(W / 2 - tw / 2 - 22, 459, 9, 0, Math.PI * 2);
    ctx.fillStyle = "#ef4444";
    ctx.fill();
  }
}

function drawArena(ctx: CanvasRenderingContext2D, s: RenderState) {
  const { cx, cy, R } = ARENA;

  // Dış parlama
  const glow = ctx.createRadialGradient(cx, cy, R * 0.9, cx, cy, R * 1.35);
  glow.addColorStop(0, "rgba(34,211,238,0.18)");
  glow.addColorStop(1, "rgba(34,211,238,0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(cx, cy, R * 1.35, 0, Math.PI * 2);
  ctx.fill();

  // Çim zemin
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.clip();
  const grass = ctx.createRadialGradient(cx, cy - R * 0.3, R * 0.1, cx, cy, R);
  grass.addColorStop(0, "#15803d");
  grass.addColorStop(1, "#064e2b");
  ctx.fillStyle = grass;
  ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
  ctx.fillStyle = "rgba(255,255,255,0.045)";
  const stripe = 70;
  for (let x = cx - R; x < cx + R; x += stripe * 2) ctx.fillRect(x, cy - R, stripe, R * 2);
  // Saha çizgileri
  ctx.strokeStyle = "rgba(255,255,255,0.28)";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(cx - R, cy);
  ctx.lineTo(cx + R, cy);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, 110, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, 9, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.45)";
  ctx.fill();
  // İç vinyet
  const vig = ctx.createRadialGradient(cx, cy, R * 0.6, cx, cy, R);
  vig.addColorStop(0, "rgba(0,0,0,0)");
  vig.addColorStop(1, "rgba(0,0,0,0.45)");
  ctx.fillStyle = vig;
  ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
  ctx.restore();

  drawGoal(ctx, s);

  // Çember (kale açıklığı hariç)
  const ga = s.goalAngle;
  ctx.save();
  ctx.lineCap = "round";
  ctx.shadowColor = "#22d3ee";
  ctx.shadowBlur = 30;
  ctx.strokeStyle = "#e0f7ff";
  ctx.lineWidth = RIM_WIDTH;
  ctx.beginPath();
  ctx.arc(cx, cy, R + RIM_WIDTH / 2, ga + GOAL_HALF, ga - GOAL_HALF + Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawGoal(ctx: CanvasRenderingContext2D, s: RenderState) {
  const { cx, cy, R } = ARENA;
  const a0 = s.goalAngle - GOAL_HALF;
  const a1 = s.goalAngle + GOAL_HALF;
  const inner = 0.06;
  const outerR = R + GOAL_DEPTH;
  const p = (a: number, r: number) => [cx + Math.cos(a) * r, cy + Math.sin(a) * r] as const;

  ctx.save();
  // Ağ alanı
  ctx.beginPath();
  ctx.moveTo(...p(a0, R));
  ctx.lineTo(...p(a0 + inner, outerR));
  ctx.arc(cx, cy, outerR, a0 + inner, a1 - inner);
  ctx.lineTo(...p(a1, R));
  ctx.arc(cx, cy, R, a1, a0, true);
  ctx.closePath();
  const flash = s.netFlash;
  ctx.fillStyle = flash > 0 ? withAlpha(s.netFlashColor, 0.25 + 0.45 * flash) : "rgba(255,255,255,0.06)";
  ctx.fill();
  ctx.clip();

  // Ağ dokusu
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  const steps = 12;
  for (let i = 0; i <= steps; i++) {
    const a = a0 + ((a1 - a0) * i) / steps;
    ctx.moveTo(...p(a, R));
    ctx.lineTo(...p(a, outerR + 10));
  }
  for (let r = R + 14; r < outerR + 10; r += 16) {
    ctx.moveTo(...p(a0, r));
    ctx.arc(cx, cy, r, a0, a1);
  }
  ctx.stroke();
  ctx.restore();

  // Kale çerçevesi
  ctx.save();
  ctx.lineWidth = 9;
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#ffffff";
  ctx.shadowColor = "rgba(255,255,255,0.8)";
  ctx.shadowBlur = 14;
  ctx.beginPath();
  ctx.moveTo(...p(a0, R));
  ctx.lineTo(...p(a0 + inner, outerR));
  ctx.arc(cx, cy, outerR, a0 + inner, a1 - inner);
  ctx.lineTo(...p(a1, R));
  ctx.stroke();
  ctx.restore();

  // Direkler
  [a0, a1].forEach((a, i) => {
    const [x, y] = p(a, R);
    const f = s.postFlash[i];
    ctx.save();
    ctx.shadowColor = f > 0 ? "#fde047" : "#ffffff";
    ctx.shadowBlur = 16 + 40 * f;
    ctx.beginPath();
    ctx.arc(x, y, POST_R + 4 * f, 0, Math.PI * 2);
    ctx.fillStyle = f > 0 ? `rgb(255,${Math.round(255 - 40 * f)},${Math.round(255 - 200 * f)})` : "#ffffff";
    ctx.fill();
    ctx.restore();
  });
}

function drawBalls(ctx: CanvasRenderingContext2D, s: RenderState) {
  for (const b of s.balls) {
    if (b.respawn > 0) continue;
    const team = s.config.teams[b.team];
    // İz
    for (let i = 0; i < b.trail.length; i++) {
      const p = b.trail[i];
      const k = (i + 1) / (b.trail.length + 1);
      ctx.beginPath();
      ctx.arc(p.x, p.y, b.r * (0.35 + 0.55 * k), 0, Math.PI * 2);
      ctx.fillStyle = withAlpha(team.color, 0.18 * k * b.alpha);
      ctx.fill();
    }
  }
  for (const b of s.balls) {
    if (b.respawn > 0) continue;
    drawBadge(ctx, s.config.teams[b.team], b.x, b.y, b.r, b.angle, b.alpha);
  }
}

function drawParticles(ctx: CanvasRenderingContext2D, s: RenderState) {
  for (const p of s.particles) {
    const k = Math.max(0, p.life / p.maxLife);
    ctx.save();
    ctx.globalAlpha = Math.min(1, k * 1.5);
    if (p.kind === "spark") {
      ctx.strokeStyle = p.color;
      ctx.lineWidth = p.size;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03);
      ctx.stroke();
    } else if (p.kind === "confetti") {
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
    } else {
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 10 * k;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (1 - k) + 20, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }
}

const easeOutBack = (t: number) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

function drawOverlays(ctx: CanvasRenderingContext2D, s: RenderState) {
  for (const o of s.overlays) {
    const t = o.t;
    const fadeOut = Math.min(1, Math.max(0, (o.dur - t) / 0.3));
    const appear = Math.min(1, t / 0.28);
    ctx.save();
    ctx.globalAlpha = fadeOut * Math.min(1, appear * 1.5);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    if (o.kind === "goal") {
      const sc = easeOutBack(appear) * (1 + 0.04 * Math.sin(t * 18));
      ctx.translate(W / 2, ARENA.cy - 40);
      ctx.rotate(-0.06);
      ctx.scale(sc, sc);
      ctx.font = font(260);
      ctx.lineWidth = 22;
      ctx.strokeStyle = "#000000";
      ctx.lineJoin = "round";
      ctx.strokeText(o.title, 0, 0);
      const g = ctx.createLinearGradient(0, -120, 0, 120);
      g.addColorStop(0, "#ffffff");
      g.addColorStop(0.5, "#fde047");
      g.addColorStop(1, o.color);
      ctx.fillStyle = g;
      ctx.shadowColor = o.color;
      ctx.shadowBlur = 50;
      ctx.fillText(o.title, 0, 0);
      ctx.shadowBlur = 0;
      if (o.subtitle) {
        const sub = upper(o.subtitle);
        const size = fitFont(ctx, sub, 820, 72);
        ctx.font = font(size);
        ctx.lineWidth = 12;
        ctx.strokeText(sub, 0, 170);
        ctx.fillStyle = "#ffffff";
        ctx.fillText(sub, 0, 170);
      }
    } else if (o.kind === "banner") {
      const slide = (1 - easeOutBack(appear)) * W * 0.6;
      ctx.translate(slide, 0);
      const y = ARENA.cy;
      const g = ctx.createLinearGradient(0, 0, W, 0);
      g.addColorStop(0, withAlpha(o.color, 0));
      g.addColorStop(0.15, withAlpha(o.color, 0.95));
      g.addColorStop(0.85, withAlpha(o.color, 0.95));
      g.addColorStop(1, withAlpha(o.color, 0));
      ctx.fillStyle = g;
      ctx.fillRect(0, y - 130, W, o.subtitle ? 260 : 200);
      ctx.fillStyle = "#ffffff";
      const size = fitFont(ctx, o.title, W - 140, 120);
      ctx.font = font(size);
      ctx.shadowColor = "rgba(0,0,0,0.6)";
      ctx.shadowBlur = 20;
      ctx.fillText(o.title, W / 2, y - 30);
      if (o.subtitle) {
        const ss = fitFont(ctx, o.subtitle, W - 160, 56, 800);
        ctx.font = font(ss, 800);
        ctx.fillStyle = "rgba(255,255,255,0.92)";
        ctx.fillText(o.subtitle, W / 2, y + 70);
      }
    } else {
      // Yüzen yazı (DİREK! vb.)
      const rise = t * 120;
      const sc = easeOutBack(appear);
      ctx.translate(o.x ?? W / 2, (o.y ?? ARENA.cy) - 70 - rise);
      ctx.scale(sc, sc);
      ctx.font = font(76);
      ctx.lineWidth = 12;
      ctx.strokeStyle = "#000";
      ctx.lineJoin = "round";
      ctx.strokeText(o.title, 0, 0);
      ctx.fillStyle = o.color;
      ctx.fillText(o.title, 0, 0);
    }
    ctx.restore();
  }
}

function drawFooter(ctx: CanvasRenderingContext2D, s: RenderState) {
  const caption = s.config.caption.trim();
  if (!caption) return;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const size = fitFont(ctx, caption, W - 140, 56);
  ctx.font = font(size);
  ctx.lineWidth = 10;
  ctx.strokeStyle = "rgba(0,0,0,0.7)";
  ctx.lineJoin = "round";
  ctx.strokeText(caption, W / 2, 1745);
  ctx.fillStyle = "#ffffff";
  ctx.fillText(caption, W / 2, 1745);
}

export function render(ctx: CanvasRenderingContext2D, s: RenderState) {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (s.shake > 0.1) {
    ctx.translate((Math.random() - 0.5) * s.shake * 2, (Math.random() - 0.5) * s.shake * 2);
  }
  drawBackground(ctx, s);
  drawHeader(ctx, s);
  drawArena(ctx, s);
  drawBalls(ctx, s);
  drawParticles(ctx, s);
  drawFooter(ctx, s);
  drawOverlays(ctx, s);
  ctx.restore();
}
