/* 回る席から、拍に合わせて手を離す。 */
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
    park: null,
    shape: null,
    stageIndex: 0,
    rideIndex: 0,
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
    muted: false,
    popups: [],
    particles: [],
    releasedThis: false,
    w: 0,
    h: 0,
    dpr: 1,
    song: 0,
    phi: 0,
    target: { x: 0, z: 0 },
    predictor: null,
    countText: null,
    ring: null,
    banner: null,
    dim: 0,
    hot: false,
    attract: true,
    displayedScore: 0,
    debugText: "",
    safeX: 18,
    safeY: 12,
    flying: null,
    landed: null,
    renderFlight: null,
    open: 1,
  };

  let fitted = false;
  let resultStamp = "";
  let lastTouchAt = 0;

  function now() {
    return performance.now() / 1000;
  }

  function stageAt(index) {
    return T().stages[Math.min(index, T().stages.length - 1)];
  }

  function judgementColor(judgement) {
    if (judgement === "perfect") return "#d35400";
    if (judgement === "great") return "#24324a";
    if (judgement === "good") return "#1f8fbf";
    return "#e06a6a";
  }

  function timingCaption(offsetMs, released) {
    if (!released) return "見逃し";
    if (Math.abs(offsetMs) < 12) return "ぴったり";
    if (offsetMs < 0) return "早い " + Math.abs(offsetMs).toFixed(0) + "ms";
    return "遅い " + offsetMs.toFixed(0) + "ms";
  }

  function labelOf(judgement) {
    if (judgement === "perfect") return "完璧";
    if (judgement === "great") return "見事";
    if (judgement === "good") return "良い";
    return "外れ";
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

  function portraitBlocked() {
    const width = state.w || root.innerWidth;
    const height = state.h || root.innerHeight;
    return height > width * 1.05;
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
      rebuildPark();
    }
  }

  function rebuildPark() {
    state.park = Physics().makePark(stageAt(state.stageIndex));
    state.shape = state.park.shape;
  }

  function resetRun() {
    state.score = 0;
    state.awardedBonus = 0;
    state.combo = 0;
    state.bestCombo = 0;
    state.records = [];
    state.stageIndex = 0;
    state.rideIndex = 0;
    state.releasedThis = false;
    state.popups = [];
    state.particles = [];
    state.flying = null;
    state.landed = null;
  }

  function enterAttract() {
    state.mode = "title";
    state.run = "attract";
    state.report = null;
    resetRun();
    rebuildPark();
    beginMusic();
    state.phase = { kind: "arming" };
    state.banner = null;
    syncDom();
  }

  function startCampaign() {
    if (state.mode === "playing" && state.phase.kind !== "finished") return;
    state.ignoreUntil = now() + 0.35;
    state.mode = "playing";
    state.run = "campaign";
    state.report = null;
    resetRun();
    audio.stop();
    state.fallbackTime = 0;
    rebuildPark();
    state.phase = { kind: "announce", remain: 1.6 };
    showBanner();
    syncDom();
  }

  function beginMusic() {
    state.preferFallback = false;
    state.fallbackTime = 0;
    if (!audio.start(state.park.stage.bpm, state.park.stage.revBeats)) {
      state.preferFallback = true;
      state.fallbackTime = 0;
    }
  }

  function visualNow() {
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

  function boundsFor(rideIndex) {
    const stage = state.park.stage;
    const beat = Physics().beatDuration(stage.bpm);
    const release = Physics().releaseSongTime(stage, rideIndex);
    const start = release - (T().windowBeats - 1) * beat;
    return {
      start: start,
      release: release,
      earliest: start + T().earliestTapBeat * beat,
      latest: release + T().lateGraceBeats * beat,
    };
  }

  function registerTap() {
    if (now() < state.ignoreUntil) return;
    if (portraitBlocked()) return;
    if (state.mode === "title" || state.run === "attract") {
      startCampaign();
      return;
    }
    if (state.mode !== "playing" || state.phase.kind !== "live" || state.releasedThis) return;
    tryRelease(visualNow());
  }

  function tryRelease(songTime) {
    if (state.phase.kind !== "live" || state.releasedThis) return;
    const bounds = boundsFor(state.rideIndex);
    if (songTime < bounds.earliest || songTime > bounds.latest) return;
    state.releasedThis = true;
    const offset = songTime - bounds.release;
    const judgement = Physics().grade(offset);
    const flight = Physics().predict(state.park, songTime);
    const zone = Physics().classify(state.park, flight.landing, songTime);
    const scored = Physics().scoreFlight(judgement, zone.zone, zone.distance, state.park.stage.targetRadius, state.combo, true);
    state.flying = {
      start: songTime,
      flight: flight,
      judgement: judgement,
      offsetMs: offset * 1000,
      zone: zone,
      points: scored.points,
      comboAfter: scored.comboAfter,
    };
    state.phase = { kind: "flying" };
    audio.playWhoosh();
    if (state.run === "campaign") {
      popup(labelOf(judgement), timingCaption(state.flying.offsetMs, true), flight.seat, judgementColor(judgement), 40);
    }
    if (judgement === "perfect") state.shake = 5;
  }

  function missRide() {
    state.releasedThis = true;
    if (state.run === "campaign") {
      state.combo = 0;
      state.records.push({
        stageIndex: state.stageIndex,
        judgement: "miss",
        released: false,
        offsetMs: 0,
        zone: "grass",
        distance: 0,
        points: 0,
        comboAfter: 0,
      });
      const seat = Physics().predict(state.park, visualNow()).seat;
      popup("見逃し", "手を離さなかった", seat, "#e06a6a", 32);
    }
    audio.playMiss();
    enterBetween();
  }

  function award() {
    const anim = state.flying;
    if (!anim) return;
    state.landed = { flight: anim.flight, until: 0 };
    if (state.run !== "campaign") {
      audio.playCatch(anim.judgement === "perfect");
      burst(anim.flight.landing, anim.judgement === "perfect" ? "#ffd166" : "#fff8ee", anim.judgement === "perfect" ? 16 : 8);
      enterBetween();
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
      zone: anim.zone.zone,
      distance: anim.zone.distance,
      points: anim.points,
      comboAfter: anim.comboAfter,
    });
    const title = anim.zone.zone === "target" && anim.zone.distance < state.park.stage.targetRadius * 0.35 ? "ど真ん中" : Physics().zoneTitle(anim.zone.zone);
    popup(title, anim.points > 0 ? "+" + root.Draw.formatPoints(anim.points) : null, { x: anim.flight.landing.x, y: 0.8, z: anim.flight.landing.z }, "#d35400", 28);
    if (anim.zone.zone === "pool") audio.playThud();
    else audio.playCatch(anim.judgement === "perfect");
    burst(anim.flight.landing, anim.zone.zone === "pool" ? "#8fd4f5" : "#ffd166", 12);
    enterBetween();
  }

  function bullseyeCount() {
    return state.records.filter((record) => record.stageIndex === state.stageIndex && record.released && record.zone === "target").length;
  }

  function enterBetween() {
    const song = visualNow();
    const stage = state.park.stage;
    const nextRide = state.rideIndex + 1;
    let until = song + 0.85;
    let pending = "ride";
    if (state.run === "attract") {
      pending = "attract";
      until = song + 0.7;
    } else if (nextRide >= stage.rides) {
      const bonus = bullseyeCount() * T().stageBullseyeBonus;
      state.awardedBonus += bonus;
      if (bonus > 0) {
        popup("区ボーナス +" + root.Draw.formatPoints(bonus), null, { x: state.park.target.x, y: 2, z: state.park.target.z }, "#d35400", 26);
      }
      pending = state.stageIndex + 1 < T().stages.length ? "announce" : "finish";
      until = song + 1.15;
    } else {
      const nextRelease = Physics().releaseSongTime(stage, nextRide);
      const nextStart = nextRelease - (T().windowBeats - 1) * Physics().beatDuration(stage.bpm);
      until = Math.max(song + 0.45, nextStart - 0.05);
    }
    state.phase = { kind: "between", until: until, pending: pending };
    if (state.landed) state.landed.until = until;
  }

  function resolveBetween() {
    const pending = state.phase.pending;
    if (pending === "attract" || pending === "ride") {
      if (pending === "ride") state.rideIndex += 1;
      state.releasedThis = false;
      state.flying = null;
      state.landed = null;
      state.phase = { kind: "live" };
      return;
    }
    if (pending === "announce") {
      state.stageIndex += 1;
      state.rideIndex = 0;
      state.releasedThis = false;
      state.flying = null;
      state.landed = null;
      audio.stop();
      state.fallbackTime = 0;
      rebuildPark();
      state.phase = { kind: "announce", remain: 1.5 };
      showBanner();
      return;
    }
    state.phase = { kind: "finished" };
    state.flying = null;
    state.landed = null;
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
      const hits = mine.filter((record) => record.released && record.zone === "target").length;
      const bonus = hits * T().stageBullseyeBonus;
      return { act: stage.act, title: stage.title, hits: hits, rides: mine.length, points: flightPoints + bonus };
    });
    const totalRides = Math.max(records.length, 1);
    const clean = records.filter((record) => record.judgement === "perfect" && record.zone === "target" && record.released).length;
    let headline = "もう一周";
    let subtitle = "次のチケットで、的の真ん中を。";
    if (records.length && clean === records.length) {
      headline = "完全な一日";
      subtitle = "すべての跳躍が、的の上だった。";
    } else {
      const decent = records.filter((record) => (record.zone === "target" || record.zone === "cushion") && record.judgement !== "miss").length;
      const ratio = decent / totalRides;
      if (ratio >= 0.9) {
        headline = "人気者";
        subtitle = "列の先頭は、あなたのもの。";
      } else if (ratio >= 0.6) {
        headline = "常連";
        subtitle = "もう一枚、買い足したくなる。";
      } else if (ratio >= 0.3) {
        headline = "初めての切符";
        subtitle = "プールも、思い出のうち。";
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

  function showBanner() {
    const stage = state.park.stage;
    state.banner = {
      act: stage.act,
      title: stage.title,
      detail: "BPM " + Math.round(stage.bpm) + "  ·  " + stage.rides + " 跳躍",
    };
  }

  function popup(text, subtitle, at, color, size) {
    state.popups.push({
      text: text,
      subtitle: subtitle,
      x: at.x,
      y: at.y + 1.2,
      z: at.z,
      color: color,
      size: size,
      age: 0,
      life: 0.95,
    });
  }

  function burst(at, color, count) {
    for (let i = 0; i < count; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      state.particles.push({
        x: at.x,
        y: 0.4,
        z: at.z,
        vx: Math.cos(angle) * 2.2,
        vz: Math.sin(angle) * 2.2,
        vy: 2 + Math.random() * 2,
        age: 0,
        life: 0.55,
        color: color,
        r: 2 + Math.random() * 2,
      });
    }
  }

  function step(dt) {
    const song = visualNow();
    const phase = state.phase;
    if (phase.kind === "announce") {
      const remain = phase.remain - dt;
      if (remain <= 0) {
        beginMusic();
        state.phase = { kind: "arming" };
      } else state.phase = { kind: "announce", remain: remain };
    } else if (phase.kind === "arming") {
      const music = audio.musicTime();
      if (!state.preferFallback && music != null && music >= 0) state.phase = { kind: "live" };
      else if ((phase.waited || 0) > 0.55) {
        state.preferFallback = true;
        state.fallbackTime = 0;
        state.phase = { kind: "live" };
      } else state.phase = { kind: "arming", waited: (phase.waited || 0) + dt };
    } else if (phase.kind === "live") {
      const rideIndex = state.run === "attract" ? attractRide(song) : state.rideIndex;
      if (state.run === "attract") state.rideIndex = rideIndex;
      const bounds = boundsFor(rideIndex);
      if (!state.releasedThis && state.run === "attract" && song >= bounds.release && song < bounds.latest) {
        tryRelease(bounds.release);
      } else if (!state.releasedThis && song > bounds.latest) {
        missRide();
      }
    } else if (phase.kind === "flying") {
      if (state.flying && song >= state.flying.start + state.flying.flight.time) award();
    } else if (phase.kind === "between" && song >= phase.until) {
      resolveBetween();
    }
    state.shake *= 0.86;
    state.shakeTime += dt;
    state.popups.forEach((item) => {
      item.age += dt;
    });
    state.popups = state.popups.filter((item) => item.age < item.life);
    state.particles.forEach((dot) => {
      dot.age += dt;
      dot.x += dot.vx * dt;
      dot.z += dot.vz * dt;
      dot.y = Math.max(0, dot.y + dot.vy * dt);
      dot.vy -= 6 * dt;
    });
    state.particles = state.particles.filter((dot) => dot.age < dot.life);
  }

  function attractRide(song) {
    const stage = state.park.stage;
    const cycle = stage.revBeats * Physics().beatDuration(stage.bpm);
    return Math.max(0, Math.floor(song / cycle));
  }

  function present() {
    const song = visualNow();
    state.song = song;
    state.attract = state.run === "attract";
    state.displayedScore = state.score + state.awardedBonus;
    const openRaw = Math.max(0, Math.min(1, song / 1.5));
    state.open = openRaw * openRaw * (3 - 2 * openRaw);
    const theta = state.park.theta * (0.28 + 0.72 * state.open);
    state.shape = Physics().rideShape(state.park.stage, theta);
    state.phi = Physics().phiAt(state.park, song);
    state.target = Physics().targetCenter(state.park, song);
    state.dim = state.phase.kind === "announce" ? 0.45 : 0;
    state.banner = state.phase.kind === "announce" ? state.banner : null;
    state.countText = null;
    state.ring = null;
    state.hot = false;
    state.predictor = null;
    state.renderFlight = null;
    if (state.phase.kind === "flying" && state.flying) {
      state.renderFlight = {
        flight: state.flying.flight,
        elapsed: Math.max(0, song - state.flying.start),
        landed: false,
      };
    } else if (state.landed && song <= state.landed.until) {
      state.renderFlight = { flight: state.landed.flight, elapsed: state.landed.flight.time, landed: true };
    }
    if (state.phase.kind === "live" || state.phase.kind === "flying") {
      const rideIndex = state.run === "attract" ? attractRide(song) : state.rideIndex;
      const bounds = boundsFor(rideIndex);
      const beat = Physics().beatDuration(state.park.stage.bpm);
      const local = (song - bounds.start) / beat;
      if (state.phase.kind === "live" && local >= -0.05 && local <= T().windowBeats - 1 + 0.45) {
        const names = ["さん", "はい", "セー", "ノ"];
        if (local >= 0 && local < names.length) state.countText = names[Math.floor(local)] || null;
        if (local >= T().windowBeats - 2) state.ring = local - (T().windowBeats - 2);
        state.hot = Math.abs(song - bounds.release) < beat * 0.35;
        if (state.open > 0.92 && !state.releasedThis) {
          const flight = Physics().predict(state.park, song);
          const dist = Math.hypot(flight.landing.x - state.target.x, flight.landing.z - state.target.z);
          state.predictor = { landing: flight.landing, close: dist < state.park.stage.targetRadius * 1.4 };
        }
      }
    }
    if (T().showDebug && state.records.length) {
      const last = state.records[state.records.length - 1];
      state.debugText = "ずれ " + last.offsetMs.toFixed(0) + "ms  的まで " + last.distance.toFixed(1) + "m";
    } else state.debugText = "";
    root.Draw.frame(ctx, state);
  }

  function loop(stamp) {
    root.requestAnimationFrame(loop);
    if (!state.park || state.w < 80 || state.h < 80) return;
    const seconds = stamp / 1000;
    const dt = state.lastTick === 0 ? 1 / 60 : Math.min(0.05, seconds - state.lastTick);
    state.lastTick = seconds;
    if (state.phase.kind !== "boot") {
      advanceClock(dt);
      step(dt);
      present();
    }
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
      const hits = document.createElement("span");
      hits.className = "gold";
      hits.textContent = stage.hits + "/" + stage.rides;
      const points = document.createElement("span");
      points.className = "points";
      points.textContent = root.Draw.formatPoints(stage.points);
      row.append(name, hits, points);
      rows.append(row);
    });
    const chips = document.getElementById("chips");
    chips.textContent = "";
    [
      ["完璧", countOf(report, "perfect")],
      ["見事", countOf(report, "great")],
      ["良い", countOf(report, "good")],
      ["外れ", countOf(report, "miss")],
      ["見逃し", report.whiffs],
    ].forEach((chip) => {
      const node = document.createElement("div");
      node.className = "chip";
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
    if (!document.hidden && audio.unlocked && audio.ctx && audio.ctx.state === "suspended") audio.ctx.resume();
  });

  fit();
  root.requestAnimationFrame(loop);

  if (typeof location !== "undefined" && String(location.search || "").indexOf("debug=1") >= 0) {
    root.__swing = {
      state: state,
      audioState: function () {
        return audio.ctx ? audio.ctx.state : "none";
      },
      releasePerfect: function () {
        if (state.phase.kind !== "live" || state.releasedThis) return false;
        tryRelease(boundsFor(state.rideIndex).release);
        return true;
      },
    };
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
