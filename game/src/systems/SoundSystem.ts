// SoundSystem — Steam-ready audio mixer.
//
// Architecture:
//   • Voice manager with priority-based stealing (hard cap on simultaneous voices).
//   • Swarm grouping: identical sounds arriving in a short window collapse into one
//     richer "layered" variant instead of hundreds of thin copies. This is the key
//     fix for late-wave audio chaos.
//   • Sidechain-style ducking: high-priority events briefly dip the master bus so
//     transients punch through clutter.
//   • Distance attenuation via optional source position.
//   • Richer synthesis per SFX: transient + body + tail, ADSR ramps to avoid clicks,
//     filter sweeps, subtle pitch variation, synthesized convolution reverb send.

type PriorityTier = 'critical' | 'primary' | 'secondary' | 'ambient';

interface PlayOptions {
  x?: number;
  y?: number;
  volumeScale?: number;
  priority?: PriorityTier;
  swarmLayers?: number;  // internal: how many events this single render represents
}

interface ActiveVoice {
  id: number;
  priority: number;
  startedAt: number;
  endsAt: number;
  stop: () => void;
}

interface SoundDef {
  priority: PriorityTier;
  swarmable: boolean;
  minInterval: number;           // minimum seconds between plays (hard rate limit)
  swarmWindowMs: number;         // window in which repeats merge
  render: (ctx: AudioContext, dest: AudioNode, opts: RenderOpts) => number; // returns duration
}

interface RenderOpts {
  pitch: number;                 // frequency multiplier
  volume: number;                // 0..1 post-attenuation
  swarmLayers: number;           // 1 = single, >1 = swarm variant
  reverbSend: GainNode | null;
}

const PRIORITY_VALUE: Record<PriorityTier, number> = {
  ambient: 2,
  secondary: 5,
  primary: 7,
  critical: 10,
};

export class SoundSystem {
  enabled: boolean;
  volume: number;          // effective SFX volume used internally (0..1)
  sfxVolume: number;       // raw user-facing SFX volume (0..1)
  musicVolume: number;     // tracked for external BGM consumers
  audioContext: AudioContext | null;
  initialized: boolean;

  // Master chain: masterGain -> compressor -> limiter -> destination
  //                           \-> reverb -> reverbGain -> masterGain (pre-limiter)
  private _masterGain: GainNode | null = null;
  private _compressor: DynamicsCompressorNode | null = null;
  private _limiter: DynamicsCompressorNode | null = null;
  private _duckGain: GainNode | null = null;           // sits before compressor, animated for sidechain feel
  private _reverb: ConvolverNode | null = null;
  private _reverbSend: GainNode | null = null;

  private _initPending = false;

  // Pre-baked noise buffers at multiple durations (used for gun noise, explosions, hisses).
  private _noiseBuffers: Record<number, AudioBuffer> = {};
  private _noiseBufferKeys: number[] = [];

  // Voice management.
  private _voices: ActiveVoice[] = [];
  private _maxVoices = 20;
  private _nextVoiceId = 1;

  // Per-sound event tracking (for swarm grouping + rate limit).
  private _lastPlay: Record<string, number> = {};      // performance.now()
  private _swarmBuckets: Record<string, { count: number; flushAt: number; firstOpts: PlayOptions }> = {};

  // Listener position (the player) for distance attenuation.
  private _listenerX = 0;
  private _listenerY = 0;
  private _listenerSet = false;

  // Sound registry: mapping of name -> synthesis recipe + policy.
  private _registry: Record<string, SoundDef> = {};

  // Hit/death aggregation — for the high-traffic events, we batch and emit on a flush cadence.
  private _pendingHits = 0;
  private _pendingCrits = 0;
  private _pendingHitLastX = 0;
  private _pendingHitLastY = 0;
  private _hitFlushAt = 0;

  private _pendingDeaths: { big: number; small: number; x: number; y: number } = { big: 0, small: 0, x: 0, y: 0 };
  private _deathFlushAt = 0;

  private readonly _HIT_FLUSH_MS = 55;
  private readonly _DEATH_FLUSH_MS = 70;

  constructor() {
    this.enabled = true;
    this.volume = 0.45;  // 25% trim on default
    this.sfxVolume = 0.5;
    this.musicVolume = 0.5;
    this.audioContext = null;
    this.initialized = false;
  }

  async init(): Promise<void> {
    if (this.initialized || this._initPending) return;
    this._initPending = true;
    try {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioContext = new Ctor();
      const ctx = this.audioContext;

      this._masterGain = ctx.createGain();
      this._masterGain.gain.value = this.volume;

      this._duckGain = ctx.createGain();
      this._duckGain.gain.value = 1.0;

      // Main compressor — gentle glue. Keeps transients punchy.
      this._compressor = ctx.createDynamicsCompressor();
      this._compressor.threshold.value = -18;
      this._compressor.knee.value = 8;
      this._compressor.ratio.value = 3;
      this._compressor.attack.value = 0.005;
      this._compressor.release.value = 0.12;

      // Brick-wall-ish limiter at the end. Catches true peaks.
      this._limiter = ctx.createDynamicsCompressor();
      this._limiter.threshold.value = -2;
      this._limiter.knee.value = 0;
      this._limiter.ratio.value = 20;
      this._limiter.attack.value = 0.001;
      this._limiter.release.value = 0.08;

      // Reverb send — short "room" impulse, gentle return level.
      this._reverb = ctx.createConvolver();
      this._reverb.buffer = this._makeImpulseResponse(ctx, 0.9, 2.6);
      this._reverbSend = ctx.createGain();
      this._reverbSend.gain.value = 0.0;  // per-sound send routed directly; this is just a hub

      const reverbReturn = ctx.createGain();
      reverbReturn.gain.value = 0.22;

      // Routing: [sources] -> duckGain -> compressor -> masterGain -> limiter -> destination
      //         [sources] -> reverbSend -> reverb -> reverbReturn -> compressor
      this._duckGain.connect(this._compressor);
      this._reverbSend.connect(this._reverb);
      this._reverb.connect(reverbReturn);
      reverbReturn.connect(this._compressor);
      this._compressor.connect(this._masterGain);
      this._masterGain.connect(this._limiter);
      this._limiter.connect(ctx.destination);

      for (const dur of [0.05, 0.1, 0.15, 0.2, 0.3, 0.4, 0.6, 1.0]) {
        const size = Math.max(1, Math.ceil(ctx.sampleRate * dur));
        const buf = ctx.createBuffer(1, size, ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < size; i++) data[i] = Math.random() * 2 - 1;
        this._noiseBuffers[dur] = buf;
      }
      this._noiseBufferKeys = Object.keys(this._noiseBuffers).map(Number);

      this._registerSounds();
      this.initialized = true;
    } catch (error) {
      console.warn('Audio not available:', error);
      this.enabled = false;
    } finally {
      this._initPending = false;
    }
  }

