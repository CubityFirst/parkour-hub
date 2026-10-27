export class AudioManager {
  private context?: AudioContext;
  private master?: GainNode;
  private wind?: GainNode;
  private windOsc?: OscillatorNode;
  private enabled = true;

  async start(): Promise<void> {
    if (this.context) {
      await this.context.resume();
      return;
    }
    const AudioContextClass = window.AudioContext;
    if (!AudioContextClass) return;
    this.context = new AudioContextClass();
    this.master = this.context.createGain();
    this.master.gain.value = 0.18;
    this.master.connect(this.context.destination);
    this.wind = this.context.createGain();
    this.wind.gain.value = 0;
    this.wind.connect(this.master);
    this.windOsc = this.context.createOscillator();
    this.windOsc.type = "sawtooth";
    this.windOsc.frequency.value = 64;
    const windFilter = this.context.createBiquadFilter();
    windFilter.type = "lowpass";
    windFilter.frequency.value = 180;
    this.windOsc.connect(windFilter);
    windFilter.connect(this.wind);
    this.windOsc.start();
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled && this.wind && this.context) this.wind.gain.setTargetAtTime(0, this.context.currentTime, 0.06);
  }

  setWind(speed: number, sprinting: boolean): void {
    if (!this.context || !this.wind || !this.enabled) return;
    const level = sprinting ? Math.min(0.08, Math.max(0, (speed - 5) / 100)) : 0;
    this.wind.gain.setTargetAtTime(level, this.context.currentTime, 0.12);
    if (this.windOsc) this.windOsc.frequency.setTargetAtTime(50 + Math.min(speed, 14) * 5, this.context.currentTime, 0.12);
  }

  step(): void {
    this.tone(86, 0.045, "triangle", 0.045);
  }

  slide(): void {
    this.tone(112, 0.11, "sawtooth", 0.045);
  }

  jump(): void {
    this.tone(170, 0.11, "triangle", 0.11);
  }

  land(): void {
    this.tone(78, 0.09, "sine", 0.15);
  }

  vault(): void {
    this.tone(250, 0.08, "triangle", 0.07);
  }

  checkpoint(): void {
    this.tone(440, 0.14, "sine", 0.1);
    window.setTimeout(() => this.tone(660, 0.16, "sine", 0.08), 90);
  }

  finish(): void {
    this.tone(523, 0.2, "sine", 0.12);
    window.setTimeout(() => this.tone(659, 0.2, "sine", 0.1), 130);
    window.setTimeout(() => this.tone(784, 0.34, "sine", 0.1), 270);
  }

  private tone(frequency: number, duration: number, type: OscillatorType, volume: number): void {
    if (!this.context || !this.master || !this.enabled) return;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, this.context.currentTime);
    gain.gain.setValueAtTime(volume, this.context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.context.currentTime + duration);
    oscillator.connect(gain);
    gain.connect(this.master);
    oscillator.start();
    oscillator.stop(this.context.currentTime + duration);
  }
}
