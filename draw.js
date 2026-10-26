/* テント、ブランコ、乗り手。座標は物理と同じ上向き。描くときだけ上下を反転する。 */
(function (root) {
  const P = () => root.PALETTE;
  const Physics = () => root.Physics;

  function add(a, b) {
    return { x: a.x + b.x, y: a.y + b.y };
  }
  function sub(a, b) {
    return { x: a.x - b.x, y: a.y - b.y };
  }
  function mul(a, s) {
    return { x: a.x * s, y: a.y * s };
  }
  function norm(v) {
    const length = Math.hypot(v.x, v.y);
    if (length < 0.001) return { x: 0, y: 1 };
    return { x: v.x / length, y: v.y / length };
  }

  function quadPoint(a, b, c, t) {
    const u = 1 - t;
    return {
      x: u * u * a.x + 2 * u * t * b.x + t * t * c.x,
      y: u * u * a.y + 2 * u * t * b.y + t * t * c.y,
    };
  }

  function ensureMotes(state) {
    if (state.motes && state.motesW === state.w && state.motesH === state.h) return;
    const motes = [];
    for (let i = 0; i < 16; i += 1) {
      motes.push({
        x: Math.random() * state.w,
        y: state.h * (0.35 + Math.random() * 0.5),
        r: 0.7 + Math.random() * 0.9,
        a: 0.15 + Math.random() * 0.2,
        phase: Math.random() * Math.PI * 2,
      });
    }
    state.motes = motes;
    state.motesW = state.w;
    state.motesH = state.h;
  }

  function drawPerformer(ctx, H, hip, upRaw, costume, arms, kneeBend, mood, squash, metrics, trail) {
    const up = norm(upRaw);
    const side = { x: up.y, y: -up.x };
    const xScale = 1 + squash * 0.28;
    const yScale = Math.max(0.72, 1 - squash * 0.42);
    const place = (offset) => ({ x: hip.x + offset.x * xScale, y: hip.y + offset.y * yScale });
    const py = (point) => ({ x: point.x, y: H - point.y });

    const shoulder = mul(up, metrics.torso * 0.92);
    const headCenter = mul(up, metrics.torso + metrics.head * 0.2);
    const hands = handPoints(arms, shoulder, up, side, metrics);
    const hipL = mul(side, 3.4);
    const hipR = mul(side, -3.4);
    const kneeL = add(add(hipL, mul(up, -metrics.thigh)), mul(side, kneeBend));
    const kneeR = add(add(hipR, mul(up, -metrics.thigh)), mul(side, -kneeBend * 0.55));
    const footL = add(add(kneeL, mul(up, -metrics.shin)), mul(side, -kneeBend * 0.35));
    const footR = add(add(kneeR, mul(up, -metrics.shin)), mul(side, kneeBend * 0.15));

    if (costume === "flyer" && trail && trail.length > 2) {
      ctx.beginPath();
      trail.forEach((point, index) => {
        const local = py(place(sub(point, hip)));
        if (index === 0) ctx.moveTo(local.x, local.y);
        else ctx.lineTo(local.x, local.y);
      });
      ctx.strokeStyle = P().gold;
      ctx.globalAlpha = 0.75;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    const dress = costume === "flyer" ? P().dress : P().teal;
    const dressDeep = costume === "flyer" ? P().dressDeep : P().tealDeep;
    const flare = costume === "flyer" ? 10 : 7;
    const hem = costume === "flyer" ? 6 : 2;
    const shoulderL = add(shoulder, mul(side, 6.5));
    const shoulderR = add(shoulder, mul(side, -6.5));
    const dressHipL = mul(side, 5.5);
    const dressHipR = mul(side, -5.5);
    const hemL = add(add(dressHipL, mul(side, -flare)), mul(up, -hem));
    const hemR = add(add(dressHipR, mul(side, flare)), mul(up, -hem));
    poly(ctx, H, [place(shoulderL), place(shoulderR), place(dressHipR), place(hemR), place(hemL), place(dressHipL)], dress, dressDeep, 1.5);

    strokeChain(ctx, H, [place(hipL), place(kneeL), place(footL)], dressDeep, 4.2);
    strokeChain(ctx, H, [place(hipR), place(kneeR), place(footR)], dressDeep, 4.2);
    const armColor = costume === "flyer" ? P().skin : P().teal;
    strokeChain(ctx, H, [place(add(shoulder, mul(side, 5))), place(hands[0])], armColor, 3.6);
    strokeChain(ctx, H, [place(add(shoulder, mul(side, -5))), place(hands[1])], armColor, 3.6);

    const head = place(headCenter);
    const headCanvas = py(head);
    ctx.beginPath();
    ctx.arc(headCanvas.x, headCanvas.y, metrics.head, 0, Math.PI * 2);
    ctx.fillStyle = P().skin;
    ctx.fill();

    const bun = place(add(add(headCenter, mul(side, -metrics.head * 0.2)), mul(up, metrics.head * 0.85)));
    const bunCanvas = py(bun);
    ctx.beginPath();
    ctx.ellipse(bunCanvas.x, bunCanvas.y, metrics.head * 0.85, metrics.head * 0.7, 0, 0, Math.PI * 2);
    ctx.fillStyle = P().hair;
    ctx.fill();

    if (costume === "catcher") {
      const origin = add(headCenter, mul(up, metrics.head * 0.95));
      const brim = mul(side, 8);
      poly(
        ctx,
        H,
        [
          place(add(sub(origin, brim), { x: 0, y: -1 })),
          place(add(add(origin, brim), { x: 0, y: -1 })),
          place(add(add(origin, mul(side, 3.5)), { x: 0, y: 7 })),
          place(add(add(origin, mul(side, -3.5)), { x: 0, y: 7 })),
        ],
        P().goldDeep,
        P().gold,
        1
      );
    }

    const look = side.x * 1.4;
    const eyeYScale = mood === "dizzy" ? 0.35 : 1;
    ctx.fillStyle = P().hair;
    [[-2.5 + look, 0.8], [2.5 + look, 0.8]].forEach((eye) => {
      const at = py(place(add(headCenter, { x: eye[0], y: eye[1] })));
      ctx.beginPath();
      ctx.ellipse(at.x, at.y, 1.35, 1.35 * eyeYScale, 0, 0, Math.PI * 2);
      ctx.fill();
    });
    const mouthAt = py(place(headCenter));
    ctx.strokeStyle = P().hair;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    if (mood === "open") {
      ctx.ellipse(mouthAt.x, mouthAt.y + 3.4 * yScale, 1.6, 1.6, 0, 0, Math.PI * 2);
    } else if (mood === "smile") {
      ctx.arc(mouthAt.x, mouthAt.y + 3.2 * yScale, 2.6, Math.PI * 0.15, Math.PI * 0.85, false);
    } else if (mood === "dizzy") {
      ctx.moveTo(mouthAt.x - 3.2, mouthAt.y + 2.4);
      ctx.lineTo(mouthAt.x - 1.2, mouthAt.y + 4.2);
      ctx.moveTo(mouthAt.x + 1.2, mouthAt.y + 2.4);
      ctx.lineTo(mouthAt.x + 3.2, mouthAt.y + 4.2);
    } else {
      ctx.moveTo(mouthAt.x - 2.2, mouthAt.y + 3.2);
      ctx.lineTo(mouthAt.x + 2.2, mouthAt.y + 3.2);
    }
    ctx.stroke();
  }

  function handPoints(style, shoulder, up, side, metrics) {
    if (style.kind === "hold") {
      const reach = mul(up, metrics.torso + metrics.arm);
      return [add(reach, mul(side, 7)), add(reach, mul(side, -7))];
    }
    if (style.kind === "balance") {
      return [
        add(add(shoulder, mul(side, metrics.arm + 12)), mul(up, 3)),
        add(add(shoulder, mul(side, -(metrics.arm + 12))), mul(up, 1)),
      ];
    }
    if (style.kind === "welcome") {
      const lift = metrics.torso * (0.35 + style.amount * 0.95);
      const across = style.toward * (8 + style.amount * metrics.arm * 1.6);
      return [
        { x: across + style.toward * 5, y: lift + metrics.head },
        { x: across - style.toward * 4, y: lift * 0.82 + metrics.torso * 0.4 },
      ];
    }
    if (style.kind === "sprawl") {
      return [add(add(shoulder, mul(side, 18)), mul(up, 1)), add(add(shoulder, mul(side, -16)), mul(up, -6))];
    }
    return [add(add(shoulder, mul(side, 8)), mul(up, -metrics.arm)), add(add(shoulder, mul(side, -8)), mul(up, -metrics.arm * 0.9))];
  }

  function poly(ctx, H, points, fill, stroke, width) {
    ctx.beginPath();
    points.forEach((point, index) => {
      const y = H - point.y;
      if (index === 0) ctx.moveTo(point.x, y);
      else ctx.lineTo(point.x, y);
    });
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = width;
      ctx.stroke();
    }
  }

  function strokeChain(ctx, H, points, color, width) {
    ctx.beginPath();
    points.forEach((point, index) => {
      const y = H - point.y;
      if (index === 0) ctx.moveTo(point.x, y);
      else ctx.lineTo(point.x, y);
    });
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
  }

  function strokeUp(ctx, H, points) {
    ctx.beginPath();
    points.forEach((point, index) => {
      const y = H - point.y;
      if (index === 0) ctx.moveTo(point.x, y);
      else ctx.lineTo(point.x, y);
    });
    ctx.stroke();
  }

  function drawRig(ctx, H, pivot, theta, rope, hot) {
    const center = {
      x: pivot.x + rope * Math.sin(theta),
      y: pivot.y - rope * Math.cos(theta),
    };
    const side = { x: Math.cos(theta), y: Math.sin(theta) };
    const half = 32;
    const endA = add(center, mul(side, half));
    const endB = add(center, mul(side, -half));
    ctx.lineCap = "round";
    ctx.strokeStyle = hot ? P().gold : P().rope;
    ctx.lineWidth = hot ? 2.4 : 1.5;
    strokeUp(ctx, H, [pivot, endA]);
    strokeUp(ctx, H, [pivot, endB]);
    ctx.strokeStyle = hot ? P().goldDeep : P().bar;
    ctx.lineWidth = 6;
    strokeUp(ctx, H, [endA, endB]);
  }

  function drawWorld(ctx, state) {
    const H = state.h;
    const W = state.w;
    const layout = state.layout;
    const palette = P();
    ensureMotes(state);

    const sky = ctx.createLinearGradient(0, H, 0, 0);
    sky.addColorStop(0, palette.floor);
    sky.addColorStop(0.22, palette.horizon);
    sky.addColorStop(0.55, palette.nightMid);
    sky.addColorStop(1, palette.night);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(-10, H - H * 0.58);
    ctx.quadraticCurveTo(W / 2, H - H * 1.08, W + 10, H - H * 0.58);
    ctx.strokeStyle = palette.tentA;
    ctx.lineWidth = Math.max(54, H * 0.16);
    ctx.stroke();

    ctx.beginPath();
    const scallopCount = 14;
    const baseY = H * 0.56;
    for (let i = 0; i < scallopCount; i += 1) {
      const x0 = (W * i) / scallopCount;
      const x1 = (W * (i + 1)) / scallopCount;
      ctx.moveTo(x0, H - baseY);
      ctx.quadraticCurveTo((x0 + x1) / 2, H - (baseY - 16), x1, H - baseY);
    }
    ctx.strokeStyle = palette.gold;
    ctx.lineWidth = 2;
    ctx.stroke();

    const song = state.song || 0;
    const beat = layout.stage.bpm / 60;
    const beatFraction = song * beat - Math.floor(song * beat);
    const pulse = Math.exp(-beatFraction * 6.5);
    const lights = 11;
    for (let i = 0; i < lights; i += 1) {
      const t = (i + 1) / (lights + 1);
      const point = quadPoint(
        { x: -10, y: H * 0.62 },
        { x: W / 2, y: H * 0.98 },
        { x: W + 10, y: H * 0.62 },
        t
      );
      const local = Math.max(0, pulse - i * 0.07);
      ctx.beginPath();
      ctx.arc(point.x, H - point.y, 4.5 * (0.85 + local * 0.55), 0, Math.PI * 2);
      ctx.fillStyle = palette.bulb;
      ctx.globalAlpha = 0.45 + local * 0.55;
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    ctx.fillStyle = palette.audience;
    let x = 18;
    while (x < W - 18) {
      const height = 14 + (Math.floor(x) % 11);
      ctx.beginPath();
      ctx.ellipse(x + 5, H - (layout.groundY - 2 + height / 2), 5, height / 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(x + 5, H - (layout.groundY + height - 1), 3, 3, 0, 0, Math.PI * 2);
      ctx.fill();
      x += 16;
    }

    ctx.fillStyle = palette.floorLip;
    ctx.fillRect(0, H - layout.groundY, W, layout.groundY);

    drawNet(ctx, state);
    drawPedestal(ctx, H, layout.leftPedestal);
    drawPedestal(ctx, H, layout.rightPedestal);
    drawArc(ctx, H, layout.leftPivot, layout.ropeLength, layout.thetaMax);
    drawArc(ctx, H, layout.rightPivot, layout.ropeLength, layout.thetaMax);
    drawMark(ctx, H, Physics().sweetX(layout, -1), layout.pedestalTop, state.direction > 0 ? 0.25 : 0.95, pulse, state.direction < 0);
    drawMark(ctx, H, Physics().sweetX(layout, 1), layout.pedestalTop, state.direction > 0 ? 0.95 : 0.25, pulse, state.direction > 0);

    const spotX = state.spotlightX || W / 2;
    const glow = ctx.createRadialGradient(spotX, H * 0.25, 8, spotX, H * 0.45, W * 0.28);
    glow.addColorStop(0, "rgba(230, 179, 92, 0.22)");
    glow.addColorStop(1, "rgba(230, 179, 92, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);

    state.motes.forEach((mote) => {
      const drift = Math.sin(song * 0.7 + mote.phase) * 10;
      ctx.globalAlpha = mote.a;
      ctx.fillStyle = palette.cream;
      ctx.beginPath();
      ctx.arc(mote.x + drift, H - mote.y, mote.r, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
  }

  function drawPedestal(ctx, H, rect) {
    const top = H - (rect.y + rect.height);
    ctx.fillStyle = P().wood;
    ctx.strokeStyle = P().goldDeep;
    ctx.lineWidth = 2;
    roundRect(ctx, rect.x, top, rect.width, rect.height, 5);
    ctx.fill();
    ctx.stroke();
    roundRect(ctx, rect.x - 6, top - 2, rect.width + 12, 10, 3);
    ctx.fillStyle = P().woodLite;
    ctx.fill();
    ctx.stroke();
  }

  function roundRect(ctx, x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  function drawArc(ctx, H, pivot, rope, thetaMax) {
    ctx.beginPath();
    const steps = 28;
    for (let step = 0; step <= steps; step += 1) {
      const theta = -thetaMax + (2 * thetaMax * step) / steps;
      const x = pivot.x + rope * Math.sin(theta);
      const y = H - (pivot.y - rope * Math.cos(theta));
      if (step === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = "rgba(230, 179, 92, 0.28)";
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }

  function drawMark(ctx, H, x, y, alpha, pulse, hot) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, H - (y + 2));
    ctx.scale(hot ? 1 + pulse * 0.08 : 1, hot ? 1 + pulse * 0.08 : 1);
    ctx.beginPath();
    ctx.ellipse(0, 0, 16, 5, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(230, 179, 92, 0.18)";
    ctx.strokeStyle = P().gold;
    ctx.lineWidth = 1.5;
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function drawNet(ctx, state) {
    const layout = state.layout;
    const left = layout.netMinX;
    const right = layout.netMaxX;
    const H = state.h;
    if (!(right > left + 8)) return;
    const top = layout.hipNetY - layout.metrics.leg * 0.15;
    ctx.beginPath();
    const rows = 5;
    for (let row = 0; row < rows; row += 1) {
      const y = top - row * 7;
      for (let step = 0; step <= 18; step += 1) {
        const t = step / 18;
        const x = left + (right - left) * t;
        const mid = (left + right) / 2;
        const halfSpan = (right - left) / 2;
        const normX = (x - mid) / halfSpan;
        const valley = 1 - normX * normX;
        const local = Math.max(0, 1 - Math.abs(x - state.netSagX) / 80);
        const dip = (10 + row * 1.4) * valley + state.netSag * local;
        const py = H - (y - dip);
        if (step === 0) ctx.moveTo(x, py);
        else ctx.lineTo(x, py);
      }
    }
    const columns = 8;
    for (let column = 1; column < columns; column += 1) {
      const x = left + ((right - left) * column) / columns;
      ctx.moveTo(x, H - (top + 4));
      ctx.lineTo(x, H - (top - 36));
    }
    ctx.strokeStyle = P().net;
    ctx.globalAlpha = 0.75;
    ctx.lineWidth = 1.15;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  function drawStar(ctx, H, x, y, alpha, scale) {
    ctx.save();
    ctx.translate(x, H - y);
    ctx.scale(scale, scale);
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    for (let i = 0; i < 8; i += 1) {
      const angle = (i * Math.PI) / 4 - Math.PI / 2;
      const length = i % 2 === 0 ? 11 : 11 * 0.42;
      const px = Math.cos(angle) * length;
      const py = -Math.sin(angle) * length;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = P().gold;
    ctx.strokeStyle = P().cream;
    ctx.lineWidth = 1;
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function drawHUD(ctx, state) {
    const attract = state.run === "attract";
    const palette = P();
    const ui = Math.min(1, state.h / 390);
    ctx.textBaseline = "middle";
    const left = state.safeX + 8;
    const top = state.safeY + 16;
    if (!attract) {
      ctx.textAlign = "left";
      ctx.font = "600 " + Math.round(15 * ui) + "px " + root.FONT_BODY;
      ctx.fillStyle = palette.cream;
      ctx.fillText(state.layout.stage.act + "  " + state.layout.stage.title, left, top);
      ctx.font = "600 " + Math.round(20 * ui) + "px " + root.FONT_BODY;
      ctx.fillStyle = palette.gold;
      ctx.fillText(formatPoints(state.displayedScore), left, top + 24 * ui);
      if (state.combo > 0) {
        ctx.font = "600 " + Math.round(13 * ui) + "px " + root.FONT_BODY;
        ctx.fillStyle = state.combo >= 3 ? palette.gold : palette.cream;
        ctx.fillText("連続 " + state.combo, left, top + 46 * ui);
      }
      const done = state.records.filter((record) => record.stageIndex === state.stageIndex).length;
      const total = state.layout.stage.flights;
      const span = Math.max(total - 1, 1) * 16;
      const lampY = state.h - state.safeY - 22;
      for (let i = 0; i < total; i += 1) {
        const lx = state.w / 2 - span / 2 + i * 16;
        ctx.beginPath();
        ctx.arc(lx, lampY, 5, 0, Math.PI * 2);
        ctx.strokeStyle = palette.goldDeep;
        ctx.lineWidth = 1.2;
        ctx.stroke();
        if (i < done) {
          ctx.fillStyle = palette.gold;
          ctx.fill();
        }
      }
    }

    if (state.countText) {
      ctx.textAlign = "center";
      ctx.font = "600 " + Math.round(34 * ui) + "px " + root.FONT_DISPLAY;
      ctx.fillStyle = state.countText === "ノ" ? palette.gold : palette.cream;
      ctx.fillText(state.countText, state.w / 2, top + 8);
    }
    if (state.ring != null) {
      const clamped = Math.max(0, Math.min(1.15, state.ring));
      const radius = 8 + (1 - Math.min(clamped, 1)) * 42;
      ctx.beginPath();
      ctx.arc(state.w / 2, top + 52 * ui, radius, 0, Math.PI * 2);
      ctx.strokeStyle = clamped >= 1 ? palette.gold : palette.cream;
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(state.w / 2, top + 52 * ui, clamped >= 1 ? 9 : 7, 0, Math.PI * 2);
      ctx.fillStyle = palette.gold;
      ctx.fill();
    }

    if (state.banner) {
      ctx.textAlign = "center";
      ctx.fillStyle = palette.gold;
      ctx.font = "600 " + Math.round(36 * ui) + "px " + root.FONT_DISPLAY;
      ctx.fillText(state.banner.act, state.w / 2, state.h / 2 - 8);
      ctx.fillStyle = palette.cream;
      ctx.font = "600 " + Math.round(16 * ui) + "px " + root.FONT_BODY;
      ctx.fillText(state.banner.title, state.w / 2, state.h / 2 + 26);
      ctx.font = Math.round(13 * ui) + "px " + root.FONT_BODY;
      ctx.fillText(state.banner.detail, state.w / 2, state.h / 2 + 50);
    }

    if (state.debugText) {
      ctx.textAlign = "left";
      ctx.font = "11px " + root.FONT_BODY;
      ctx.fillStyle = palette.sky;
      ctx.fillText(state.debugText, left, state.h - state.safeY - 8);
    }
  }

  function formatPoints(value) {
    return new Intl.NumberFormat("ja-JP").format(value);
  }

  function frame(ctx, state) {
    const w = state.w;
    const h = state.h;
    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    const cx = w / 2 + Math.sin(state.shakeTime * 46) * state.shake;
    const cy = h / 2 + Math.cos(state.shakeTime * 37) * state.shake * 0.6;
    ctx.translate(cx, cy);
    ctx.scale(state.zoom, state.zoom);
    ctx.translate(-w / 2, -h / 2);
    drawWorld(ctx, state);
    drawActors(ctx, state);
    state.particles.forEach((dot) => {
      ctx.globalAlpha = Math.max(0, 1 - dot.age / dot.life);
      ctx.fillStyle = dot.color;
      ctx.beginPath();
      ctx.arc(dot.x, h - dot.y, Math.max(0.4, dot.r * (1 - 0.8 * (dot.age / dot.life))), 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
    state.popups.forEach((popup) => {
      drawPopup(ctx, state, popup);
    });
    if (state.star) drawStar(ctx, h, state.star.x, state.star.y, state.star.alpha, state.star.scale);
    ctx.restore();

    if (state.dim > 0) {
      ctx.fillStyle = "rgba(0,0,0," + state.dim + ")";
      ctx.fillRect(0, 0, w, h);
    }
    if (state.flash > 0) {
      ctx.fillStyle = "rgba(255,255,255," + state.flash + ")";
      ctx.fillRect(0, 0, w, h);
    }
    drawHUD(ctx, state);
  }

  function drawPopup(ctx, state, popup) {
    const t = popup.age / popup.life;
    const alpha = t < 0.12 ? t / 0.12 : t > 0.72 ? Math.max(0, 1 - (t - 0.72) / 0.28) : 1;
    const scale = t < 0.12 ? 0.7 + 0.35 * (t / 0.12) : 1;
    const rise = t > 0.72 ? ((t - 0.72) / 0.28) * 22 : 0;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(popup.x, state.h - popup.y - rise);
    ctx.scale(scale, scale);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "600 " + popup.size + "px " + root.FONT_DISPLAY;
    ctx.fillStyle = popup.color;
    ctx.fillText(popup.text, 0, 0);
    if (popup.subtitle) {
      ctx.font = "15px " + root.FONT_BODY;
      ctx.fillStyle = P().cream;
      ctx.fillText(popup.subtitle, 0, popup.size * 0.58);
    }
    ctx.restore();
  }

  function drawActors(ctx, state) {
    const layout = state.layout;
    const metrics = layout.metrics;
    const phase = state.phase;
    const H = state.h;
    if (phase.kind === "swing") {
      drawBars(ctx, state, state.direction, phase.start);
      const swing = Physics().makeSwing(layout, state.direction);
      const local = Math.max(0, state.song - phase.start);
      const sample = Physics().sampleAt(swing, local);
      const up = { x: -Math.sin(sample.theta), y: Math.cos(sample.theta) };
      const knee = Math.sin(sample.theta * 2) * 7;
      rememberTrail(state, sample.position);
      drawPerformer(ctx, H, sample.position, up, "flyer", { kind: "hold" }, knee, "focus", state.impact, metrics, state.trail);
      const localBeat = local / Physics().beatDuration(swing);
      const reach = Math.max(0, Math.min(1, localBeat - (root.TUNING.releaseBeat - 1)));
      drawCatchers(ctx, state, reach, null);
      return;
    }
    if (phase.kind === "flying") {
      const anim = phase.anim;
      const releaseOffset = Physics().releaseTime(Physics().makeSwing(layout, state.direction)) + anim.offsetMs / 1000;
      drawBars(ctx, state, state.direction, anim.start - releaseOffset);
      const elapsed = Math.min(Math.max(0, state.song - anim.start), anim.landing.time);
      const hip = Physics().positionAt(anim.sample, anim.gravity, elapsed);
      const velocity = {
        x: anim.sample.velocity.x,
        y: anim.sample.velocity.y - anim.gravity * elapsed,
      };
      const spun = rotate(norm(velocity), anim.spin * elapsed);
      rememberTrail(state, hip);
      drawPerformer(ctx, H, hip, spun, "flyer", { kind: "balance" }, 5, anim.judgement === "miss" ? "dizzy" : "open", state.impact, metrics, state.trail);
      drawCatchers(ctx, state, 1, null);
      return;
    }
    if (phase.kind === "between") {
      if (phase.swingOrigin != null && phase.pose.kind === "onBar") {
        drawBars(ctx, state, state.direction, phase.swingOrigin);
        const swing = Physics().makeSwing(layout, state.direction);
        const sample = Physics().sampleAt(swing, Math.max(0, state.song - phase.swingOrigin));
        rememberTrail(state, sample.position);
        drawPerformer(
          ctx,
          H,
          sample.position,
          { x: -Math.sin(sample.theta), y: Math.cos(sample.theta) },
          "flyer",
          { kind: "hold" },
          2,
          "dizzy",
          state.impact,
          metrics,
          state.trail
        );
      } else {
        drawBars(ctx, state, null, null);
        const pose = phase.pose;
        if (pose.kind === "caught") {
          state.trail = [];
          drawPerformer(ctx, H, { x: pose.x, y: layout.hipPlatformY }, { x: 0, y: 1 }, "flyer", { kind: "down" }, 0, "smile", state.impact, metrics, null);
        } else if (pose.kind === "net") {
          state.trail = [];
          drawPerformer(ctx, H, { x: pose.x, y: layout.hipNetY }, { x: state.direction * 0.85, y: 0.3 }, "flyer", { kind: "sprawl" }, 8, "dizzy", state.impact, metrics, null);
        } else if (pose.kind === "fallen") {
          state.trail = [];
          const x = Math.min(Math.max(pose.x, 20), state.w - 20);
          drawPerformer(ctx, H, { x: x, y: layout.groundY + metrics.leg * 0.4 }, { x: state.direction * 0.2, y: 0.4 }, "flyer", { kind: "sprawl" }, 4, "dizzy", state.impact, metrics, null);
        }
      }
      const caughtSide = phase.pose.kind === "caught" ? state.direction : null;
      drawCatchers(ctx, state, caughtSide == null ? 0.15 : 1, caughtSide);
      return;
    }
    drawBars(ctx, state, null, null);
    const foot = layout.leftPedestal.x + layout.leftPedestal.width * 0.76;
    state.trail = [];
    drawPerformer(ctx, H, { x: foot, y: layout.hipPlatformY }, { x: 0, y: 1 }, "flyer", { kind: "down" }, 0, "focus", 0, metrics, null);
    drawCatchers(ctx, state, 0.12, null);
  }

  function rememberTrail(state, hip) {
    state.trail.push({ x: hip.x, y: hip.y });
    if (state.trail.length > 7) state.trail.splice(0, state.trail.length - 7);
  }

  function drawCatchers(ctx, state, reach, caughtSide) {
    const layout = state.layout;
    const metrics = layout.metrics;
    const leftReach = state.direction < 0 ? reach : 0.08;
    const rightReach = state.direction > 0 ? reach : 0.08;
    drawPerformer(
      ctx,
      state.h,
      { x: Physics().catcherX(layout, true), y: layout.hipPlatformY },
      { x: 0, y: 1 },
      "catcher",
      { kind: "welcome", amount: leftReach, toward: 1 },
      0,
      caughtSide != null && caughtSide < 0 ? "smile" : "focus",
      0,
      metrics,
      null
    );
    drawPerformer(
      ctx,
      state.h,
      { x: Physics().catcherX(layout, false), y: layout.hipPlatformY },
      { x: 0, y: 1 },
      "catcher",
      { kind: "welcome", amount: rightReach, toward: -1 },
      0,
      caughtSide != null && caughtSide > 0 ? "smile" : "focus",
      0,
      metrics,
      null
    );
  }

  function drawBars(ctx, state, active, swingStart) {
    const layout = state.layout;
    let leftTheta = Math.sin(state.song * 1.5 + 0.4) * 0.08;
    let rightTheta = Math.sin(state.song * 1.5 + 1.2) * 0.08;
    let hotLeft = false;
    let hotRight = false;
    if (active != null && swingStart != null) {
      const theta = Physics().motion(Physics().makeSwing(layout, active), Math.max(0, state.song - swingStart)).theta;
      if (active > 0) {
        leftTheta = theta;
        hotLeft = true;
      } else {
        rightTheta = theta;
        hotRight = true;
      }
    }
    drawRig(ctx, state.h, layout.leftPivot, leftTheta, layout.ropeLength, hotLeft);
    drawRig(ctx, state.h, layout.rightPivot, rightTheta, layout.ropeLength, hotRight);
  }

  function rotate(vector, radians) {
    const c = Math.cos(radians);
    const s = Math.sin(radians);
    return { x: vector.x * c - vector.y * s, y: vector.x * s + vector.y * c };
  }

  root.Draw = { frame: frame, formatPoints: formatPoints };
})(typeof globalThis !== "undefined" ? globalThis : this);