  // ---- Public API ----

  /** Update listener position for distance attenuation. Called from game loop. */
  setListener(x: number, y: number): void {
    this._listenerX = x;
    this._listenerY = y;
    this._listenerSet = true;
  }

  /** Pump time-based flushers (swarm merges, hit/death aggregation). Called each frame. */
  tick(): void {
    if (!this.initialized) return;
    const now = performance.now();
    this._flushPendingEvents(now);
    this._flushSwarms(now);
    this._reapVoices(now);
  }

  play(soundName: string, opts?: PlayOptions): void {
    if (!this.enabled) return;
    if (!this.initialized) {
      if (this._initPending) return;
      this.init().then(() => this._dispatch(soundName, opts)).catch(() => {});
      return;
    }
    this._dispatch(soundName, opts);
  }

  /** High-traffic: a projectile hit an enemy. Rate-limited + swarmed centrally. */
  registerHit(isCrit: boolean, x?: number, y?: number): void {
    if (isCrit) this._pendingCrits++;
    else this._pendingHits++;
    if (x !== undefined) this._pendingHitLastX = x;
    if (y !== undefined) this._pendingHitLastY = y;
    if (this._hitFlushAt === 0) this._hitFlushAt = performance.now() + this._HIT_FLUSH_MS;
  }

  /** High-traffic: an enemy died. Tiered + swarmed. */
  registerEnemyDeath(type: string, x: number, y: number): void {
    // Tanks, splitters, shooters, bosses → "big" death. Everything else → small pop.
    const big = (type === 'tank' || type === 'boss' || type === 'splitter' || type === 'charger' || type === 'sniper');
    if (big) this._pendingDeaths.big++;
    else this._pendingDeaths.small++;
    this._pendingDeaths.x = x;
    this._pendingDeaths.y = y;
    if (this._deathFlushAt === 0) this._deathFlushAt = performance.now() + this._DEATH_FLUSH_MS;
  }

  setVolume(value: number): void {
    this.volume = Math.max(0, Math.min(1, value));
    this.sfxVolume = this.volume;
    if (this._masterGain && this.audioContext) {
      this._masterGain.gain.setTargetAtTime(this.volume, this.audioContext.currentTime, 0.02);
    }
  }

  setSfxVolume(value: number): void {
    const v = Math.max(0, Math.min(1, value));
    this.sfxVolume = v;
    // Perceptual curve — quadratic gives a more natural slider.
    // 0.75x global trim: SFX were too loud relative to music; tames peaks end-to-end.
    this.volume = (v * v * 1.15 + v * 0.35) * 0.75;
    this.volume = Math.min(1, this.volume);
    if (this._masterGain && this.audioContext) {
      this._masterGain.gain.setTargetAtTime(Math.max(0.0001, this.volume), this.audioContext.currentTime, 0.02);
    }
  }

  setMusicVolume(value: number): void {
    this.musicVolume = Math.max(0, Math.min(1, value));
  }

  toggle(): void {
    this.enabled = !this.enabled;
  }

  // ---- Internal dispatch ----

  private _dispatch(name: string, opts?: PlayOptions): void {
    const def = this._registry[name];
    if (!def) return;
    const now = performance.now();

    // Hard rate limit (prevents absurd queuing on identical rapid events).
    const last = this._lastPlay[name] || 0;
    if (now - last < def.minInterval * 1000) {
      if (def.swarmable) {
        const b = this._swarmBuckets[name];
        if (b) { b.count++; b.flushAt = Math.min(b.flushAt, now + def.swarmWindowMs); }
        else this._swarmBuckets[name] = { count: 1, flushAt: now + def.swarmWindowMs, firstOpts: opts || {} };
      }
      return;
    }

    // Swarm grouping: hold the first event briefly to see if more arrive.
    if (def.swarmable) {
      const bucket = this._swarmBuckets[name];
      if (bucket) {
        bucket.count++;
        bucket.flushAt = Math.min(bucket.flushAt, now + def.swarmWindowMs);
        return;
      }
      this._swarmBuckets[name] = { count: 1, flushAt: now + def.swarmWindowMs, firstOpts: opts || {} };
      // Seed _lastPlay so the rate-limit check above sees the bucket as an
      // in-flight render and doesn't spawn a second parallel bucket.
      this._lastPlay[name] = now;
      return;
    }

    this._render(name, def, 1, opts || {});
    this._lastPlay[name] = now;
  }

  private _flushSwarms(now: number): void {
    for (const name in this._swarmBuckets) {
      const b = this._swarmBuckets[name];
      if (now < b.flushAt) continue;
      const def = this._registry[name];
      if (def) this._render(name, def, b.count, b.firstOpts);
      this._lastPlay[name] = now;
      delete this._swarmBuckets[name];
    }
  }

  private _flushPendingEvents(now: number): void {
    if (this._hitFlushAt > 0 && now >= this._hitFlushAt) {
      // Snapshot before zeroing so a concurrent registerHit doesn't corrupt positions.
      const hits = this._pendingHits;
      const crits = this._pendingCrits;
      const hx = this._pendingHitLastX;
      const hy = this._pendingHitLastY;
      this._pendingHits = 0;
      this._pendingCrits = 0;
      this._hitFlushAt = 0;
      if (crits > 0) {
        this._render('_hitCrit', this._registry['_hitCrit'], Math.min(crits, 6), { x: hx, y: hy });
        this._lastPlay['_hitCrit'] = now;
      }
      if (hits > 0) {
        this._render('_hitCluster', this._registry['_hitCluster'], Math.min(hits, 10), { x: hx, y: hy });
        this._lastPlay['_hitCluster'] = now;
      }
    }

    if (this._deathFlushAt > 0 && now >= this._deathFlushAt) {
      const big = this._pendingDeaths.big;
      const small = this._pendingDeaths.small;
      const x = this._pendingDeaths.x;
      const y = this._pendingDeaths.y;
      this._pendingDeaths.big = 0;
      this._pendingDeaths.small = 0;
      this._deathFlushAt = 0;
      if (big > 0) {
        this._render('_deathBig', this._registry['_deathBig'], Math.min(big, 5), { x, y });
        this._lastPlay['_deathBig'] = now;
      }
      if (small > 0) {
        this._render('_deathSmall', this._registry['_deathSmall'], Math.min(small, 12), { x, y });
        this._lastPlay['_deathSmall'] = now;
      }
    }
  }

