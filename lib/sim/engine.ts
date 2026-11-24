import type { SoundEngine } from "../audio/soundEngine";
import {
  ARENA,
  BALL_R,
  ET_MIN,
  FIXED_DT,
  FULL_MIN,
  GOAL_SPIN,
  GOLDEN_MAX_SEC,
  HALF_MIN,
  MINUTES_PER_SEC,
  RESPAWN_DELAY,
  T_ETBREAK,
  T_FULLTIME,
  T_GOLDEN_CELEBRATION,
  T_HALFTIME,
  T_KICKOFF,
} from "./constants";
import { createBall, launch, placeAtCenter, stepWorld, type PhysicsEvent, type World } from "./physics";
import { render, type RenderState } from "./renderer";
import type { Ball, MatchConfig, MatchResult, Overlay, Particle, Phase, TeamIndex } from "./types";

export interface EngineStatus {
  phase: Phase;
  clockLabel: string;
  phaseLabel: string;
  score: [number, number];
  running: boolean;
}

export interface EngineCallbacks {
  onStatus?: (s: EngineStatus) => void;
  onFinished?: (r: MatchResult) => void;
}

const PHASE_LABEL: Record<Phase, string> = {
  idle: "HAZIR",
  kickoff: "BAŞLAMA",
  first: "1. YARI",
  halftime: "DEVRE ARASI",
  second: "2. YARI",
  etbreak: "UZATMALAR",
  extra: "UZATMA",
  golden: "ALTIN GOL",
  fulltime: "MAÇ SONU",
  finished: "MAÇ SONU",
};

const PLAY_PHASES: Phase[] = ["first", "second", "extra", "golden"];

export class MatchEngine {
  private ctx: CanvasRenderingContext2D;
  private world: World;
  private score: [number, number] = [0, 0];
  private phase: Phase = "idle";
  private phaseTime = 0;
  private clock = 0; // maç dakikası
  private goldenTime = 0;
  private particles: Particle[] = [];
  private overlays: Overlay[] = [];
  private shake = 0;
  private postFlash: [number, number] = [0, 0];
  private scorePulse: [number, number] = [0, 0];
  private netFlash = 0;
  private netFlashColor = "#ffffff";
  private time = 0;
  private raf = 0;
  private last = 0;
  private acc = 0;
  private pendingFinish = -1;
  private extraTimePlayed = false;
  private events: PhysicsEvent[] = [];
  private lastStatusKey = "";

