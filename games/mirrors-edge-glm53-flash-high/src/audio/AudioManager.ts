/**
 * Procedural sound effects built from filtered noise bursts and
 * simple oscillator tones — no external audio assets.
 */
export class AudioManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private windGain: GainNode | null = null;
  private slideGain: GainNode | null = null;

  /** Must be called from a user gesture (start button). */
  init(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const ctx = new AudioContext();
    this.ctx = ctx;

    this.master = ctx.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(ctx.destination);

    // 2 seconds of white noise reused by every noise-based sound.
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    // Looping wind bed.
    const wind = this.loopNoise('lowpass', 420);
    this.windGain = wind.gain;
    this.windGain.gain.value = 0;

    // Looping slide scrape.
    const slide = this.loopNoise('bandpass', 560);
    this.slideGain = slide.gain;
    this.slideGain.gain.value = 0;
  }

  suspend(): void {
    if (this.ctx && this.ctx.state === 'running') void this.ctx.suspend();
  }

  resume(): void {
    if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume();
  }

  private loopNoise(type: BiquadFilterType, freq: number): { gain: GainNode } {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    src.connect(filter).connect(gain).connect(this.master!);
    src.start();
    return { gain };
  }

  /** Filtered noise burst with a fast decay envelope. */
  private burst(dur: number, freq: number, gain: number, type: BiquadFilterType = 'lowpass', rate = 1): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise!;
    src.playbackRate.value = rate;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter).connect(g).connect(this.master!);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.02);
  }

  private tone(freq0: number, freq1: number, dur: number, gain: number, delay = 0, type: OscillatorType = 'sine'): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq0, t);
    if (freq1 !== freq0) osc.frequency.exponentialRampToValueAtTime(freq1, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.master!);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  step(): void {
    this.burst(0.07, 600 + Math.random() * 350, 0.09, 'lowpass', 0.9 + Math.random() * 0.3);
  }

  jump(): void {
    this.burst(0.1, 900, 0.1, 'bandpass');
    this.tone(280, 340, 0.09, 0.03);
  }

  land(intensity: number): void {
    this.burst(0.16, 320, 0.12 + 0.25 * intensity, 'lowpass', 0.7);
  }

  mantle(): void {
    this.burst(0.14, 500, 0.1, 'lowpass', 0.8);
  }

  /** t = 0..1 wind loudness from speed */
  setWind(t: number): void {
    if (!this.windGain) return;
    this.windGain.gain.setTargetAtTime(t * 0.14, this.ctx!.currentTime, 0.15);
  }

  /** t = 0..1 slide scrape loudness */
  setSlide(t: number): void {
    if (!this.slideGain) return;
    this.slideGain.gain.setTargetAtTime(t * 0.18, this.ctx!.currentTime, 0.05);
  }

  checkpoint(): void {
    this.tone(659, 659, 0.12, 0.12);
    this.tone(880, 880, 0.22, 0.12, 0.1);
  }

  finish(): void {
    const notes = [523, 659, 784, 1047];
    notes.forEach((f, i) => this.tone(f, f, 0.3, 0.14, i * 0.12));
    this.tone(1568, 1568, 0.5, 0.06, 0.5, 'triangle');
  }
}