  // ---- Voice management & ducking ----

  private _reapVoices(now: number): void {
    for (let i = this._voices.length - 1; i >= 0; i--) {
      if (this._voices[i].endsAt <= now) {
        this._voices[i] = this._voices[this._voices.length - 1];
        this._voices.pop();
      }
    }
  }

  private _claimVoice(priority: number): number | null {
    const now = performance.now();
    this._reapVoices(now);
    if (this._voices.length >= this._maxVoices) {
      // Find lowest-priority, OLDEST voice to steal. Older voices are more
      // expendable (they've already played longest). The score subtracts age
      // so higher age = lower score; combined with lowest priority having
      // the lowest `priority * 1000`, the lowest score is "lowest priority,
      // oldest" as intended. Previous formula added age instead of subtracting,
      // which made the steal pick the NEWEST low-priority voice.
      let stealIdx = -1;
      let stealScore = Infinity;
      for (let i = 0; i < this._voices.length; i++) {
        const v = this._voices[i];
        const score = v.priority * 1000 - (now - v.startedAt);
        if (v.priority < priority && score < stealScore) {
          stealScore = score;
          stealIdx = i;
        }
      }
      if (stealIdx === -1) return null;
      try { this._voices[stealIdx].stop(); } catch { /* ignore */ }
      this._voices[stealIdx] = this._voices[this._voices.length - 1];
      this._voices.pop();
    }
    const id = this._nextVoiceId++;
    return id;
  }

  private _registerVoice(id: number, priority: number, durationMs: number, stop: () => void): void {
    const now = performance.now();
    this._voices.push({ id, priority, startedAt: now, endsAt: now + durationMs, stop });
  }

  private _duck(priority: number, durationMs: number): void {
    if (!this._duckGain || !this.audioContext) return;
    if (priority < 5) return;
    const amount = priority >= 10 ? 0.45 : priority >= 7 ? 0.72 : 0.85;
    const now = this.audioContext.currentTime;
    const g = this._duckGain.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(amount, now + 0.008);
    g.linearRampToValueAtTime(1.0, now + 0.008 + durationMs / 1000);
  }

  // ---- Render pipeline ----

  private _render(_name: string, def: SoundDef, swarmLayers: number, opts: PlayOptions): void {
    if (!this.audioContext || !this._duckGain) return;
    const priority = PRIORITY_VALUE[opts.priority || def.priority];

    // Distance attenuation (0.4..1.0) if listener is set and source has position.
    // Short-circuit the common case (in range) before paying for sqrt.
    let distAtten = 1;
    if (this._listenerSet && opts.x !== undefined && opts.y !== undefined) {
      const dx = opts.x - this._listenerX;
      const dy = opts.y - this._listenerY;
      const distSq = dx * dx + dy * dy;
      if (distSq > 150 * 150) {
        if (distSq >= 700 * 700) distAtten = 0.35;
        else distAtten = 1 - ((Math.sqrt(distSq) - 150) / 550) * 0.65;
      }
    }

    const volScale = (opts.volumeScale ?? 1) * distAtten;
    if (volScale < 0.04) return;

    const voiceId = this._claimVoice(priority);
    if (voiceId === null) return;

    // Subtle pitch variation so rapid repeats feel alive, not mechanical.
    const variation = def.swarmable ? 0.06 : 0.03;
    const pitch = 1 + (Math.random() - 0.5) * 2 * variation;

    const renderOpts: RenderOpts = {
      pitch,
      volume: volScale,
      swarmLayers: Math.max(1, Math.min(swarmLayers, 12)),
      reverbSend: this._reverbSend,
    };

    let durationSec = 0.2;
    try {
      durationSec = def.render(this.audioContext, this._duckGain, renderOpts);
    } catch (e) {
      // ignore synthesis errors
    }

    this._duck(priority, Math.min(180, durationSec * 1000 * 0.6));

    const durMs = Math.max(40, durationSec * 1000);
    this._registerVoice(voiceId, priority, durMs, () => { /* voices stop themselves via oscillator.stop */ });
  }

  // ---- Synthesis primitives ----

  private _env(ctx: AudioContext, gain: GainNode, peak: number, attack: number, decay: number, sustain: number, sustainTime: number, release: number): number {
    const now = ctx.currentTime;
    const g = gain.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(0.0001, now);
    g.exponentialRampToValueAtTime(Math.max(0.0002, peak), now + attack);
    g.exponentialRampToValueAtTime(Math.max(0.0001, peak * sustain), now + attack + decay);
    g.setValueAtTime(Math.max(0.0001, peak * sustain), now + attack + decay + sustainTime);
    g.exponentialRampToValueAtTime(0.0001, now + attack + decay + sustainTime + release);
    return attack + decay + sustainTime + release;
  }

