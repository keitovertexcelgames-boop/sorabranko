/* 著作権素材は使わない。クリック、キック、短いペンタトニックをその場で合成してループする。 */
(function (root) {
  function hashNoise(state) {
    state.seed = (Math.imul(state.seed, 1664525) + 1013904223) >>> 0;
    return (state.seed % 2000) / 1000 - 1;
  }

  function softClip(samples) {
    for (let i = 0; i < samples.length; i += 1) {
      samples[i] = Math.tanh(samples[i] * 1.15);
    }
  }

  function addKick(samples, start, gain, sampleRate) {
    const count = Math.min(samples.length - start, Math.floor(sampleRate * 0.11));
    if (start < 0 || count <= 0) return;
    let phase = 0;
    for (let i = 0; i < count; i += 1) {
      const time = i / sampleRate;
      const frequency = 170 * Math.pow(0.22, time / 0.09);
      phase += (2 * Math.PI * frequency) / sampleRate;
      const envelope = Math.exp(-time * 28);
      samples[start + i] += Math.sin(phase) * envelope * gain;
    }
  }

  function addWood(samples, start, gain, seed, sampleRate) {
    const count = Math.min(samples.length - start, Math.floor(sampleRate * 0.045));
    if (start < 0 || count <= 0) return;
    const state = { seed: seed >>> 0 };
    for (let i = 0; i < count; i += 1) {
      const time = i / sampleRate;
      const tone = Math.sin(2 * Math.PI * 1450 * time) * Math.exp(-time * 95);
      const click = hashNoise(state) * Math.exp(-time * 160);
      samples[start + i] += (tone * 0.75 + click * 0.25) * gain;
    }
  }

  function addHat(samples, start, gain, seed, sampleRate) {
    const count = Math.min(samples.length - start, Math.floor(sampleRate * 0.03));
    if (start < 0 || count <= 1) return;
    const state = { seed: seed >>> 0 };
    let previous = hashNoise(state);
    for (let i = 0; i < count; i += 1) {
      const time = i / sampleRate;
      const noise = hashNoise(state);
      const high = noise - previous;
      previous = noise;
      samples[start + i] += high * Math.exp(-time * 70) * gain;
    }
  }

  function addPluck(samples, start, frequency, gain, sampleRate) {
    const count = Math.min(samples.length - start, Math.floor(sampleRate * 0.45));
    if (start < 0 || count <= 0) return;
    for (let i = 0; i < count; i += 1) {
      const time = i / sampleRate;
      const envelope = Math.exp(-time * 7.5);
      const wave =
        Math.sin(2 * Math.PI * frequency * time) +
        0.45 * Math.sin(2 * Math.PI * frequency * 2 * time) +
        0.18 * Math.sin(2 * Math.PI * frequency * 3 * time);
      samples[start + i] += wave * envelope * gain;
    }
  }

  function Synth() {
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.sfxGain = null;
    this.source = null;
    this.startedAt = 0;
    this.playing = false;
    this.unlocked = false;
    this.volume = 0.82;
    this.cache = {};
  }

  Synth.prototype.ensure = function () {
    if (this.ctx) return true;
    const Ctor = root.AudioContext || root.webkitAudioContext;
    if (!Ctor) return false;
    const ctx = new Ctor({ latencyHint: "interactive" });
    const master = ctx.createGain();
    const musicGain = ctx.createGain();
    const sfxGain = ctx.createGain();
    musicGain.connect(master);
    sfxGain.connect(master);
    master.connect(ctx.destination);
    master.gain.value = this.volume;
    this.ctx = ctx;
    this.master = master;
    this.musicGain = musicGain;
    this.sfxGain = sfxGain;
    return true;
  };

  Synth.prototype.unlock = function () {
    if (!this.ensure()) return false;
    this.unlocked = true;
    if (this.ctx.state !== "running") {
      const pending = this.ctx.resume();
      if (pending && pending.catch) pending.catch(function () {});
    }
    if (!this.primed) {
      const silent = this.ctx.createBuffer(1, 1, this.ctx.sampleRate);
      const blip = this.ctx.createBufferSource();
      blip.buffer = silent;
      blip.connect(this.master);
      try {
        blip.start(0);
      } catch (error) {
        /* すでに鳴っている文脈では無視する */
      }
      this.primed = true;
    }
    return true;
  };

  Synth.prototype.setMuted = function (muted) {
    this.volume = muted ? 0 : 0.82;
    if (this.master) this.master.gain.value = this.volume;
  };

  Synth.prototype.stop = function () {
    if (this.source) {
      try {
        this.source.stop();
      } catch (error) {
        /* 停止済み */
      }
      try {
        this.source.disconnect();
      } catch (error) {
        /* 切断済み */
      }
      this.source = null;
    }
    this.playing = false;
  };

  Synth.prototype.musicTime = function () {
    if (!this.playing || !this.ctx) return null;
    return this.ctx.currentTime - this.startedAt;
  };

  Synth.prototype.start = function (bpm) {
    if (!this.ctx || !this.unlocked) return false;
    if (this.ctx.state !== "running") {
      const pending = this.ctx.resume();
      if (pending && pending.catch) pending.catch(function () {});
      return false;
    }
    this.stop();
    const buffer = this.renderBar(bpm, arguments.length > 1 ? arguments[1] : 8);
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.connect(this.musicGain);
    const when = this.ctx.currentTime + 0.02;
    try {
      source.start(when);
    } catch (error) {
      return false;
    }
    this.source = source;
    this.startedAt = when;
    this.playing = true;
    this.warm();
    return true;
  };

  Synth.prototype.playWhoosh = function () {
    this.play(this.cached("whoosh", this.renderWhoosh.bind(this)));
  };
  Synth.prototype.playCatch = function (perfect) {
    this.play(perfect ? this.cached("perfect", () => this.renderChime(true)) : this.cached("catch", () => this.renderChime(false)));
  };
  Synth.prototype.playThud = function () {
    this.play(this.cached("thud", this.renderThud.bind(this)));
  };
  Synth.prototype.playMiss = function () {
    this.play(this.cached("miss", this.renderMiss.bind(this)));
  };

  Synth.prototype.cached = function (name, build) {
    if (!this.cache[name]) this.cache[name] = build();
    return this.cache[name];
  };

  Synth.prototype.warm = function () {
    this.cached("whoosh", this.renderWhoosh.bind(this));
    this.cached("catch", () => this.renderChime(false));
    this.cached("perfect", () => this.renderChime(true));
    this.cached("thud", this.renderThud.bind(this));
    this.cached("miss", this.renderMiss.bind(this));
  };

  Synth.prototype.play = function (buffer) {
    if (!this.ctx || !buffer || this.ctx.state !== "running") return;
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.sfxGain);
    try {
      source.start();
    } catch (error) {
      /* 再生できない端末では絵だけで進む */
    }
  };

  Synth.prototype.makeSamples = function (seconds) {
    const rate = this.ctx.sampleRate;
    const frames = Math.max(1, Math.floor(rate * seconds));
    return { rate: rate, frames: frames, left: new Float32Array(frames) };
  };

  Synth.prototype.toBuffer = function (pack) {
    softClip(pack.left);
    const buffer = this.ctx.createBuffer(2, pack.frames, pack.rate);
    buffer.getChannelData(0).set(pack.left);
    buffer.getChannelData(1).set(pack.left);
    return buffer;
  };

  Synth.prototype.renderBar = function (bpm, beats) {
    const rate = this.ctx.sampleRate;
    const bars = beats || 8;
    const beatSamples = Math.max(1, Math.floor(rate * 60 / bpm));
    const frames = beatSamples * bars;
    const left = new Float32Array(frames);
    const notes = [262, 330, 392, 523, 330, 392, 494, 523];
    for (let beat = 0; beat < bars; beat += 1) {
      const start = beat * beatSamples;
      const accent = beat === bars - 1;
      addKick(left, start, accent ? 0.5 : beat % 4 === 0 ? 0.32 : 0.16, rate);
      addWood(left, start, accent ? 0.48 : 0.18, 1000 + beat, rate);
      addPluck(left, start, notes[beat % notes.length], accent ? 0.13 : 0.065, rate);
      addHat(left, start + Math.floor(beatSamples / 2), 0.04, 8000 + beat, rate);
    }
    const fade = Math.floor(rate * 0.012);
    if (fade > 1 && fade < frames) {
      for (let i = 0; i < fade; i += 1) {
        left[frames - fade + i] *= 1 - i / fade;
      }
    }
    return this.toBuffer({ rate: rate, frames: frames, left: left });
  };

  Synth.prototype.renderWhoosh = function () {
    const pack = this.makeSamples(0.38);
    const state = { seed: 42 };
    let previous = 0;
    for (let i = 0; i < pack.frames; i += 1) {
      const time = i / pack.rate;
      const noise = hashNoise(state);
      const high = noise - previous;
      previous = noise;
      const envelope = Math.exp(-time * 6.5) * Math.sin(Math.PI * Math.min(1, time / 0.38));
      pack.left[i] = high * 0.35 * envelope;
    }
    return this.toBuffer(pack);
  };

  Synth.prototype.renderChime = function (perfect) {
    const pack = this.makeSamples(0.42);
    addPluck(pack.left, 0, perfect ? 523.25 : 392, 0.22, pack.rate);
    addPluck(pack.left, 0, perfect ? 659.25 : 493.88, 0.16, pack.rate);
    if (perfect) addPluck(pack.left, Math.floor(pack.rate * 0.06), 783.99, 0.12, pack.rate);
    return this.toBuffer(pack);
  };

  Synth.prototype.renderThud = function () {
    const pack = this.makeSamples(0.34);
    addKick(pack.left, 0, 0.5, pack.rate);
    const state = { seed: 9 };
    const count = Math.min(pack.frames, Math.floor(pack.rate * 0.08));
    for (let i = 0; i < count; i += 1) {
      const time = i / pack.rate;
      pack.left[i] += hashNoise(state) * Math.exp(-time * 40) * 0.15;
    }
    return this.toBuffer(pack);
  };

  Synth.prototype.renderMiss = function () {
    const pack = this.makeSamples(0.28);
    addPluck(pack.left, 0, 196, 0.16, pack.rate);
    addPluck(pack.left, Math.floor(pack.rate * 0.09), 155.56, 0.12, pack.rate);
    return this.toBuffer(pack);
  };

  root.BeatSynth = Synth;
})(typeof globalThis !== "undefined" ? globalThis : this);
