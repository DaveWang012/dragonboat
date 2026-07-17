(() => {
  const GATEWAY_REPORT_SCORE_URL = "https://ms.jr.jd.com/gw2/generic/redEnv001/newh5/m/reportScore";
  const GATEWAY_QUERY_TOP_RANK_URL = "https://ms.jr.jd.com/gw2/generic/redEnv001/newh5/m/queryTopRank";
  const GATEWAY_GET_USER_BY_PIN_URL = "https://ms.jr.jd.com/gw2/generic/icCreator/newh5/m/getDefaultUserByPin";
  const JD_LOGIN_URL = "https://plogin.m.jd.com/user/login.action?jrWebNativeLogin=false&appid=100&returnurl=";
  const APP_VERSION = "20260717-notice-fallback";
  const ACTIVITY_URL = window.DRAGONBOAT_ACTIVITY_URL || window.location.href;
  const BASE_GAME_CODE = "dragonboat_h5_202606";
  const BASE_GAME_CODE_DATE = "20260618";
  const PIN_PARAM_NAMES = ["pin", "pt_pin", "jdPin", "userPin"];
  const LOGIN_COOKIE_NAMES = ["pt_key", "pwdt_id", "sid", "wskey"];
  const GAME_CODE_PARAM_NAMES = ["gameCode", "game_code"];
  const UPLOAD_LOG_KEY = "dragonboatUploadLogs";
  const UPLOAD_LOG_LIMIT = 40;

  function getQueryValue(names) {
    const params = new URLSearchParams(window.location.search || "");
    for (const name of names) {
      const value = params.get(name);
      if (value) return decodeURIComponent(value);
    }
    return "";
  }

  function getCookieValue(names) {
    const pairs = document.cookie ? document.cookie.split(";") : [];
    for (const pair of pairs) {
      const [rawName, ...rawValue] = pair.trim().split("=");
      if (names.includes(rawName)) return decodeURIComponent(rawValue.join("="));
    }
    return "";
  }

  function getGameCode() {
    const fromQuery = getQueryValue(GAME_CODE_PARAM_NAMES);
    if (fromQuery) {
      localStorage.setItem("dragonboatGameCode", fromQuery);
      return fromQuery;
    }
    return dailyGameCode();
  }

  function chinaDateStamp(date = new Date()) {
    const parts = new Intl.DateTimeFormat("zh-CN", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);
    const valueOf = (type) => parts.find((part) => part.type === type)?.value || "";
    return `${valueOf("year")}${valueOf("month")}${valueOf("day")}`;
  }

  function dailyGameCode(date = new Date()) {
    const dateStamp = chinaDateStamp(date);
    if (dateStamp === BASE_GAME_CODE_DATE) return BASE_GAME_CODE;
    return `dragonboat_h5_${dateStamp}`;
  }

  function getPlayerPin() {
    const fromQuery = getQueryValue(PIN_PARAM_NAMES);
    if (fromQuery) {
      localStorage.setItem("dragonboatPlayerPin", fromQuery);
      return fromQuery;
    }
    return getCookieValue(PIN_PARAM_NAMES);
  }

  function isLocalPreview() {
    const host = window.location.hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  }

  function isJdHost() {
    return /\.jd\.com$/i.test(window.location.hostname) || window.location.hostname === "jd.com";
  }

  function isStandaloneHost() {
    return !isJdHost();
  }

  function hasLoginState() {
    return Boolean(getQueryValue(PIN_PARAM_NAMES) || getCookieValue(PIN_PARAM_NAMES) || getCookieValue(LOGIN_COOKIE_NAMES));
  }

  function buildLoginUrl() {
    return `${JD_LOGIN_URL}${encodeURIComponent(ACTIVITY_URL)}`;
  }

  function redirectToLogin() {
    const loginUrl = buildLoginUrl();
    try {
      if (window.top && window.top !== window) {
        window.top.location.replace(loginUrl);
        return;
      }
    } catch {
      // Cross-origin frames may block top navigation; fall back to the current page.
    }
    window.location.replace(loginUrl);
  }

  function ensureLogin() {
    if (isLocalPreview() || isStandaloneHost() || hasLoginState()) return true;
    redirectToLogin();
    return false;
  }

  function readLocalScores() {
    try {
      return JSON.parse(localStorage.getItem("dragonboatLeaderboardAll") || localStorage.getItem("dragonboatLeaderboard") || "[]");
    } catch {
      return [];
    }
  }

  function isGatewaySuccess(payload) {
    const resultData = payload && payload.resultData;
    const resultDataCode = Number(resultData && resultData.code);
    if (!payload || payload.success !== true || payload.resultCode !== 0) return false;
    if (!resultData) return true;
    if (resultData.sgmSuccess === false) return false;
    if (resultData.code !== undefined && resultDataCode !== 0 && resultDataCode !== 200) return false;
    return true;
  }

  function firstValue(entry, names) {
    for (const name of names) {
      const value = entry && entry[name];
      if (value !== undefined && value !== null && value !== "") return value;
    }
    return "";
  }

  function cleanUrlValue(value) {
    const text = String(value || "").trim();
    const markdownLink = text.match(/^\[[^\]]+\]\((https?:\/\/[^)]+)\)$/);
    const url = markdownLink ? markdownLink[1] : text;
    return url.replace(/^http:\/\//, "https://");
  }

  function maskPin(pin) {
    const text = String(pin || "");
    if (!text) return "";
    if (text.length <= 6) return `${text.slice(0, 1)}***${text.slice(-1)}`;
    return `${text.slice(0, 3)}***${text.slice(-3)}`;
  }

  function sanitizeReqData(reqData) {
    const data = { ...(reqData || {}) };
    if (data.pin) data.pin = maskPin(data.pin);
    return data;
  }

  function writeUploadLog(stage, data = {}) {
    const entry = {
      stage,
      time: Date.now(),
      readableTime: new Date().toLocaleString("zh-CN", { hour12: false }),
      ...data,
    };
    console.log("[DragonBoatUpload]", stage, entry);
    try {
      const logs = JSON.parse(localStorage.getItem(UPLOAD_LOG_KEY) || "[]");
      logs.push(entry);
      localStorage.setItem(UPLOAD_LOG_KEY, JSON.stringify(logs.slice(-UPLOAD_LOG_LIMIT)));
      localStorage.setItem("dragonboatLastUploadLog", JSON.stringify(entry));
    } catch {
      // 调试日志写入失败不影响游戏和接口请求。
    }
  }

  async function postGateway(url, reqData, action = "gateway") {
    writeUploadLog(`${action}:request`, {
      url,
      credentials: "include",
      reqData: sanitizeReqData(reqData),
    });
    const response = await fetch(url, {
      method: "POST",
      credentials: "include",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ reqData }),
    });
    const payload = await response.json();
    writeUploadLog(`${action}:response`, {
      httpStatus: response.status,
      success: payload?.success,
      resultCode: payload?.resultCode,
      resultMsg: payload?.resultMsg || "",
      resultDataCode: payload?.resultData?.code,
      resultDataMsg: payload?.resultData?.msg || "",
      sgmSuccess: payload?.resultData?.sgmSuccess,
    });
    if (!isGatewaySuccess(payload)) {
      const message = payload?.resultData?.msg || payload?.resultMsg || "接口调用失败";
      const error = new Error(message);
      error.payload = payload;
      writeUploadLog(`${action}:error`, {
        message,
        resultCode: payload?.resultCode,
        resultMsg: payload?.resultMsg || "",
        resultDataCode: payload?.resultData?.code,
        resultDataMsg: payload?.resultData?.msg || "",
      });
      throw error;
    }
    return payload;
  }

  async function reportScore(score, options = {}) {
    const pin = options.pin || getPlayerPin();
    const gameCode = options.gameCode || getGameCode();
    console.log("[DragonBoat] reportScore gameCode:", gameCode);
    const safeScore = Math.max(0, Math.floor(Number(score) || 0));
    if (isStandaloneHost()) {
      const payload = {
        success: true,
        resultCode: 0,
        resultData: {
          code: 0,
          msg: "本地静态模式成绩已保存",
          data: { score: safeScore, gameCode },
        },
      };
      payload.reportIdentity = { pin: pin || "", source: pin ? "pin" : "local" };
      payload.reportGameCode = gameCode;
      writeUploadLog("reportScore:local", {
        gameCode,
        score: safeScore,
        identitySource: payload.reportIdentity.source,
      });
      return payload;
    }
    const reqData = {
      gameCode,
      score: safeScore,
    };
    if (pin) reqData.pin = pin;
    writeUploadLog("reportScore:prepare", {
      gameCode,
      score: safeScore,
      sentPin: Boolean(pin),
      pin: maskPin(pin),
      identitySource: pin ? "pin" : "cookie",
    });
    const payload = await postGateway(GATEWAY_REPORT_SCORE_URL, reqData, "reportScore");
    payload.reportIdentity = { pin, source: pin ? "pin" : "cookie" };
    payload.reportGameCode = gameCode;
    writeUploadLog("reportScore:done", {
      gameCode,
      score: safeScore,
      sentPin: Boolean(pin),
      identitySource: pin ? "pin" : "cookie",
    });
    return payload;
  }

  async function queryTopRank(options = {}) {
    const gameCode = options.gameCode || getGameCode();
    console.log("[DragonBoat] queryTopRank gameCode:", gameCode);
    const pin = options.pin || getPlayerPin();
    if (isStandaloneHost()) {
      const rows = readLocalScores().slice(0, 50);
      return {
        success: true,
        resultCode: 0,
        queryGameCode: gameCode,
        source: "local",
        resultData: {
          code: 0,
          data: {
            rankList: rows,
          },
        },
      };
    }
    writeUploadLog("queryTopRank:prepare", {
      gameCode,
      sentPin: Boolean(pin),
      pin: maskPin(pin),
    });
    const payload = await postGateway(GATEWAY_QUERY_TOP_RANK_URL, pin ? { gameCode, pin } : { gameCode }, "queryTopRank");
    payload.queryGameCode = gameCode;
    return payload;
  }

  async function getUserByPin(options = {}) {
    const pin = options.pin || getPlayerPin();
    if (!pin) {
      const error = new Error("查询用户信息需要pin");
      error.skipRequest = true;
      writeUploadLog("getUserByPin:skip", { reason: "missing-pin" });
      throw error;
    }
    writeUploadLog("getUserByPin:request", { sentPin: true, pin: maskPin(pin) });
    const response = await fetch(GATEWAY_GET_USER_BY_PIN_URL, {
      method: "POST",
      credentials: "include",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ reqData: { pin } }),
    });
    const payload = await response.json();
    writeUploadLog("getUserByPin:response", {
      httpStatus: response.status,
      success: payload?.success,
      resultCode: payload?.resultCode,
      resultMsg: payload?.resultMsg || "",
      resultDataCode: payload?.resultData?.code,
      resultDataMsg: payload?.resultData?.msg || "",
    });
    if (!isGatewaySuccess(payload)) {
      const message = payload?.resultData?.msg || payload?.resultMsg || "查询用户信息失败";
      const error = new Error(message);
      error.payload = payload;
      throw error;
    }
    const resultData = payload?.resultData || {};
    const rawData = resultData?.data || resultData?.result || resultData?.userInfo || resultData || {};
    const data = Array.isArray(rawData) ? rawData[0] || {} : rawData;
    const flat = Object.assign({}, data?.basic || {}, data);
    const uid = firstValue(flat, ["uid", "UID", "userUid", "userUID", "communityUid", "contentId", "jimuUid", "jimuUserInfoId", "userInfoId"]);
    const resolvedPin = firstValue(flat, ["userPin", "pin", "ptPin", "pt_pin", "jdPin", "accountPin", "loginPin"]) || pin;
    const nickName = firstValue(flat, ["userName", "nickName", "nickname", "nick", "displayName", "userNick", "showName", "nick_name"]);
    const avatar = cleanUrlValue(firstValue(flat, ["userImageUrl", "avatar", "avatarUrl", "headImg", "headUrl", "headImageUrl", "headImage", "headSmallImageUrl", "headMidImageUrl", "headBigImageUrl", "userAvatar", "userImage", "userPic", "imgUrl", "imageUrl", "faceUrl", "icon"]));
    if (!uid && !resolvedPin && !nickName && !avatar) {
      const message = resultData?.msg || payload?.resultMsg || "查询用户信息失败";
      const error = new Error(message);
      error.payload = payload;
      throw error;
    }
    const profile = {
      uid: uid ? String(uid) : "",
      pin: resolvedPin ? String(resolvedPin) : "",
      nickName: nickName ? String(nickName) : "",
      avatar,
    };
    return profile;
  }

  window.DragonBoatScoreApi = {
    gameCode: getGameCode(),
    baseGameCode: BASE_GAME_CODE,
    reportScore,
    queryTopRank,
    getUserByPin,
    getGameCode,
    dailyGameCode,
    getPlayerPin,
    writeUploadLog,
    ensureLogin,
    hasLoginState,
    loginUrl: buildLoginUrl(),
    isGatewaySuccess,
  };
  ensureLogin();
  document.documentElement.dataset.scoreApi = "ready";
})();