  private _osc(ctx: AudioContext, type: OscillatorType, freq: number, freqEndOpt?: number, when: number = 0): OscillatorNode {
    const osc = ctx.createOscillator();
    osc.type = type;
    const t0 = ctx.currentTime + Math.max(0, when);
    osc.frequency.setValueAtTime(freq, t0);
    if (freqEndOpt !== undefined && freqEndOpt !== freq) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEndOpt), t0 + 0.2);
    }
    return osc;
  }

  private _pickNoiseBuf(duration: number): AudioBuffer | null {
    if (this._noiseBufferKeys.length === 0) return null;
    let best = this._noiseBufferKeys[0];
    let bestDiff = Math.abs(best - duration);
    for (let i = 1; i < this._noiseBufferKeys.length; i++) {
      const diff = Math.abs(this._noiseBufferKeys[i] - duration);
      if (diff < bestDiff) { bestDiff = diff; best = this._noiseBufferKeys[i]; }
    }
    return this._noiseBuffers[best] || null;
  }

  private _filteredNoise(ctx: AudioContext, dest: AudioNode, duration: number, volume: number, filterType: BiquadFilterType, freq: number, q: number = 1, freqEnd?: number): void {
    const buf = this._pickNoiseBuf(duration);
    if (!buf) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.Q.value = q;
    const t0 = ctx.currentTime;
    filter.frequency.setValueAtTime(freq, t0);
    if (freqEnd !== undefined) filter.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t0 + duration);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), t0 + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    src.connect(filter); filter.connect(g); g.connect(dest);
    src.start(t0);
    src.stop(t0 + duration + 0.05);
    // Explicitly disconnect filter + gain when the buffer source ends.
    // Without this, these nodes stay connected to `dest` after `src.stop()`
    // completes and the Web Audio GC can't reclaim them, slowly growing the
    // graph (36+ orphan nodes/sec during a flood wave).
    src.onended = () => {
      try { filter.disconnect(); } catch { /* ignore */ }
      try { g.disconnect(); } catch { /* ignore */ }
    };
  }

  private _makeImpulseResponse(ctx: AudioContext, duration: number, decay: number): AudioBuffer {
    const rate = ctx.sampleRate;
    const len = Math.floor(rate * duration);
    const buf = ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        // Exponential decay with dense noise — approximates a small room tail.
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay);
      }
    }
    return buf;
  }

  // ---- Sound registry (the actual palette) ----

  private _registerSounds(): void {
    const r = this._registry;

    // Hit cluster: the replacement for the old per-bullet 'hit' sound.
    // A punchy, short "thwack" whose body scales with swarm count — 1 bullet = thin click,
    // 10 bullets merging = fat crunch. Single voice regardless.
    r['_hitCluster'] = {
      priority: 'ambient',
      swarmable: false,
      minInterval: 0.045,
      swarmWindowMs: 0,
      render: (ctx, dest, o) => {
        const layers = Math.min(10, o.swarmLayers);
        const intensity = 0.4 + Math.log2(layers + 1) * 0.22;  // 0.4..~1.2
        const volBase = 0.22 * o.volume * intensity;
        // Transient: short filtered noise burst.
        this._filteredNoise(ctx, dest, 0.055 + layers * 0.002, volBase * 1.4, 'bandpass', 1800, 0.8, 600);
        // Body: short low thud.
        const osc = this._osc(ctx, 'triangle', 180 * o.pitch, 90, 0);
        const g = ctx.createGain();
        osc.connect(g); g.connect(dest);
        const dur = this._env(ctx, g, volBase * 0.8, 0.002, 0.03, 0.2, 0.0, 0.08);
        osc.start(); osc.stop(ctx.currentTime + dur + 0.05);
        return dur;
      },
    };

    // Crit cluster: brighter, chord-like accent.
    r['_hitCrit'] = {
      priority: 'primary',
      swarmable: false,
      minInterval: 0.06,
      swarmWindowMs: 0,
      render: (ctx, dest, o) => {
        const layers = Math.min(6, o.swarmLayers);
        const vol = 0.28 * o.volume * (0.7 + Math.log2(layers + 1) * 0.18);
        const freqs = [660, 990, 1320];
        let maxDur = 0;
        for (let i = 0; i < freqs.length; i++) {
          const osc = this._osc(ctx, 'triangle', freqs[i] * o.pitch);
          const g = ctx.createGain();
          osc.connect(g); g.connect(dest);
          const dur = this._env(ctx, g, vol * (i === 0 ? 1 : 0.55), 0.003, 0.04, 0.25, 0.02, 0.14);
          osc.start(ctx.currentTime + i * 0.008); osc.stop(ctx.currentTime + 0.25);
          maxDur = Math.max(maxDur, dur);
        }
        this._filteredNoise(ctx, dest, 0.08, vol * 0.5, 'highpass', 2400, 1);
        return maxDur;
      },
    };

    // Small enemy death: dry "pop". Swarmable → 8 dying at once = one crunchy layer.
    r['_deathSmall'] = {
      priority: 'ambient',
      swarmable: false,
      minInterval: 0.05,
      swarmWindowMs: 0,
      render: (ctx, dest, o) => {
        const layers = Math.min(12, o.swarmLayers);
        const intensity = 0.45 + Math.log2(layers + 1) * 0.18;
        const vol = 0.2 * o.volume * intensity;
        // Body tone sweeping down.
        const osc = this._osc(ctx, 'square', 320 * o.pitch, 90);
        const g = ctx.createGain();
        osc.connect(g); g.connect(dest);
        const dur = this._env(ctx, g, vol, 0.002, 0.05, 0.2, 0.0, 0.12);
        osc.start(); osc.stop(ctx.currentTime + dur + 0.05);
        // Noise transient.
        this._filteredNoise(ctx, dest, 0.07, vol * 0.9, 'bandpass', 1400, 0.9, 500);
        return dur;
      },
    };

    // Big enemy death: full crunch. Boss/tank/splitter feels weighty.
    r['_deathBig'] = {
      priority: 'secondary',
      swarmable: false,
      minInterval: 0.05,
      swarmWindowMs: 0,
      render: (ctx, dest, o) => {
        const layers = Math.min(5, o.swarmLayers);
        const intensity = 0.7 + Math.log2(layers + 1) * 0.2;
        const vol = 0.34 * o.volume * intensity;
        // Low sub pulse.
        const sub = this._osc(ctx, 'sine', 90 * o.pitch, 40);
        const gs = ctx.createGain();
        sub.connect(gs); gs.connect(dest);
        this._env(ctx, gs, vol, 0.004, 0.08, 0.25, 0.03, 0.2);
        sub.start(); sub.stop(ctx.currentTime + 0.4);
        // Mid saw body.
        const body = this._osc(ctx, 'sawtooth', 220 * o.pitch, 110);
        const gb = ctx.createGain();
        body.connect(gb); gb.connect(dest);
        this._env(ctx, gb, vol * 0.55, 0.003, 0.06, 0.18, 0.02, 0.18);
        body.start(); body.stop(ctx.currentTime + 0.35);
        // Noise crunch.
        this._filteredNoise(ctx, dest, 0.22, vol * 0.6, 'lowpass', 1800, 1, 500);
        return 0.35;
      },
    };

    // ---- Weapon sounds — richer, transient-forward design ----

    r['shoot'] = r['shootPistol'] = {
      priority: 'primary',
      swarmable: true,
      minInterval: 0.02,
      swarmWindowMs: 50,
      render: (ctx, dest, o) => {
        const layers = Math.min(4, o.swarmLayers);
        const vol = 0.3 * o.volume * (0.85 + layers * 0.05);
        // Click transient.
        this._filteredNoise(ctx, dest, 0.03, vol * 1.6, 'highpass', 3000, 1);
        // Punchy body: fast downward pitch.
        const osc = this._osc(ctx, 'square', 480 * o.pitch, 140);
        const g = ctx.createGain();
        osc.connect(g); g.connect(dest);
        const dur = this._env(ctx, g, vol, 0.002, 0.025, 0.15, 0.0, 0.05);
        osc.start(); osc.stop(ctx.currentTime + dur + 0.05);
        // Sub thump.
        const sub = this._osc(ctx, 'sine', 120 * o.pitch, 70);
        const gs = ctx.createGain();
        sub.connect(gs); gs.connect(dest);
        this._env(ctx, gs, vol * 0.5, 0.002, 0.02, 0.2, 0.0, 0.08);
        sub.start(); sub.stop(ctx.currentTime + 0.15);
        return 0.12;
      },
    };

    r['shootShotgun'] = {
      priority: 'primary',
      swarmable: true,
      minInterval: 0.1,
      swarmWindowMs: 60,
      render: (ctx, dest, o) => {
        const vol = 0.4 * o.volume;
        // Big noise blast.
        this._filteredNoise(ctx, dest, 0.22, vol * 1.2, 'lowpass', 2200, 0.9, 600);
        this._filteredNoise(ctx, dest, 0.1, vol * 0.9, 'highpass', 1800, 0.9);
        // Sub boom.
        const sub = this._osc(ctx, 'sine', 110 * o.pitch, 55);
        const g = ctx.createGain();
        sub.connect(g); g.connect(dest);
        const dur = this._env(ctx, g, vol * 0.8, 0.003, 0.05, 0.2, 0.02, 0.18);
        sub.start(); sub.stop(ctx.currentTime + 0.3);
        return dur;
      },
    };

    r['shootSMG'] = {
      priority: 'primary',
      swarmable: true,
      minInterval: 0.01,
      swarmWindowMs: 30,
      render: (ctx, dest, o) => {
        const vol = 0.22 * o.volume;
        this._filteredNoise(ctx, dest, 0.02, vol * 1.2, 'highpass', 3500, 1);
        const osc = this._osc(ctx, 'square', 620 * o.pitch, 260);
        const g = ctx.createGain();
        osc.connect(g); g.connect(dest);
        const dur = this._env(ctx, g, vol * 0.8, 0.001, 0.015, 0.1, 0.0, 0.035);
        osc.start(); osc.stop(ctx.currentTime + dur + 0.03);
        return dur;
      },
    };

    r['shootRocket'] = {
      priority: 'secondary',
      swarmable: true,
      minInterval: 0.08,
      swarmWindowMs: 80,
      render: (ctx, dest, o) => {
        const vol = 0.32 * o.volume;
        // Whoosh — sweeping filtered noise.
        this._filteredNoise(ctx, dest, 0.32, vol, 'bandpass', 600, 0.8, 1400);
        // Low rumble body.
        const sub = this._osc(ctx, 'sawtooth', 80 * o.pitch, 50);
        const g = ctx.createGain();
        sub.connect(g); g.connect(dest);
        const dur = this._env(ctx, g, vol * 0.5, 0.01, 0.08, 0.4, 0.1, 0.2);
        sub.start(); sub.stop(ctx.currentTime + 0.45);
        return dur;
      },
    };

    r['shootLaser'] = {
      priority: 'primary',
      swarmable: true,
      minInterval: 0.02,
      swarmWindowMs: 40,
      render: (ctx, dest, o) => {
        const vol = 0.2 * o.volume;
        const osc = this._osc(ctx, 'sine', 1800 * o.pitch, 1200);
        const g = ctx.createGain();
        osc.connect(g); g.connect(dest);
        const dur = this._env(ctx, g, vol, 0.001, 0.02, 0.2, 0.0, 0.05);
        osc.start(); osc.stop(ctx.currentTime + dur + 0.05);
        // Shimmer.
        const osc2 = this._osc(ctx, 'sine', 3600 * o.pitch, 2400);
        const g2 = ctx.createGain();
        osc2.connect(g2); g2.connect(dest);
        this._env(ctx, g2, vol * 0.35, 0.001, 0.015, 0.15, 0.0, 0.04);
        osc2.start(); osc2.stop(ctx.currentTime + 0.1);
        return dur;
      },
    };

    r['shootRicochet'] = {
      priority: 'primary',
      swarmable: true,
      minInterval: 0.03,
      swarmWindowMs: 60,
      render: (ctx, dest, o) => {
        const vol = 0.26 * o.volume;
        const osc = this._osc(ctx, 'triangle', 540 * o.pitch, 420);
        const g = ctx.createGain();
        osc.connect(g); g.connect(dest);
        const dur = this._env(ctx, g, vol, 0.002, 0.03, 0.2, 0.02, 0.11);
        osc.start(); osc.stop(ctx.currentTime + dur + 0.05);
        return dur;
      },
    };

    r['shootWave'] = {
      priority: 'primary',
      swarmable: true,
      minInterval: 0.04,
      swarmWindowMs: 60,
      render: (ctx, dest, o) => {
        const vol = 0.24 * o.volume;
        const osc = this._osc(ctx, 'sine', 420 * o.pitch, 340);
        const g = ctx.createGain();
        osc.connect(g); g.connect(dest);
        const dur = this._env(ctx, g, vol, 0.003, 0.04, 0.25, 0.03, 0.14);
        osc.start(); osc.stop(ctx.currentTime + dur + 0.05);
        return dur;
      },
    };

    r['shootBurst'] = {
      priority: 'primary',
      swarmable: true,
      minInterval: 0.02,
      swarmWindowMs: 40,
      render: (ctx, dest, o) => {
        const vol = 0.22 * o.volume;
        this._filteredNoise(ctx, dest, 0.03, vol, 'highpass', 2600, 1);
        const osc = this._osc(ctx, 'square', 500 * o.pitch, 320);
        const g = ctx.createGain();
        osc.connect(g); g.connect(dest);
        const dur = this._env(ctx, g, vol, 0.001, 0.025, 0.15, 0.0, 0.06);
        osc.start(); osc.stop(ctx.currentTime + dur + 0.05);
        return dur;
      },
    };

    r['shootOrbital'] = {
      priority: 'secondary',
      swarmable: true,
      minInterval: 0.1,
      swarmWindowMs: 80,
      render: (ctx, dest, o) => {
        const vol = 0.32 * o.volume;
        const sub = this._osc(ctx, 'sawtooth', 90 * o.pitch, 60);
        const g = ctx.createGain();
        sub.connect(g); g.connect(dest);
        const dur = this._env(ctx, g, vol, 0.008, 0.06, 0.3, 0.05, 0.2);
        sub.start(); sub.stop(ctx.currentTime + 0.4);
        this._filteredNoise(ctx, dest, 0.25, vol * 0.5, 'lowpass', 1200, 1);
        return dur;
      },
    };

    r['shootNova'] = {
      priority: 'secondary',
      swarmable: true,
      minInterval: 0.12,
      swarmWindowMs: 80,
      render: (ctx, dest, o) => {
        const vol = 0.32 * o.volume;
        const osc = this._osc(ctx, 'sine', 820 * o.pitch, 520);
        const g = ctx.createGain();
        osc.connect(g); g.connect(dest);
        const dur = this._env(ctx, g, vol, 0.003, 0.06, 0.3, 0.05, 0.2);
        osc.start(); osc.stop(ctx.currentTime + 0.4);
        this._filteredNoise(ctx, dest, 0.18, vol * 0.5, 'bandpass', 2400, 1.2);
        return dur;
      },
    };

    r['shootLightning'] = {
      priority: 'primary',
      swarmable: true,
      minInterval: 0.05,
      swarmWindowMs: 60,
      render: (ctx, dest, o) => {
        const vol = 0.24 * o.volume;
        this._filteredNoise(ctx, dest, 0.14, vol * 0.9, 'highpass', 3200, 2);
        const osc = this._osc(ctx, 'square', 900 * o.pitch, 1600);
        const g = ctx.createGain();
        osc.connect(g); g.connect(dest);
        const dur = this._env(ctx, g, vol * 0.7, 0.001, 0.03, 0.15, 0.02, 0.1);
        osc.start(); osc.stop(ctx.currentTime + dur + 0.05);
        return dur;
      },
    };

    r['shootBoomerang'] = {
      priority: 'primary',
      swarmable: true,
      minInterval: 0.06,
      swarmWindowMs: 60,
      render: (ctx, dest, o) => {
        const vol = 0.22 * o.volume;
        const osc = this._osc(ctx, 'triangle', 520 * o.pitch, 360);
        const g = ctx.createGain();
        osc.connect(g); g.connect(dest);
        const dur = this._env(ctx, g, vol, 0.004, 0.05, 0.2, 0.04, 0.12);
        osc.start(); osc.stop(ctx.currentTime + dur + 0.05);
        return dur;
      },
    };

    r['swordSwing'] = {
      priority: 'primary',
      swarmable: true,
      minInterval: 0.04,
      swarmWindowMs: 50,
      render: (ctx, dest, o) => {
        const vol = 0.28 * o.volume;
        this._filteredNoise(ctx, dest, 0.12, vol * 1.1, 'bandpass', 1600, 1.2, 3200);
        const osc = this._osc(ctx, 'triangle', 280 * o.pitch, 180);
        const g = ctx.createGain();
        osc.connect(g); g.connect(dest);
        const dur = this._env(ctx, g, vol * 0.6, 0.003, 0.04, 0.2, 0.02, 0.1);
        osc.start(); osc.stop(ctx.currentTime + dur + 0.05);
        return dur;
      },
    };

    r['fistSwing'] = {
      priority: 'primary',
      swarmable: true,
      minInterval: 0.05,
      swarmWindowMs: 60,
      render: (ctx, dest, o) => {
        const vol = 0.3 * o.volume;
        this._filteredNoise(ctx, dest, 0.18, vol * 1.0, 'lowpass', 900, 1);
        const osc = this._osc(ctx, 'sawtooth', 140 * o.pitch, 80);
        const g = ctx.createGain();
        osc.connect(g); g.connect(dest);
        const dur = this._env(ctx, g, vol * 0.7, 0.003, 0.05, 0.22, 0.04, 0.14);
        osc.start(); osc.stop(ctx.currentTime + dur + 0.05);
        return dur;
      },
    };

    // Kept for direct callers (spells, bosses, one-shots) — tiered explosion.
    r['explosion'] = {
      priority: 'secondary',
      swarmable: true,
      minInterval: 0.06,
      swarmWindowMs: 70,
      render: (ctx, dest, o) => {
        const layers = Math.min(4, o.swarmLayers);
        const intensity = 0.8 + Math.log2(layers + 1) * 0.22;
        const vol = 0.4 * o.volume * intensity;
        // Sub boom.
        const sub = this._osc(ctx, 'sine', 70 * o.pitch, 38);
        const gs = ctx.createGain();
        sub.connect(gs); gs.connect(dest);
        this._env(ctx, gs, vol, 0.004, 0.08, 0.35, 0.08, 0.25);
        sub.start(); sub.stop(ctx.currentTime + 0.5);
        // Mid body.
        const body = this._osc(ctx, 'sawtooth', 180 * o.pitch, 90);
        const gb = ctx.createGain();
        body.connect(gb); gb.connect(dest);
        this._env(ctx, gb, vol * 0.55, 0.003, 0.07, 0.2, 0.04, 0.2);
        body.start(); body.stop(ctx.currentTime + 0.4);
        // Crackle.
        this._filteredNoise(ctx, dest, 0.32, vol * 0.7, 'lowpass', 2400, 0.9, 400);
        // Reverb send — single path through tap gain into the reverb bus.
        if (o.reverbSend) {
          const tap = ctx.createGain();
          const t0 = ctx.currentTime;
          tap.gain.setValueAtTime(0.0001, t0);
          tap.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol * 0.4), t0 + 0.01);
          tap.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.4);
          const src = this._osc(ctx, 'sine', 90 * o.pitch);
          src.connect(tap); tap.connect(o.reverbSend);
          src.start(); src.stop(t0 + 0.4);
        }
        return 0.45;
      },
    };

    // Player / feedback sounds.
    r['playerHurt'] = {
      priority: 'critical',
      swarmable: false,
      minInterval: 0.18,
      swarmWindowMs: 0,
      render: (ctx, dest, o) => {
        const vol = 0.5 * o.volume;
        const osc = this._osc(ctx, 'sawtooth', 240 * o.pitch, 90);
        const g = ctx.createGain();
        osc.connect(g); g.connect(dest);
        const dur = this._env(ctx, g, vol, 0.003, 0.08, 0.35, 0.05, 0.2);
        osc.start(); osc.stop(ctx.currentTime + 0.4);
        this._filteredNoise(ctx, dest, 0.18, vol * 0.5, 'bandpass', 600, 1.5);
        return dur;
      },
    };

    r['dodge'] = {
      priority: 'secondary',
      swarmable: false,
      minInterval: 0.12,
      swarmWindowMs: 0,
      render: (ctx, dest, o) => {
        const vol = 0.28 * o.volume;
        const osc = this._osc(ctx, 'sine', 900 * o.pitch, 1500);
        const g = ctx.createGain();
        osc.connect(g); g.connect(dest);
        const dur = this._env(ctx, g, vol, 0.002, 0.03, 0.2, 0.0, 0.08);
        osc.start(); osc.stop(ctx.currentTime + dur + 0.05);
        return dur;
      },
    };

    r['pickup'] = {
      priority: 'ambient',
      swarmable: true,
      minInterval: 0.04,
      swarmWindowMs: 60,
      render: (ctx, dest, o) => {
        const layers = Math.min(6, o.swarmLayers);
        const vol = 0.22 * o.volume * (0.8 + Math.log2(layers + 1) * 0.12);
        const osc = this._osc(ctx, 'sine', 800 * o.pitch, 1200);
        const g = ctx.createGain();
        osc.connect(g); g.connect(dest);
        const dur = this._env(ctx, g, vol, 0.002, 0.04, 0.2, 0.02, 0.1);
        osc.start(); osc.stop(ctx.currentTime + dur + 0.05);
        return dur;
      },
    };

    r['moneyPickup'] = {
      priority: 'ambient',
      swarmable: true,
      minInterval: 0.04,
      swarmWindowMs: 80,
      render: (ctx, dest, o) => {
        const layers = Math.min(8, o.swarmLayers);
        const vol = 0.22 * o.volume * (0.75 + Math.log2(layers + 1) * 0.14);
        const freqs = [720, 960, 1280];
        let end = 0;
        for (let i = 0; i < freqs.length; i++) {
          const osc = this._osc(ctx, 'triangle', freqs[i] * o.pitch);
          const g = ctx.createGain();
          osc.connect(g); g.connect(dest);
          const t0 = ctx.currentTime + i * 0.03;
          g.gain.setValueAtTime(0.0001, t0);
          g.gain.exponentialRampToValueAtTime(vol, t0 + 0.005);
          g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.12);
          osc.start(t0); osc.stop(t0 + 0.15);
          end = Math.max(end, 0.12 + i * 0.03);
        }
        return end;
      },
    };

    r['heal'] = {
      priority: 'secondary',
      swarmable: false,
      minInterval: 0.1,
      swarmWindowMs: 0,
      render: (ctx, dest, o) => {
        const vol = 0.24 * o.volume;
        const freqs = [540, 760, 980];
        for (let i = 0; i < freqs.length; i++) {
          const osc = this._osc(ctx, 'sine', freqs[i] * o.pitch);
          const g = ctx.createGain();
          osc.connect(g); g.connect(dest);
          const t0 = ctx.currentTime + i * 0.04;
          g.gain.setValueAtTime(0.0001, t0);
          g.gain.exponentialRampToValueAtTime(vol, t0 + 0.008);
          g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.2);
          osc.start(t0); osc.stop(t0 + 0.25);
        }
        return 0.3;
      },
    };

    r['levelUp'] = {
      priority: 'critical',
      swarmable: false,
      minInterval: 0.4,
      swarmWindowMs: 0,
      render: (ctx, dest, o) => {
        const vol = 0.4 * o.volume;
        const freqs = [440, 554, 659, 880];
        for (let i = 0; i < freqs.length; i++) {
          const osc = this._osc(ctx, 'triangle', freqs[i] * o.pitch);
          const g = ctx.createGain();
          osc.connect(g); g.connect(dest);
          const t0 = ctx.currentTime + i * 0.07;
          g.gain.setValueAtTime(0.0001, t0);
          g.gain.exponentialRampToValueAtTime(vol, t0 + 0.008);
          g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.28);
          osc.start(t0); osc.stop(t0 + 0.32);
        }
        return 0.55;
      },
    };

    r['waveComplete'] = {
      priority: 'critical',
      swarmable: false,
      minInterval: 0.5,
      swarmWindowMs: 0,
      render: (ctx, dest, o) => {
        const vol = 0.38 * o.volume;
        const freqs = [330, 440, 554, 659, 880];
        for (let i = 0; i < freqs.length; i++) {
          const osc = this._osc(ctx, 'triangle', freqs[i] * o.pitch);
          const g = ctx.createGain();
          osc.connect(g); g.connect(dest);
          const t0 = ctx.currentTime + i * 0.09;
          g.gain.setValueAtTime(0.0001, t0);
          g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
          g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.32);
          osc.start(t0); osc.stop(t0 + 0.4);
        }
        return 0.75;
      },
    };

    r['countdown'] = {
      priority: 'primary', swarmable: false, minInterval: 0.2, swarmWindowMs: 0,
      render: (ctx, dest, o) => {
        const vol = 0.3 * o.volume;
        const osc = this._osc(ctx, 'sine', 880 * o.pitch);
        const g = ctx.createGain(); osc.connect(g); g.connect(dest);
        const dur = this._env(ctx, g, vol, 0.005, 0.04, 0.3, 0.05, 0.1);
        osc.start(); osc.stop(ctx.currentTime + 0.25);
        return dur;
      },
    };
    r['countdownUrgent'] = {
      priority: 'critical', swarmable: false, minInterval: 0.2, swarmWindowMs: 0,
      render: (ctx, dest, o) => {
        const vol = 0.4 * o.volume;
        const osc = this._osc(ctx, 'square', 1320 * o.pitch);
        const g = ctx.createGain(); osc.connect(g); g.connect(dest);
        const dur = this._env(ctx, g, vol, 0.004, 0.05, 0.4, 0.06, 0.12);
        osc.start(); osc.stop(ctx.currentTime + 0.3);
        return dur;
      },
    };

    r['buttonClick'] = {
      priority: 'primary', swarmable: false, minInterval: 0.04, swarmWindowMs: 0,
      render: (ctx, dest, o) => {
        const vol = 0.22 * o.volume;
        const osc = this._osc(ctx, 'sine', 640 * o.pitch);
        const g = ctx.createGain(); osc.connect(g); g.connect(dest);
        const dur = this._env(ctx, g, vol, 0.001, 0.02, 0.1, 0.0, 0.05);
        osc.start(); osc.stop(ctx.currentTime + 0.08);
        return dur;
      },
    };

    r['purchaseSuccess'] = {
      priority: 'primary', swarmable: false, minInterval: 0.1, swarmWindowMs: 0,
      render: (ctx, dest, o) => {
        const vol = 0.3 * o.volume;
        const freqs = [440, 660, 880];
        for (let i = 0; i < freqs.length; i++) {
          const osc = this._osc(ctx, 'triangle', freqs[i] * o.pitch);
          const g = ctx.createGain(); osc.connect(g); g.connect(dest);
          const t0 = ctx.currentTime + i * 0.05;
          g.gain.setValueAtTime(0.0001, t0);
          g.gain.exponentialRampToValueAtTime(vol, t0 + 0.006);
          g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.14);
          osc.start(t0); osc.stop(t0 + 0.2);
        }
        return 0.3;
      },
    };

    r['purchaseFail'] = {
      priority: 'secondary', swarmable: false, minInterval: 0.1, swarmWindowMs: 0,
      render: (ctx, dest, o) => {
        const vol = 0.26 * o.volume;
        const osc = this._osc(ctx, 'sawtooth', 240 * o.pitch, 140);
        const g = ctx.createGain(); osc.connect(g); g.connect(dest);
        const dur = this._env(ctx, g, vol, 0.004, 0.06, 0.2, 0.04, 0.14);
        osc.start(); osc.stop(ctx.currentTime + 0.3);
        return dur;
      },
    };

    r['sell'] = {
      priority: 'primary', swarmable: false, minInterval: 0.08, swarmWindowMs: 0,
      render: (ctx, dest, o) => {
        const vol = 0.26 * o.volume;
        const freqs = [780, 560];
        for (let i = 0; i < freqs.length; i++) {
          const osc = this._osc(ctx, 'triangle', freqs[i] * o.pitch);
          const g = ctx.createGain(); osc.connect(g); g.connect(dest);
          const t0 = ctx.currentTime + i * 0.05;
          g.gain.setValueAtTime(0.0001, t0);
          g.gain.exponentialRampToValueAtTime(vol, t0 + 0.005);
          g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.12);
          osc.start(t0); osc.stop(t0 + 0.18);
        }
        return 0.22;
      },
    };

    r['upgrade'] = {
      priority: 'primary', swarmable: false, minInterval: 0.1, swarmWindowMs: 0,
      render: (ctx, dest, o) => {
        const vol = 0.3 * o.volume;
        const freqs = [523, 659, 784, 988];
        for (let i = 0; i < freqs.length; i++) {
          const osc = this._osc(ctx, 'triangle', freqs[i] * o.pitch);
          const g = ctx.createGain(); osc.connect(g); g.connect(dest);
          const t0 = ctx.currentTime + i * 0.05;
          g.gain.setValueAtTime(0.0001, t0);
          g.gain.exponentialRampToValueAtTime(vol, t0 + 0.006);
          g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.16);
          osc.start(t0); osc.stop(t0 + 0.22);
        }
        return 0.32;
      },
    };

    r['bounce'] = {
      priority: 'ambient', swarmable: true, minInterval: 0.03, swarmWindowMs: 60,
      render: (ctx, dest, o) => {
        const vol = 0.14 * o.volume;
        const osc = this._osc(ctx, 'triangle', 440 * o.pitch);
        const g = ctx.createGain(); osc.connect(g); g.connect(dest);
        const dur = this._env(ctx, g, vol, 0.001, 0.015, 0.1, 0.0, 0.04);
        osc.start(); osc.stop(ctx.currentTime + 0.06);
        return dur;
      },
    };

    r['reload'] = {
      priority: 'ambient', swarmable: false, minInterval: 0.08, swarmWindowMs: 0,
      render: (ctx, dest, o) => {
        this._filteredNoise(ctx, dest, 0.06, 0.18 * o.volume, 'bandpass', 1200, 2);
        return 0.08;
      },
    };

    r['enemySpawn'] = {
      priority: 'ambient', swarmable: true, minInterval: 0.1, swarmWindowMs: 80,
      render: (ctx, dest, o) => {
        const vol = 0.16 * o.volume;
        const osc = this._osc(ctx, 'triangle', 160 * o.pitch, 240);
        const g = ctx.createGain(); osc.connect(g); g.connect(dest);
        const dur = this._env(ctx, g, vol, 0.003, 0.03, 0.2, 0.02, 0.08);
        osc.start(); osc.stop(ctx.currentTime + 0.15);
        return dur;
      },
    };

    // Legacy names — route to centralized clusters to keep back-compat with
    // any stray call sites. Game.ts is migrated to registerHit/registerEnemyDeath.
    r['hit'] = r['_hitCluster'];
    r['critHit'] = r['_hitCrit'];
    r['enemyDeath'] = r['_deathSmall'];
  }
}
