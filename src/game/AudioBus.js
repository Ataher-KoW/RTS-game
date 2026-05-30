const SOUND_SETTINGS = {
  select: { frequency: 620, duration: 0.055, type: 'triangle', gain: 0.035 },
  move: { frequency: 280, duration: 0.09, type: 'sine', gain: 0.04 },
  build: { frequency: 520, duration: 0.18, type: 'sawtooth', gain: 0.035 },
  fire: { frequency: 120, duration: 0.045, type: 'square', gain: 0.025 },
  explosion: { frequency: 70, duration: 0.32, type: 'sawtooth', gain: 0.06 },
  veteran: { frequency: 880, duration: 0.22, type: 'triangle', gain: 0.04 },
  denied: { frequency: 130, duration: 0.12, type: 'square', gain: 0.035 },
};

export class AudioBus {
  constructor() {
    this.context = null;
    this.enabled = true;
  }

  unlock() {
    if (!this.context) {
      this.context = new AudioContext();
    }
    if (this.context.state === 'suspended') {
      this.context.resume();
    }
  }

  play(name) {
    if (!this.enabled || !SOUND_SETTINGS[name]) {
      return;
    }
    this.unlock();

    const settings = SOUND_SETTINGS[name];
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = settings.type;
    oscillator.frequency.value = settings.frequency;
    gain.gain.setValueAtTime(settings.gain, this.context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, this.context.currentTime + settings.duration);
    oscillator.connect(gain).connect(this.context.destination);
    oscillator.start();
    oscillator.stop(this.context.currentTime + settings.duration);
  }
}
