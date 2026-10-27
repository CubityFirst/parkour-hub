/**
 * AudioManager — every sound is synthesised with the Web Audio API at
 * runtime (short noise bursts, filtered loops and FM-ish blips), so the
 * game ships with zero audio assets.
 *
 * Call resume() from a user gesture (the Start button) before playback.
 */

type LoopName = 'wind' | 'slide';

export class AudioManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private loops = new Map<LoopName, { src: AudioBufferSourceNode; gain: GainNode }>();
  enabled = true;

  resume(): void {
    if (!this.ctx) {
      const Ctor: typeof AudioContext =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.55;
      this.master.connect(this.ctx.destination);
      this.noise = this.makeNoise(this.ctx, 2);
      this.startLoop('wind', { type: 'lowpass', freq: 480 }, 0.0);
      this.startLoop('slide', { type: 'bandpass', freq: 950, Q: 0.8 }, 0.0);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (this.master) this.master.gain.value = on ? 0.55 : 0;
  }

  /** continuous wind tied to sprint speed (0..1) */
  setWind(level: number): void {
    const l = this.loops.get('wind');
    if (l && this.ctx) {
      l.gain.gain.setTargetAtTime(Math.pow(level, 2.1) * 0.32, this.ctx.currentTime, 0.12);
    }
  }

  /** shoe-scrape loop while sliding */
  setSlide(active: boolean): void {
    const l = this.loops.get('slide');
    if (l && this.ctx) {
      l.gain.gain.setTargetAtTime(active ? 0.26 : 0, this.ctx.currentTime, 0.05);
    }
  }

  /** one-shot dispatcher used by the controller event stream */
  event(type: string, intensity = 1): void {
    if (!this.ctx || !this.enabled) return;
    switch (type) {
      case 'footstep':
        this.thud(0.09, 150 + Math.random() * 40, 0.16 * Math.max(0.4, intensity));
        this.burst(0.05, 2400, 0.05);
        break;
      case 'jump':
        this.sweep(0.16, 240, 120, 0.14);
        this.burst(0.09, 900, 0.05);
        break;
      case 'land': {
        const i = Math.max(0, Math.min(1, (intensity - 3) / 18));
        if (i > 0.02) {
          this.thud(0.13, 110, 0.22 * i + 0.05);
          this.burst(0.1, 500, 0.09 * i);
        }
        break;
      }
      case 'slideStart':
        this.burst(0.35, 1100, 0.12);
        break;
      case 'wallStart':
        this.sweep(0.2, 420, 700, 0.07);
        this.burst(0.16, 1800, 0.07);
        break;
      case 'wallJump':
        this.sweep(0.14, 520, 300, 0.1);
        break;
      case 'vaultStart':
      case 'mantleStart':
        this.burst(0.14, 700, 0.09);
        this.thud(0.08, 180, 0.1);
        break;
      case 'vaultEnd':
        this.thud(0.07, 160, 0.08);
        break;
      case 'zipGrab':
        this.ping(1320, 0.5);
        this.burst(0.2, 2600, 0.06);
        break;
      case 'zipRelease':
        this.sweep(0.18, 900, 1400, 0.05);
        break;
      case 'checkpoint':
        this.ping(660, 0.4);
        setTimeout(() => this.ping(990, 0.4), 110);
        break;
      case 'finish': {
        const notes = [440, 554, 659, 880, 1109];
        notes.forEach((f, i) => setTimeout(() => this.ping(f, 0.5, 0.28), i * 90));
        break;
      }
      case 'respawn':
        this.sweep(0.25, 300, 90, 0.08);
        break;
    }
  }

  dispose(): void {
    for (const [, l] of this.loops) {
      try {
        l.src.stop();
      } catch {
        /* already stopped */
      }
      l.src.disconnect();
      l.gain.disconnect();
    }
    this.loops.clear();
    void this.ctx?.close();
    this.ctx = null;
  }

  // ---------------------------------------------------------------- helpers

  private makeNoise(ctx: AudioContext, seconds: number): AudioBuffer {
    const buf = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  private startLoop(
    name: LoopName,
    filter: { type: BiquadFilterType; freq: number; Q?: number },
    gain: number,
  ): void {
    if (!this.ctx || !this.master || !this.noise) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = filter.type;
    f.frequency.value = filter.freq;
    if (filter.Q) f.Q.value = filter.Q;
    const g = this.ctx.createGain();
    g.gain.value = gain;
    src.connect(f).connect(g).connect(this.master);
    src.start();
    this.loops.set(name, { src, gain: g });
  }

  private burst(dur: number, freq: number, gain: number): void {
    if (!this.ctx || !this.master || !this.noise) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    f.Q.value = 1.2;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random());
    src.stop(t + dur + 0.02);
  }

  private thud(dur: number, freq: number, gain: number): void {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(freq * 1.6, t);
    o.frequency.exponentialRampToValueAtTime(freq * 0.6, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private sweep(dur: number, from: number, to: number, gain: number): void {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(from, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(30, to), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private ping(freq: number, gain: number, dur = 0.18): void {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }
}
