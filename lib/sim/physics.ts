import {
  AIR_DAMP,
  ARENA,
  BALL_E,
  BALL_R,
  BOUNCE_JITTER,
  GOAL_HALF,
  GRAVITY,
  MAX_SPEED,
  MIN_BOUNCE,
  POST_E,
  POST_R,
  STUCK_SPEED,
  STUCK_TIME,
  UNSTICK_IMPULSE,
  WALL_E,
} from "./constants";
import type { Ball, TeamIndex } from "./types";

export interface World {
  balls: Ball[];
  goalAngle: number;
  goalSpin: number;
}

export type PhysicsEvent =
  | { type: "wall"; ball: Ball; x: number; y: number; strength: number }
  | { type: "post"; ball: Ball; post: 0 | 1; x: number; y: number; strength: number }
  | { type: "clash"; x: number; y: number; strength: number }
  | { type: "goal"; ball: Ball; x: number; y: number; angle: number };

const TAU = Math.PI * 2;

export function angDiff(a: number, b: number): number {
  let d = (a - b) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

export function createBall(team: TeamIndex): Ball {
  return {
    team,
    x: ARENA.cx,
    y: ARENA.cy,
    vx: 0,
    vy: 0,
    r: BALL_R,
    angle: 0,
    stillTime: 0,
    scoring: false,
    alpha: 1,
    respawn: 0,
    trail: [],
    lastSound: 0,
  };
}

export function postPositions(goalAngle: number): [{ x: number; y: number; a: number }, { x: number; y: number; a: number }] {
  const a0 = goalAngle - GOAL_HALF;
  const a1 = goalAngle + GOAL_HALF;
  return [
    { x: ARENA.cx + Math.cos(a0) * ARENA.R, y: ARENA.cy + Math.sin(a0) * ARENA.R, a: a0 },
    { x: ARENA.cx + Math.cos(a1) * ARENA.R, y: ARENA.cy + Math.sin(a1) * ARENA.R, a: a1 },
  ];
}

/** Topu merkeze yerleştirir (hareketsiz). offset: yatay kaydırma */
export function placeAtCenter(ball: Ball, offset: number) {
  ball.x = ARENA.cx + offset;
  ball.y = ARENA.cy - ARENA.R * 0.15;
  ball.vx = 0;
  ball.vy = 0;
  ball.scoring = false;
  ball.alpha = 1;
  ball.respawn = 0;
  ball.stillTime = 0;
  ball.trail = [];
}

/** Merkezden oyuna "düşür": hafif rastgele başlangıç hızı ver */
export function launch(ball: Ball, dir: number, rng: () => number = Math.random) {
  ball.vx = dir * (280 + rng() * 380);
  ball.vy = -(250 + rng() * 450);
}

function clampSpeed(b: Ball) {
  const s = Math.hypot(b.vx, b.vy);
  if (s > MAX_SPEED) {
    b.vx = (b.vx / s) * MAX_SPEED;
    b.vy = (b.vy / s) * MAX_SPEED;
  }
}

function collidePosts(b: Ball, world: World, events: PhysicsEvent[]) {
  const posts = postPositions(world.goalAngle);
  for (const i of [0, 1] as const) {
    const p = posts[i];
    const dx = b.x - p.x;
    const dy = b.y - p.y;
    const d = Math.hypot(dx, dy);
    const minD = b.r + POST_R;
    if (d < minD && d > 0.0001) {
      const nx = dx / d;
      const ny = dy / d;
      b.x = p.x + nx * minD;
      b.y = p.y + ny * minD;
      // Direk hareket ediyor (kale dönüyor): direk hızı = ω × r
      const pvx = -Math.sin(p.a) * ARENA.R * world.goalSpin;
      const pvy = Math.cos(p.a) * ARENA.R * world.goalSpin;
      const rvx = b.vx - pvx;
      const rvy = b.vy - pvy;
      const vn = rvx * nx + rvy * ny;
      if (vn < 0) {
        const out = Math.max(-vn * POST_E, MIN_BOUNCE * 0.7);
        b.vx += (out - vn) * nx;
        b.vy += (out - vn) * ny;
        events.push({ type: "post", ball: b, post: i, x: p.x, y: p.y, strength: -vn });
      }
    }
  }
}

function collideWall(b: Ball, world: World, events: PhysicsEvent[], rng: () => number) {
  const dx = b.x - ARENA.cx;
  const dy = b.y - ARENA.cy;
  const d = Math.hypot(dx, dy);
  if (d + b.r <= ARENA.R || d < 0.0001) return;

  const a = Math.atan2(dy, dx);
  const inGap = Math.abs(angDiff(a, world.goalAngle)) < GOAL_HALF;

  if (inGap) {
    // Merkez kale açıklığında: duvar yok, kenarları direkler yönetir.
    if (d > ARENA.R) {
      // Top dış çizgiyi geçti → GOL
      b.scoring = true;
      events.push({ type: "goal", ball: b, x: b.x, y: b.y, angle: a });
      // Ağa doğru dışarı uçmaya devam etsin
      const nx = dx / d;
      const ny = dy / d;
      const vr = b.vx * nx + b.vy * ny;
      if (vr < 500) {
        b.vx += (500 - vr) * nx;
        b.vy += (500 - vr) * ny;
      }
    }
    return;
  }

  const nx = dx / d;
  const ny = dy / d;
  b.x = ARENA.cx + nx * (ARENA.R - b.r);
  b.y = ARENA.cy + ny * (ARENA.R - b.r);
  const vn = b.vx * nx + b.vy * ny;
  if (vn > 0) {
    const tx = -ny;
    const ty = nx;
    let vt = b.vx * tx + b.vy * ty;
    // Anti-stuck: minimum sekme enerjisi + rastgele teğetsel dürtü
    const outN = Math.max(vn * WALL_E, MIN_BOUNCE * (0.85 + rng() * 0.35));
    vt += (rng() - 0.5) * BOUNCE_JITTER;
    b.vx = tx * vt - nx * outN;
    b.vy = ty * vt - ny * outN;
    events.push({ type: "wall", ball: b, x: b.x + nx * b.r, y: b.y + ny * b.r, strength: vn });
  }
}

function collideBalls(a: Ball, b: Ball, events: PhysicsEvent[]) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.hypot(dx, dy);
  const minD = a.r + b.r;
  if (d >= minD) return;
  let nx: number, ny: number;
  if (d < 0.0001) {
    nx = 1;
    ny = 0;
  } else {
    nx = dx / d;
    ny = dy / d;
  }
  const overlap = (minD - d) / 2;
  a.x -= nx * overlap;
  a.y -= ny * overlap;
  b.x += nx * overlap;
  b.y += ny * overlap;
  const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
  if (rv < 0) {
    const j = (-(1 + BALL_E) * rv) / 2; // eşit kütle
    a.vx -= j * nx;
    a.vy -= j * ny;
    b.vx += j * nx;
    b.vy += j * ny;
    events.push({ type: "clash", x: a.x + nx * a.r, y: a.y + ny * a.r, strength: -rv });
  }
}

