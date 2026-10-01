/**
 * AudioManager: music, effects and ambience with independent volumes.
 * There are no audio files: sounds are synthesized with Web Audio. If the
 * API is unavailable or blocked, every method silently does nothing.
 */
export type Sfx = 'click' | 'coin' | 'harvest' | 'plant' | 'build' | 'error' | 'levelUp' | 'notify';

export class AudioManager {
  private ctx: AudioContext | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private ambientGain: GainNode | null = null;
  private musicTimer: number | null = null;
  private ambientSource: AudioBufferSourceNode | null = null;
  private volumes = { music: 0.4, sfx: 0.7, ambient: 0.3 };
  private step = 0;

  setVolumes(v: { music: number; sfx: number; ambient: number }): void {
    this.volumes = { ...v };
    if (this.musicGain) this.musicGain.gain.value = v.music * 0.12;
    if (this.sfxGain) this.sfxGain.gain.value = v.sfx * 0.4;
    if (this.ambientGain) this.ambientGain.gain.value = v.ambient * 0.05;
  }

  /** Silences all output (e.g. while a portal ad is playing). */
  setSuspended(suspended: boolean): void {
    try {
      if (!this.ctx) return;
      if (suspended && this.ctx.state === 'running') void this.ctx.suspend();
      else if (!suspended && this.ctx.state === 'suspended') void this.ctx.resume();
    } catch {
      // ignore: audio is optional
    }
  }

  /** Must be called from a user gesture (browser autoplay policy). */
  unlock(): void {
    try {
      if (!this.ctx) {
        const AC =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this.musicGain = this.ctx.createGain();
        this.sfxGain = this.ctx.createGain();
        this.ambientGain = this.ctx.createGain();
        this.musicGain.connect(this.ctx.destination);
        this.sfxGain.connect(this.ctx.destination);
        this.ambientGain.connect(this.ctx.destination);
        this.setVolumes(this.volumes);
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume();
    } catch {
      this.ctx = null;
    }
  }

  private tone(
    freq: number,
    dur: number,
    type: OscillatorType,
    gainNode: GainNode | null,
    delay = 0,
    vol = 1,
  ): void {
    if (!this.ctx || !gainNode) return;
    try {
      const t0 = this.ctx.currentTime + delay;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(g).connect(gainNode);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    } catch {
      // ignore audio errors
    }
  }

  play(sfx: Sfx): void {
    if (!this.ctx || this.volumes.sfx <= 0) return;
    const g = this.sfxGain;
    switch (sfx) {
      case 'click':
        this.tone(660, 0.06, 'triangle', g, 0, 0.5);
        break;
      case 'coin':
        this.tone(988, 0.08, 'square', g, 0, 0.3);
        this.tone(1318, 0.18, 'square', g, 0.07, 0.3);
        break;
      case 'harvest':
        this.tone(392, 0.1, 'triangle', g);
        this.tone(523, 0.1, 'triangle', g, 0.08);
        this.tone(659, 0.2, 'triangle', g, 0.16);
        break;
      case 'plant':
        this.tone(330, 0.08, 'sine', g);
        this.tone(440, 0.12, 'sine', g, 0.06);
        break;
      case 'build':
        this.tone(196, 0.12, 'square', g, 0, 0.3);
        this.tone(262, 0.2, 'square', g, 0.1, 0.3);
        break;
      case 'error':
        this.tone(180, 0.18, 'sawtooth', g, 0, 0.25);
        break;
      case 'levelUp':
        [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.18, 'triangle', g, i * 0.09));
        break;
      case 'notify':
        this.tone(880, 0.1, 'sine', g, 0, 0.4);
        break;
    }
  }

  /** Gentle generative music loop (pentatonic). */
  startMusic(): void {
    if (!this.ctx || this.musicTimer !== null) return;
    const scale = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25];
    const chords = [
      [130.81, 196.0],
      [146.83, 220.0],
      [174.61, 261.63],
      [130.81, 196.0],
    ];
    this.musicTimer = window.setInterval(() => {
      if (!this.ctx || this.volumes.music <= 0 || this.ctx.state !== 'running') return;
      const s = this.step++;
      if (s % 8 === 0)
        for (const f of chords[(s / 8) % chords.length]) this.tone(f, 3.2, 'sine', this.musicGain, 0, 0.6);
      if (s % 2 === 0 || Math.random() < 0.3)
        this.tone(scale[Math.floor(Math.random() * scale.length)], 0.9, 'triangle', this.musicGain, 0, 0.35);
    }, 420);
  }

  stopMusic(): void {
    if (this.musicTimer !== null) window.clearInterval(this.musicTimer);
    this.musicTimer = null;
  }

  /** Soft wind-like filtered noise. */
  startAmbient(): void {
    if (!this.ctx || !this.ambientGain || this.ambientSource) return;
    try {
      const len = this.ctx.sampleRate * 2;
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < len; i++) {
        last = last * 0.98 + (Math.random() * 2 - 1) * 0.02;
        data[i] = last * 6;
      }
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 600;
      src.connect(filter).connect(this.ambientGain);
      src.start();
      this.ambientSource = src;
    } catch {
      this.ambientSource = null;
    }
  }

  stopAmbient(): void {
    try {
      this.ambientSource?.stop();
    } catch {
      // ignore
    }
    this.ambientSource = null;
  }
}

export const audio = new AudioManager();
