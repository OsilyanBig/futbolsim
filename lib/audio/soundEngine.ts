/**
 * Harici dosya gerektirmeyen, Web Audio API ile sentezlenen ses efektleri.
 *
 * Sinyal yolu:
 *   kaynaklar → master → compressor ─┬→ monitor (sessize alma) → hoparlör
 *                                    └→ MediaStreamDestination → video kaydı
 *
 * Sessize alma yalnızca hoparlör çıkışını etkiler; video her zaman sesli kaydedilir.
 */
type WhistleKind = "short" | "double" | "long";

export class SoundEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private monitor: GainNode | null = null;
  private recDest: MediaStreamAudioDestinationNode | null = null;
  private noise: AudioBuffer | null = null;
  private muted = false;

  get ready() {
    return this.ctx !== null;
  }

  /** Kullanıcı etkileşimi içinde çağrılmalı (autoplay politikası) */
  async init(): Promise<void> {
    if (typeof window === "undefined") return;
    if (!this.ctx) {
      const Ctor: typeof AudioContext | undefined =
        window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      const ctx = new Ctor();
      this.ctx = ctx;

      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 4;

      this.master = ctx.createGain();
      this.master.gain.value = 0.8;
      this.monitor = ctx.createGain();
      this.monitor.gain.value = this.muted ? 0 : 1;

      this.master.connect(comp);
      comp.connect(this.monitor);
      this.monitor.connect(ctx.destination);

      if (typeof ctx.createMediaStreamDestination === "function") {
        this.recDest = ctx.createMediaStreamDestination();
        comp.connect(this.recDest);
      }

      const len = ctx.sampleRate * 2;
      this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === "suspended") await this.ctx.resume();
  }

  /** Video kaydına eklenecek ses akışı */
  getStream(): MediaStream | null {
    return this.recDest?.stream ?? null;
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.monitor && this.ctx) this.monitor.gain.setTargetAtTime(m ? 0 : 1, this.ctx.currentTime, 0.02);
  }

  // ---------- yardımcılar ----------

  private env(g: GainNode, t: number, peak: number, attack: number, decay: number) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  private noiseBurst(t: number, dur: number, peak: number, type: BiquadFilterType, freq: number, q = 1, attack = 0.005) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    this.env(g, t, peak, attack, dur);
    src.connect(f).connect(g).connect(this.master!);
    src.start(t, Math.random() * 1.5);
    src.stop(t + attack + dur + 0.05);
    return { src, f, g };
  }

  private tone(t: number, type: OscillatorType, f0: number, f1: number, dur: number, peak: number, attack = 0.003) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + dur);
    const g = ctx.createGain();
    this.env(g, t, peak, attack, dur);
    o.connect(g).connect(this.master!);
    o.start(t);
    o.stop(t + attack + dur + 0.05);
    return o;
  }

  // ---------- efektler ----------

  /** Duvardan sekme: strength 0..1 */
  bounce(strength: number) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const s = Math.min(1, Math.max(0.1, strength));
    this.tone(t, "sine", 150 + 160 * s, 60, 0.14, 0.35 * s);
    this.noiseBurst(t, 0.05, 0.18 * s, "bandpass", 1800, 1.2);
  }

  /** İki topun çarpışması */
  clash(strength: number) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const s = Math.min(1, Math.max(0.15, strength));
    this.tone(t, "triangle", 420, 160, 0.1, 0.3 * s);
    this.noiseBurst(t, 0.06, 0.2 * s, "highpass", 2500, 0.8);
  }

  /** Direğe çarpma: metalik "tıng" */
  post() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const partials = [523, 1061, 1587, 2210, 3010];
    partials.forEach((f, i) => {
      const o = this.tone(t, i === 0 ? "triangle" : "sine", f, f * 0.995, 0.9 - i * 0.12, 0.22 / (i + 1) + 0.04);
      o.detune.value = (Math.random() - 0.5) * 12;
    });
    this.noiseBurst(t, 0.04, 0.4, "highpass", 3000, 0.7);
  }

  /** Gol: tribün uğultusu + korna akoru */
  goal() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;

    // Kalabalık (filtrelenmiş gürültü, yükselip alçalan)
    const crowd = this.noiseBurst(t, 2.6, 0.55, "bandpass", 900, 0.6, 0.25);
    crowd.f.frequency.setValueAtTime(600, t);
    crowd.f.frequency.linearRampToValueAtTime(1300, t + 0.6);
    crowd.f.frequency.linearRampToValueAtTime(800, t + 2.6);
    this.noiseBurst(t + 0.05, 2.2, 0.25, "lowpass", 400, 0.5, 0.3);

    // Stadyum kornası
    [220, 277.2, 329.6, 440].forEach((f) => {
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = f;
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 1400;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.09, t + 0.05);
      g.gain.setValueAtTime(0.09, t + 0.75);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
      o.connect(lp).connect(g).connect(this.master!);
      o.start(t);
      o.stop(t + 1.3);
    });

    // Yükselen "vuuş"
    this.tone(t, "sine", 200, 900, 0.35, 0.2, 0.02);
  }

  /** Hakem düdüğü */
  whistle(kind: WhistleKind = "short") {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const blasts: [number, number][] =
      kind === "short" ? [[0, 0.32]] : kind === "double" ? [[0, 0.22], [0.32, 0.4]] : [[0, 0.3], [0.42, 0.3], [0.84, 1.0]];
    for (const [start, dur] of blasts) this.blast(t + start, dur);
  }

  private blast(t: number, dur: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.value = 2900;
    // Düdük titreşimi (bilye etkisi)
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 32;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 110;
    lfo.connect(lfoGain).connect(o.frequency);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.22, t + 0.02);
    g.gain.setValueAtTime(0.22, t + dur - 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master!);

    // Hava sesi
    this.noiseBurst(t, dur, 0.05, "bandpass", 3200, 2, 0.02);

    o.start(t);
    lfo.start(t);
    o.stop(t + dur + 0.05);
    lfo.stop(t + dur + 0.05);
  }
}
