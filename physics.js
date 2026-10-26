/* ブランコの余弦、放物線、台の配置、得点。FlightPhysics.swift と同じ式。 */
(function (root) {
  function tuning() {
    return root.TUNING;
  }

  function metricsFor(height) {
    const torso = height * 0.06;
    const arm = height * 0.03;
    const thigh = height * 0.032;
    const shin = height * 0.03;
    const head = height * 0.026;
    return { torso: torso, arm: arm, thigh: thigh, shin: shin, head: head, hipDrop: torso + arm, leg: thigh + shin };
  }

  function beatDuration(swing) {
    return 60 / swing.bpm;
  }

  function releaseTime(swing) {
    return swing.releaseBeat * beatDuration(swing);
  }

  function angularFrequency(swing) {
    const ratio = Math.min(0.95, Math.max(0.05, swing.thetaIdeal / swing.thetaMax));
    return Math.acos(-ratio) / releaseTime(swing);
  }

  function motion(swing, time) {
    const w = angularFrequency(swing);
    const theta = -swing.direction * swing.thetaMax * Math.cos(w * time);
    const omega = swing.direction * swing.thetaMax * w * Math.sin(w * time);
    return { theta: theta, omega: omega };
  }

  function pointOnRope(pivot, radius, theta) {
    return {
      x: pivot.x + radius * Math.sin(theta),
      y: pivot.y - radius * Math.cos(theta),
    };
  }

  function sampleAt(swing, time) {
    const pair = motion(swing, time);
    const scaled = pair.omega * swing.velocityScale;
    const radius = swing.ropeLength + swing.hipDrop;
    const position = pointOnRope(swing.pivot, radius, pair.theta);
    return {
      theta: pair.theta,
      omega: scaled,
      position: position,
      velocity: {
        x: radius * Math.cos(pair.theta) * scaled,
        y: radius * Math.sin(pair.theta) * scaled,
      },
    };
  }

  function barPosition(swing, time) {
    return pointOnRope(swing.pivot, swing.ropeLength, motion(swing, time).theta);
  }

  function positionAt(sample, gravity, time) {
    return {
      x: sample.position.x + sample.velocity.x * time,
      y: sample.position.y + sample.velocity.y * time - 0.5 * gravity * time * time,
    };
  }

  function timeToHeight(targetY, sample, gravity) {
    if (!(gravity > 1)) return null;
    const y0 = sample.position.y;
    const vy = sample.velocity.y;
    const drop = y0 - targetY;
    if (drop <= 0 && vy <= 0) return null;
    const discriminant = vy * vy + 2 * gravity * drop;
    if (discriminant < 0) return null;
    const time = (vy + Math.sqrt(discriminant)) / gravity;
    if (time < 0) return null;
    return time;
  }

  function solveGravity(sample, hipY, sweetX, direction) {
    const band = tuning();
    function progress(gravity) {
      const time = timeToHeight(hipY, sample, gravity);
      if (time == null) return null;
      const landed = positionAt(sample, gravity, time).x;
      return (landed - sweetX) * direction;
    }
    let low = band.gravitySearchMin;
    let high = band.gravitySearchMax;
    if (progress(high) == null) return high;
    for (let i = 0; i < 28; i += 1) {
      const mid = (low + high) * 0.5;
      const extra = progress(mid);
      if ((extra == null ? 1 : extra) > 0) low = mid;
      else high = mid;
    }
    return (low + high) * 0.5;
  }

  function evaluate(sample, gravity, hipPlatformY, hipNetY, platformMinX, platformMaxX, netMinX, netMaxX, sweet, direction) {
    const platformTime = timeToHeight(hipPlatformY, sample, gravity);
    if (platformTime != null) {
      const hip = positionAt(sample, gravity, platformTime);
      if (hip.x >= platformMinX && hip.x <= platformMaxX) {
        return {
          kind: "caught",
          hip: { x: hip.x, y: hipPlatformY },
          time: platformTime,
          distanceToSweet: Math.abs(hip.x - sweet),
          alongMiss: (hip.x - sweet) * direction,
        };
      }
    }
    const netTime = timeToHeight(hipNetY, sample, gravity);
    if (netTime != null) {
      const hip = positionAt(sample, gravity, netTime);
      const along = (hip.x - sweet) * direction;
      if (netMaxX > netMinX && hip.x >= netMinX && hip.x <= netMaxX) {
        return {
          kind: "net",
          hip: { x: hip.x, y: hipNetY },
          time: netTime,
          distanceToSweet: Math.abs(hip.x - sweet),
          alongMiss: along,
        };
      }
      return {
        kind: "fall",
        hip: hip,
        time: netTime,
        distanceToSweet: Math.abs(hip.x - sweet),
        alongMiss: along,
      };
    }
    return {
      kind: "fall",
      hip: sample.position,
      time: 0.45,
      distanceToSweet: Math.abs(sample.position.x - sweet),
      alongMiss: 0,
    };
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

  function scoreFlight(judgement, kind, distance, halfWidth, comboBefore, released) {
    const band = tuning();
    if (!released) return { points: 0, multiplier: 1, comboAfter: 0 };
    const multiplier = 1 + band.comboStep * Math.min(comboBefore, band.comboCap);
    let landingPoints = 0;
    if (kind === "caught") {
      const proximity = Math.max(0, 1 - distance / Math.max(halfWidth, 1));
      landingPoints = Math.round(band.landingPointsMax * proximity);
    } else if (kind === "net") {
      landingPoints = band.netConsolation;
    }
    const points = Math.round((basePoints(judgement) + landingPoints) * multiplier);
    const success = kind === "caught" && judgement !== "miss";
    return { points: points, multiplier: multiplier, comboAfter: success ? comboBefore + 1 : 0 };
  }

  function destinationPedestal(layout, direction) {
    return direction > 0 ? layout.rightPedestal : layout.leftPedestal;
  }

  function sweetX(layout, direction) {
    const pedestal = destinationPedestal(layout, direction);
    const towardCenter = direction > 0 ? -1 : 1;
    return pedestal.x + pedestal.width / 2 + towardCenter * pedestal.width * 0.22;
  }

  function catcherX(layout, onLeft) {
    const pedestal = onLeft ? layout.leftPedestal : layout.rightPedestal;
    const away = onLeft ? -1 : 1;
    return pedestal.x + pedestal.width / 2 + away * pedestal.width * 0.22;
  }

  function makeSwing(layout, direction) {
    const band = tuning();
    return {
      pivot: direction > 0 ? layout.leftPivot : layout.rightPivot,
      ropeLength: layout.ropeLength,
      hipDrop: layout.metrics.hipDrop,
      thetaMax: layout.thetaMax,
      thetaIdeal: layout.thetaIdeal,
      direction: direction,
      bpm: layout.stage.bpm,
      releaseBeat: band.releaseBeat,
      velocityScale: band.velocityScale,
    };
  }

  function makeLayout(width, height, stage) {
    const band = tuning();
    const metrics = metricsFor(height);
    const groundY = height * 0.09;
    const pedestalTop = height * 0.3;
    const hipPlatformY = pedestalTop + metrics.leg;
    const hipNetY = height * 0.175 + metrics.leg * 0.2;
    const pivotY = height * 0.9;
    let ropeLength = height * band.ropeLengthRatio;
    let thetaMax = band.thetaMaxRadians;
    let thetaIdeal = band.thetaIdealRadians;
    const clearance = Math.max(8, width * 0.012);
    let half = Math.max(28, width * stage.platformHalfRatio);
    let pedestalWidth = half * 2;
    let distance = width * stage.flightDistanceRatio;
    const margin = 12;

    function edges(dist, halfWidth) {
      const span = Math.max(40, dist - clearance - halfWidth);
      const a = span / 2;
      const center = width / 2;
      const leftPivotX = center - a;
      const rightPivotX = center + a;
      return {
        left: leftPivotX - clearance - halfWidth * 2,
        right: rightPivotX + clearance + halfWidth * 2,
        a: a,
      };
    }

    for (let i = 0; i < 8; i += 1) {
      const edge = edges(distance, half);
      if (edge.left >= margin && edge.right <= width - margin) break;
      distance *= 0.94;
      half *= 0.97;
      pedestalWidth = half * 2;
    }

    const edge = edges(distance, half);
    const center = width / 2;
    const leftPivot = { x: center - edge.a, y: pivotY };
    const rightPivot = { x: center + edge.a, y: pivotY };
    let guardCount = 0;
    while ((ropeLength + metrics.hipDrop) * Math.sin(thetaMax) > leftPivot.x - 8 && guardCount < 10) {
      thetaMax *= 0.96;
      thetaIdeal = thetaMax * Math.SQRT1_2;
      ropeLength *= 0.98;
      guardCount += 1;
    }

    const leftPedestal = {
      x: leftPivot.x - clearance - pedestalWidth,
      y: groundY,
      width: pedestalWidth,
      height: pedestalTop - groundY,
    };
    const rightPedestal = {
      x: rightPivot.x + clearance,
      y: groundY,
      width: pedestalWidth,
      height: pedestalTop - groundY,
    };

    const layout = {
      size: { width: width, height: height },
      stage: stage,
      metrics: metrics,
      leftPivot: leftPivot,
      rightPivot: rightPivot,
      leftPedestal: leftPedestal,
      rightPedestal: rightPedestal,
      ropeLength: ropeLength,
      thetaMax: thetaMax,
      thetaIdeal: thetaIdeal,
      hipPlatformY: hipPlatformY,
      hipNetY: hipNetY,
      groundY: groundY,
      pedestalTop: pedestalTop,
      gravity: 900,
      clearance: clearance,
      netMinX: leftPedestal.x + leftPedestal.width,
      netMaxX: rightPedestal.x,
    };

    const swing = makeSwing(layout, 1);
    const sample = sampleAt(swing, releaseTime(swing));
    layout.gravity = solveGravity(sample, hipPlatformY, sweetX(layout, 1), 1);
    return layout;
  }

  function perfectLandingError(width, height, stageIndex) {
    const stage = tuning().stages[stageIndex];
    const layout = makeLayout(width, height, stage);
    const swing = makeSwing(layout, 1);
    const sample = sampleAt(swing, releaseTime(swing));
    const platform = destinationPedestal(layout, 1);
    const landing = evaluate(
      sample,
      layout.gravity,
      layout.hipPlatformY,
      layout.hipNetY,
      platform.x,
      platform.x + platform.width,
      layout.netMinX,
      layout.netMaxX,
      sweetX(layout, 1),
      1
    );
    return {
      error: landing.hip.x - sweetX(layout, 1),
      gravity: layout.gravity,
      kind: landing.kind,
      time: landing.time,
      half: platform.width / 2,
    };
  }

  root.Physics = {
    metricsFor: metricsFor,
    beatDuration: beatDuration,
    releaseTime: releaseTime,
    motion: motion,
    sampleAt: sampleAt,
    barPosition: barPosition,
    positionAt: positionAt,
    timeToHeight: timeToHeight,
    evaluate: evaluate,
    grade: grade,
    basePoints: basePoints,
    scoreFlight: scoreFlight,
    destinationPedestal: destinationPedestal,
    sweetX: sweetX,
    catcherX: catcherX,
    makeSwing: makeSwing,
    makeLayout: makeLayout,
    perfectLandingError: perfectLandingError,
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
