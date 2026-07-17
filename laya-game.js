(() => {
  const W = 414;
  const H = 736;
  const horizonY = 246;
  const roadBottomY = 736;
  const laneOffsets = [-1, 0, 1];
  const laneBoundaryOffsets = [-1.5, -0.5, 0.5, 1.5];
  const keyMap = new Map();
  const APP_VERSION = "20260717-notice-fallback";
  const ACTIVITY_SHARE_URL = `https://show.jd.com/n/QwMWVE53XAodKr0x/?pageKey=QwMWVE53XAodKr0x&v=${APP_VERSION}`;
  const SHARE_THUMB_URL = "https://m.360buyimg.com/babel/jfs/t16171/127/2505983508/7852/4cfd7bdf/5abc8954N23307760.png";
  const LEADERBOARD_VERSION = APP_VERSION;
  const ASSETS_VERSION = "20260615-zongzi-refresh";
  const GAME_AUDIO_VOLUME = 0.12;
  const TARGET_FRAME_MS = 1000 / 60;
  const DOM_EFFECT_FRAME_MS = 1000 / 15;
  const LOW_PERF_DOM_EFFECT_FRAME_MS = 1000 / 10;
  const FRAME_DROP_MS = 42;
  const FRAME_DROP_LIMIT = 18;
  const MAX_ACTIVE_ITEMS = 24;
  const MAX_PARTICLES = 48;
  const SCORE_RULES = {
    distanceFactor: 0.03,
    zongzi: 30,
    gold: 60,
  };

  const playerHitbox = {
    centerY: 620,
    halfWidth: 34,
    halfHeight: 78,
    frontHalfHeight: 50,
  };
  const itemHitboxes = {
    zongzi: { rx: 19, ry: 22 },
    gold: { rx: 24, ry: 28 },
    log: { rx: 36, ry: 15 },
    rock: { rx: 27, ry: 22 },
    whirlpool: { rx: 29, ry: 15 },
  };
  const obstacleTypes = new Set(["log", "rock", "whirlpool"]);
  const dragFollowThreshold = 0.5;
  const dragCommitThreshold = 2;
  const dragVerticalSlack = 6;

  const state = {
    mode: "ready",
    lane: 1,
    targetLane: 1,
    x: 207,
    score: 0,
    distance: 0,
    zongzi: 0,
    speed: 205,
    spawnTimer: 0,
    bgOffset: 0,
    introTime: 0,
    safeTime: 1.6,
    items: [],
    particles: [],
    lives: 2,
    hitCooldown: 0,
    hitShake: 0,
    heldDirection: 0,
    nextHeldMove: 0,
    pointerActive: false,
    pointerMoved: false,
    dragControl: false,
    nativePointerId: null,
    nativeTouchId: null,
    startX: 0,
    startY: 0,
    dragStartBoatX: 207,
  };

  Laya.Config.isAntialias = false;
  Laya.init(W, H);
  Laya.stage.bgColor = null;
  Laya.stage.scaleMode = Laya.Stage.SCALE_NOSCALE;
  Laya.stage.screenMode = Laya.Stage.SCREEN_VERTICAL;
  Laya.stage.alignH = Laya.Stage.ALIGN_LEFT;
  Laya.stage.alignV = Laya.Stage.ALIGN_TOP;

  const root = document.getElementById("laya-root");
  let rootScale = root ? root.clientWidth / W : 1;
  const startOverlay = document.getElementById("startOverlay");
  const startGameBtn = document.getElementById("startGameBtn");
  const resultOverlay = document.getElementById("resultOverlay");
  const restartGameBtn = document.getElementById("restartGameBtn");
  const leaderboardBtn = document.getElementById("leaderboardBtn");
  const floatingLeaderboardBtn = document.getElementById("floatingLeaderboardBtn");
  const leaderboardOverlay = document.getElementById("leaderboardOverlay");
  const leaderboardFrame = document.getElementById("leaderboardFrame");
  const leaderboardLoading = document.getElementById("leaderboardLoading");
  const shareBtn = document.getElementById("shareBtn");
  const rulesOverlay = document.getElementById("rulesOverlay");
  const rulesBtn = document.getElementById("rulesBtn");
  const rulesCloseBtn = document.getElementById("rulesCloseBtn");
  const prizeOverlay = document.getElementById("prizeOverlay");
  const prizeBtn = document.getElementById("prizeBtn");
  const prizeCloseBtn = document.getElementById("prizeCloseBtn");
  const noticeOverlay = document.getElementById("noticeOverlay");
  const noticeBtn = document.getElementById("noticeBtn");
  const noticeFromRulesBtn = document.getElementById("noticeFromRulesBtn");
  const floatingNoticeBtn = document.getElementById("floatingNoticeBtn");
  const noticeCloseBtn = document.getElementById("noticeCloseBtn");
  const noticeOfficialBoat = document.getElementById("noticeOfficialBoat");
  const gameBgm = document.getElementById("gameBgm");
  const rewardSfx = document.getElementById("rewardSfx");
  const collisionSfx = document.getElementById("collisionSfx");
  const domHud = {
    score: document.getElementById("hudScore"),
    distance: document.getElementById("hudDistance"),
    zongzi: document.getElementById("hudZongzi"),
    heartA: document.getElementById("hudHeartA"),
    heartB: document.getElementById("hudHeartB"),
  };
  const domResult = {
    score: document.getElementById("resultScore"),
    distance: document.getElementById("resultDistance"),
    zongzi: document.getElementById("resultZongzi"),
  };
  if (root && Laya.Browser.container) root.appendChild(Laya.Browser.container);
  if (root) {
    bindNativeControls(root);
  }
  let laneBuoys = [];
  let wakeGif = null;
  let boatGif = null;

  const scene = new Laya.Sprite();
  Laya.stage.addChild(scene);

  let renderedLives = -1;
  let renderedScore = -1;
  let renderedDistance = -1;
  let renderedZongzi = -1;
  let renderedBoatMode = "";
  let renderedBoatFilter = "";
  let renderedBoatDuration = "";
  let lowPerformanceMode = false;
  let droppedFrameCount = 0;
  let domEffectFrameMs = DOM_EFFECT_FRAME_MS;
  let leaderboardReleaseTimer = 0;
  let lastStaticRenderMode = "";
  let pageHidden = document.hidden;
  let resumeBgmOnVisible = false;
  let boatGifLoaded = false;

  state.items = createOpeningItems();
  state.x = playerLaneX(1);
  updateUi();

  if (startGameBtn) startGameBtn.addEventListener("click", resetGame);
  if (restartGameBtn) restartGameBtn.addEventListener("click", resetGame);
  if (leaderboardBtn) leaderboardBtn.addEventListener("click", openLeaderboardOverlay);
  if (floatingLeaderboardBtn) {
    floatingLeaderboardBtn.addEventListener("pointerdown", stopGameInput);
    floatingLeaderboardBtn.addEventListener("touchstart", stopGameInput, { passive: true });
    floatingLeaderboardBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      openLeaderboardOverlay();
    });
  }
  if (floatingNoticeBtn) {
    floatingNoticeBtn.addEventListener("pointerdown", stopGameInput);
    floatingNoticeBtn.addEventListener("touchstart", stopGameInput, { passive: true });
    floatingNoticeBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      openNoticeOverlay();
    });
  }
  if (shareBtn) shareBtn.addEventListener("click", shareResult);
  bindReliableTap(rulesBtn, openRulesOverlay);
  bindReliableTap(rulesCloseBtn, closeRulesOverlay);
  bindReliableTap(noticeBtn, openNoticeOverlay);
  bindReliableTap(noticeFromRulesBtn, openNoticeOverlay);
  bindReliableTap(noticeCloseBtn, closeNoticeOverlay);
  if (prizeBtn) bindReliableTap(prizeBtn, openPrizeOverlay);
  if (prizeCloseBtn) bindReliableTap(prizeCloseBtn, closePrizeOverlay);
  window.addEventListener("message", (event) => {
    if (leaderboardFrame && event.source !== leaderboardFrame.contentWindow) return;
    if (event.data && event.data.type === "dragonboat:closeLeaderboard") closeLeaderboardOverlay();
    if (event.data && event.data.type === "dragonboat:share") shareResult();
  });
  if (leaderboardFrame && leaderboardLoading) {
    leaderboardFrame.addEventListener("load", () => {
      if (leaderboardFrame.getAttribute("src") && leaderboardFrame.getAttribute("src") !== "about:blank") {
        leaderboardFrame.dataset.loaded = "1";
      }
      leaderboardLoading.classList.add("is-hidden");
    });
  }
  document.addEventListener("keydown", onKeyDown);
  document.addEventListener("keyup", onKeyUp);
  document.addEventListener("visibilitychange", handleVisibilityChange);
  window.addEventListener("resize", refreshRootScale, { passive: true });

  let lastTime = performance.now();
  let lastFrameTime = lastTime;
  let lastDomEffectTime = 0;
  Laya.timer.frameLoop(1, null, () => {
    if (pageHidden) return;
    const now = performance.now();
    const elapsed = now - lastFrameTime;
    if (elapsed < TARGET_FRAME_MS) return;
    updatePerformanceMode(elapsed);
    const dt = Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;
    lastFrameTime = now;
    const isAnimating = state.mode === "playing" || state.mode === "intro";
    if (!isAnimating) {
      if (lastStaticRenderMode !== state.mode) {
        render();
        updateLaneBuoys();
        updateWakeGif();
        updateBoatGif();
        lastStaticRenderMode = state.mode;
      }
      return;
    }
    lastStaticRenderMode = "";
    update(dt);
    render();
    if (now - lastDomEffectTime >= domEffectFrameMs) {
      updateLaneBuoys();
      updateWakeGif();
      lastDomEffectTime = now;
    }
    updateBoatGif();
  });

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function refreshRootScale() {
    if (!root) return;
    rootScale = root.clientWidth / W;
    lastStaticRenderMode = "";
  }

  function handleVisibilityChange() {
    pageHidden = document.hidden;
    document.documentElement.classList.toggle("is-page-hidden", pageHidden);
    if (pageHidden) {
      resumeBgmOnVisible = Boolean(gameBgm && !gameBgm.paused);
      gameBgm?.pause();
      return;
    }
    const now = performance.now();
    lastTime = now;
    lastFrameTime = now;
    lastStaticRenderMode = "";
    if (resumeBgmOnVisible && (state.mode === "playing" || state.mode === "intro")) startBgm();
    resumeBgmOnVisible = false;
  }

  function stopGameInput(event) {
    event.stopPropagation();
  }

  function updatePerformanceMode(elapsed) {
    if (state.mode !== "playing" && state.mode !== "intro") return;
    if (elapsed > FRAME_DROP_MS) droppedFrameCount += 1;
    else droppedFrameCount = Math.max(0, droppedFrameCount - 1);
    if (lowPerformanceMode || droppedFrameCount < FRAME_DROP_LIMIT) return;
    lowPerformanceMode = true;
    domEffectFrameMs = LOW_PERF_DOM_EFFECT_FRAME_MS;
    document.documentElement.classList.add("is-low-performance");
  }

  function bindReliableTap(target, handler) {
    if (!target) return;
    let lastTapTime = 0;
    const activate = (event) => {
      event.stopPropagation();
      if (event.cancelable) event.preventDefault();
      const now = performance.now();
      if (now - lastTapTime < 350) return;
      lastTapTime = now;
      handler(event);
    };
    target.addEventListener("click", activate);
    target.addEventListener("touchend", activate, { passive: false });
  }

  function startBgm() {
    if (!gameBgm) return;
    ensureAudioSource(gameBgm);
    gameBgm.loop = true;
    gameBgm.volume = GAME_AUDIO_VOLUME;
    if (!gameBgm.paused) return;
    gameBgm.play().catch(() => {
      // Browsers may block audio until a direct user gesture.
    });
  }

  function playRewardSfx() {
    if (!rewardSfx) return;
    ensureAudioSource(rewardSfx);
    rewardSfx.volume = GAME_AUDIO_VOLUME;
    rewardSfx.currentTime = 0;
    rewardSfx.play().catch(() => {
      // Sound effects also depend on the browser's audio gesture policy.
    });
  }

  function playCollisionSfx() {
    if (!collisionSfx) return;
    ensureAudioSource(collisionSfx);
    collisionSfx.volume = GAME_AUDIO_VOLUME;
    collisionSfx.currentTime = 0;
    collisionSfx.play().catch(() => {
      // Sound effects also depend on the browser's audio gesture policy.
    });
  }

  function ensureAudioSource(audio) {
    if (!audio || audio.getAttribute("src")) return;
    const src = audio.dataset.src;
    if (src) audio.setAttribute("src", src);
  }

  function depthAt(y) {
    return clamp((y - horizonY) / (roadBottomY - horizonY), 0, 1);
  }

  function easeDepth(y) {
    const t = depthAt(y);
    return t * t * (3 - 2 * t);
  }

  function laneSpreadAt(y) {
    return 24 + easeDepth(y) * 90;
  }

  function laneXAt(lane, y) {
    return 207 + laneOffsets[lane] * laneSpreadAt(y);
  }

  function laneBoundaryXAt(boundary, y) {
    return 207 + boundary * laneSpreadAt(y);
  }

  function itemLaneOffsetX(lane, y) {
    const t = easeDepth(y);
    if (lane === 0) return -(10 + t * 18);
    if (lane === 1) return -(4 + t * 8);
    return 0;
  }

  function playerLaneX(lane) {
    return laneXAt(lane, 625);
  }

  function playerMinX() {
    return playerLaneX(0);
  }

  function playerMaxX() {
    return playerLaneX(2);
  }

  function nearestPlayerLane(x) {
    const centers = [playerLaneX(0), playerLaneX(1), playerLaneX(2)];
    return centers.reduce((best, center, index) => Math.abs(x - center) < Math.abs(x - centers[best]) ? index : best, 0);
  }

  function worldScaleAt(y) {
    return 0.2 + easeDepth(y) * 1.16;
  }

  function scoreSpeedLevel(score) {
    const earlyLevel = 1.2 + score / 360;
    if (score < 1800) return earlyLevel;
    return Math.min(10.8, 6.2 + (score - 1800) / 700);
  }

  function targetSpeedForScore(score) {
    return Math.min(430, 205 + scoreSpeedLevel(score) * 18);
  }

  function spawnIntervalForScore(score, safeOnly) {
    if (safeOnly) return 0.72;
    const earlyPressure = Math.min(1, score / 1200);
    return Math.max(0.42, 0.88 - scoreSpeedLevel(score) * 0.052 - earlyPressure * 0.12);
  }

  function extraObstacleChanceForScore(score) {
    if (score < 3000) return 0;
    return Math.min(0.38, 0.08 + (score - 3000) / 4500);
  }

  function randomObstacleType(score) {
    const hardBias = Math.min(0.16, scoreSpeedLevel(score) * 0.018);
    const roll = Math.random();
    if (roll < 0.43 - hardBias) return "log";
    if (roll < 0.66) return "rock";
    return "whirlpool";
  }

  function boatAnimationDurationForScore(score) {
    return Math.max(0.32, 0.78 - scoreSpeedLevel(score) * 0.065);
  }

  function laneFromPoint(x, y) {
    const centers = [laneXAt(0, y), laneXAt(1, y), laneXAt(2, y)];
    return centers.reduce((best, center, index) => Math.abs(x - center) < Math.abs(x - centers[best]) ? index : best, 0);
  }

  function createOpeningItems() {
    const ySlots = [286, 350, 486, 548];
    let lastLane = -1;
    return ySlots.map((y, index) => {
      let lane = Math.floor(Math.random() * 3);
      if (lane === lastLane && Math.random() < 0.62) lane = (lane + 1 + Math.floor(Math.random() * 2)) % 3;
      lastLane = lane;
      return {
        type: Math.random() < 0.14 && index > 0 ? "gold" : "zongzi",
        lane,
        y,
        prevY: y,
        hit: false,
        spin: Math.random() * Math.PI,
      };
    });
  }

  function resetGame() {
    startBgm();
    ensureMotionAssets();
    Object.assign(state, {
      mode: "playing",
      lane: 1,
      targetLane: 1,
      x: playerLaneX(1),
      score: 0,
      distance: 0,
      zongzi: 0,
      speed: 205,
      spawnTimer: 0,
      bgOffset: 0,
      introTime: 0,
      safeTime: 1.6,
      items: createOpeningItems(),
      particles: [],
      lives: 2,
      hitCooldown: 0,
      hitShake: 0,
      heldDirection: 0,
      nextHeldMove: 0,
      pointerActive: false,
      pointerMoved: false,
      dragControl: false,
      nativePointerId: null,
      nativeTouchId: null,
      dragStartBoatX: playerLaneX(1),
    });
    if (startOverlay) startOverlay.classList.add("is-hidden");
    if (resultOverlay) resultOverlay.classList.add("is-hidden");
    beginOpeningAnimation();
    updateUi();
  }

  function ensureMotionAssets() {
    if (!laneBuoys.length) laneBuoys = createLaneBuoys();
    if (!wakeGif) wakeGif = createWakeGif();
    if (!boatGif) boatGif = createBoatGif();
  }

  function beginOpeningAnimation() {
    state.mode = "intro";
    state.introTime = 0;
    state.lane = 1;
    state.targetLane = 1;
    state.x = playerLaneX(1);
    state.heldDirection = 0;
    keyMap.clear();
  }

  function finishGame() {
    state.mode = "over";
    if (domResult.score) domResult.score.textContent = Math.floor(state.score).toLocaleString("zh-CN");
    if (domResult.distance) domResult.distance.textContent = `${Math.floor(state.distance).toLocaleString("zh-CN")}米`;
    if (domResult.zongzi) domResult.zongzi.textContent = state.zongzi.toLocaleString("zh-CN");
    if (window.DragonBoatScoreApi?.writeUploadLog) {
      window.DragonBoatScoreApi.writeUploadLog("game:finish", {
        score: Math.floor(state.score),
        distance: Math.floor(state.distance),
        zongzi: state.zongzi,
        gameCode: window.DragonBoatScoreApi.getGameCode(),
      });
    }
    saveLeaderboardScore();
    reportScoreToGateway();
    if (resultOverlay) resultOverlay.classList.remove("is-hidden");
  }

  function saveLeaderboardScore() {
    const currentScore = Math.floor(state.score);
    let previousBest = 0;
    try {
      previousBest = Number(localStorage.getItem("dragonboatMyBestScore") || 0);
    } catch {
      previousBest = 0;
    }
    let cachedProfile = null;
    try {
      cachedProfile = JSON.parse(localStorage.getItem("dragonboatMyProfile") || "null");
    } catch {
      cachedProfile = null;
    }
    const isNewBest = currentScore > previousBest;
    const entry = {
      id: "me",
      name: cachedProfile?.nickName || "我",
      avatar: cachedProfile?.avatar || "",
      uid: cachedProfile?.uid || "",
      score: currentScore,
      distance: Math.floor(state.distance),
      zongzi: state.zongzi,
      previousBest,
      isNewBest,
      time: Date.now(),
    };
    try {
      const allScores = JSON.parse(localStorage.getItem("dragonboatLeaderboardAll") || "[]")
        .concat(entry)
        .sort((a, b) => b.score - a.score)
        .slice(0, 500);
      localStorage.setItem("dragonboatLeaderboardAll", JSON.stringify(allScores));
      localStorage.setItem("dragonboatLeaderboard", JSON.stringify(allScores.slice(0, 50)));
      localStorage.setItem("dragonboatLatestScore", JSON.stringify(entry));
      if (isNewBest) {
        localStorage.setItem("dragonboatMyBestScore", String(currentScore));
      }
    } catch {
      // Local storage can be unavailable in some embedded browsers.
    }
  }

  async function reportScoreToGateway() {
    if (!window.DragonBoatScoreApi) return;
    try {
      const currentScore = Math.floor(state.score);
      window.DragonBoatScoreApi.writeUploadLog?.("reportScoreToGateway:start", {
        score: currentScore,
        gameCode: window.DragonBoatScoreApi.getGameCode(),
        hasReadablePin: Boolean(window.DragonBoatScoreApi.getPlayerPin()),
      });
      const result = await window.DragonBoatScoreApi.reportScore(currentScore);
      const identity = result.reportIdentity || {};
      const pin = identity.pin || window.DragonBoatScoreApi.getPlayerPin() || "";
      const gameCode = result.reportGameCode || window.DragonBoatScoreApi.getGameCode();
      localStorage.setItem("dragonboatLastReportResult", JSON.stringify({
        ok: true,
        gameCode,
        score: currentScore,
        usedPin: Boolean(pin),
        sentPin: Boolean(identity.pin),
        identitySource: identity.source || "",
        time: Date.now(),
      }));
      window.DragonBoatScoreApi.writeUploadLog?.("reportScoreToGateway:success", {
        gameCode,
        score: currentScore,
        usedPin: Boolean(pin),
        sentPin: Boolean(identity.pin),
        identitySource: identity.source || "",
      });
      const prevBest = Number(localStorage.getItem("dragonboatMyBestScore") || 0);
      if (currentScore > prevBest) {
        localStorage.setItem("dragonboatMyBestScore", String(currentScore));
      }
      if (pin) {
        localStorage.setItem("dragonboatMyPin", pin);
      }
    } catch (error) {
      const gameCode = window.DragonBoatScoreApi.getGameCode();
      localStorage.setItem("dragonboatLastReportResult", JSON.stringify({
        ok: false,
        gameCode,
        skipped: Boolean(error.skipReport),
        msg: error.message || "接口调用失败",
        payload: error.payload || null,
        time: Date.now(),
      }));
      window.DragonBoatScoreApi.writeUploadLog?.("reportScoreToGateway:error", {
        gameCode,
        skipped: Boolean(error.skipReport),
        message: error.message || "接口调用失败",
        payload: error.payload || null,
      });
    }
  }

  let modeBeforeLeaderboard = "";
  let modeBeforeRules = "";
  let modeBeforeNotice = "";

  function openLeaderboardOverlay() {
    if (!leaderboardOverlay || !leaderboardFrame) {
      window.location.href = `./leaderboard.html?v=${LEADERBOARD_VERSION}`;
      return;
    }
    if (leaderboardReleaseTimer) {
      clearTimeout(leaderboardReleaseTimer);
      leaderboardReleaseTimer = 0;
    }
    if (leaderboardOverlay.classList.contains("is-hidden")) {
      modeBeforeLeaderboard = state.mode;
      if (state.mode === "playing" || state.mode === "intro") {
        state.mode = "paused";
        state.heldDirection = 0;
        state.pointerActive = false;
        state.dragControl = false;
        updateUi();
      }
    }
    if (leaderboardFrame.dataset.loaded === "1") {
      if (leaderboardLoading) leaderboardLoading.classList.add("is-hidden");
      leaderboardFrame.contentWindow?.postMessage({ type: "dragonboat:refreshLeaderboard" }, "*");
    } else {
      if (leaderboardLoading) leaderboardLoading.classList.remove("is-hidden");
      leaderboardFrame.src = `./leaderboard.html?v=${LEADERBOARD_VERSION}&embedded=1`;
    }
    leaderboardOverlay.classList.remove("is-hidden");
  }

  function closeLeaderboardOverlay() {
    if (!leaderboardOverlay) return;
    leaderboardOverlay.classList.add("is-hidden");
    if (leaderboardLoading) leaderboardLoading.classList.add("is-hidden");
    if (state.mode === "paused" && (modeBeforeLeaderboard === "playing" || modeBeforeLeaderboard === "intro")) {
      state.mode = modeBeforeLeaderboard;
      updateUi();
    }
    modeBeforeLeaderboard = "";
    leaderboardReleaseTimer = window.setTimeout(() => {
      if (!leaderboardFrame || !leaderboardOverlay.classList.contains("is-hidden")) return;
      delete leaderboardFrame.dataset.loaded;
      leaderboardFrame.src = "about:blank";
      if (leaderboardLoading) leaderboardLoading.classList.add("is-hidden");
    }, 30000);
  }

  function openRulesOverlay() {
    if (!rulesOverlay) return;
    modeBeforeRules = state.mode;
    if (state.mode === "playing" || state.mode === "intro") {
      state.mode = "paused";
      state.heldDirection = 0;
      state.pointerActive = false;
      state.dragControl = false;
      updateUi();
    }
    rulesOverlay.classList.remove("is-hidden");
  }

  function closeRulesOverlay() {
    if (!rulesOverlay) return;
    rulesOverlay.classList.add("is-hidden");
    if (state.mode === "paused" && (modeBeforeRules === "playing" || modeBeforeRules === "intro")) {
      state.mode = modeBeforeRules;
      updateUi();
    }
    modeBeforeRules = "";
  }

  function openNoticeOverlay() {
    if (!noticeOverlay) return;
    if (noticeOfficialBoat && !noticeOfficialBoat.getAttribute("src")) {
      const src = noticeOfficialBoat.dataset.src;
      if (src) noticeOfficialBoat.setAttribute("src", src);
    }
    if (noticeOverlay.classList.contains("is-hidden")) {
      modeBeforeNotice = state.mode;
      if (state.mode === "playing" || state.mode === "intro") {
        state.mode = "paused";
        state.heldDirection = 0;
        state.pointerActive = false;
        state.dragControl = false;
        updateUi();
      }
    }
    noticeOverlay.classList.remove("is-hidden");
  }

  function closeNoticeOverlay() {
    if (!noticeOverlay) return;
    noticeOverlay.classList.add("is-hidden");
    const rulesStillOpen = rulesOverlay && !rulesOverlay.classList.contains("is-hidden");
    if (!rulesStillOpen && state.mode === "paused" && (modeBeforeNotice === "playing" || modeBeforeNotice === "intro")) {
      state.mode = modeBeforeNotice;
      updateUi();
    }
    modeBeforeNotice = "";
  }

  let modeBeforePrize = "";
  function openPrizeOverlay() {
    if (!prizeOverlay) return;
    modeBeforePrize = state.mode;
    if (state.mode === "playing" || state.mode === "intro") {
      state.mode = "paused";
      state.heldDirection = 0;
      state.pointerActive = false;
      state.dragControl = false;
      updateUi();
    }
    prizeOverlay.classList.remove("is-hidden");
  }

  function closePrizeOverlay() {
    if (!prizeOverlay) return;
    prizeOverlay.classList.add("is-hidden");
    if (state.mode === "paused" && (modeBeforePrize === "playing" || modeBeforePrize === "intro")) {
      state.mode = modeBeforePrize;
      updateUi();
    }
    modeBeforePrize = "";
  }

  async function shareResult() {
    const score = Math.floor(state.score);
    const distance = Math.floor(state.distance);
    const zongzi = state.zongzi;
    const text = `我在端午龙舟冲刺赛中获得了${score}分！划行${distance}米，收集${zongzi}个粽子，快来挑战我吧！`;
    const jrBridge = await waitForJrBridge();

    if (jrBridge) {
      await callJrBridgeShare(text, jrBridge);
      return;
    }

    saveShareState({ ok: false, error: "JrBridge 未注入" });
    await fallbackShareText(text);
  }

  function getJrBridge() {
    if (window.JrBridge && typeof window.JrBridge.callNative === "function") return window.JrBridge;
    return null;
  }

  function waitForJrBridge(timeout = 1800) {
    return new Promise((resolve) => {
      const readyBridge = getJrBridge();
      if (readyBridge) {
        resolve(readyBridge);
        return;
      }

      if (!isJdRuntime()) {
        resolve(null);
        return;
      }

      loadJrBridgeScript();

      const startedAt = Date.now();
      const timer = setInterval(() => {
        const bridge = getJrBridge();
        if (bridge || Date.now() - startedAt >= timeout) {
          clearInterval(timer);
          resolve(bridge);
        }
      }, 60);
    });
  }

  function isJdRuntime() {
    return /(^|\.)jd\.com$/i.test(window.location.hostname) || /(^|\.)jr\.jd\.com$/i.test(window.location.hostname);
  }

  let jrBridgeScriptPromise = null;
  function loadJrBridgeScript() {
    if (getJrBridge()) return Promise.resolve();
    if (jrBridgeScriptPromise) return jrBridgeScriptPromise;
    jrBridgeScriptPromise = new Promise((resolve) => {
      const script = document.createElement("script");
      script.src = "https://jrb.jr.jd.com/common/jssdk/jrbridge/3.0.1/jrbridge.js";
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => resolve();
      document.head.appendChild(script);
    });
    return jrBridgeScriptPromise;
  }

  async function callJrBridgeShare(text, jrBridge) {
    const shareData = {
      type: "4",
      shareDataNew: {
        showAdjustFont: true,
        showTools: true,
        imageUrl: SHARE_THUMB_URL,
        linkTitle: "端午龙舟冲刺赛",
        linkSubtitle: text,
        isLogin: "0",
        channelList: [
          {
            shareType: 0,
            id: "1",
            link: ACTIVITY_SHARE_URL,
          }
        ]
      }
    };

    try {
      jrBridge.callNative(shareData, function(data) {
        let result = data;
        if (typeof data === "string") {
          try {
            result = JSON.parse(data);
          } catch {
            result = {};
          }
        }
        if (result && result.share) {
          saveShareState({ ok: true, shareState: result.share.shareState, sharePlat: result.share.sharePlat || "" });
        }
      });
    } catch (error) {
      saveShareState({ ok: false, error: error.message || "JrBridge 调用失败" });
      await fallbackShareText(text);
    }
  }

  function saveShareState(info) {
    try {
      localStorage.setItem("dragonboatLastShareState", JSON.stringify({
        ...info,
        time: Date.now(),
      }));
    } catch {
      // 分享状态记录失败不影响用户分享。
    }
  }

  async function fallbackShareText(text) {
    const shareText = `${text}\n${ACTIVITY_SHARE_URL}`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: "端午龙舟冲刺赛",
          text,
          url: ACTIVITY_SHARE_URL,
        });
        return;
      } catch {
        // 用户取消系统分享时，继续尝试复制文案。
      }
    }

    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(shareText);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = shareText;
        textarea.style.position = "fixed";
        textarea.style.left = "-9999px";
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        document.execCommand("copy");
        textarea.remove();
      }
      alert("分享文案已复制，请手动粘贴分享。");
    } catch {
      alert("当前环境暂不支持唤起分享，请在京东金融内打开后重试。");
    }
  }

  function switchLane(direction) {
    if (state.mode !== "playing") return;
    state.targetLane = clamp(state.targetLane + direction, 0, 2);
    state.lane = state.targetLane;
  }

  function switchToLane(lane) {
    if (state.mode !== "playing") return;
    state.targetLane = clamp(lane, 0, 2);
    state.lane = state.targetLane;
  }

  function spawnItem(safeOnly = false, forcedType = "") {
    if (state.items.length >= MAX_ACTIVE_ITEMS) return;
    const lane = Math.floor(Math.random() * 3);
    const roll = Math.random();
    let type = forcedType || "zongzi";
    if (forcedType) {
      type = forcedType;
    } else if (safeOnly) {
      if (roll < 0.86) type = "zongzi";
      else type = "gold";
    } else {
      const level = scoreSpeedLevel(state.score);
      const earlyPressure = Math.min(1, state.score / 1200);
      const collectibleChance = Math.max(0.2, 0.4 - level * 0.024 - earlyPressure * 0.055);
      const goldChance = Math.max(0.016, 0.035 - level * 0.002);
      if (roll < collectibleChance - goldChance) {
        type = "zongzi";
      } else if (roll < collectibleChance) {
        type = "gold";
      } else {
        type = randomObstacleType(state.score);
      }
    }

    const occupied = state.items.some((item) => item.lane === lane && item.y < 310);
    const y = horizonY - 28;
    state.items.push({ type, lane: occupied ? (lane + 1) % 3 : lane, y, prevY: y, hit: false, spin: Math.random() * Math.PI });
  }

  function burst(x, y, color, count) {
    const desiredCount = lowPerformanceMode ? Math.ceil(count * 0.55) : count;
    const safeCount = Math.min(desiredCount, MAX_PARTICLES - state.particles.length);
    for (let i = 0; i < safeCount; i += 1) {
      state.particles.push({
        x,
        y,
        vx: (Math.random() - 0.5) * 130,
        vy: -Math.random() * 170 - 20,
        life: 0.55 + Math.random() * 0.45,
        color,
      });
    }
  }

  function update(dt) {
    if (state.mode === "intro") {
      state.introTime += dt;
      state.bgOffset += dt * 160;
      state.x += (playerLaneX(1) - state.x) * Math.min(1, dt * 16);
      for (const item of state.items) item.spin += dt * 1.8;
      if (state.introTime >= 2.75) {
        state.mode = "playing";
        state.introTime = 0;
        state.safeTime = 1.6;
        state.spawnTimer = 0.65;
        updateUi();
      }
      return;
    }

    if (state.mode !== "playing") return;

    state.speed += (targetSpeedForScore(state.score) - state.speed) * Math.min(1, dt * 2.4);
    state.distance += dt * state.speed * 0.055;
    state.score += dt * state.speed * SCORE_RULES.distanceFactor;
    state.bgOffset += dt * state.speed;
    state.safeTime = Math.max(0, state.safeTime - dt);
    state.hitCooldown = Math.max(0, state.hitCooldown - dt);
    state.hitShake = Math.max(0, state.hitShake - dt);

    if (state.heldDirection && performance.now() >= state.nextHeldMove) {
      switchLane(state.heldDirection);
      state.nextHeldMove = performance.now() + 92;
    }

    if (!state.dragControl) {
      state.x += (playerLaneX(state.targetLane) - state.x) * Math.min(1, dt * 28);
      if (Math.abs(state.x - playerLaneX(state.targetLane)) < 2) state.lane = state.targetLane;
    }

    state.spawnTimer -= dt;
    if (state.spawnTimer <= 0) {
      spawnItem(state.safeTime > 0);
      if (state.safeTime <= 0 && Math.random() < extraObstacleChanceForScore(state.score)) {
        spawnItem(false, randomObstacleType(state.score));
      }
      state.spawnTimer = spawnIntervalForScore(state.score, state.safeTime > 0);
    }

    for (const item of state.items) {
      item.prevY = item.y;
      item.y += dt * state.speed;
      item.spin += dt * 2.6;
      if (!item.hit && isItemColliding(item)) resolveHit(item);
    }
    state.items = state.items.filter((item) => item.y < 820 && !item.hit);

    for (const particle of state.particles) {
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vy += 260 * dt;
      particle.life -= dt;
    }
    state.particles = state.particles.filter((particle) => particle.life > 0);
    updateUi();
  }

  function resolveHit(item) {
    item.hit = true;
    const hitX = getItemCenterX(item);
    const hitY = getItemCenterY(item);
    if (item.type === "zongzi") {
      state.score += SCORE_RULES.zongzi;
      state.zongzi += 1;
      playRewardSfx();
      burst(hitX, hitY, "#d7ff78", 7);
    } else if (item.type === "gold") {
      state.score += SCORE_RULES.gold;
      state.zongzi += 2;
      playRewardSfx();
      burst(hitX, hitY, "#ffd84d", 12);
    } else {
      handleObstacleHit();
    }
  }

  function handleObstacleHit() {
    if (state.hitCooldown > 0) return;
    playCollisionSfx();
    state.lives -= 1;
    state.hitCooldown = 1.1;
    state.hitShake = 0.38;
    if (state.lives <= 0) finishGame();
    updateUi();
  }

  function isItemColliding(item) {
    const scale = worldScaleAt(item.y);
    const box = itemHitboxes[item.type] || { rx: 24, ry: 24 };
    const isObstacle = obstacleTypes.has(item.type);
    if (isObstacle && state.hitCooldown > 0) return false;
    const itemX = getItemCenterX(item);
    const itemRx = box.rx * scale;
    const itemRy = box.ry * scale;
    const dx = Math.abs(itemX - state.x);
    const allowedX = playerHitbox.halfWidth + itemRx;
    if (dx > allowedX) return false;

    if (isObstacle) {
      if (item.y > playerHitbox.centerY) return false;
      const frontTop = playerHitbox.centerY - playerHitbox.frontHalfHeight;
      const frontBottom = playerHitbox.centerY;
      const previousY = item.prevY ?? item.y;
      if (previousY - itemRy > frontBottom) return false;
      if (item.y + itemRy < frontTop) return false;
      const sweptY = clamp(item.y, frontTop, frontBottom);
      const dy = Math.abs(sweptY - playerHitbox.centerY);
      const nx = dx / allowedX;
      const ny = dy / (playerHitbox.frontHalfHeight + itemRy);
      return nx * nx + ny * ny <= 1;
    }

    const collectY = getItemCenterY(item);
    const dy = Math.abs(collectY - playerHitbox.centerY);
    const allowedY = playerHitbox.halfHeight + itemRy;
    const nx = dx / allowedX;
    const ny = dy / allowedY;
    return nx * nx + ny * ny <= 1;
  }

  function getItemCenterX(item) {
    return laneXAt(item.lane, item.y) + itemLaneOffsetX(item.lane, item.y);
  }

  function getItemCenterY(item) {
    if (item.type !== "zongzi" && item.type !== "gold") return item.y;
    const scale = worldScaleAt(item.y);
    return item.y + Math.sin(item.spin * 1.4 + state.bgOffset * 0.025) * 5 * scale;
  }

  function render() {
    const g = scene.graphics;
    g.clear();
    state.items.sort((a, b) => a.y - b.y).forEach((item) => drawItem(g, item));
    drawParticles(g);
    drawBoatFallback(g);
    if (state.mode === "intro") drawOpeningAnimation(g);
    if (state.mode === "paused") {
      g.drawRect(0, 0, W, H, "rgba(0,28,28,0.42)");
      drawLabel(g, 207, 360, "已暂停", 38, "#fff1b8", "#163728", 3, "center");
    }
  }

  function createBoatGif() {
    const root = document.getElementById("laya-root");
    if (!root) return null;
    const img = document.createElement("img");
    img.className = "boat-gif";
    img.decoding = "async";
    img.onload = () => {
      boatGifLoaded = true;
      lastStaticRenderMode = "";
    };
    img.onerror = () => {
      boatGifLoaded = false;
      lastStaticRenderMode = "";
    };
    img.src = "./assets/boat-rowing-new.webp";
    img.alt = "";
    root.appendChild(img);
    return img;
  }

  function createLaneBuoys() {
    const root = document.getElementById("laya-root");
    if (!root) return [];
    const buoys = [];
    const rowsPerBoundary = 7;
    for (const boundary of laneBoundaryOffsets) {
      for (let row = 0; row < rowsPerBoundary; row += 1) {
        const img = document.createElement("img");
        img.className = "lane-buoy-gif";
        img.src = "./assets/lane-buoy.webp";
        img.alt = "";
        root.appendChild(img);
        buoys.push({ img, boundary, row });
      }
    }
    return buoys;
  }

  function updateLaneBuoys() {
    const root = document.getElementById("laya-root");
    if (!root || !laneBuoys.length) return;
    const scale = rootScale;
    const span = roadBottomY - horizonY + 92;
    const flow = state.mode === "paused" ? 0 : state.bgOffset * 0.22;
    for (const buoy of laneBuoys) {
      const raw = (buoy.row * 82 + flow) % span;
      const y = horizonY + 18 + raw;
      const visible = y > horizonY + 22 && y < roadBottomY - 16;
      const depth = easeDepth(y);
      const buoyW = 16 + depth * 38;
      const buoyH = 22 + depth * 52;
      const x = laneBoundaryXAt(buoy.boundary, y) - buoyW / 2;
      buoy.img.style.visibility = visible ? "visible" : "hidden";
      buoy.img.style.opacity = `${0.44 + depth * 0.28}`;
      buoy.img.style.transform = `translate3d(${x * scale}px, ${(y - buoyH * 0.72) * scale}px, 0) scale(${(buoyW / 54) * scale}, ${(buoyH / 74) * scale})`;
    }
  }

  function createWakeGif() {
    const root = document.getElementById("laya-root");
    if (!root) return null;
    const img = document.createElement("img");
    img.className = "wake-gif";
    img.src = "./assets/boat-wake.webp";
    img.alt = "";
    root.appendChild(img);
    return img;
  }

  function updateWakeGif() {
    if (!wakeGif) return;
    const root = document.getElementById("laya-root");
    if (!root) return;
    const scale = rootScale;
    const wakeW = 178;
    const wakeH = 268;
    const x = state.x - wakeW / 2;
    const y = 502;
    wakeGif.style.opacity = state.mode === "over" ? "0.72" : "1";
    wakeGif.style.transform = `translate3d(${x * scale}px, ${y * scale}px, 0) scale(${scale})`;
  }

  function updateBoatGif() {
    if (!boatGif) return;
    const root = document.getElementById("laya-root");
    if (!root) return;
    const scale = rootScale;
    const boatW = 180;
    const boatH = 264;
    const shake = state.mode === "playing" && state.hitShake > 0 ? Math.sin(performance.now() * 0.07) * 7 * (state.hitShake / 0.38) : 0;
    const x = state.x - boatW / 2 + shake;
    const y = 448;
    boatGif.style.setProperty("--boat-x", `${x * scale}px`);
    boatGif.style.setProperty("--boat-y", `${y * scale}px`);
    const boatMode = state.mode === "over"
      ? "over"
      : state.mode === "playing" || state.mode === "intro"
        ? "moving"
        : "idle";
    if (renderedBoatMode !== boatMode) {
      renderedBoatMode = boatMode;
      boatGif.style.zIndex = state.mode === "over" ? "4" : "6";
      boatGif.style.opacity = state.mode === "over" ? "0.74" : "1";
      boatGif.style.animationPlayState = state.mode === "playing" || state.mode === "intro" ? "running" : "paused";
    }
    const hitFlash = state.mode === "playing" && state.hitCooldown > 0 && Math.floor(state.hitCooldown * 16) % 2 === 0;
    const nextFilter = hitFlash
      ? lowPerformanceMode
        ? "brightness(1.08) sepia(1) saturate(3) hue-rotate(-22deg)"
        : "brightness(1.15) sepia(1) saturate(5) hue-rotate(-25deg) drop-shadow(0 0 10px rgba(255, 45, 34, 0.72))"
      : "";
    if (renderedBoatFilter !== nextFilter) {
      renderedBoatFilter = nextFilter;
      boatGif.style.filter = nextFilter;
    }
    boatGif.style.setProperty("--boat-scale", String(scale));
    const nextDuration = `${boatAnimationDurationForScore(state.score).toFixed(2)}s`;
    if (renderedBoatDuration !== nextDuration) {
      renderedBoatDuration = nextDuration;
      boatGif.style.setProperty("--boat-row-duration", nextDuration);
    }
  }

  function drawBoatFallback(g) {
    if (state.mode === "ready") return;
    if (boatGifLoaded) return;
    const scale = state.mode === "over" ? 0.86 : 1;
    const shake = state.mode === "playing" && state.hitShake > 0 ? Math.sin(performance.now() * 0.07) * 7 * (state.hitShake / 0.38) : 0;
    const x = state.x + shake;
    const y = 626;
    drawShadow(g, x, y + 36 * scale, 48 * scale, 14 * scale, 0.24);
    g.drawPoly(0, 0, [
      x - 46 * scale, y - 86 * scale,
      x + 46 * scale, y - 86 * scale,
      x + 35 * scale, y + 64 * scale,
      x + 12 * scale, y + 86 * scale,
      x - 12 * scale, y + 86 * scale,
      x - 35 * scale, y + 64 * scale,
    ], "#8b3e20", "#4a2114", 3 * scale);
    g.drawPoly(0, 0, [
      x - 34 * scale, y - 72 * scale,
      x + 34 * scale, y - 72 * scale,
      x + 24 * scale, y + 50 * scale,
      x - 24 * scale, y + 50 * scale,
    ], "#c87131", "#ffd785", 2 * scale);
    g.drawRect(x - 30 * scale, y - 34 * scale, 60 * scale, 12 * scale, "#7c351d");
    g.drawRect(x - 25 * scale, y + 14 * scale, 50 * scale, 12 * scale, "#7c351d");
    g.drawCircle(x, y - 88 * scale, 15 * scale, "#f0c85f", "#77331c", 3 * scale);
    g.drawCircle(x, y - 88 * scale, 7 * scale, "#fff0ad");
  }

  function drawOpeningAnimation(g) {
    const t = state.introTime;
    const centerX = 207;

    const countdown = getCountdownText(t);
    if (countdown) {
      const local = t < 0.65 ? t : (t - 0.65) % 0.55;
      const scale = 1 + Math.max(0, 0.28 - local) * 1.8;
      const size = countdown === "冲！" ? 58 : 68;
      drawLabel(g, centerX, 320, countdown, size * scale, "#fff2a0", "#6a3214", 6, "center", "Georgia");
    }
  }

  function getCountdownText(t) {
    if (t < 0.55) return "";
    if (t < 1.05) return "3";
    if (t < 1.55) return "2";
    if (t < 2.05) return "1";
    if (t < 2.58) return "冲！";
    return "";
  }

  function drawItem(g, item) {
    const x = getItemCenterX(item);
    const y = item.y;
    const s = worldScaleAt(y);
    const isZongzi = item.type === "zongzi" || item.type === "gold";
    const centerY = getItemCenterY(item);
    drawShadow(g, x, y + 21 * s, 24 * s, 8 * s, 0.2 + depthAt(y) * 0.18);
    if (isZongzi) drawZongziAsset(g, x, centerY, s, item.type === "gold");
    if (item.type === "log") drawLog(g, x, y, s);
    if (item.type === "rock") drawRock(g, x, y, s);
    if (item.type === "whirlpool") drawWhirlpool(g, x, y, s, item.spin);
  }

  function drawZongziAsset(g, x, y, s, gold) {
    const size = (gold ? 92 : 78) * s;
    const visualCenterX = 108 / 210;
    const visualCenterY = 114 / 210;
    const asset = gold ? `./assets/zongzi-gold.png?v=${ASSETS_VERSION}` : `./assets/zongzi.png?v=${ASSETS_VERSION}`;
    drawZongziGlow(g, x, y, s, gold);
    g.loadImage(asset, x - size * visualCenterX, y - size * visualCenterY, size, size);
  }

  function drawZongziGlow(g, x, y, s, gold) {
    const glowColor = gold ? "255,214,74" : "180,255,170";
    const coreColor = gold ? "255,238,145" : "212,255,188";
    g.drawCircle(x, y + 1 * s, (gold ? 38 : 32) * s, `rgba(${glowColor},0.13)`);
    g.drawCircle(x, y + 1 * s, (gold ? 25 : 21) * s, `rgba(${coreColor},0.16)`);
    g.drawCircle(x - 10 * s, y - 9 * s, (gold ? 10 : 8) * s, `rgba(255,255,230,${gold ? 0.24 : 0.18})`);
  }

  function drawLog(g, x, y, s) {
    const width = 78 * s;
    const height = 58 * s;
    g.loadImage("./assets/log.png", x - width * 0.5, y - height * 0.58, width, height);
  }

  function drawRock(g, x, y, s) {
    const width = 68 * s;
    const height = 82 * s;
    g.loadImage("./assets/rock.png", x - width * 0.5, y - height * 0.7, width, height);
  }

  function drawWhirlpool(g, x, y, s, spin) {
    drawShadow(g, x, y + 4 * s, 30 * s, 13 * s, 0.32);
    const size = 96 * s;
    g.loadImage("./assets/whirlpool.png", x - size * 0.5, y - size * 0.5, size, size);
  }

  function drawParticles(g) {
    for (const p of state.particles) g.drawCircle(p.x, p.y, 3, p.color);
  }

  function drawShadow(g, x, y, rx, ry, alpha) {
    const points = [];
    for (let i = 0; i < 18; i += 1) {
      const angle = (Math.PI * 2 * i) / 18;
      points.push(x + Math.cos(angle) * rx, y + Math.sin(angle) * ry);
    }
    g.drawPoly(0, 0, points, `rgba(0,28,25,${alpha})`);
  }

  function drawLabel(g, x, y, text, size, fill, stroke, strokeWidth, align = "left", font = "PingFang SC") {
    const family = font === "Georgia" ? "Georgia, serif" : "\"PingFang SC\", \"Microsoft YaHei\", sans-serif";
    const fontSpec = `bold ${Math.max(1, Math.round(size))}px ${family}`;
    if (stroke && strokeWidth) scene.graphics.fillBorderText(text, x, y, fontSpec, fill, stroke, strokeWidth, align);
    else scene.graphics.fillText(text, x, y, fontSpec, fill, align);
  }

  function fitTextSize(element, maxFontSize) {
    if (!element) return;
    element.style.fontSize = maxFontSize + "px";
    const container = element.parentElement;
    if (!container) return;
    const maxWidth = container.clientWidth - 4;
    if (element.scrollWidth > maxWidth) {
      const ratio = maxWidth / element.scrollWidth;
      element.style.fontSize = Math.max(10, Math.floor(maxFontSize * ratio)) + "px";
    }
  }

  function updateUi() {
    const scoreValue = Math.floor(state.score);
    const distanceValue = Math.floor(state.distance);
    if (domHud.score && scoreValue !== renderedScore) {
      renderedScore = scoreValue;
      domHud.score.textContent = scoreValue.toLocaleString("zh-CN");
      domHud.score.classList.toggle("is-compact", scoreValue >= 1000);
    }
    if (domHud.distance && distanceValue !== renderedDistance) {
      renderedDistance = distanceValue;
      domHud.distance.textContent = `${distanceValue.toLocaleString("zh-CN")}米`;
      domHud.distance.classList.toggle("is-compact", distanceValue > 999);
    }
    if (domHud.zongzi && state.zongzi !== renderedZongzi) {
      renderedZongzi = state.zongzi;
      domHud.zongzi.textContent = state.zongzi.toLocaleString("zh-CN");
      fitTextSize(domHud.zongzi, 15);
    }
    if (renderedLives !== state.lives) {
      renderedLives = state.lives;
      if (domHud.heartA) domHud.heartA.src = state.lives >= 1 ? "./assets/ui/heart-full.png" : "./assets/ui/heart-empty.png";
      if (domHud.heartB) domHud.heartB.src = state.lives >= 2 ? "./assets/ui/heart-full.png" : "./assets/ui/heart-empty.png";
    }
  }

  function handlePointerDown(x, y) {
    state.pointerActive = true;
    state.pointerMoved = false;
    state.dragControl = state.mode === "playing";
    state.startX = x;
    state.startY = y;
    state.dragStartBoatX = state.x;
  }

  function handlePointerMove(x, y) {
    if (!state.pointerActive || state.mode !== "playing") return;
    const dx = x - state.startX;
    const dy = y - state.startY;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);
    if (absDx < dragFollowThreshold) return;
    if (absDx >= dragCommitThreshold || absDy >= dragVerticalSlack) state.pointerMoved = true;
    state.dragControl = true;
    const targetX = clamp(state.dragStartBoatX + dx, playerMinX(), playerMaxX());
    const maxStep = 48;
    state.x = clamp(targetX, state.x - maxStep, state.x + maxStep);
    state.targetLane = nearestPlayerLane(state.x);
    state.lane = state.targetLane;
  }

  function handlePointerUp(x, y) {
    state.pointerActive = false;
    if (state.mode !== "playing") {
      state.dragControl = false;
      return;
    }
    const dx = x - state.startX;
    const dy = y - state.startY;
    if (state.pointerMoved) {
      state.targetLane = nearestPlayerLane(state.x);
      state.lane = state.targetLane;
    } else if (Math.abs(dx) > 24 && Math.abs(dx) > Math.abs(dy)) {
      switchLane(dx > 0 ? 1 : -1);
    } else if (y > 230) {
      switchToLane(laneFromPoint(x, y));
    }
    state.dragControl = false;
  }

  function bindNativeControls(target) {
    const options = { capture: true, passive: false };
    if (window.PointerEvent) {
      target.addEventListener("pointerdown", onNativePointerDown, options);
      target.addEventListener("pointermove", onNativePointerMove, options);
      target.addEventListener("pointerup", onNativePointerUp, options);
      target.addEventListener("pointercancel", onNativePointerCancel, options);
      return;
    }
    target.addEventListener("touchstart", onNativeTouchStart, options);
    target.addEventListener("touchmove", onNativeTouchMove, options);
    target.addEventListener("touchend", onNativeTouchEnd, options);
    target.addEventListener("touchcancel", onNativeTouchCancel, options);
  }

  function shouldUseNativeControl(event) {
    if (state.mode !== "playing") return false;
    const target = event.target;
    if (target && typeof target.closest === "function") {
      if (target.closest("button") || target.closest(".leaderboard-overlay") || target.closest(".rules-overlay")) return false;
    }
    return true;
  }

  function consumeNativeControlEvent(event) {
    event.preventDefault();
    event.stopPropagation();
  }

  function onNativePointerDown(event) {
    if (!shouldUseNativeControl(event)) return;
    const point = domPointToStage(event);
    if (!point) return;
    state.nativePointerId = event.pointerId;
    if (root.setPointerCapture) {
      try {
        root.setPointerCapture(event.pointerId);
      } catch {
        // Some embedded browsers expose pointer events without capture support.
      }
    }
    handlePointerDown(point.x, point.y);
    consumeNativeControlEvent(event);
  }

  function onNativePointerMove(event) {
    if (state.nativePointerId !== event.pointerId) return;
    if (state.mode !== "playing") return;
    const point = domPointToStage(event);
    if (!point) return;
    handlePointerMove(point.x, point.y);
    consumeNativeControlEvent(event);
  }

  function onNativePointerUp(event) {
    if (state.nativePointerId !== event.pointerId) return;
    const point = domPointToStage(event);
    state.nativePointerId = null;
    state.pointerActive = false;
    if (root.releasePointerCapture) {
      try {
        root.releasePointerCapture(event.pointerId);
      } catch {
        // Capture may already have been released by the browser.
      }
    }
    if (point && state.mode === "playing") handlePointerUp(point.x, point.y);
    else state.dragControl = false;
    consumeNativeControlEvent(event);
  }

  function onNativePointerCancel(event) {
    if (state.nativePointerId !== event.pointerId) return;
    state.nativePointerId = null;
    state.pointerActive = false;
    state.dragControl = false;
  }

  function onNativeTouchStart(event) {
    if (!shouldUseNativeControl(event)) return;
    const touch = event.changedTouches[0];
    if (!touch) return;
    const point = domPointToStage(touch);
    if (!point) return;
    state.nativeTouchId = touch.identifier;
    handlePointerDown(point.x, point.y);
    consumeNativeControlEvent(event);
  }

  function onNativeTouchMove(event) {
    if (state.mode !== "playing") return;
    const touch = getNativeTouch(event.touches);
    if (!touch) return;
    const point = domPointToStage(touch);
    if (!point) return;
    handlePointerMove(point.x, point.y);
    consumeNativeControlEvent(event);
  }

  function onNativeTouchEnd(event) {
    const touch = getNativeTouch(event.changedTouches);
    if (!touch) return;
    const point = domPointToStage(touch);
    state.nativeTouchId = null;
    state.pointerActive = false;
    if (point && state.mode === "playing") handlePointerUp(point.x, point.y);
    else state.dragControl = false;
    consumeNativeControlEvent(event);
  }

  function onNativeTouchCancel(event) {
    const touch = getNativeTouch(event.changedTouches);
    if (!touch) return;
    state.nativeTouchId = null;
    state.pointerActive = false;
    state.dragControl = false;
  }

  function getNativeTouch(touches) {
    if (state.nativeTouchId === null) return null;
    for (let index = 0; index < touches.length; index += 1) {
      if (touches[index].identifier === state.nativeTouchId) return touches[index];
    }
    return null;
  }

  function domPointToStage(event) {
    const root = document.getElementById("laya-root");
    if (!root) return null;
    const rect = root.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * W,
      y: ((event.clientY - rect.top) / rect.height) * H,
    };
  }

  function onKeyDown(event) {
    const key = event.key.toLowerCase();
    if (key === "arrowleft" || key === "a") {
      event.preventDefault();
      if (!keyMap.get(key)) switchLane(-1);
      keyMap.set(key, -1);
      state.heldDirection = -1;
      state.nextHeldMove = performance.now() + 140;
    }
    if (key === "arrowright" || key === "d") {
      event.preventDefault();
      if (!keyMap.get(key)) switchLane(1);
      keyMap.set(key, 1);
      state.heldDirection = 1;
      state.nextHeldMove = performance.now() + 140;
    }
  }

  function onKeyUp(event) {
    const key = event.key.toLowerCase();
    keyMap.delete(key);
    state.heldDirection = Array.from(keyMap.values()).pop() || 0;
    state.nextHeldMove = performance.now() + 80;
  }

  function togglePause() {
    if (state.mode === "playing") state.mode = "paused";
    else if (state.mode === "paused") state.mode = "playing";
    updateUi();
  }
})();
