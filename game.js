/* 拍に合わせて手を離し、放物線の着地点で点を取る。GameScene.swift と同じ進行。 */
(function (root) {
  const T = () => root.TUNING;
  const Physics = () => root.Physics;
  const canvas = document.getElementById("view");
  const titleEl = document.getElementById("title");
  const resultEl = document.getElementById("result");
  const muteBtn = document.getElementById("mute");
  const startBtn = document.getElementById("start");
  const retryBtn = document.getElementById("retry");
  const backBtn = document.getElementById("back");
  const ctx = canvas.getContext("2d");
  const audio = new root.BeatSynth();

  const state = {
    mode: "title",
    run: "attract",
    phase: { kind: "boot" },
    layout: null,
    stageIndex: 0,
    flightIndex: 0,
    direction: 1,
    releasedThisSwing: false,
    score: 0,
    awardedBonus: 0,
    combo: 0,
    bestCombo: 0,
    records: [],
    fallbackTime: 0,
    preferFallback: true,
    lastTick: 0,
    ignoreUntil: 0,
    shake: 0,
    shakeTime: 0,
    zoom: 1,
    flash: 0,
    impact: 0,
    netSag: 0,
    netSagX: 0,
    safeX: 18,
    safeY: 12,
    popups: [],
    particles: [],
    trail: [],
    muted: false,
    report: null,
    w: 0,
    h: 0,
    dpr: 1,
    song: 0,
    countText: null,
    ring: null,
    banner: null,
    dim: 0,
    star: null,
    displayedScore: 0,
    debugText: "",
    spotlightX: 0,
  };

  let fitted = false;
  let resultStamp = "";

  function now() {
    return performance.now() / 1000;
  }

  function judgementColor(judgement) {
    const palette = root.PALETTE;
    if (judgement === "perfect") return palette.gold;
    if (judgement === "great") return palette.cream;
    if (judgement === "good") return palette.sky;
    return palette.miss;
  }

  function timingCaption(offsetMs, released) {
    if (!released) return "見逃し";
    if (Math.abs(offsetMs) < 12) return "ぴったり";
    if (offsetMs < 0) return "早い " + Math.abs(offsetMs).toFixed(0) + "ms";
    return "遅い " + offsetMs.toFixed(0) + "ms";
  }

  function readSafe() {
    const cs = getComputedStyle(document.documentElement);
    const px = (name) => {
      const value = parseFloat(cs.getPropertyValue(name));
      return Number.isFinite(value) ? value : 0;
    };
    state.safeX = Math.max(18, px("--safe-x"));
    state.safeY = Math.max(10, px("--safe-y"));
  }

  function fit() {
    const viewport = root.visualViewport;
    const width = Math.max(1, Math.round(viewport ? viewport.width : root.innerWidth));
    const height = Math.max(1, Math.round(viewport ? viewport.height : root.innerHeight));
    const app = document.getElementById("app");
    app.style.width = width + "px";
    app.style.height = height + "px";
    app.style.transform = "translate(" + (viewport ? viewport.offsetLeft : 0) + "px," + (viewport ? viewport.offsetTop : 0) + "px)";
    const first = !fitted || state.phase.kind === "boot";
    const changed = state.w !== width || state.h !== height;
    const wasPortrait = state.w > 0 && state.h > state.w * 1.05;
    state.w = width;
    state.h = height;
    state.dpr = Math.min(root.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * state.dpr);
    canvas.height = Math.round(height * state.dpr);
    readSafe();
    const rotate = document.getElementById("rotate");
    if (rotate) rotate.hidden = !portraitBlocked();
    if (width < 80 || height < 80) return;
    const nowPortrait = height > width * 1.05;
    if (first || (wasPortrait !== nowPortrait && state.run === "attract")) {
      fitted = true;
      enterAttract();
    } else if (changed) {
      rebuildLayout();
    }
  }

  function rebuildLayout() {
    const stage = T().stages[state.stageIndex] || T().stages[0];
    state.layout = Physics().makeLayout(state.w, state.h, stage);
    if (state.w > 80) {
      const probe = Physics().perfectLandingError(state.w, state.h, state.stageIndex);
      if (Math.abs(probe.error) > 3) {
        console.warn("空中ブランコ: 完璧着地の誤差 " + probe.error.toFixed(2) + " px");
      }
    }
  }

  function resetRun() {
    state.score = 0;
    state.awardedBonus = 0;
    state.combo = 0;
    state.bestCombo = 0;
    state.records = [];
    state.stageIndex = 0;
    state.flightIndex = 0;
    state.direction = 1;
    state.releasedThisSwing = false;
    state.popups = [];
    state.particles = [];
    state.trail = [];
  }

  function enterAttract() {
    state.mode = "title";
    state.run = "attract";
    state.report = null;
    resetRun();
    rebuildLayout();
    beginMusic();
    state.phase = { kind: "arming", waited: 0 };
    state.banner = null;
    syncDom();
  }

  function startCampaign() {
    if (state.mode === "playing" && state.phase.kind !== "finished") return;
    state.ignoreUntil = now() + 0.4;
    state.mode = "playing";
    state.run = "campaign";
    state.report = null;
    resetRun();
    audio.stop();
    state.fallbackTime = 0;
    rebuildLayout();
    state.phase = { kind: "announce", remain: 1.75 };
    showBanner(null);
    syncDom();
  }

  function beginMusic() {
    state.preferFallback = false;
    state.fallbackTime = 0;
    if (!audio.start(state.layout.stage.bpm)) {
      state.preferFallback = true;
      state.fallbackTime = 0;
    }
  }

  function beginSwing(startSongTime) {
    state.releasedThisSwing = false;
    state.trail = [];
    state.banner = null;
    state.phase = { kind: "swing", start: startSongTime };
  }

  function visualNow() {
    return state.fallbackTime - T().presentationDelay;
  }

  function tapTime() {
    if (!state.preferFallback) {
      const time = audio.musicTime();
      if (time != null) return time - T().presentationDelay;
    }
    return state.fallbackTime - T().presentationDelay;
  }

  function advanceClock(dt) {
    if (!state.preferFallback) {
      const time = audio.musicTime();
      if (time != null) state.fallbackTime = time;
      else state.fallbackTime += dt;
    } else {
      state.fallbackTime += dt;
    }
  }

  function registerTap() {
    if (now() < state.ignoreUntil) return;
    if (portraitBlocked()) return;
    if (state.mode === "title" || state.run === "attract") {
      startCampaign();
      return;
    }
    if (state.mode === "result") return;
    if (state.phase.kind !== "swing") return;
    tryRelease(tapTime(), state.phase.start);
  }

  function tryRelease(visualTime, swingStart) {
    if (state.phase.kind !== "swing" || state.releasedThisSwing) return;
    const swing = Physics().makeSwing(state.layout, state.direction);
    const local = visualTime - swingStart;
    const localBeat = local / Physics().beatDuration(swing);
    if (localBeat < T().earliestTapBeat) return;
    if (localBeat > T().releaseBeat + T().lateGraceBeats) return;
    state.releasedThisSwing = true;
    const offset = local - Physics().releaseTime(swing);
    const judgement = Physics().grade(offset);
    const sample = Physics().sampleAt(swing, Math.max(0.001, local));
    const platform = Physics().destinationPedestal(state.layout, state.direction);
    const landing = Physics().evaluate(
      sample,
      state.layout.gravity,
      state.layout.hipPlatformY,
      state.layout.hipNetY,
      platform.x,
      platform.x + platform.width,
      state.layout.netMinX,
      state.layout.netMaxX,
      Physics().sweetX(state.layout, state.direction),
      state.direction
    );
    const scored = Physics().scoreFlight(judgement, landing.kind, landing.distanceToSweet, platform.width / 2, state.combo, true);
    const spin = { perfect: 0.5, great: 1.3, good: 2.4, miss: 4.8 }[judgement] * state.direction;
    const anim = {
      start: visualTime,
      duration: Math.max(0.32, landing.time),
      sample: sample,
      gravity: state.layout.gravity,
      judgement: judgement,
      offsetMs: offset * 1000,
      landing: landing,
      points: scored.points,
      comboAfter: scored.comboAfter,
      spin: spin,
    };
    state.phase = { kind: "flying", anim: anim };
    state.trail = [];
    audio.playWhoosh();
    buzz(judgement);
    if (state.run === "campaign") {
      popup(labelOf(judgement), timingCaption(anim.offsetMs, true), { x: sample.position.x, y: sample.position.y + 46 }, judgementColor(judgement), judgement === "perfect" ? 46 : 40);
    }
    burst(sample.position, root.PALETTE.gold, judgement === "perfect" ? 16 : 8, 70);
    if (judgement === "perfect") {
      state.shake = 7;
      state.zoom = 0.965;
      state.flash = 0.33;
    } else if (judgement === "great") {
      state.shake = 3.5;
    }
  }

  function labelOf(judgement) {
    if (judgement === "perfect") return "完璧";
    if (judgement === "great") return "見事";
    if (judgement === "good") return "良い";
    return "外れ";
  }

  function missTheBeat(swingStart) {
    state.releasedThisSwing = true;
    if (state.run === "campaign") {
      state.combo = 0;
      state.records.push({
        stageIndex: state.stageIndex,
        judgement: "miss",
        released: false,
        offsetMs: 0,
        kind: "fall",
        distance: 0,
        points: 0,
        comboAfter: 0,
      });
      state.bestCombo = Math.max(state.bestCombo, state.combo);
      popup("見逃し", "手を離さなかった", { x: state.w / 2, y: state.h * 0.62 }, root.PALETTE.miss, 36);
    }
    audio.playMiss();
    if (navigator.vibrate) navigator.vibrate([18, 30, 18]);
    enterBetween(null, false, swingStart, "miss");
  }

  function award(anim) {
    state.impact = anim.landing.kind === "caught" ? 0.2 : 0.08;
    if (anim.landing.kind === "net") {
      state.netSag = 20;
      state.netSagX = anim.landing.hip.x;
    }
    if (state.run !== "campaign") {
      audio.playCatch(anim.judgement === "perfect");
      enterBetween(anim.landing, true, null, anim.judgement);
      return;
    }
    state.score += anim.points;
    state.combo = anim.comboAfter;
    state.bestCombo = Math.max(state.bestCombo, state.combo);
    state.records.push({
      stageIndex: state.stageIndex,
      judgement: anim.judgement,
      released: true,
      offsetMs: anim.offsetMs,
      kind: anim.landing.kind,
      distance: anim.landing.distanceToSweet,
      points: anim.points,
      comboAfter: anim.comboAfter,
    });
    popup(landingTitle(anim.landing), anim.points > 0 ? "+" + root.Draw.formatPoints(anim.points) : null, { x: anim.landing.hip.x, y: anim.landing.hip.y + 52 }, root.PALETTE.cream, 28);
    if (anim.landing.kind === "caught") {
      audio.playCatch(anim.judgement === "perfect");
      burst(anim.landing.hip, anim.judgement === "perfect" ? root.PALETTE.gold : root.PALETTE.cream, anim.judgement === "perfect" ? 18 : 8, 56);
      if (anim.judgement === "perfect") state.flash = Math.max(state.flash, 0.18);
    } else {
      audio.playThud();
      state.shake = Math.max(state.shake, anim.landing.kind === "fall" ? 6 : 4);
    }
    enterBetween(anim.landing, true, null, anim.judgement);
  }

  function landingTitle(landing) {
    if (landing.kind === "caught") {
      const half = Physics().destinationPedestal(state.layout, state.direction).width / 2;
      return landing.distanceToSweet < half * 0.22 ? "ど真ん中" : "キャッチ";
    }
    if (landing.kind === "net") return landing.alongMiss < 0 ? "届かず" : "ネット";
    return landing.alongMiss > 0 ? "飛びすぎ" : "落下";
  }

  function stageBonus() {
    const catches = state.records.filter((record) => {
      return record.stageIndex === state.stageIndex && record.released && record.kind === "caught" && record.judgement !== "miss";
    }).length;
    return catches * T().stageCatchBonus;
  }

  function enterBetween(landing, released, swingOrigin, judgement) {
    const success = released && landing && landing.kind === "caught" && judgement !== "miss";
    let pose = { kind: "onBar" };
    if (landing && released) {
      if (landing.kind === "caught") pose = { kind: "caught", x: landing.hip.x };
      else if (landing.kind === "net") pose = { kind: "net", x: landing.hip.x };
      else pose = { kind: "fallen", x: landing.hip.x };
    }
    let pending;
    if (state.run === "attract") {
      pending = { kind: "swing", direction: success ? -state.direction : state.direction, flightIndex: 0 };
    } else {
      const nextFlight = state.flightIndex + 1;
      if (nextFlight >= state.layout.stage.flights) {
        const bonus = stageBonus();
        state.awardedBonus += bonus;
        if (bonus > 0) {
          popup("幕ボーナス +" + root.Draw.formatPoints(bonus), null, { x: state.w / 2, y: state.h * 0.58 }, root.PALETTE.gold, 26);
        }
        if (state.stageIndex + 1 < T().stages.length) pending = { kind: "announce", stageIndex: state.stageIndex + 1 };
        else pending = { kind: "finish" };
      } else {
        pending = { kind: "swing", direction: success ? -state.direction : state.direction, flightIndex: nextFlight };
      }
    }
    const song = visualNow();
    const nextEvent = pending.kind === "swing" ? nextBarTime(song + 0.45, state.layout.stage.bpm) : song + 1.2;
    state.phase = { kind: "between", nextEvent: nextEvent, pose: pose, swingOrigin: swingOrigin, pending: pending };
  }

  function nextBarTime(time, bpm) {
    const beat = 60 / bpm;
    const index = time / beat;
    const startBeat = Math.ceil((index + 0.12) / 4) * 4;
    return startBeat * beat;
  }

  function resolvePending(pending) {
    if (pending.kind === "swing") {
      state.direction = pending.direction;
      state.flightIndex = pending.flightIndex;
      beginSwing(state.phase.nextEvent);
      return;
    }
    if (pending.kind === "announce") {
      state.stageIndex = pending.stageIndex;
      state.flightIndex = 0;
      state.direction = 1;
      audio.stop();
      state.fallbackTime = 0;
      rebuildLayout();
      state.phase = { kind: "announce", remain: 1.7 };
      showBanner(null);
      return;
    }
    state.phase = { kind: "finished" };
    audio.stop();
    state.banner = null;
    state.report = makeReport(state.records, state.bestCombo);
    state.mode = "result";
    syncDom();
  }

  function makeReport(records, bestCombo) {
    const stages = T().stages.map((stage, index) => {
      const mine = records.filter((record) => record.stageIndex === index);
      const flightPoints = mine.reduce((sum, record) => sum + record.points, 0);
      const catches = mine.filter((record) => record.kind === "caught" && record.judgement !== "miss" && record.released).length;
      const bonus = catches * T().stageCatchBonus;
      return {
        act: stage.act,
        title: stage.title,
        catches: catches,
        flights: mine.length,
        points: flightPoints + bonus,
      };
    });
    const totalFlights = Math.max(records.length, 1);
    const clean = records.filter((record) => record.judgement === "perfect" && record.kind === "caught" && record.released).length;
    let headline = "もう一稽古";
    let subtitle = "明日の朝稽古で、もう一度。";
    if (records.length && clean === records.length) {
      headline = "完全な一夜";
      subtitle = "すべての跳躍が、星の上だった。";
    } else {
      const catches = records.filter((record) => record.kind === "caught" && record.judgement !== "miss").length;
      const ratio = catches / totalFlights;
      if (ratio >= 0.9) {
        headline = "花形";
        subtitle = "テントの視線を、ひとりじめ。";
      } else if (ratio >= 0.65) {
        headline = "看板役者";
        subtitle = "お客様は拍手を惜しまない。";
      } else if (ratio >= 0.35) {
        headline = "旅芸人";
        subtitle = "ネットの感触も、芸のうち。";
      }
    }
    return {
      records: records,
      stages: stages,
      bestCombo: bestCombo,
      total: stages.reduce((sum, stage) => sum + stage.points, 0),
      headline: headline,
      subtitle: subtitle,
      whiffs: records.filter((record) => !record.released).length,
    };
  }

  function countOf(report, judgement) {
    return report.records.filter((record) => record.released && record.judgement === judgement).length;
  }

  function showBanner(note) {
    const stage = state.layout.stage;
    state.banner = {
      act: stage.act,
      title: stage.title,
      detail: note || "BPM " + Math.round(stage.bpm) + "  ·  " + stage.flights + " 跳躍",
    };
  }

  function popup(text, subtitle, at, color, size) {
    state.popups.push({ text: text, subtitle: subtitle, x: at.x, y: at.y, color: color, size: size, age: 0, life: 0.96 });
  }

  function burst(at, color, count, distance) {
    for (let i = 0; i < count; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = (distance * (0.35 + Math.random() * 0.65)) / 0.48;
      state.particles.push({
        x: at.x,
        y: at.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed + 16 / 0.48,
        age: 0,
        life: 0.48,
        color: color,
        r: 1.4 + Math.random() * 1.6,
      });
    }
  }

  function buzz(judgement) {
    if (!navigator.vibrate) return;
    if (judgement === "perfect") navigator.vibrate(16);
    else if (judgement === "great" || judgement === "good") navigator.vibrate(8);
    else navigator.vibrate([18, 30, 18]);
  }

  function step(dt) {
    const song = visualNow();
    const phase = state.phase;
    if (phase.kind === "announce") {
      const remain = phase.remain - dt;
      if (remain <= 0) {
        beginMusic();
        state.phase = { kind: "arming", waited: 0 };
      } else {
        state.phase = { kind: "announce", remain: remain };
      }
    } else if (phase.kind === "arming") {
      const music = audio.musicTime();
      if (!state.preferFallback && music != null && music >= 0) beginSwing(0);
      else if (phase.waited > 0.55) {
        state.preferFallback = true;
        state.fallbackTime = 0;
        beginSwing(0);
      } else {
        state.phase = { kind: "arming", waited: phase.waited + dt };
      }
    } else if (phase.kind === "swing") {
      const swing = Physics().makeSwing(state.layout, state.direction);
      const localBeat = (song - phase.start) / Physics().beatDuration(swing);
      if (state.run === "attract" && !state.releasedThisSwing && song >= phase.start + Physics().releaseTime(swing)) {
        tryRelease(phase.start + Physics().releaseTime(swing), phase.start);
      } else if (!state.releasedThisSwing && localBeat > T().releaseBeat + T().lateGraceBeats) {
        missTheBeat(phase.start);
      }
    } else if (phase.kind === "flying") {
      if (song >= phase.anim.start + Math.max(phase.anim.duration, 0.32)) award(phase.anim);
    } else if (phase.kind === "between") {
      if (song >= phase.nextEvent) resolvePending(phase.pending);
    }
    state.netSag *= 0.9;
    state.impact *= 0.86;
    state.shake *= 0.86;
    state.shakeTime += dt;
    state.flash *= 0.86;
    state.zoom += (1 - state.zoom) * 0.1;
    state.popups.forEach((item) => {
      item.age += dt;
    });
    state.popups = state.popups.filter((item) => item.age < item.life);
    state.particles.forEach((dot) => {
      dot.age += dt;
      dot.x += dot.vx * dt;
      dot.y += dot.vy * dt;
    });
    state.particles = state.particles.filter((dot) => dot.age < dot.life);
  }

  function present() {
    const song = visualNow();
    state.song = song;
    state.displayedScore = state.score + state.awardedBonus;
    state.dim = 0;
    state.countText = null;
    state.ring = null;
    state.star = null;
    if (state.phase.kind === "announce") state.dim = 0.38;
    if (state.phase.kind === "between") {
      const lead = 0.3;
      const start = state.phase.nextEvent - lead;
      if (song >= start) state.dim = Math.min(1, (song - start) / lead) * 0.8;
    }
    if (state.phase.kind === "swing") {
      const swing = Physics().makeSwing(state.layout, state.direction);
      const localBeat = Math.max(0, song - state.phase.start) / Physics().beatDuration(swing);
      if (localBeat <= T().releaseBeat + 0.38) {
        const names = ["さん", "はい", "セー", "ノ"];
        state.countText = names[Math.floor(localBeat)] || null;
      }
      if (localBeat >= T().releaseBeat - 1 && localBeat <= T().releaseBeat + 0.35) {
        state.ring = localBeat - (T().releaseBeat - 1);
      }
      const ideal = Physics().barPosition(swing, Physics().releaseTime(swing));
      const proximity = Math.abs(localBeat - T().releaseBeat);
      state.star = {
        x: ideal.x,
        y: ideal.y,
        alpha: proximity < 1.35 ? 1 - proximity / 1.35 : 0.15,
        scale: proximity < 0.12 ? 1.35 : 1,
      };
    }
    if (state.phase.kind !== "announce") state.banner = null;
    if (T().showDebug) {
      const last = state.records[state.records.length - 1];
      state.debugText = last ? "ずれ " + last.offsetMs.toFixed(0) + "ms   的まで " + last.distance.toFixed(0) : "";
    } else {
      state.debugText = "";
    }
    if (!state.spotlightX) state.spotlightX = state.w / 2;
    root.Draw.frame(ctx, state);
  }

  function loop(stamp) {
    root.requestAnimationFrame(loop);
    if (!state.layout || state.w < 80 || state.h < 80) return;
    const seconds = stamp / 1000;
    const dt = state.lastTick === 0 ? 1 / 60 : Math.min(0.05, seconds - state.lastTick);
    state.lastTick = seconds;
    if (state.phase.kind !== "boot") {
      advanceClock(dt);
      step(dt);
      present();
    }
  }

  function portraitBlocked() {
    const width = state.w || root.innerWidth;
    const height = state.h || root.innerHeight;
    return height > width * 1.05;
  }

  function unlockAnd(fn) {
    audio.unlock();
    fn();
  }

  function toggleMute() {
    state.muted = !state.muted;
    audio.setMuted(state.muted);
    if (!state.muted && state.run === "attract" && state.preferFallback) beginMusic();
    syncDom();
  }

  let lastTouchAt = 0;

  function bindPress(element, fn) {
    element.addEventListener(
      "touchstart",
      (event) => {
        event.preventDefault();
        event.stopPropagation();
        lastTouchAt = performance.now();
        unlockAnd(fn);
      },
      { passive: false }
    );
    element.addEventListener("click", (event) => {
      if (event.detail === 0) return;
      if (lastTouchAt && performance.now() - lastTouchAt < 700) return;
      unlockAnd(fn);
    });
  }
  canvas.addEventListener(
    "touchstart",
    (event) => {
      event.preventDefault();
      lastTouchAt = performance.now();
      if (event.touches.length > 1) return;
      unlockAnd(registerTap);
    },
    { passive: false }
  );
  canvas.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "touch") return;
    unlockAnd(registerTap);
  });

  bindPress(startBtn, startCampaign);
  bindPress(retryBtn, startCampaign);
  bindPress(backBtn, enterAttract);
  bindPress(muteBtn, toggleMute);

  root.addEventListener("keydown", (event) => {
    if (event.code !== "Space" && event.code !== "Enter") return;
    if (event.repeat) return;
    event.preventDefault();
    unlockAnd(() => {
      if (state.mode === "title") startCampaign();
      else if (state.mode === "result") startCampaign();
      else registerTap();
    });
  });

  document.addEventListener(
    "touchmove",
    (event) => {
      if (event.target.closest && event.target.closest("#result .card")) return;
      event.preventDefault();
    },
    { passive: false }
  );
  document.addEventListener("gesturestart", (event) => event.preventDefault(), { passive: false });
  document.addEventListener("gesturechange", (event) => event.preventDefault(), { passive: false });
  document.addEventListener("contextmenu", (event) => event.preventDefault());

  function syncDom() {
    titleEl.hidden = state.mode !== "title";
    resultEl.hidden = state.mode !== "result";
    muteBtn.textContent = state.muted ? "音オフ" : "音オン";
    muteBtn.setAttribute("aria-label", state.muted ? "音をオンにする" : "音をオフにする");
    if (state.mode === "result" && state.report) {
      const stamp = state.report.headline + ":" + state.report.total + ":" + state.records.length;
      if (stamp !== resultStamp) {
        resultStamp = stamp;
        fillResult(state.report);
      }
    }
  }

  function fillResult(report) {
    document.getElementById("headline").textContent = report.headline;
    document.getElementById("subtitle").textContent = report.subtitle;
    document.getElementById("total").textContent = root.Draw.formatPoints(report.total);
    document.getElementById("best").textContent = "最高連続 " + report.bestCombo;
    const rows = document.getElementById("rows");
    rows.textContent = "";
    report.stages.forEach((stage) => {
      const row = document.createElement("div");
      row.className = "row";
      const name = document.createElement("span");
      name.textContent = stage.act + " " + stage.title;
      const catches = document.createElement("span");
      catches.className = "gold";
      catches.textContent = stage.catches + "/" + stage.flights;
      const points = document.createElement("span");
      points.className = "points";
      points.textContent = root.Draw.formatPoints(stage.points);
      row.append(name, catches, points);
      rows.append(row);
    });
    const chips = document.getElementById("chips");
    chips.textContent = "";
    [
      ["完璧", countOf(report, "perfect"), "gold"],
      ["見事", countOf(report, "great"), ""],
      ["良い", countOf(report, "good"), "sky"],
      ["外れ", countOf(report, "miss"), "miss"],
      ["見逃し", report.whiffs, "miss"],
    ].forEach((chip) => {
      const node = document.createElement("div");
      node.className = "chip " + chip[2];
      const value = document.createElement("strong");
      value.textContent = String(chip[1]);
      const name = document.createElement("span");
      name.textContent = chip[0];
      node.append(value, name);
      chips.append(node);
    });
  }

  root.addEventListener("resize", fit);
  if (root.visualViewport) {
    root.visualViewport.addEventListener("resize", fit);
    root.visualViewport.addEventListener("scroll", fit);
  }
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && audio.unlocked && audio.ctx && audio.ctx.state === "suspended") {
      audio.ctx.resume();
    }
  });

  fit();
  root.requestAnimationFrame(loop);
})(typeof globalThis !== "undefined" ? globalThis : this);
