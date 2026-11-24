export type TeamIndex = 0 | 1;

export interface Team {
  name: string;
  color: string;
  logo: HTMLImageElement | null;
}

export interface MatchConfig {
  title: string;
  caption: string;
  teams: [Team, Team];
  /** Berabere biterse uzatmalara gidilsin mi (eleme / Şampiyonlar Ligi modu) */
  extraTime: boolean;
  /** Uzatmalarda ilk atan kazanır */
  goldenGoal: boolean;
  /** Kale dönüş hızı çarpanı */
  goalSpeed: number;
}

export interface Ball {
  team: TeamIndex;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  angle: number;
  /** Düşük hızda geçen süre (anti-stuck) */
  stillTime: number;
  /** Gol çizgisini geçti, ağa doğru uçuyor */
  scoring: boolean;
  /** 1 = tam görünür, 0 = görünmez */
  alpha: number;
  /** >0 ise top yeniden doğmayı bekliyor */
  respawn: number;
  trail: { x: number; y: number }[];
  lastSound: number;
}

export type Phase =
  | "idle"
  | "kickoff"
  | "first"
  | "halftime"
  | "second"
  | "etbreak"
  | "extra"
  | "golden"
  | "fulltime"
  | "finished";

export interface Particle {
  kind: "spark" | "confetti" | "ring";
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  rot: number;
  vr: number;
}

export interface Overlay {
  kind: "goal" | "banner" | "float";
  title: string;
  subtitle?: string;
  color: string;
  t: number;
  dur: number;
  x?: number;
  y?: number;
}

export interface MatchResult {
  score: [number, number];
  winner: TeamIndex | null;
  extraTimePlayed: boolean;
}
