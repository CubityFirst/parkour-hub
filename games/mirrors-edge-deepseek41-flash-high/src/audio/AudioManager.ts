/**
 * All audio is synthesised at runtime with the Web Audio API — no asset
 * downloads, no backend.
 */
export class AudioManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private windGain: GainNode | null = null;
  private windFilter: BiquadFilterNode | null = null;
  private slideGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private muted = false;
  private paused = false;
  private footstepFlip = false;

  /** Must be called from a user gesture. */
  unlock(): void {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.55;
      this.master.connect(this.ctx.destination);
      this.noiseBuffer = this.createNoiseBuffer(this.ctx);
      this.createLoops();
    }
    void this.ctx.resume();
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    if (this.paused) {
      this.setWind(0);
      this.setSlide(false);
    }
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : 0.55;
  }

  private createNoiseBuffer(ctx: AudioContext): AudioBuffer {
    const length = Math.floor(ctx.sampleRate * 2);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      last = 0.97 * last + 0.03 * white;
      data[i] = white * 0.7 + last * 0.6;
    }
    return buffer;
  }

  private createLoops(): void {
    if (!this.ctx || !this.master || !this.noiseBuffer) return;

    // Wind: filtered noise that follows the player's speed.
    const wind = this.ctx.createBufferSource();
    wind.buffer = this.noiseBuffer;
    wind.loop = true;
    const windFilter = this.ctx.createBiquadFilter();
    windFilter.type = 'lowpass';
    windFilter.frequency.value = 620;
    windFilter.Q.value = 0.5;
    const windGain = this.ctx.createGain();
    windGain.gain.value = 0;
    wind.connect(windFilter).connect(windGain).connect(this.master);
    wind.start();
    this.windGain = windGain;
    this.windFilter = windFilter;

    // Slide: brighter band-passed noise.
    const slide = this.ctx.createBufferSource();
    slide.buffer = this.noiseBuffer;
    slide.loop = true;
    const slideFilter = this.ctx.createBiquadFilter();
    slideFilter.type = 'bandpass';
    slideFilter.frequency.value = 1050;
    slideFilter.Q.value = 0.7;
    const slideGain = this.ctx.createGain();
    slideGain.gain.value = 0;
    slide.connect(slideFilter).connect(slideGain).connect(this.master);
    slide.start();
    this.slideGain = slideGain;
  }

  /** Called every rendered frame. */
  update(speed: number, sliding: boolean, grounded: boolean): void {
    if (!this.ctx || this.paused) return;
    const speedFactor = Math.min(Math.max((speed - 5.5) / 7, 0), 1);
    const windTarget = grounded ? speedFactor * 0.1 : speedFactor * 0.14;
    this.setWind(windTarget);
    if (this.windFilter) {
      this.windFilter.frequency.setTargetAtTime(420 + speed * 55, this.ctx.currentTime, 0.15);
    }
    this.setSlide(sliding && grounded);
  }

  private setWind(value: number): void {
    if (!this.windGain || !this.ctx) return;
    this.windGain.gain.setTargetAtTime(this.muted ? 0 : value, this.ctx.currentTime, 0.18);
  }

  private setSlide(active: boolean): void {
    if (!this.slideGain || !this.ctx) return;
    this.slideGain.gain.setTargetAtTime(active && !this.muted ? 0.055 : 0, this.ctx.currentTime, 0.08);
  }

  // --------------------------------------------------------------- one-shots

  footstep(sprinting: boolean): void {
    if (!this.ctx || !this.master || !this.noiseBuffer || this.muted) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const source = ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = (this.footstepFlip ? 1500 : 2100) + Math.random() * 350;
    filter.Q.value = 1.4;
    const gain = ctx.createGain();
    const peak = sprinting ? 0.12 : 0.07;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(peak, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.11);
    source.connect(filter).connect(gain).connect(this.master);
    source.start(now, Math.random() * 1.2, 0.14);
    this.footstepFlip = !this.footstepFlip;

    // Low body thump.
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(105, now);
    osc.frequency.exponentialRampToValueAtTime(62, now + 0.08);
    const bodyGain = ctx.createGain();
    bodyGain.gain.setValueAtTime(sprinting ? 0.07 : 0.045, now);
    bodyGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.1);
    osc.connect(bodyGain).connect(this.master);
    osc.start(now);
    osc.stop(now + 0.11);
  }

  jump(): void {
    if (!this.ctx || !this.master || this.muted) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(185, now);
    osc.frequency.exponentialRampToValueAtTime(95, now + 0.16);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.055, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
    osc.connect(gain).connect(this.master);
    osc.start(now);
    osc.stop(now + 0.19);
    this.whoosh(0.035, 900, 0.18);
  }

  land(impact: number): void {
    if (!this.ctx || !this.master || this.muted) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const strength = Math.min(1, impact / 18);

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(85, now);
    osc.frequency.exponentialRampToValueAtTime(42, now + 0.16);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.1 * strength + 0.02, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
    osc.connect(gain).connect(this.master);
    osc.start(now);
    osc.stop(now + 0.22);

    if (this.noiseBuffer) {
      const source = ctx.createBufferSource();
      source.buffer = this.noiseBuffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 900;
      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.09 * strength + 0.01, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.13);
      source.connect(filter).connect(noiseGain).connect(this.master);
      source.start(now, 0.3, 0.15);
    }
  }

  vault(): void {
    this.whoosh(0.06, 1400, 0.25);
  }

  wallRunStart(): void {
    this.whoosh(0.075, 700, 0.4);
  }

  wallJump(): void {
    this.whoosh(0.08, 1100, 0.25);
    this.jump();
  }

  checkpoint(): void {
    if (!this.ctx || !this.master || this.muted) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    [660, 990, 1320].forEach((freq, index) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const gain = ctx.createGain();
      const start = now + index * 0.07;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.07, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.35);
      osc.connect(gain).connect(this.master!);
      osc.start(start);
      osc.stop(start + 0.36);
    });
  }

  finish(): void {
    if (!this.ctx || !this.master || this.muted) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, index) => {
      const start = now + index * 0.12;
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.085, start + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 1.1);
      osc.connect(gain).connect(this.master!);
      osc.start(start);
      osc.stop(start + 1.15);
    });

    // Low pad underneath.
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 130.81;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.07, now + 0.12);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.8);
    osc.connect(gain).connect(this.master);
    osc.start(now);
    osc.stop(now + 1.85);
  }

  uiClick(): void {
    if (!this.ctx || !this.master || this.muted) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.exponentialRampToValueAtTime(440, now + 0.05);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.035, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.07);
    osc.connect(gain).connect(this.master);
    osc.start(now);
    osc.stop(now + 0.08);
  }

  private whoosh(volume: number, frequency: number, duration: number): void {
    if (!this.ctx || !this.master || !this.noiseBuffer || this.muted) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const source = ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(frequency, now);
    filter.frequency.exponentialRampToValueAtTime(frequency * 0.55, now + duration);
    filter.Q.value = 0.9;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + duration * 0.25);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    source.connect(filter).connect(gain).connect(this.master);
    source.start(now, Math.random(), duration + 0.05);
  }

  dispose(): void {
    this.setWind(0);
    this.setSlide(false);
    void this.ctx?.close();
    this.ctx = null;
  }
}
