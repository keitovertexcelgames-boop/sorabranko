/* 斜め見下ろし。鎖の開き（高さと半径）と、地面の着地点を同時に見せる。 */
(function (root) {
  const P = () => root.PALETTE;
  const T = () => root.TUNING;

  const SEAT_COLORS = ["#ff4d6d", "#4d96ff", "#6bcb77", "#ffd93d", "#c77dff", "#ff922b", "#22b8cf", "#ff8787"];

  function project(cam, x, y, z) {
    const sx = x * Math.cos(cam.yaw) - z * Math.sin(cam.yaw);
    const sz = x * Math.sin(cam.yaw) + z * Math.cos(cam.yaw);
    return {
      x: cam.originX + sx * cam.scale,
      y: cam.originY + (sz * cam.squash - y * cam.vert) * cam.scale,
      depth: sz,
    };
  }

  function cameraFor(state) {
    const park = state.park;
    const yaw = -0.5;
    const squash = 0.6;
    const vert = 0.9;
    const samples = [{ x: 0, y: T().hubHeight + 2.4, z: 0 }, { x: 0, y: 0, z: 0 }];
    const ring = Math.max(park.shape.radius + 2, 9);
    for (let i = 0; i < 10; i += 1) {
      const a = (i / 10) * Math.PI * 2;
      samples.push({ x: Math.cos(a) * ring, y: 0, z: Math.sin(a) * ring });
      samples.push({ x: Math.cos(a) * park.shape.radius, y: park.shape.height, z: Math.sin(a) * park.shape.radius });
    }
    [park.target, park.cushion, park.pool, park.stand].forEach((p) => {
      samples.push({ x: p.x, y: 0, z: p.z });
      samples.push({ x: p.x + 6, y: 0, z: p.z + 5 });
      samples.push({ x: p.x - 6, y: 0, z: p.z - 5 });
    });
    const raw = samples.map((p) => {
      const sx = p.x * Math.cos(yaw) - p.z * Math.sin(yaw);
      const sz = p.x * Math.sin(yaw) + p.z * Math.cos(yaw);
      return { x: sx, y: sz * squash - p.y * vert };
    });
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    raw.forEach((p) => {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    });
    const padL = 28;
    const padR = 28;
    const padT = 72;
    const padB = 28;
    const scale = Math.min((state.w - padL - padR) / Math.max(0.01, maxX - minX), (state.h - padT - padB) / Math.max(0.01, maxY - minY));
    return {
      yaw: yaw,
      squash: squash,
      vert: vert,
      scale: scale,
      originX: padL + (state.w - padL - padR) * 0.5 - ((minX + maxX) * 0.5) * scale,
      originY: padT + (state.h - padT - padB) * 0.5 - ((minY + maxY) * 0.5) * scale,
    };
  }

  function poly(ctx, points, fill, stroke, width) {
    if (!points.length) return;
    ctx.beginPath();
    points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.closePath();
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = width || 2;
      ctx.stroke();
    }
  }

  function groundCircle(cam, x, z, radius, segments) {
    const pts = [];
    for (let i = 0; i <= segments; i += 1) {
      const a = (i / segments) * Math.PI * 2;
      pts.push(project(cam, x + Math.cos(a) * radius, 0, z + Math.sin(a) * radius));
    }
    return pts;
  }

  function drawGround(ctx, cam, state) {
    const palette = P();
    const sky = ctx.createLinearGradient(0, 0, 0, state.h);
    sky.addColorStop(0, palette.skyTop);
    sky.addColorStop(0.45, palette.skyMid);
    sky.addColorStop(1, palette.horizon);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, state.w, state.h);

    const sun = project(cam, -16, 11, -14);
    ctx.beginPath();
    ctx.arc(sun.x, sun.y, 26, 0, Math.PI * 2);
    ctx.fillStyle = "#ffe08a";
    ctx.fill();

    poly(ctx, groundCircle(cam, 0, 0, 34, 48), palette.grass, null);
    poly(ctx, groundCircle(cam, 2, 6, 22, 40), palette.grassDark, null);
    poly(ctx, groundCircle(cam, 0, 0, state.park.shape.radius + 3.2, 40), palette.path, "#e7c48a", 2);

    const park = state.park;
    const stage = park.stage;
    const along = (meters) => ({
      x: park.target.x + park.side.x * meters,
      z: park.target.z + park.side.z * meters,
    });
    const cushion = along(-stage.cushionRadius * 0.42);
    const pool = along(stage.poolRadius * 0.42);
    const stand = along(stage.standRadius * 0.15);
    poly(ctx, groundCircle(cam, stand.x, stand.z, stage.standRadius * 0.72, 24), "rgba(108,92,231,0.28)", null);
    poly(ctx, groundCircle(cam, cushion.x, cushion.z, stage.cushionRadius * 0.55, 22), palette.cushion, "#ffd0dc", 2);
    poly(ctx, groundCircle(cam, pool.x, pool.z, stage.poolRadius * 0.5, 22), palette.pool, palette.poolDeep, 3);

    const center = state.target;
    const pulse = 0.5 + 0.5 * Math.sin((state.song || 0) * 6);
    [stage.targetRadius, stage.targetRadius * 0.68, stage.targetRadius * 0.36].forEach((radius, index) => {
      const fill = index === 2 ? palette.bullseye : index === 1 ? palette.gold : palette.bullRing;
      poly(ctx, groundCircle(cam, center.x, center.z, radius, 28), fill, "#ffffff", 2);
    });
    if (state.hot) {
      ctx.save();
      ctx.globalAlpha = 0.35 + pulse * 0.25;
      poly(ctx, groundCircle(cam, center.x, center.z, stage.targetRadius * (1.15 + pulse * 0.08), 28), null, "#fff6c8", 4);
      ctx.restore();
    }

    ctx.fillStyle = "#5b3b8c";
    for (let i = 0; i < 8; i += 1) {
      const seat = along(stage.standRadius * 0.55 + (i % 2) * 0.35);
      const shift = park.ahead.x * (i - 3.5) * 0.85;
      const shiftZ = park.ahead.z * (i - 3.5) * 0.85;
      const p = project(cam, seat.x + shift, 0.55, seat.z + shiftZ);
      ctx.fillStyle = i % 2 ? "#ffe08a" : "#5b3b8c";
      ctx.fillRect(p.x - 4, p.y - 10, 8, 10);
    }
    zoneLabel(ctx, cam, center, "的");
    zoneLabel(ctx, cam, cushion, "クッション");
    zoneLabel(ctx, cam, pool, "プール");
  }

  function zoneLabel(ctx, cam, at, text) {
    const p = project(cam, at.x, 0.15, at.z);
    ctx.save();
    ctx.font = "700 12px " + root.FONT_BODY;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(255,248,238,0.85)";
    ctx.strokeText(text, p.x, p.y);
    ctx.fillStyle = P().ink;
    ctx.fillText(text, p.x, p.y);
    ctx.restore();
  }

  function drawTower(ctx, cam) {
    const palette = P();
    const base = project(cam, 0, 0, 0);
    const top = project(cam, 0, T().hubHeight, 0);
    const roof = project(cam, 0, T().hubHeight + 1.7, 0);
    ctx.strokeStyle = palette.towerWhite;
    ctx.lineWidth = 10;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(base.x, base.y);
    ctx.lineTo(top.x, top.y);
    ctx.stroke();
    ctx.strokeStyle = palette.towerRed;
    ctx.lineWidth = 4;
    ctx.setLineDash([7, 7]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(top.x, top.y);
    ctx.lineTo(roof.x, roof.y - 8);
    ctx.lineTo(top.x + 16, top.y + 6);
    ctx.closePath();
    ctx.fillStyle = palette.towerYellow;
    ctx.fill();
    ctx.strokeStyle = palette.towerRed;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(roof.x, roof.y - 12, 5, 0, Math.PI * 2);
    ctx.fillStyle = palette.towerRed;
    ctx.fill();
  }

  function drawSeat(ctx, cam, x, y, z, color, rider, holding) {
    const seat = project(cam, x, y, z);
    const hub = project(cam, Math.cos(Math.atan2(z, x)) * T().hubRadius, T().hubHeight, Math.sin(Math.atan2(z, x)) * T().hubRadius);
    ctx.strokeStyle = P().chain;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(hub.x, hub.y);
    ctx.lineTo(seat.x, seat.y);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(seat.x, seat.y, 11, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    if (!rider) return;
    const head = { x: seat.x, y: seat.y - 16 };
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(seat.x, seat.y - 2);
    ctx.lineTo(head.x, head.y + 6);
    ctx.stroke();
    ctx.strokeStyle = P().skin;
    ctx.beginPath();
    if (holding) {
      ctx.moveTo(head.x, head.y + 4);
      ctx.lineTo(seat.x - 7, seat.y - 18);
      ctx.moveTo(head.x, head.y + 4);
      ctx.lineTo(seat.x + 7, seat.y - 18);
    } else {
      ctx.moveTo(head.x, head.y + 4);
      ctx.lineTo(head.x - 10, head.y + 8);
      ctx.moveTo(head.x, head.y + 4);
      ctx.lineTo(head.x + 10, head.y + 2);
    }
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(head.x, head.y, 5.5, 0, Math.PI * 2);
    ctx.fillStyle = P().skin;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(head.x - 1, head.y - 3, 4, Math.PI, 0);
    ctx.fillStyle = P().hair;
    ctx.fill();
  }

  function drawPredictor(ctx, cam, landing, close) {
    const p = project(cam, landing.x, 0, landing.z);
    ctx.beginPath();
    ctx.arc(p.x, p.y, close ? 11 : 7, 0, Math.PI * 2);
    ctx.strokeStyle = close ? "#fff4c2" : P().gold;
    ctx.lineWidth = close ? 4 : 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = P().ink;
    ctx.fill();
  }

  function drawFlyer(ctx, cam, flight, elapsed, landed) {
    const g = T().g;
    const t = Math.min(elapsed, flight.time);
    const x = flight.seat.x + flight.tangent.x * flight.speed * t;
    const z = flight.seat.z + flight.tangent.z * flight.speed * t;
    const y = Math.max(0, flight.seat.y - 0.5 * g * t * t);
    ctx.strokeStyle = "rgba(255,77,109,0.55)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i <= 8; i += 1) {
      const u = (t * i) / 8;
      const px = flight.seat.x + flight.tangent.x * flight.speed * u;
      const pz = flight.seat.z + flight.tangent.z * flight.speed * u;
      const py = Math.max(0, flight.seat.y - 0.5 * g * u * u);
      const p = project(cam, px, py, pz);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
    const shadow = project(cam, x, 0, z);
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = "#24324a";
    ctx.beginPath();
    ctx.ellipse(shadow.x, shadow.y, landed ? 12 : 8, landed ? 5 : 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    const body = project(cam, x, y, z);
    ctx.fillStyle = P().player;
    ctx.beginPath();
    ctx.ellipse(body.x, body.y, landed ? 9 : 7, landed ? 5 : 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(body.x, body.y - (landed ? 8 : 12), 5, 0, Math.PI * 2);
    ctx.fillStyle = P().skin;
    ctx.fill();
  }

  function drawWorld(ctx, state) {
    const cam = cameraFor(state);
    state.cam = cam;
    drawGround(ctx, cam, state);
    const shape = state.shape;
    const seats = [];
    for (let i = 0; i < T().seatCount; i += 1) {
      const phi = state.phi + (i / T().seatCount) * Math.PI * 2;
      const x = shape.radius * Math.cos(phi);
      const z = shape.radius * Math.sin(phi);
      seats.push({ i: i, x: x, z: z, depth: project(cam, x, shape.height, z).depth });
    }
    seats.sort((a, b) => a.depth - b.depth);
    const flying = state.renderFlight;
    seats.forEach((seat) => {
      if (seat.depth < 0.5) drawSeat(ctx, cam, seat.x, shape.height, seat.z, SEAT_COLORS[seat.i % SEAT_COLORS.length], !(flying && seat.i === 0), true);
    });
    drawTower(ctx, cam);
    seats.forEach((seat) => {
      if (seat.depth >= 0.5) drawSeat(ctx, cam, seat.x, shape.height, seat.z, SEAT_COLORS[seat.i % SEAT_COLORS.length], !(flying && seat.i === 0), true);
    });
    if (state.predictor) drawPredictor(ctx, cam, state.predictor.landing, state.predictor.close);
    if (flying) drawFlyer(ctx, cam, flying.flight, flying.elapsed, flying.landed);
    state.particles.forEach((dot) => {
      const p = project(cam, dot.x, dot.y, dot.z);
      ctx.globalAlpha = Math.max(0, 1 - dot.age / dot.life);
      ctx.fillStyle = dot.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, dot.r, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
    state.popups.forEach((popup) => {
      const p = project(cam, popup.x, popup.y, popup.z);
      const t = popup.age / popup.life;
      const alpha = t < 0.1 ? t / 0.1 : t > 0.7 ? Math.max(0, 1 - (t - 0.7) / 0.3) : 1;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(p.x, p.y - t * 18);
      ctx.textAlign = "center";
      ctx.font = "700 " + popup.size + "px " + root.FONT_DISPLAY;
      ctx.lineWidth = 4;
      ctx.strokeStyle = "rgba(255,248,238,0.9)";
      ctx.strokeText(popup.text, 0, 0);
      ctx.fillStyle = popup.color;
      ctx.fillText(popup.text, 0, 0);
      if (popup.subtitle) {
        ctx.font = "600 14px " + root.FONT_BODY;
        ctx.lineWidth = 3;
        ctx.strokeText(popup.subtitle, 0, 18);
        ctx.fillStyle = P().ink;
        ctx.fillText(popup.subtitle, 0, 18);
      }
      ctx.restore();
    });
  }

  function drawHUD(ctx, state) {
    const palette = P();
    const ui = Math.min(1, state.h / 390);
    const left = state.safeX + 8;
    const top = state.safeY + 18;
    ctx.textBaseline = "middle";
    if (!state.attract) {
      ctx.textAlign = "left";
      ctx.font = "700 " + Math.round(15 * ui) + "px " + root.FONT_BODY;
      ctx.fillStyle = palette.ink;
      ctx.fillText(state.park.stage.act + "  " + state.park.stage.title, left, top);
      ctx.font = "700 " + Math.round(22 * ui) + "px " + root.FONT_DISPLAY;
      ctx.fillStyle = "#d35400";
      ctx.fillText(formatPoints(state.displayedScore), left, top + 24 * ui);
      if (state.combo > 0) {
        ctx.font = "700 " + Math.round(13 * ui) + "px " + root.FONT_BODY;
        ctx.fillStyle = state.combo >= 3 ? "#d35400" : palette.ink;
        ctx.fillText("連続 " + state.combo, left, top + 46 * ui);
      }
      const total = state.park.stage.rides;
      const done = state.records.filter((record) => record.stageIndex === state.stageIndex).length;
      const lampY = state.h - state.safeY - 16;
      const span = Math.max(total - 1, 1) * 16;
      for (let i = 0; i < total; i += 1) {
        ctx.beginPath();
        ctx.arc(state.w / 2 - span / 2 + i * 16, lampY, 5, 0, Math.PI * 2);
        ctx.strokeStyle = "#d35400";
        ctx.lineWidth = 1.4;
        if (i < done) {
          ctx.fillStyle = "#ffb703";
          ctx.fill();
        }
        ctx.stroke();
      }
    }
    if (state.countText) {
      ctx.textAlign = "center";
      ctx.font = "700 " + Math.round(34 * ui) + "px " + root.FONT_DISPLAY;
      ctx.fillStyle = state.countText === "ノ" ? "#d35400" : palette.ink;
      ctx.fillText(state.countText, state.w / 2, top + 4);
    }
    if (state.ring != null) {
      const clamped = Math.max(0, Math.min(1.15, state.ring));
      const radius = 8 + (1 - Math.min(clamped, 1)) * 36;
      ctx.beginPath();
      ctx.arc(state.w / 2, top + 48 * ui, radius, 0, Math.PI * 2);
      ctx.strokeStyle = clamped >= 1 ? "#d35400" : palette.ink;
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }
    if (state.banner) {
      ctx.textAlign = "center";
      ctx.fillStyle = "#d35400";
      ctx.font = "700 " + Math.round(34 * ui) + "px " + root.FONT_DISPLAY;
      ctx.fillText(state.banner.act, state.w / 2, state.h * 0.42);
      ctx.fillStyle = palette.ink;
      ctx.font = "700 " + Math.round(16 * ui) + "px " + root.FONT_BODY;
      ctx.fillText(state.banner.title, state.w / 2, state.h * 0.42 + 32);
      ctx.font = Math.round(13 * ui) + "px " + root.FONT_BODY;
      ctx.fillText(state.banner.detail, state.w / 2, state.h * 0.42 + 54);
    }
    if (state.debugText) {
      ctx.textAlign = "left";
      ctx.font = "12px " + root.FONT_BODY;
      ctx.fillStyle = palette.ink;
      ctx.fillText(state.debugText, left, state.h - 28);
    }
  }

  function formatPoints(value) {
    return new Intl.NumberFormat("ja-JP").format(value);
  }

  function frame(ctx, state) {
    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    ctx.clearRect(0, 0, state.w, state.h);
    ctx.save();
    const cx = state.w / 2 + Math.sin(state.shakeTime * 40) * state.shake;
    const cy = state.h / 2 + Math.cos(state.shakeTime * 33) * state.shake * 0.5;
    ctx.translate(cx, cy);
    ctx.translate(-state.w / 2, -state.h / 2);
    drawWorld(ctx, state);
    ctx.restore();
    if (state.dim > 0) {
      ctx.fillStyle = "rgba(36,50,74," + state.dim * 0.35 + ")";
      ctx.fillRect(0, 0, state.w, state.h);
    }
    drawHUD(ctx, state);
  }

  root.Draw = { frame: frame, formatPoints: formatPoints, project: project };
})(typeof globalThis !== "undefined" ? globalThis : this);
