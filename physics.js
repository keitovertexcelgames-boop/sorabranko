/* 塔のまわりを回る席。遠心力で鎖が開き、離した瞬間の接線速度で放物線を描く。 */
(function (root) {
  function tuning() {
    return root.TUNING;
  }

  function beatDuration(bpm) {
    return 60 / bpm;
  }

  function omegaFor(stage) {
    return (Math.PI * 2) / (stage.revBeats * beatDuration(stage.bpm));
  }

  /* ω² (R + L sinθ) cosθ - g sinθ = 0 */
  function solveTheta(omega, hubRadius, chain, g) {
    let low = 0.05;
    let high = 1.47;
    function f(theta) {
      const radius = hubRadius + chain * Math.sin(theta);
      return omega * omega * radius * Math.cos(theta) - g * Math.sin(theta);
    }
    if (f(high) > 0) return high;
    for (let i = 0; i < 28; i += 1) {
      const mid = (low + high) * 0.5;
      if (f(mid) > 0) low = mid;
      else high = mid;
    }
    return (low + high) * 0.5;
  }

  function rideShape(stage, theta) {
    const band = tuning();
    const radius = band.hubRadius + band.chainLength * Math.sin(theta);
    const height = band.hubHeight - band.chainLength * Math.cos(theta);
    return { theta: theta, radius: radius, height: Math.max(0.4, height) };
  }

  function seatPosition(shape, phi) {
    return {
      x: shape.radius * Math.cos(phi),
      y: shape.height,
      z: shape.radius * Math.sin(phi),
      phi: phi,
    };
  }

  function tangent(phi) {
    return { x: -Math.sin(phi), z: Math.cos(phi) };
  }

  function flightFrom(shape, phi, omega, g) {
    const seat = seatPosition(shape, phi);
    const speed = omega * shape.radius;
    const dir = tangent(phi);
    const time = Math.sqrt((2 * shape.height) / g);
    const distance = speed * time;
    return {
      time: time,
      speed: speed,
      distance: distance,
      seat: seat,
      landing: {
        x: seat.x + dir.x * distance,
        z: seat.z + dir.z * distance,
      },
      tangent: dir,
    };
  }

  function releaseBeat(stage) {
    return stage.revBeats - 1;
  }

  function makePark(stage) {
    const band = tuning();
    const omega = omegaFor(stage);
    const theta = solveTheta(omega, band.hubRadius, band.chainLength, band.g);
    const shape = rideShape(stage, theta);
    const ideal = flightFrom(shape, band.phiIdeal, omega, band.g);
    const ahead = tangent(band.phiIdeal);
    const side = { x: -ahead.z, z: ahead.x };
    /* 早い側にクッション、遅い側にプール。観客席はその外側。 */
    const early = flightFrom(shape, band.phiIdeal - 0.22, omega, band.g).landing;
    const late = flightFrom(shape, band.phiIdeal + 0.22, omega, band.g).landing;
    const far = {
      x: ideal.landing.x + ahead.x * 4.2 + side.x * 1.4,
      z: ideal.landing.z + ahead.z * 4.2 + side.z * 1.4,
    };
    return {
      stage: stage,
      omega: omega,
      theta: theta,
      shape: shape,
      ideal: ideal,
      target: ideal.landing,
      cushion: early,
      pool: late,
      stand: far,
      ahead: ahead,
      side: side,
    };
  }

  function phiAt(park, songTime) {
    const stage = park.stage;
    const beat = beatDuration(stage.bpm);
    const releaseTime = releaseBeat(stage) * beat;
    return tuning().phiIdeal + park.omega * (songTime - releaseTime);
  }

  function swayOffset(park, songTime) {
    const stage = park.stage;
    if (!stage.sway) return { x: 0, z: 0 };
    const beat = beatDuration(stage.bpm);
    const local = (songTime / beat) % stage.revBeats;
    const amount = stage.sway * Math.sin((Math.PI * 2 * (local - releaseBeat(stage))) / stage.revBeats);
    return { x: park.side.x * amount, z: park.side.z * amount };
  }

  function targetCenter(park, songTime) {
    const sway = swayOffset(park, songTime);
    return { x: park.target.x + sway.x, z: park.target.z + sway.z };
  }

  function predict(park, songTime) {
    return flightFrom(park.shape, phiAt(park, songTime), park.omega, tuning().g);
  }

  function grade(offsetSeconds) {
    const band = tuning();
    const delta = Math.abs(offsetSeconds);
    if (delta <= band.perfectWindow) return "perfect";
    if (delta <= band.greatWindow) return "great";
    if (delta <= band.goodWindow) return "good";
    return "miss";
  }

  function basePoints(judgement) {
    const band = tuning();
    if (judgement === "perfect") return band.perfectPoints;
    if (judgement === "great") return band.greatPoints;
    if (judgement === "good") return band.goodPoints;
    return band.missPoints;
  }

  function classify(park, landing, songTime) {
    const stage = park.stage;
    const center = targetCenter(park, songTime);
    const relX = landing.x - center.x;
    const relZ = landing.z - center.z;
    const along = relX * park.side.x + relZ * park.side.z;
    const cross = relX * park.ahead.x + relZ * park.ahead.z;
    const dist = Math.hypot(relX, relZ);
    const onPad = Math.abs(cross) <= Math.max(3.2, stage.cushionRadius * 0.72);
    if (dist <= stage.targetRadius && Math.abs(cross) <= stage.targetRadius * 1.25) {
      return { zone: "target", distance: dist, along: along, center: center };
    }
    if (onPad && along < 0 && -along <= stage.cushionRadius) {
      return { zone: "cushion", distance: dist, along: along, center: center };
    }
    if (onPad && along > 0 && along <= stage.poolRadius) {
      return { zone: "pool", distance: dist, along: along, center: center };
    }
    if (Math.abs(along) <= stage.standRadius && Math.abs(cross) <= stage.standRadius) {
      return { zone: "stand", distance: dist, along: along, center: center };
    }
    return { zone: "grass", distance: dist, along: along, center: center };
  }

  function scoreFlight(judgement, zone, distance, targetRadius, comboBefore, released) {
    const band = tuning();
    if (!released) return { points: 0, multiplier: 1, comboAfter: 0 };
    const multiplier = 1 + band.comboStep * Math.min(comboBefore, band.comboCap);
    let landingPoints = band.grassPoints;
    if (zone === "target") {
      const proximity = Math.max(0, 1 - distance / Math.max(targetRadius, 0.2));
      landingPoints = Math.round(band.landingPointsMax * proximity);
    } else if (zone === "cushion") landingPoints = band.cushionPoints;
    else if (zone === "pool") landingPoints = band.poolPoints;
    else if (zone === "stand") landingPoints = band.standPoints;
    const points = Math.round((basePoints(judgement) + landingPoints) * multiplier);
    const success = (zone === "target" || zone === "cushion") && judgement !== "miss";
    return { points: points, multiplier: multiplier, comboAfter: success ? comboBefore + 1 : 0 };
  }

  function zoneTitle(zone) {
    if (zone === "target") return "ど真ん中";
    if (zone === "cushion") return "クッション";
    if (zone === "pool") return "プール";
    if (zone === "stand") return "観客席";
    return "芝生";
  }

  function releaseSongTime(stage, rideIndex) {
    const beat = beatDuration(stage.bpm);
    return (releaseBeat(stage) + rideIndex * stage.revBeats) * beat;
  }

  root.Physics = {
    beatDuration: beatDuration,
    omegaFor: omegaFor,
    solveTheta: solveTheta,
    rideShape: rideShape,
    flightFrom: flightFrom,
    releaseBeat: releaseBeat,
    makePark: makePark,
    phiAt: phiAt,
    targetCenter: targetCenter,
    predict: predict,
    grade: grade,
    basePoints: basePoints,
    classify: classify,
    scoreFlight: scoreFlight,
    zoneTitle: zoneTitle,
    releaseSongTime: releaseSongTime,
    tangent: tangent,
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
