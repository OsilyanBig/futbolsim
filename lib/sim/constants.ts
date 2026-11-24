/** 9:16 sahne çözünürlüğü (video çıktısı da bu boyutta) */
export const W = 1080;
export const H = 1920;

/** Dairesel arena */
export const ARENA = { cx: 540, cy: 1145, R: 430 } as const;
export const RIM_WIDTH = 16;

/** Kale */
export const GOAL_HALF = 0.25; // rad (yarım açıklık, ~14°)
export const GOAL_SPIN = 1.05; // rad/s (çarpan 1 iken)
export const GOAL_DEPTH = 78; // ağ derinliği (px)
export const POST_R = 12;

/** Toplar */
export const BALL_R = 58;

/** Fizik */
export const GRAVITY = 1500; // px/s²
export const AIR_DAMP = 0.035; // 1/s (hafif sönümleme)
export const WALL_E = 0.93; // duvar sekme katsayısı
export const POST_E = 0.95;
export const BALL_E = 0.96;
export const MIN_BOUNCE = 900; // duvardan sekmede minimum normal hız (anti-stuck)
export const BOUNCE_JITTER = 240; // duvarda rastgele teğetsel dürtü
export const MAX_SPEED = 2600;
export const STUCK_SPEED = 260;
export const STUCK_TIME = 0.45;
export const UNSTICK_IMPULSE = 1100;
export const FIXED_DT = 1 / 240;

/** Zaman ölçeği: 1 gerçek saniye = 2 maç dakikası → 45 sn = 90' */
export const MINUTES_PER_SEC = 2;
export const HALF_MIN = 45;
export const FULL_MIN = 90;
export const ET_MIN = 120;
/** Altın gol (120' sonrası ani ölüm) için gerçek saniye üst sınırı */
export const GOLDEN_MAX_SEC = 20;

/** Geçiş süreleri (gerçek saniye) */
export const T_KICKOFF = 1.4;
export const T_HALFTIME = 2.2;
export const T_ETBREAK = 2.4;
export const T_FULLTIME = 3.8;
export const T_GOLDEN_CELEBRATION = 1.4;
export const RESPAWN_DELAY = 0.9;

export const FONT = `system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`;
