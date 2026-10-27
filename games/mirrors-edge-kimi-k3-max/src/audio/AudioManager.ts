/**
 * All sound is synthesized with the Web Audio API — no audio files.
 * Footsteps, jumps, landings, slide/wallrun loops, wind, checkpoint and finish cues.
 */
export class AudioManager {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private noise!: AudioBuffer;
  private windGain: GainNode | null = null;
  private slideGain: GainNode | null = null;
  private scrapeGain: GainNode | null = null;

  /** Must be called from a user gesture (Start button). */
  init(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(this.ctx.destination);

    const len = this.ctx.sampleRate;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    this.windGain = this.loopThrough('bandpass', 500, 0.7);
    this.slideGain = this.loopThrough('lowpass', 420, 0);
    this.scrapeGain = this.loopThrough('highpass', 900, 0);
  }

  private loopThrough(type: BiquadFilterType, freq: number, q: number): GainNode {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = 0;
    src.connect(f);
    f.connect(g);
    g.connect(this.master);
    src.start();
    return g;
  }

  private burst(opts: { type?: BiquadFilterType; from: number; to?: number; dur: number; gain: number }): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = opts.type ?? 'bandpass';
    f.frequency.setValueAtTime(opts.from, t);
    if (opts.to) f.frequency.exponentialRampToValueAtTime(opts.to, t + opts.dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(opts.gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + opts.dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.master);
    src.start(t, Math.random() * 0.5, opts.dur + 0.05);
  }

  private tone(freq: number, dur: number, gain: number, type: OscillatorType = 'sine', delay = 0): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  footstep(intensity: number): void {
    this.burst({ from: 420 + Math.random() * 260, dur: 0.07, gain: 0.07 + intensity * 0.05 });
  }

  jump(): void {
    this.burst({ type: 'highpass', from: 300, to: 1400, dur: 0.16, gain: 0.08 });
  }

  land(fallSpeed: number): void {
    const k = Math.min(1, fallSpeed / 18);
    this.tone(75, 0.14, 0.08 + k * 0.2);
    this.burst({ type: 'lowpass', from: 500, dur: 0.12, gain: 0.06 + k * 0.14 });
  }

  vault(): void {
    this.burst({ from: 900, to: 1800, dur: 0.14, gain: 0.07 });
  }

  checkpoint(): void {
    this.tone(660, 0.12, 0.12);
    this.tone(990, 0.22, 0.12, 'sine', 0.1);
  }

  finish(): void {
    [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.34, 0.12, 'triangle', i * 0.12));
  }

  respawn(): void {
    this.burst({ type: 'lowpass', from: 300, to: 90, dur: 0.3, gain: 0.15 });
  }

  click(): void {
    this.tone(1250, 0.05, 0.06, 'square');
  }

  setWind(v: number): void {
    if (!this.ctx || !this.windGain) return;
    this.windGain.gain.setTargetAtTime(v * 0.16, this.ctx.currentTime, 0.1);
  }

  setSliding(b: boolean): void {
    if (!this.ctx || !this.slideGain) return;
    this.slideGain.gain.setTargetAtTime(b ? 0.14 : 0, this.ctx.currentTime, 0.05);
  }

  setWallrunning(b: boolean): void {
    if (!this.ctx || !this.scrapeGain) return;
    this.scrapeGain.gain.setTargetAtTime(b ? 0.08 : 0, this.ctx.currentTime, 0.05);
  }
}
