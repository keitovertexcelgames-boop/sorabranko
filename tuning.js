/* 空中ブランコ Web 版のつまみ。数値は Trapeze/Game/GameTuning.swift と同じ。 */
(function (root) {
  const thetaMaxDegrees = 69;
  const thetaMaxRadians = (thetaMaxDegrees * Math.PI) / 180;
  const thetaIdealRadians = thetaMaxRadians * Math.SQRT1_2;

  root.TUNING = {
    releaseBeat: 3,
    earliestTapBeat: 0.35,
    lateGraceBeats: 0.42,
    perfectWindow: 0.048,
    greatWindow: 0.095,
    goodWindow: 0.155,
    presentationDelay: 0,
    thetaMaxDegrees: thetaMaxDegrees,
    thetaMaxRadians: thetaMaxRadians,
    thetaIdealRadians: thetaIdealRadians,
    ropeLengthRatio: 0.41,
    velocityScale: 1.9,
    gravitySearchMin: 120,
    gravitySearchMax: 6000,
    perfectPoints: 1000,
    greatPoints: 700,
    goodPoints: 400,
    missPoints: 0,
    landingPointsMax: 500,
    netConsolation: 80,
    comboStep: 0.25,
    comboCap: 8,
    stageCatchBonus: 300,
    showDebug: false,
    stages: [
      { act: "第1幕", title: "朝稽古", bpm: 92, flights: 4, flightDistanceRatio: 0.42, platformHalfRatio: 0.104 },
      { act: "第2幕", title: "夕暮れ興行", bpm: 108, flights: 4, flightDistanceRatio: 0.5, platformHalfRatio: 0.078 },
      { act: "第3幕", title: "大団円", bpm: 124, flights: 4, flightDistanceRatio: 0.57, platformHalfRatio: 0.06 },
    ],
  };

  root.PALETTE = {
    night: "#140c12",
    nightMid: "#3a182c",
    horizon: "#6e3044",
    floor: "#2a1814",
    floorLip: "#120c0a",
    tentA: "#7c2436",
    tentB: "#4c1524",
    gold: "#e6b35c",
    goldDeep: "#a67a32",
    cream: "#f3e6d0",
    rope: "#c6a36e",
    bar: "#8b5a32",
    net: "rgba(240, 224, 188, 0.85)",
    wood: "#3b2420",
    woodLite: "#5a3a30",
    sky: "#8ec8e0",
    miss: "#e07a7a",
    dress: "#c4313f",
    dressDeep: "#7a1c2c",
    skin: "#f0c8a8",
    hair: "#1a1014",
    teal: "#1f6f78",
    tealDeep: "#134850",
    audience: "#12080e",
    bulb: "#ffe1ae",
    burgundy: "#7c2436",
  };

  root.FONT_DISPLAY = '"Hiragino Mincho ProN", "Yu Mincho", "YuMincho", "Noto Serif CJK JP", "WenQuanYi Micro Hei", serif';
  root.FONT_BODY = '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic", "YuGothic", "Noto Sans CJK JP", "WenQuanYi Micro Hei", sans-serif';
})(typeof globalThis !== "undefined" ? globalThis : this);