/** Sabit adımlı fizik güncellemesi */
export function stepWorld(world: World, dt: number, events: PhysicsEvent[], rng: () => number = Math.random) {
  world.goalAngle = (world.goalAngle + world.goalSpin * dt) % TAU;

  for (const b of world.balls) {
    if (b.respawn > 0) continue;

    if (b.scoring) {
      // Ağa takılan top: hızla yavaşla ve kaybol
      const f = Math.max(0, 1 - 5 * dt);
      b.vx *= f;
      b.vy *= f;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.alpha = Math.max(0, b.alpha - dt * 1.6);
      continue;
    }

    b.vy += GRAVITY * dt;
    const damp = 1 - AIR_DAMP * dt;
    b.vx *= damp;
    b.vy *= damp;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.angle += (b.vx / b.r) * dt * 0.8;

    collidePosts(b, world, events);
    collideWall(b, world, events, rng);

    // Anti-stuck: uzun süre yavaş kalan topa rastgele dürtü
    const speed = Math.hypot(b.vx, b.vy);
    if (speed < STUCK_SPEED) {
      b.stillTime += dt;
      if (b.stillTime > STUCK_TIME) {
        const ang = -Math.PI / 2 + (rng() - 0.5) * Math.PI * 0.9;
        b.vx += Math.cos(ang) * UNSTICK_IMPULSE;
        b.vy += Math.sin(ang) * UNSTICK_IMPULSE;
        b.stillTime = 0;
      }
    } else {
      b.stillTime = 0;
    }
    clampSpeed(b);
  }

  const active = world.balls.filter((b) => b.respawn <= 0 && !b.scoring);
  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      collideBalls(active[i], active[j], events);
    }
  }
}
