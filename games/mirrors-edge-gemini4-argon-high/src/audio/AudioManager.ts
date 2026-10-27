export class AudioManager {
  private ctx: AudioContext | null = null;
  private enabled: boolean = true;

  // Continuous wind nodes
  private windGain: GainNode | null = null;
  private windFilter: BiquadFilterNode | null = null;

  // Continuous slide nodes
  private slideGain: GainNode | null = null;
  private slideFilter: BiquadFilterNode | null = null;

  // Continuous zipline nodes
  private zipGain: GainNode | null = null;
  private zipOsc: OscillatorNode | null = null;

  private noiseBuffer: AudioBuffer | null = null;
  private stepToggle: boolean = false;

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled && this.ctx) {
      if (this.windGain) this.windGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
      if (this.slideGain) this.slideGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
      if (this.zipGain) this.zipGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
    }
  }

  public init(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      return;
    }

    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();

      // Generate 2-second white/pink noise buffer
      const sampleRate = this.ctx.sampleRate;
      const length = sampleRate * 2;
      this.noiseBuffer = this.ctx.createBuffer(1, length, sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      let b0 = 0, b1 = 0, b2 = 0;
      for (let i = 0; i < length; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99765 * b0 + white * 0.099046;
        b1 = 0.96300 * b1 + white * 0.2965164;
        b2 = 0.57000 * b2 + white * 1.0526913;
        data[i] = (b0 + b1 + b2 + white * 0.1848) * 0.18;
      }

      // Wind continuous loop
      const windSource = this.ctx.createBufferSource();
      windSource.buffer = this.noiseBuffer;
      windSource.loop = true;

      this.windFilter = this.ctx.createBiquadFilter();
      this.windFilter.type = 'bandpass';
      this.windFilter.frequency.value = 320;
      this.windFilter.Q.value = 1.2;

      this.windGain = this.ctx.createGain();
      this.windGain.gain.value = 0;

      windSource.connect(this.windFilter);
      this.windFilter.connect(this.windGain);
      this.windGain.connect(this.ctx.destination);
      windSource.start();

      // Slide continuous loop
      const slideSource = this.ctx.createBufferSource();
      slideSource.buffer = this.noiseBuffer;
      slideSource.loop = true;

      this.slideFilter = this.ctx.createBiquadFilter();
      this.slideFilter.type = 'bandpass';
      this.slideFilter.frequency.value = 950;
      this.slideFilter.Q.value = 1.8;

      this.slideGain = this.ctx.createGain();
      this.slideGain.gain.value = 0;

      slideSource.connect(this.slideFilter);
      this.slideFilter.connect(this.slideGain);
      this.slideGain.connect(this.ctx.destination);
      slideSource.start();

      // Zipline continuous metallic whir
      this.zipOsc = this.ctx.createOscillator();
      this.zipOsc.type = 'sawtooth';
      this.zipOsc.frequency.value = 260;

      const zipFilter = this.ctx.createBiquadFilter();
      zipFilter.type = 'bandpass';
      zipFilter.frequency.value = 1400;
      zipFilter.Q.value = 3.0;

      this.zipGain = this.ctx.createGain();
      this.zipGain.gain.value = 0;

      this.zipOsc.connect(zipFilter);
      zipFilter.connect(this.zipGain);
      this.zipGain.connect(this.ctx.destination);
      this.zipOsc.start();
    } catch {
      // AudioContext unavailable
    }
  }

  public updateContinuous(speed: number, isSliding: boolean, isZiplining: boolean, paused: boolean): void {
    if (!this.ctx || !this.windGain || !this.windFilter || !this.slideGain || !this.slideFilter || !this.zipGain || !this.zipOsc) {
      return;
    }

    const now = this.ctx.currentTime;
    if (!this.enabled || paused) {
      this.windGain.gain.setTargetAtTime(0, now, 0.06);
      this.slideGain.gain.setTargetAtTime(0, now, 0.04);
      this.zipGain.gain.setTargetAtTime(0, now, 0.04);
      return;
    }

    // Wind scales softly with speed above 6.5 m/s
    const speedNorm = Math.max(0, Math.min(1, (speed - 6.5) / 13.0));
    const targetWindGain = speedNorm * speedNorm * 0.22;
    const targetWindFreq = 260 + speedNorm * 650;
    this.windGain.gain.setTargetAtTime(targetWindGain, now, 0.08);
    this.windFilter.frequency.setTargetAtTime(targetWindFreq, now, 0.08);

    // Slide friction loop
    if (isSliding && speed > 1.5) {
      const slideNorm = Math.min(1, speed / 12.0);
      this.slideGain.gain.setTargetAtTime(slideNorm * 0.24, now, 0.04);
      this.slideFilter.frequency.setTargetAtTime(650 + slideNorm * 650, now, 0.05);
    } else {
      this.slideGain.gain.setTargetAtTime(0, now, 0.05);
    }

    // Zipline metallic cable whine
    if (isZiplining && speed > 2.0) {
      const zipNorm = Math.min(1, speed / 18.0);
      this.zipGain.gain.setTargetAtTime(zipNorm * 0.12, now, 0.05);
      this.zipOsc.frequency.setTargetAtTime(220 + zipNorm * 340, now, 0.05);
    } else {
      this.zipGain.gain.setTargetAtTime(0, now, 0.05);
    }
  }

  public playFootstep(isSprint: boolean, isWallRun: boolean = false): void {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx || !this.noiseBuffer) return;

    this.stepToggle = !this.stepToggle;
    const now = this.ctx.currentTime;

    // Low sneaker thud
    const osc = this.ctx.createOscillator();
    const oscGain = this.ctx.createGain();
    osc.type = 'sine';
    const basePitch = isWallRun ? 125 : isSprint ? 102 : 88;
    const pitchOffset = this.stepToggle ? 7 : -5;
    osc.frequency.setValueAtTime(basePitch + pitchOffset, now);
    osc.frequency.exponentialRampToValueAtTime(36, now + 0.065);

    const vol = isWallRun ? 0.18 : isSprint ? 0.21 : 0.14;
    oscGain.gain.setValueAtTime(vol, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.075);

    osc.connect(oscGain);
    oscGain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.08);

    // Crisp sole scuff
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = isWallRun ? 1600 : 1200 + (this.stepToggle ? 180 : -120);
    filter.Q.value = 1.6;

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(vol * 0.65, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.055);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.ctx.destination);
    noise.start(now, Math.random() * 1.2, 0.06);
  }

  public playJump(isWallJump: boolean = false): void {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx || !this.noiseBuffer) return;

    const now = this.ctx.currentTime;

    // Upward breath/cloth whoosh
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(isWallJump ? 520 : 380, now);
    filter.frequency.exponentialRampToValueAtTime(1150, now + 0.16);
    filter.Q.value = 1.4;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.22, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.17);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    noise.start(now, Math.random(), 0.18);

    // Subtle shoe push-off
    const osc = this.ctx.createOscillator();
    const oscGain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(isWallJump ? 130 : 95, now);
    osc.frequency.exponentialRampToValueAtTime(210, now + 0.09);

    oscGain.gain.setValueAtTime(0.14, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

    osc.connect(oscGain);
    oscGain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.1);
  }

  public playLand(impactSpeed: number): void {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx || !this.noiseBuffer) return;

    const now = this.ctx.currentTime;
    const intensity = Math.min(1, Math.max(0.2, impactSpeed / 16));

    // Heavy body/sole thud
    const osc = this.ctx.createOscillator();
    const oscGain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(110 + intensity * 30, now);
    osc.frequency.exponentialRampToValueAtTime(28, now + 0.14);

    oscGain.gain.setValueAtTime(0.32 * intensity, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

    osc.connect(oscGain);
    oscGain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.16);

    // Concrete grit impact
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 950;

    const nGain = this.ctx.createGain();
    nGain.gain.setValueAtTime(0.22 * intensity, now);
    nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);

    noise.connect(filter);
    filter.connect(nGain);
    nGain.connect(this.ctx.destination);
    noise.start(now, Math.random(), 0.12);
  }

  public playVault(): void {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx || !this.noiseBuffer) return;

    const now = this.ctx.currentTime;

    // Hand slap on obstacle + swift cloth swoosh
    const osc = this.ctx.createOscillator();
    const oscGain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(165, now);
    osc.frequency.exponentialRampToValueAtTime(62, now + 0.08);

    oscGain.gain.setValueAtTime(0.22, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

    osc.connect(oscGain);
    oscGain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.095);

    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(600, now);
    filter.frequency.exponentialRampToValueAtTime(1500, now + 0.18);

    const nGain = this.ctx.createGain();
    nGain.gain.setValueAtTime(0.18, now);
    nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

    noise.connect(filter);
    filter.connect(nGain);
    nGain.connect(this.ctx.destination);
    noise.start(now, Math.random(), 0.21);
  }

  public playCheckpoint(): void {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const notes = [587.33, 880.0]; // D5 -> A5 clean crystalline interval
    notes.forEach((freq, idx) => {
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      const startTime = now + idx * 0.09;
      osc.frequency.setValueAtTime(freq, startTime);

      gain.gain.setValueAtTime(0.001, startTime);
      gain.gain.linearRampToValueAtTime(0.16, startTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0008, startTime + 0.55);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(startTime);
      osc.stop(startTime + 0.56);
    });
  }

  public playLevelComplete(): void {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    // Mirror's Edge-inspired atmospheric synth arpeggio (D major 9th / E9 shimmer)
    const freqs = [587.33, 739.99, 880.0, 1174.66, 1318.51];
    freqs.forEach((freq, idx) => {
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = idx % 2 === 0 ? 'sine' : 'triangle';
      const startTime = now + idx * 0.085;
      osc.frequency.setValueAtTime(freq, startTime);

      gain.gain.setValueAtTime(0.001, startTime);
      gain.gain.linearRampToValueAtTime(0.15, startTime + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0005, startTime + 1.35);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(startTime);
      osc.stop(startTime + 1.4);
    });
  }
}
