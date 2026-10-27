/**
 * All sound is synthesised with the Web Audio API - no audio files.
 * Short one-shots (footsteps, jumps, landings...) are built from a shared
 * noise buffer and oscillators; wind and slide are continuous loops whose
 * gain follows the player's movement.
 */
export class AudioManager {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private noise!: AudioBuffer;
  private windGain!: GainNode;
  private windFilter!: BiquadFilterNode;
  private slideGain!: GainNode;
  private slideFilter!: BiquadFilterNode;
  private volume = 0.8;
  private muted = false;

  /** Must be called from a user gesture (browser autoplay rules). */
  init(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    this.ctx = ctx;

    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(ctx.destination);

    // Two seconds of white noise reused by every noisy sound.
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    // Wind loop (speed driven).
    const wind = this.loopNoise();
    this.windFilter = ctx.createBiquadFilter();
    // Soft low rumble rather than hiss: lowpass with a gentle slope.
    this.windFilter.type = 'lowpass';
    this.windFilter.frequency.value = 260;
    this.windFilter.Q.value = 0.3;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    wind.connect(this.windFilter).connect(this.windGain).connect(this.master);

    // Slide loop (scrape).
    const slide = this.loopNoise();
    this.slideFilter = ctx.createBiquadFilter();
    this.slideFilter.type = 'bandpass';
    this.slideFilter.frequency.value = 1400;
    this.slideFilter.Q.value = 0.9;
    this.slideGain = ctx.createGain();
    this.slideGain.gain.value = 0;
    slide.connect(this.slideFilter).connect(this.slideGain).connect(this.master);
  }

  setVolume(v: number): void {
    this.volume = v;
    if (this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : v, this.ctx.currentTime, 0.05);
  }

  /** Silence everything (pause menu etc). */
  setMuted(m: boolean): void {
    this.muted = m;
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : this.volume, this.ctx.currentTime, 0.08);
  }

  private loopNoise(): AudioBufferSourceNode {
    const src = this.ctx!.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    src.start();
    return src;
  }

  /** Short filtered noise burst. */
  private burst(freq: number, q: number, gain: number, attack: number, decay: number, type: BiquadFilterType = 'bandpass', delay = 0): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random() * 1.5);
    src.stop(t + attack + decay + 0.05);
  }

  /** Pitched tone with an exponential pitch sweep. */
  private tone(type: OscillatorType, f0: number, f1: number, gain: number, attack: number, decay: number, delay = 0): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + attack + decay);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + attack + decay + 0.05);
  }

  footstep(speed: number): void {
    const k = Math.min(1, speed / 11);
    const pitch = 0.85 + Math.random() * 0.3;
    this.burst(1700 * pitch, 1.2, 0.1 + k * 0.1, 0.004, 0.06);
    this.tone('sine', 140 * pitch, 60, 0.12 + k * 0.08, 0.003, 0.07);
  }

  jump(): void {
    this.burst(900, 0.8, 0.16, 0.005, 0.12);
    this.tone('sine', 180, 90, 0.16, 0.005, 0.1);
    this.burst(2400, 0.5, 0.05, 0.02, 0.18, 'highpass');
  }

  land(impact: number): void {
    const k = Math.min(1, impact / 20);
    this.tone('sine', 110, 38, 0.25 + k * 0.4, 0.004, 0.14 + k * 0.15);
    this.burst(600, 0.7, 0.15 + k * 0.25, 0.004, 0.1 + k * 0.12, 'lowpass');
    this.burst(2200, 1, 0.06 + k * 0.06, 0.003, 0.05);
  }

  vault(): void {
    this.burst(1200, 0.8, 0.14, 0.01, 0.1);
    this.burst(500, 0.6, 0.12, 0.08, 0.25, 'bandpass', 0.05);
    this.tone('sine', 160, 80, 0.1, 0.004, 0.08, 0.18);
  }

  mantle(): void {
    this.burst(800, 0.8, 0.14, 0.01, 0.08);
    this.burst(1500, 1, 0.1, 0.01, 0.08, 'bandpass', 0.16);
    this.tone('sine', 130, 70, 0.12, 0.004, 0.08, 0.3);
  }

  wallStep(): void {
    this.burst(1300, 1.4, 0.12, 0.003, 0.05);
    this.tone('sine', 170, 90, 0.08, 0.003, 0.05);
  }

  checkpoint(): void {
    const notes = [880, 1318.5];
    notes.forEach((f, i) => {
      this.tone('sine', f, f, 0.14, 0.01, 0.55, i * 0.09);
      this.tone('triangle', f * 2, f * 2, 0.03, 0.01, 0.3, i * 0.09);
    });
  }

  finish(): void {
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5];
    notes.forEach((f, i) => {
      this.tone('sine', f, f, 0.15, 0.01, 0.9, i * 0.11);
      this.tone('triangle', f / 2, f / 2, 0.06, 0.01, 0.9, i * 0.11);
    });
    this.burst(3000, 0.3, 0.05, 0.4, 1.4, 'highpass', 0.1);
  }

  respawn(): void {
    this.tone('sine', 300, 600, 0.08, 0.05, 0.3);
    this.burst(3000, 0.5, 0.06, 0.15, 0.3, 'highpass');
  }

  uiClick(): void {
    this.tone('sine', 1200, 900, 0.06, 0.002, 0.05);
  }

  /** Continuous sounds; call every frame. */
  updateLoops(speed: number, airborne: boolean, sliding: boolean, slideSpeed: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const w = Math.max(0, Math.min(1, (speed - 5) / 10)) * (airborne ? 1.2 : 1);
    this.windGain.gain.setTargetAtTime(w * w * 0.12, t, 0.25);
    this.windFilter.frequency.setTargetAtTime(220 + w * 480, t, 0.3);
    const sv = sliding ? Math.min(1, slideSpeed / 12) : 0;
    this.slideGain.gain.setTargetAtTime(sv * 0.22, t, sliding ? 0.03 : 0.08);
    this.slideFilter.frequency.setTargetAtTime(700 + sv * 1300, t, 0.05);
  }
}
