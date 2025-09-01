export class SoundSystem {
  constructor() {
    this.enabled = true;
    this.volume = 0.3;
    this.audioContext = null;
    this.sounds = {};
    
    // Initialize on first user interaction
    this.initialized = false;
  }

  async init() {
    if (this.initialized) return;
    
    try {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      this.initialized = true;
      
      // Create basic sounds using Web Audio API
      this.createSounds();
    } catch (error) {
      console.warn('Audio not available:', error);
      this.enabled = false;
    }
  }

  createSounds() {
    // These are simple synthesized sounds
    this.sounds = {
      // Weapon sounds
      shoot: () => this.playShootSound(),
      shootPistol: () => this.playTone(250, 0.05, 'square', 0.08),
      shootShotgun: () => this.playBurst(150, 0.15, 'sawtooth', 0.3),
      shootSMG: () => this.playTone(350, 0.02, 'square', 0.05),
      shootRocket: () => this.playExplosion(80, 0.3, 0.4),
      shootLaser: () => this.playTone(1200, 0.03, 'sine', 0.05),
      shootRicochet: () => this.playTone(500, 0.08, 'triangle', 0.15),
      shootWave: () => this.playTone(400, 0.1, 'sine', 0.12),
      shootBurst: () => this.playTone(450, 0.04, 'square', 0.1),
      shootOrbital: () => {
        this.playExplosion(60, 0.3, 0.25);
        this.playTone(100, 0.2, 'sawtooth', 0.2);
      },
      shootNova: () => {
        // Expanding ring sound effect
        this.playTone(800, 0.15, 'sine', 0.2);
        this.playTone(600, 0.2, 'triangle', 0.15);
        this.playNoise(0.1, 0.1);
      },
      
      // Impact sounds
      hit: () => this.playTone(100, 0.1, 'sawtooth', 0.2),
      critHit: () => this.playArpeggio([100, 200, 400], 0.1),
      explosion: () => this.playExplosion(50, 0.4, 0.5),
      
      // Enemy sounds
      enemyDeath: () => this.playNoise(0.1, 0.3),
      enemySpawn: () => this.playTone(150, 0.1, 'triangle', 0.1),
      
      // Pickup sounds
      pickup: () => this.playTone(800, 0.1, 'sine', 0.2),
      moneyPickup: () => this.playArpeggio([600, 800, 1000], 0.08),
      
      // Player sounds
      levelUp: () => this.playArpeggio([400, 500, 600, 800], 0.15),
      playerHurt: () => this.playTone(50, 0.2, 'sawtooth', 0.4),
      dodge: () => this.playTone(1200, 0.05, 'sine', 0.15),
      
      // UI sounds
      countdown: () => this.playTone(880, 0.1, 'sine', 0.3),
      countdownUrgent: () => this.playTone(1320, 0.15, 'square', 0.4),
      buttonClick: () => this.playTone(600, 0.05, 'sine', 0.1),
      purchaseSuccess: () => this.playArpeggio([400, 600, 800], 0.1),
      purchaseFail: () => this.playTone(200, 0.2, 'sawtooth', 0.2),
      waveComplete: () => this.playArpeggio([300, 400, 500, 600, 800], 0.2),
      
      // Projectile sounds
      bounce: () => this.playTone(400, 0.03, 'triangle', 0.05),
      reload: () => this.playNoise(0.05, 0.1),
    };
  }

  // Random shoot sound variation to avoid repetition
  playShootSound() {
    const variations = [
      () => this.playTone(200 + Math.random() * 50, 0.05, 'square', 0.1),
      () => this.playTone(180 + Math.random() * 40, 0.04, 'sawtooth', 0.08),
      () => this.playTone(220 + Math.random() * 30, 0.06, 'triangle', 0.09),
    ];
    variations[Math.floor(Math.random() * variations.length)]();
  }

  // Burst sound for shotgun
  playBurst(frequency, duration, type, volume) {
    if (!this.enabled || !this.audioContext) return;
    
    // Play multiple quick tones
    for (let i = 0; i < 3; i++) {
      setTimeout(() => {
        this.playTone(frequency + i * 20, duration / 3, type, volume * (1 - i * 0.2));
      }, i * 30);
    }
  }

  // Explosion sound effect
  playExplosion(frequency, duration, volume) {
    if (!this.enabled || !this.audioContext) return;
    
    // Combine noise and low frequency tone
    this.playNoise(duration, volume);
    this.playTone(frequency, duration * 0.5, 'sawtooth', volume * 0.5);
    
    // Add some rumble
    setTimeout(() => {
      this.playTone(frequency * 0.5, duration * 0.3, 'sine', volume * 0.3);
    }, 50);
  }

  playTone(frequency, duration, type = 'sine', volume = null) {
    if (!this.enabled || !this.audioContext) return;
    
    const oscillator = this.audioContext.createOscillator();
    const gainNode = this.audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(this.audioContext.destination);
    
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, this.audioContext.currentTime);
    
    const finalVolume = (volume ?? this.volume) * 0.5;
    gainNode.gain.setValueAtTime(finalVolume, this.audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + duration);
    
    oscillator.start(this.audioContext.currentTime);
    oscillator.stop(this.audioContext.currentTime + duration);
  }

  playNoise(duration, volume = null) {
    if (!this.enabled || !this.audioContext) return;
    
    const bufferSize = this.audioContext.sampleRate * duration;
    const buffer = this.audioContext.createBuffer(1, bufferSize, this.audioContext.sampleRate);
    const output = buffer.getChannelData(0);
    
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }
    
    const noise = this.audioContext.createBufferSource();
    const gainNode = this.audioContext.createGain();
    const filter = this.audioContext.createBiquadFilter();
    
    noise.buffer = buffer;
    noise.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(this.audioContext.destination);
    
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1000, this.audioContext.currentTime);
    
    const finalVolume = (volume ?? this.volume) * 0.3;
    gainNode.gain.setValueAtTime(finalVolume, this.audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + duration);
    
    noise.start(this.audioContext.currentTime);
  }

  playArpeggio(frequencies, duration) {
    if (!this.enabled || !this.audioContext) return;
    
    const noteLength = duration / frequencies.length;
    frequencies.forEach((freq, index) => {
      setTimeout(() => {
        this.playTone(freq, noteLength * 0.9, 'sine', this.volume * 0.5);
      }, index * noteLength * 1000);
    });
  }

  play(soundName) {
    if (!this.initialized) {
      this.init().then(() => {
        if (this.sounds[soundName]) {
          this.sounds[soundName]();
        }
      });
    } else if (this.sounds[soundName]) {
      this.sounds[soundName]();
    }
  }

  setVolume(value) {
    this.volume = Math.max(0, Math.min(1, value));
  }

  toggle() {
    this.enabled = !this.enabled;
  }
}