  constructor(
    private canvas: HTMLCanvasElement,
    private sound: SoundEngine,
    private config: MatchConfig,
    private cb: EngineCallbacks = {},
  ) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D desteklenmiyor");
    this.ctx = ctx;
    this.world = { balls: [createBall(0), createBall(1)], goalAngle: -Math.PI / 2, goalSpin: GOAL_SPIN * config.goalSpeed };
    this.resetState();
    this.draw();
  }

  get running() {
    return this.raf !== 0;
  }

  setConfig(config: MatchConfig) {
    this.config = config;
    this.world.goalSpin = GOAL_SPIN * config.goalSpeed;
    if (!this.running) this.draw();
  }

  start() {
    this.stopLoop();
    this.resetState();
    this.enter("kickoff");
    this.last = performance.now();
    this.acc = 0;
    const loop = (ts: number) => {
      const dt = Math.min(0.05, Math.max(0, (ts - this.last) / 1000));
      this.last = ts;
      this.update(dt);
      this.draw();
      this.emitStatus();
      if (this.phase === "finished") {
        this.raf = 0;
        this.emitStatus(true);
        return;
      }
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  /** Simülasyonu durdur ve başlangıç durumuna dön */
  reset() {
    this.stopLoop();
    this.resetState();
    this.draw();
    this.emitStatus(true);
  }

  destroy() {
    this.stopLoop();
  }

  private stopLoop() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private resetState() {
    this.score = [0, 0];
    this.phase = "idle";
    this.phaseTime = 0;
    this.clock = 0;
    this.goldenTime = 0;
    this.particles = [];
    this.overlays = [];
    this.shake = 0;
    this.postFlash = [0, 0];
    this.scorePulse = [0, 0];
    this.netFlash = 0;
    this.time = 0;
    this.pendingFinish = -1;
    this.extraTimePlayed = false;
    this.world.goalAngle = -Math.PI / 2;
    this.placeBallsAtCenter();
  }

  private placeBallsAtCenter() {
    const [a, b] = this.world.balls;
    placeAtCenter(a, -(BALL_R + 6));
    placeAtCenter(b, BALL_R + 6);
  }

  private launchBalls() {
    const [a, b] = this.world.balls;
    launch(a, -1);
    launch(b, 1);
  }

  // ---------------------------------------------------------------- faz yönetimi

  private enter(phase: Phase) {
    this.phase = phase;
    this.phaseTime = 0;
    const [t1, t2] = this.config.teams;
    const scoreLine = `${t1.name} ${this.score[0]} - ${this.score[1]} ${t2.name}`;

    switch (phase) {
      case "kickoff":
        this.placeBallsAtCenter();
        this.banner("MAÇ BAŞLIYOR", "#7c3aed", T_KICKOFF, this.config.title || undefined);
        break;
      case "first":
        this.clock = 0;
        this.launchBalls();
        this.sound.whistle("short");
        break;
      case "halftime":
        this.clock = HALF_MIN;
        this.sound.whistle("double");
        this.freezeBalls();
        this.banner("2. YARI", "#2563eb", T_HALFTIME, `İlk yarı: ${scoreLine}`);
        break;
      case "second":
        this.clock = HALF_MIN;
        this.placeBallsAtCenter();
        this.launchBalls();
        this.sound.whistle("short");
        break;
      case "etbreak":
        this.clock = FULL_MIN;
        this.extraTimePlayed = true;
        this.sound.whistle("double");
        this.freezeBalls();
        this.banner(
          "UZATMALAR",
          "#ea580c",
          T_ETBREAK,
          this.config.goldenGoal ? "Altın gol: ilk atan kazanır!" : `90' berabere: ${this.score[0]} - ${this.score[1]}`,
        );
        break;
      case "extra":
        this.clock = FULL_MIN;
        this.placeBallsAtCenter();
        this.launchBalls();
        this.sound.whistle("short");
        break;
      case "golden":
        this.clock = ET_MIN;
        this.goldenTime = 0;
        this.sound.whistle("short");
        this.banner("ALTIN GOL", "#ca8a04", 1.8, "İlk atan kazanır!");
        break;
      case "fulltime": {
        this.sound.whistle("long");
        this.freezeBalls();
        const w = this.winner();
        const sub = w === null ? `Berabere · ${this.score[0]} - ${this.score[1]}` : `Kazanan: ${this.config.teams[w].name}`;
        this.banner("MAÇ SONU", w === null ? "#475569" : this.config.teams[w].color, T_FULLTIME, sub);
        if (w !== null) this.confetti(this.config.teams[w].color, 160);
        break;
      }
      case "finished":
        this.cb.onFinished?.({ score: [...this.score] as [number, number], winner: this.winner(), extraTimePlayed: this.extraTimePlayed });
        break;
    }
  }

  private winner(): TeamIndex | null {
    if (this.score[0] === this.score[1]) return null;
    return this.score[0] > this.score[1] ? 0 : 1;
  }

  private freezeBalls() {
    for (const b of this.world.balls) {
      b.vx = 0;
      b.vy = 0;
    }
  }

  private banner(title: string, color: string, dur: number, subtitle?: string) {
    // Geçiş bandı ekrandaki tüm yazıların yerini alır (GOL!, DİREK! ile üst üste binmesin)
    this.overlays = [];
    this.overlays.push({ kind: "banner", title, subtitle, color, t: 0, dur });
  }

  // ---------------------------------------------------------------- güncelleme

  private update(dt: number) {
    this.time += dt;
    this.phaseTime += dt;
    this.updateEffects(dt);

    switch (this.phase) {
      case "kickoff":
        if (this.phaseTime >= T_KICKOFF) this.enter("first");
        break;
      case "halftime":
        if (this.phaseTime >= T_HALFTIME) this.enter("second");
        break;
      case "etbreak":
        if (this.phaseTime >= T_ETBREAK) this.enter("extra");
        break;
      case "fulltime":
        if (this.phaseTime >= T_FULLTIME) this.enter("finished");
        break;
      default:
        if (PLAY_PHASES.includes(this.phase)) this.updatePlay(dt);
    }
  }

  private updatePlay(dt: number) {
    this.clock += dt * MINUTES_PER_SEC;

    // Sabit adımlı fizik
    this.acc += dt;
    while (this.acc >= FIXED_DT) {
      this.acc -= FIXED_DT;
      this.events.length = 0;
      stepWorld(this.world, FIXED_DT, this.events);
      for (const e of this.events) this.handleEvent(e);
    }

    for (const b of this.world.balls) {
      if (b.respawn > 0) {
        b.respawn -= dt;
        if (b.respawn <= 0) this.respawn(b);
        continue;
      }
      b.trail.push({ x: b.x, y: b.y });
      if (b.trail.length > 9) b.trail.shift();
      if (b.scoring && b.alpha <= 0) {
        b.respawn = RESPAWN_DELAY;
        b.trail = [];
      }
    }

    if (this.pendingFinish >= 0) {
      this.pendingFinish -= dt;
      if (this.pendingFinish < 0) this.enter("fulltime");
      return;
    }

    switch (this.phase) {
      case "first":
        if (this.clock >= HALF_MIN) this.enter("halftime");
        break;
      case "second":
        if (this.clock >= FULL_MIN) {
          this.clock = FULL_MIN;
          if (this.config.extraTime && this.winner() === null) this.enter("etbreak");
          else this.enter("fulltime");
        }
        break;
      case "extra":
        if (this.clock >= ET_MIN) {
          this.clock = ET_MIN;
          if (this.winner() === null) this.enter("golden");
          else this.enter("fulltime");
        }
        break;
      case "golden":
        this.goldenTime += dt;
        if (this.goldenTime >= GOLDEN_MAX_SEC) this.enter("fulltime");
        break;
    }
  }

  private respawn(b: Ball) {
    const other = this.world.balls.find((o) => o !== b)!;
    const offset = other.x < ARENA.cx ? BALL_R + 6 : -(BALL_R + 6);
    placeAtCenter(b, offset);
    if (Math.hypot(other.x - b.x, other.y - b.y) < BALL_R * 2.2) b.y -= BALL_R * 2.4;
    launch(b, offset > 0 ? 1 : -1);
  }

  private handleEvent(e: PhysicsEvent) {
    switch (e.type) {
      case "wall": {
        if (e.strength > 140 && this.time - e.ball.lastSound > 0.06) {
          e.ball.lastSound = this.time;
          this.sound.bounce(e.strength / 2200);
        }
        if (e.strength > 900) this.sparks(e.x, e.y, 6, ["#ffffff", this.config.teams[e.ball.team].color], 0.6);
        break;
      }
      case "clash":
        if (e.strength > 120) this.sound.clash(e.strength / 2200);
        this.sparks(e.x, e.y, 10, ["#ffffff", "#fde047"], 0.8);
        this.shake = Math.max(this.shake, Math.min(10, e.strength / 250));
        break;
      case "post":
        if (e.strength > 150) {
          this.sound.post();
          this.postFlash[e.post] = 1;
          this.shake = Math.max(this.shake, 14);
          this.sparks(e.x, e.y, 26, ["#fde047", "#ffffff", "#f97316"], 1.4);
          this.overlays.push({ kind: "float", title: "DİREK!", color: "#fde047", t: 0, dur: 0.9, x: e.x, y: e.y });
        }
        break;
      case "goal":
        this.onGoal(e.ball, e.x, e.y);
        break;
    }
  }

  private onGoal(ball: Ball, x: number, y: number) {
    if (this.pendingFinish >= 0) return; // altın gol sonrası kutlamada ek gol sayılmaz
    const team = this.config.teams[ball.team];
    this.score[ball.team] += 1;
    this.scorePulse[ball.team] = 1;
    this.netFlash = 1;
    this.netFlashColor = team.color;
    this.shake = 28;
    this.sound.goal();
    this.sparks(x, y, 70, [team.color, "#ffffff", "#fde047"], 2.2);
    this.particles.push({ kind: "ring", x, y, vx: 0, vy: 0, life: 0.7, maxLife: 0.7, size: 260, color: team.color, rot: 0, vr: 0 });
    this.confetti(team.color, 90);
    this.overlays = this.overlays.filter((o) => o.kind !== "goal");
    this.overlays.push({ kind: "goal", title: "GOL!", subtitle: team.name, color: team.color, t: 0, dur: 1.6 });

    if (this.phase === "golden" || (this.phase === "extra" && this.config.goldenGoal)) {
      this.pendingFinish = T_GOLDEN_CELEBRATION;
    }
  }

  // ---------------------------------------------------------------- efektler

  private sparks(x: number, y: number, n: number, colors: string[], power: number) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (200 + Math.random() * 700) * power;
      this.particles.push({
        kind: "spark",
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: 0.35 + Math.random() * 0.4,
        maxLife: 0.75,
        size: 3 + Math.random() * 5,
        color: colors[i % colors.length],
        rot: 0,
        vr: 0,
      });
    }
  }

  private confetti(color: string, n: number) {
    const palette = [color, "#ffffff", "#fde047", "#22d3ee", "#f472b6"];
    for (let i = 0; i < n; i++) {
      this.particles.push({
        kind: "confetti",
        x: Math.random() * 1080,
        y: -40 - Math.random() * 400,
        vx: (Math.random() - 0.5) * 300,
        vy: 300 + Math.random() * 500,
        life: 2.2 + Math.random() * 1.2,
        maxLife: 3.4,
        size: 16 + Math.random() * 18,
        color: palette[i % palette.length],
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 12,
      });
    }
  }

  private updateEffects(dt: number) {
    for (const p of this.particles) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      if (p.kind === "spark") {
        p.vx *= 1 - 3 * dt;
        p.vy = p.vy * (1 - 3 * dt) + 600 * dt;
      } else if (p.kind === "confetti") {
        p.vx += Math.sin(this.time * 3 + p.rot) * 30 * dt;
      }
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    for (const o of this.overlays) o.t += dt;
    this.overlays = this.overlays.filter((o) => o.t < o.dur);
    this.shake = Math.max(0, this.shake - dt * 60);
    this.postFlash = [Math.max(0, this.postFlash[0] - dt * 3), Math.max(0, this.postFlash[1] - dt * 3)];
    this.scorePulse = [Math.max(0, this.scorePulse[0] - dt * 1.2), Math.max(0, this.scorePulse[1] - dt * 1.2)];
    this.netFlash = Math.max(0, this.netFlash - dt * 1.5);
    // Kale geçişlerde de dönmeye devam etsin (oyun dışında yavaşça)
    if (!PLAY_PHASES.includes(this.phase)) this.world.goalAngle += this.world.goalSpin * dt * 0.35;
  }

  // ---------------------------------------------------------------- çıktı

  private clockLabel(): string {
    if (this.phase === "idle" || this.phase === "kickoff") return "0'";
    if (this.phase === "golden") return `120+${Math.max(1, Math.ceil(this.clock - ET_MIN))}'`;
    if (this.phase === "fulltime" || this.phase === "finished") return this.extraTimePlayed ? "UZ. SONU" : "MS";
    return `${Math.floor(this.clock)}'`;
  }

  private phaseLabel(): string {
    if (this.phase === "extra" && this.config.goldenGoal) return "UZATMA · ALTIN GOL";
    return PHASE_LABEL[this.phase];
  }

  private draw() {
    const s: RenderState = {
      config: this.config,
      balls: this.world.balls,
      goalAngle: this.world.goalAngle,
      score: this.score,
      phase: this.phase,
      clockLabel: this.clockLabel(),
      phaseLabel: this.phaseLabel(),
      particles: this.particles,
      overlays: this.overlays,
      shake: this.shake,
      postFlash: this.postFlash,
      scorePulse: this.scorePulse,
      netFlash: this.netFlash,
      netFlashColor: this.netFlashColor,
      time: this.time,
    };
    render(this.ctx, s);
  }

  private emitStatus(force = false) {
    if (!this.cb.onStatus) return;
    const status: EngineStatus = {
      phase: this.phase,
      clockLabel: this.clockLabel(),
      phaseLabel: this.phaseLabel(),
      score: [...this.score] as [number, number],
      running: this.running,
    };
    const key = `${status.phase}|${status.clockLabel}|${status.score.join("-")}|${status.running}`;
    if (!force && key === this.lastStatusKey) return;
    this.lastStatusKey = key;
    this.cb.onStatus(status);
  }
}
