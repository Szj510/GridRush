// Simple Web Audio API Synthesizer to avoid external assets
class AudioService {
  private ctx: AudioContext | null = null;
  private soundEnabled: boolean = true;
  private musicEnabled: boolean = true;
  private musicNode: OscillatorNode | null = null;
  private musicGain: GainNode | null = null;

  init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  setSettings(sound: boolean, music: boolean) {
    this.soundEnabled = sound;
    this.musicEnabled = music;
    
    if (!music && this.musicNode) {
      this.stopMusic();
    } else if (music && !this.musicNode) {
      // Lazy start music if enabled later
      // playMusic called explicitly usually
    }
  }

  playTone(freq: number, type: OscillatorType, duration: number, vol: number = 0.1) {
    if (!this.soundEnabled || !this.ctx) return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
      gain.gain.setValueAtTime(vol, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + duration);
    } catch (e) { console.error(e); }
  }

  playClick() {
    this.playTone(800, 'sine', 0.1, 0.1);
  }

  playPop() {
    this.playTone(600, 'triangle', 0.05, 0.1);
  }

  playSuccess() {
    if (!this.soundEnabled || !this.ctx) return;
    const now = this.ctx.currentTime;
    [440, 554, 659].forEach((f, i) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, now + i * 0.1);
      gain.gain.setValueAtTime(0.1, now + i * 0.1);
      gain.gain.linearRampToValueAtTime(0, now + i * 0.1 + 0.2);
      osc.connect(gain);
      gain.connect(this.ctx!.destination);
      osc.start(now + i * 0.1);
      osc.stop(now + i * 0.1 + 0.2);
    });
  }

  playFailure() {
    if (!this.soundEnabled || !this.ctx) return;
    this.playTone(150, 'sawtooth', 0.3, 0.1);
  }

  playWin() {
    if (!this.soundEnabled || !this.ctx) return;
    // Simple fanfare
    this.playSuccess();
    setTimeout(() => this.playSuccess(), 200);
  }

  // Very simple ambient drone
  startMusic() {
    if (!this.musicEnabled || !this.ctx || this.musicNode) return;
    try {
      this.musicNode = this.ctx.createOscillator();
      this.musicGain = this.ctx.createGain();
      this.musicNode.type = 'sine';
      this.musicNode.frequency.setValueAtTime(110, this.ctx.currentTime); // Low A
      this.musicGain.gain.setValueAtTime(0.02, this.ctx.currentTime); // Very quiet
      this.musicNode.connect(this.musicGain);
      this.musicGain.connect(this.ctx.destination);
      this.musicNode.start();
    } catch(e) { console.error(e); }
  }

  stopMusic() {
    if (this.musicNode) {
      try {
        this.musicNode.stop();
        this.musicNode.disconnect();
      } catch (e) {}
      this.musicNode = null;
    }
  }
}

export const audio = new AudioService();