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
    this.sfxVolume = 0.78;
    this.musicVolume = 0.42;
    this.musicStarted = false;
    this.combatLevel = 0;
  }

  unlock() {
    if (!this.context) {
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.master.gain.value = 1;
      this.master.connect(this.context.destination);
      this.sfxGain = this.context.createGain();
      this.sfxGain.gain.value = this.sfxVolume;
      this.sfxGain.connect(this.master);
      this.calmGain = this.context.createGain();
      this.intenseGain = this.context.createGain();
      this.calmGain.gain.value = 0;
      this.intenseGain.gain.value = 0;
      this.calmGain.connect(this.master);
      this.intenseGain.connect(this.master);
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
    oscillator.connect(gain).connect(this.sfxGain);
    oscillator.start();
    oscillator.stop(this.context.currentTime + settings.duration);
  }

  setSettings(settings = {}) {
    this.sfxVolume = Number(settings.sfxVolume ?? this.sfxVolume);
    this.musicVolume = Number(settings.musicVolume ?? this.musicVolume);
    if (this.sfxGain) {
      this.sfxGain.gain.setTargetAtTime(this.sfxVolume, this.context.currentTime, 0.04);
    }
    if (this.musicStarted) {
      this.applyMusicMix();
    }
  }

  startMusic() {
    this.unlock();
    if (this.musicStarted) {
      return;
    }
    this.musicStarted = true;
    this.calmNodes = this.createMusicLayer({
      gain: this.calmGain,
      base: 82,
      intervals: [0, 7, 12, 19],
      type: 'sine',
      filter: 720,
    });
    this.intenseNodes = this.createMusicLayer({
      gain: this.intenseGain,
      base: 110,
      intervals: [0, 3, 7, 10, 15],
      type: 'sawtooth',
      filter: 1100,
    });
    this.applyMusicMix();
  }

  setCombatActivity(activity) {
    this.combatLevel = Math.max(0, Math.min(1, activity / 12));
    if (this.musicStarted) {
      this.applyMusicMix();
    }
  }

  createMusicLayer({ gain, base, intervals, type, filter }) {
    const filterNode = this.context.createBiquadFilter();
    filterNode.type = 'lowpass';
    filterNode.frequency.value = filter;
    filterNode.Q.value = 0.7;
    filterNode.connect(gain);
    const nodes = intervals.map((interval, index) => {
      const oscillator = this.context.createOscillator();
      const voiceGain = this.context.createGain();
      oscillator.type = type;
      oscillator.frequency.value = base * 2 ** (interval / 12);
      oscillator.detune.value = (index - intervals.length / 2) * 4;
      voiceGain.gain.value = 0.055 / intervals.length;
      oscillator.connect(voiceGain).connect(filterNode);
      oscillator.start();
      return { oscillator, voiceGain };
    });
    return { filterNode, nodes };
  }

  applyMusicMix() {
    const now = this.context.currentTime;
    const calm = this.musicVolume * (1 - this.combatLevel) * 0.42;
    const intense = this.musicVolume * this.combatLevel * 0.52;
    this.calmGain.gain.setTargetAtTime(calm, now, 0.9);
    this.intenseGain.gain.setTargetAtTime(intense, now, 0.65);
  }
}
