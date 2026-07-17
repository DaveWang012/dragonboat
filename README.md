# Dragon Boat H5

端午龙舟冲刺赛 H5 游戏，按魔笛纯静态项目规范整理。

当前仓库支持直接通过 GitHub Pages 作为静态站点访问。非 JD 域名访问时不会跳转京东登录，成绩和排行榜使用浏览器本地存储。

## Project Type

- 类型：纯静态 H5
- 入口：`index.html`
- 分支：`main`
- 构建：无构建步骤，直接发布项目根目录

## Modi Deploy Notes

- `index.html` 位于项目根目录。
- 页面、脚本、样式和素材均使用相对路径引用。
- 项目不依赖 Node/Python 服务端运行环境。
- API 请求直接调用线上 HTTPS 网关。

## Main Files

- `index.html`：游戏入口
- `leaderboard.html`：排行榜页
- `laya-game.js`：游戏主逻辑
- `game-api.js`：分数上报和排行榜查询
- `laya.css`：页面和游戏 UI 样式
- `assets/`：游戏图片素材
- `libs/laya.core.js`：LayaAir 运行库

---

## 核心功能实现说明

### 0. 版本号、缓存与 GameCode

**实现位置**：`index.html`、`game-api.js`、`laya-game.js`

当前代码使用统一版本号 `20260717-boat-fallback`，用于规避 App WebView / CDN 缓存：

- `index.html` 首屏脚本会检查 URL 中的 `v` 参数，若不是当前版本，会自动 `location.replace()` 到同一路径并补齐 `v=20260717-boat-fallback`。
- `laya.css`、`game-api.js`、`laya-game.js` 均带同一版本号 query。
- 排行榜 iframe 使用 `LEADERBOARD_VERSION = APP_VERSION`，会打开 `leaderboard.html?v=20260717-boat-fallback&embedded=1`。
- 分享链接和登录 `returnurl` 也带同一版本号。

> 注意：该逻辑只有在用户加载到新版 `index.html` 后才生效。若 App/CDN 已缓存更旧的 `index.html`，仍需平台侧刷新页面缓存一次。

GameCode 生成规则：

```javascript
const BASE_GAME_CODE = "dragonboat_h5_202606";
const BASE_GAME_CODE_DATE = "20260618";

function dailyGameCode(date = new Date()) {
  const dateStamp = chinaDateStamp(date); // Asia/Shanghai
  if (dateStamp === BASE_GAME_CODE_DATE) return BASE_GAME_CODE;
  return `dragonboat_h5_${dateStamp}`;
}
```

- URL 参数 `gameCode` / `game_code` 优先级最高，可覆盖自动生成值。
- `2026-06-18` 使用 `dragonboat_h5_202606`。
- `2026-06-19` 起按北京时间日期生成，例如 `dragonboat_h5_20260619`、`dragonboat_h5_20260620`。
- 不同 `gameCode` 会产生不同排行榜分桶，排查“两套榜单”时优先检查上报和查询日志中的 `gameCode`。

### 1. 登录状态检测与跳转

**实现位置**：`game-api.js`

检测 Cookie 或 URL 参数中的登录标识，未登录时自动跳转京东登录页，登录成功后回跳活动页。

```javascript
const LOGIN_COOKIE_NAMES = ["pt_key", "pwdt_id", "sid", "wskey"];

function hasLoginState() {
  return Boolean(
    getQueryValue(PIN_PARAM_NAMES) ||
    getCookieValue(PIN_PARAM_NAMES) ||
    getCookieValue(LOGIN_COOKIE_NAMES)
  );
}

// 页面加载时自动执行
function ensureLogin() {
  if (isLocalPreview() || hasLoginState()) return true;
  redirectToLogin(); // 跳转: https://plogin.m.jd.com/user/login.action?returnurl=活动页URL
  return false;
}
```

**登录流程**：未登录 → `ensureLogin()` 拦截 → 跳转京东登录页（returnurl=带版本号的活动页）→ 登录成功回跳 → Cookie 写入登录态 → 后续接口携带 `credentials: "include"` 正常使用

---

### 2. H5 获取用户 Pin

**实现位置**：`game-api.js`

```javascript
const PIN_PARAM_NAMES = ["pin", "pt_pin", "jdPin", "userPin"];

function getPlayerPin() {
  // 优先从 URL 参数获取（活动页跳转传入）
  const fromQuery = getQueryValue(PIN_PARAM_NAMES);
  if (fromQuery) return fromQuery;
  // 其次从 Cookie 读取（登录后写入）
  return getCookieValue(PIN_PARAM_NAMES);
}
```

**Pin 来源优先级**：URL 参数 > Cookie（`pin` / `pt_pin` / `jdPin` / `userPin`）。若前端读不到 pin，分数上报仍会携带登录态 Cookie，由网关侧统一解析当前登录用户。

---

### 3. 显示社区昵称和头像（非京东昵称）

**实现位置**：`game-api.js` 的 `getUserByPin()` 函数

调用 `getDefaultUserByPin` 接口获取的是**京东金融社区**的用户资料（头像、昵称、UID），而非京东主站信息。线上环境正常返回，本地预览可能无数据。

**接口**：`https://ms.jr.jd.com/gw2/generic/icCreator/newh5/m/getDefaultUserByPin`

字段兼容多种命名（`userName`/`nickName`/`nickname`、`avatar`/`avatarUrl`/`headImg` 等）。

---

### 4. 排行榜数据获取

**实现位置**：`game-api.js` + `leaderboard.html`

**接口地址**：
- 上报分数：`https://ms.jr.jd.com/gw2/generic/redEnv001/newh5/m/reportScore`
- 查询排行榜（前50名）：`https://ms.jr.jd.com/gw2/generic/redEnv001/newh5/m/queryTopRank`
- 查询用户信息：`https://ms.jr.jd.com/gw2/generic/icCreator/newh5/m/getDefaultUserByPin`

**字段映射**（兼容多种字段名）：
- UID：`uid`, `UID`, `userUid`, `communityUid`, `contentId`
- 昵称：`userName`, `nickName`, `nickname`, `displayName`
- 头像：`userImageUrl`, `avatar`, `avatarUrl`, `headImg`
- 得分：`score`, `totalScore`, `maxScore`, `bestScore`

---

### 5. 用户个人页跳转

**实现位置**：`leaderboard.html`

```javascript
const PERSONAL_PAGE_URLS = {
  preprod: "https://utest.jr.jd.com/content/personal?romaFileName=pageCommunityPersonal&contentId=",
  prod:    "https://roma.jd.com/content/personal?romaFileName=pageCommunityPersonal&contentId=",
};

// URL 拼接：基础地址 + encodeURIComponent(uid)
function profileUrlForUid(uid) {
  return `${PERSONAL_PAGE_URLS.prod}${encodeURIComponent(uid)}`;
}

// 点击排行榜用户行时触发，优先在 iframe 顶层窗口跳转
function navigateToProfile(uid) {
  const url = profileUrlForUid(uid);
  if (window.top && window.top !== window) {
    window.top.location.href = url;
  } else {
    window.location.href = url;
  }
}
```

**URL 示例**：`https://roma.jd.com/content/personal?romaFileName=pageCommunityPersonal&contentId=用户UID`

可通过 URL 参数 `?personalEnv=preprod` 切换至预发环境。

---

### 6. 唤起分享面板

**实现位置**：`laya-game.js` 的 `shareResult()` 函数；排行榜页分享按钮通过 `postMessage({ type: "dragonboat:share" })` 通知父页面复用该逻辑。

**JrBridge SDK 导入**（在 `index.html` 中引入）：
```html
<script src="https://jrb.jr.jd.com/common/jssdk/jrbridge/3.0.1/jrbridge.js"></script>
```

**京东金融 App 内分享**（`type: "4"` 为分享功能）：
```javascript
const shareData = {
  type: "4",
  shareDataNew: {
    imageUrl: SHARE_THUMB_URL,
    linkTitle: "端午龙舟冲刺赛",
    linkSubtitle: text,
    channelList: [{ shareType: 0, link: ACTIVITY_SHARE_URL }]
  }
};
jrBridge.callNative(shareData, callback);
```

**等待 JrBridge 注入**（立即检查，未就绪则最多等 1800ms，每 60ms 轮询一次）：
```javascript
function waitForJrBridge(timeout = 1800) {
  return new Promise((resolve) => {
    // 若已注入则立即返回
    if (window.JrBridge && typeof window.JrBridge.callNative === "function") {
      resolve(window.JrBridge);
      return;
    }
    const startedAt = Date.now();
    const timer = setInterval(() => {
      const bridge = window.JrBridge && typeof window.JrBridge.callNative === "function"
        ? window.JrBridge : null;
      if (bridge || Date.now() - startedAt >= timeout) {
        clearInterval(timer);
        resolve(bridge);
      }
    }, 60);
  });
}
```

**降级方案**（非京东金融 App 环境）：
```javascript
if (navigator.share) {
  await navigator.share({ title, text, url });
} else {
  await navigator.clipboard.writeText(shareText);
  // 或降级为 textarea 选中复制
}
```

排行榜页底部同样提供分享按钮，按钮点击后复用游戏页分享逻辑，不另起一套分享实现。

---

## 游戏界面与页面流程

### 页面结构总览

```
┌─────────────────────────────────────────────────────────────┐
│                        index.html                            │
├─────────────────────────────────────────────────────────────┤
│  [排行榜] ← floatingLeaderboardBtn (左上角，游戏中随时可点)   │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ game-hud (顶部数据栏)                                 │    │
│  │  [❤️❤️]  得分: 0    📍0米  🍙0                        │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              游戏画布 (Laya Canvas)                   │    │
│  │                  🚤 龙舟                              │    │
│  │              🍙 🪨 🌀 道具/障碍物                      │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
│  startOverlay     (开始页)   → is-hidden 控制显隐            │
│  resultOverlay    (结束页)   → is-hidden 控制显隐            │
│  leaderboardOverlay (排行榜) → is-hidden 控制显隐            │
│  rulesOverlay     (规则页)   → is-hidden 控制显隐            │
│  prizeOverlay     (奖品页)   → is-hidden 控制显隐            │
└─────────────────────────────────────────────────────────────┘
```

### 页面状态流转

```
页面加载
  ↓
开始页 (state.mode = "ready")
  ↓ 点击"开始游戏"
开场动画 (state.mode = "intro", 倒计时3-2-1-冲！约2.75秒)
  ↓ 自动过渡
游戏中 (state.mode = "playing")
  ├→ 打开排行榜/规则/奖品 → state.mode = "paused"（关闭后恢复）
  └→ lives <= 0
        ↓
      结束页 (state.mode = "over")
        ├→ 再来一局 → resetGame() → 游戏中
        ├→ 排行榜  → openLeaderboardOverlay()
        └→ 分享    → JrBridge / Web Share API
```

---

### 各页面详情

#### 1. 开始页 (startOverlay)

开始页内嵌了一个规则预览卡，展示收集物和障碍物图标，无需进入规则页即可了解基本玩法。

| 元素 | ID | 动作 |
|------|-----|------|
| 开始游戏 | `startGameBtn` | `resetGame()` → 进入游戏 |
| 游戏规则 | `rulesBtn` | `openRulesOverlay()` |
| 奖品详情 | `prizeBtn` | `openPrizeOverlay()` |

#### 2. 游戏页 (game-hud)

| 元素 | ID | 说明 |
|------|-----|------|
| 血量 | `hudHeartA`, `hudHeartB` | 碰撞后变空心，共2颗 |
| 得分 | `hudScore` | 实时更新，框固定92px宽，绝对定位水平居中 |
| 距离 | `hudDistance` | 实时更新，归属`.hud-stats`容器 |
| 粽子数 | `hudZongzi` | 实时更新，归属`.hud-stats`容器 |
| 排行榜按钮 | `floatingLeaderboardBtn` | 左上角悬浮按钮，随时可点 |

HUD HTML 结构：
```html
<section class="game-hud">
  <span class="hud-hearts">          <!-- 左侧血量，flex自适应 -->
    <img id="hudHeartA" />
    <img id="hudHeartB" />
  </span>
  <div class="hud-score">            <!-- 绝对定位，水平居中，固定92px宽 -->
    <span>得分</span>
    <strong id="hudScore">0</strong>
  </div>
  <div class="hud-stats">            <!-- 右侧数据组（距离+粽子），flex靠右 -->
    <span class="hud-stat"><img/><strong id="hudDistance">0米</strong></span>
    <span class="hud-stat"><img/><strong id="hudZongzi">0</strong></span>
  </div>
</section>
```

`.hud-score` 样式：`position: absolute; left: 50%; transform: translateX(-50%); width: 92px; overflow: hidden`（得分框固定宽度居中，字号变大时 `fitTextSize()` 自动缩小字号适配）

#### 3. 结束页 (resultOverlay)

| 元素 | ID | 动作 |
|------|-----|------|
| 再来一局 | `restartGameBtn` | `resetGame()` |
| 排行榜 | `leaderboardBtn` | `openLeaderboardOverlay()` |
| 分享 | `shareBtn` | `shareResult()` |

#### 4. 排行榜页 (leaderboardOverlay)

- 以 **iframe** 形式嵌入 `leaderboard.html`，打开时游戏暂停
- iframe 内点"返回游戏"发送 `postMessage({type:"dragonboat:closeLeaderboard"})`，父页恢复游戏
- iframe 内点"分享"发送 `postMessage({type:"dragonboat:share"})`，父页复用 `shareResult()` 唤起分享面板
- 若 overlay/iframe 不存在，降级为直接跳转 `leaderboard.html`
- 点击用户行 → `navigateToProfile(uid)` → 跳转社区个人页
- **本地预览模式**：仍会先尝试调用网关接口；本地缺少京东登录态时接口可能失败，失败后回退到 `localStorage` 本地成绩；若条数不足50，用 `completeTopRows()` 填充模拟数据补足至50条
- **用户资料懒加载**：获取到榜单后，对有 pin 但缺少头像/昵称/uid 的条目，异步调用 `getDefaultUserByPin` 补充，结果缓存至 `dragonboatRankProfileCache`（TTL 24h）
- **当前用户资料缓存**：当前用户头像、昵称、UID 会缓存至 `dragonboatMyProfile`（TTL 7天），用于未上榜时仍在“本局得分”位置展示头像昵称
- **前三名高亮**：前3名增加金/银/铜高亮样式和圆形排名徽章，不改变排行榜整体高度
- **底部按钮**：`返回游戏`、`游戏规则`、`分享` 三个按钮同一行展示，节省页面高度

#### 5. 规则页 / 奖品页

打开时若游戏正在进行则暂停（`mode = "paused"`），关闭后恢复原 mode。

---

### 按钮汇总

| 按钮 | 所在页 | 动作 |
|------|--------|------|
| 开始游戏 | 开始页 | `resetGame()` |
| 游戏规则 | 开始页 | `openRulesOverlay()` |
| 奖品详情 | 开始页 | `openPrizeOverlay()` |
| 排行榜（左上角） | 游戏中 | `openLeaderboardOverlay()` |
| 再来一局 | 结束页 | `resetGame()` |
| 排行榜 | 结束页 | `openLeaderboardOverlay()` |
| 分享 | 结束页 | `shareResult()` |
| 我知道了 | 规则页/奖品页 | `closeXxxOverlay()` |
| 返回游戏 | 排行榜页(iframe内) | `postMessage` → `closeLeaderboardOverlay()` |
| 游戏规则 | 排行榜页(iframe内) | 打开排行榜内规则弹窗 |
| 分享 | 排行榜页(iframe内) | `postMessage` → 父页 `shareResult()` |

---

## 游戏参数配置

**实现位置**：`laya-game.js` 顶部常量

```javascript
const W = 414;                  // 游戏画布宽度
const H = 736;                  // 游戏画布高度
const GAME_AUDIO_VOLUME = 0.12; // 音效音量 (0~1)

const SCORE_RULES = {
  distanceFactor: 0.03, // 距离得分系数（每像素）
  zongzi: 30,           // 普通粽子得分
  gold: 60,             // 金色粽子得分
};

// 初始状态
state.lives = 2;        // 初始生命值
state.speed = 205;      // 初始速度（像素/秒），随分数最高增至430
state.safeTime = 1.6;   // intro结束后的无敌时间（秒）
```

**计分规则**：

- 行驶分：`score += dt × speed × 0.03`
- 页面显示距离：`distance += dt × speed × 0.055`
- 收集普通粽子：`+30分`
- 收集金色粽子：`+60分`

因此对用户可声明为：`总分 = 行驶得分 + 收集粽子得分`。注意页面显示的“距离”不是直接乘以 `0.03` 得到总分。

### 碰撞判定参数

```javascript
const playerHitbox = {
  centerY: 620,         // 龙舟碰撞中心 Y（画布坐标）
  halfWidth: 34,        // 左右半宽
  halfHeight: 78,       // 上下半高（用于收集物判定）
  frontHalfHeight: 50,  // 前方半高（用于障碍物判定）
};
const itemHitboxes = {
  zongzi:    { rx: 19, ry: 22 },
  gold:      { rx: 24, ry: 28 },
  log:       { rx: 36, ry: 15 },
  rock:      { rx: 27, ry: 22 },
  whirlpool: { rx: 29, ry: 15 },
};
```

碰撞检测使用椭圆重叠公式 `(dx/rx)² + (dy/ry)² ≤ 1`，障碍物还使用 `prevY` 做扫掠检测防穿透。

### 难度曲线

- 速度：`205 → 430 px/s`，随分数平滑增长
- 生成间隔：`0.88s → 0.42s`，分数越高越密集
- 高分（>3000）开始有概率额外生成一个障碍物（最高额外概率38%）
- 碰撞后无敌时间：1.1秒（`hitCooldown`）

### 性能与渲染保护

- 主循环目标帧率：`TARGET_FRAME_MS = 1000 / 60`
- DOM 装饰更新频率：`DOM_EFFECT_FRAME_MS = 1000 / 15`
- 同屏道具/障碍物上限：`MAX_ACTIVE_ITEMS = 24`
- 粒子上限：`MAX_PARTICLES = 48`
- Laya 抗锯齿关闭：`Laya.Config.isAntialias = false`
- 航标数量：每条边界 7 个，共 28 个
- HUD 仅在数值变化时更新 DOM，避免每帧重复写入

---

## 接口调用说明

### 分数上报

游戏结束（`lives <= 0`）时自动调用 `reportScoreToGateway()`，无需手动触发。上报成功后记录 `dragonboatMyBestScore` 到 localStorage。

上报接口请求体：
```json
{ "reqData": { "gameCode": "dragonboat_h5_20260619", "score": 1234, "pin": "用户pin" } }
```

`pin` 字段可选。若前端可读取 pin，则随请求上报；若前端读不到 pin，请求仍使用 `credentials: "include"` 携带登录态 Cookie，由网关侧解析当前登录用户。生产环境未登录用户会被 `ensureLogin()` 跳转登录。

### localStorage 数据缓存

| Key | 用途 |
|-----|------|
| `dragonboatMyBestScore` | 个人历史最高分（本地保存+上报成功后均更新） |
| `dragonboatMyPin` | 上报成功后缓存的用户 Pin |
| `dragonboatLastReportResult` | 最近一次上报结果（ok/msg/time） |
| `dragonboatLatestScore` | 本局完整成绩（score/distance/zongzi/time） |
| `dragonboatLeaderboard` | 本地排行榜前50条（供离线展示） |
| `dragonboatLeaderboardAll` | 本地排行榜全量最多500条 |
| `dragonboatLastShareState` | 最近一次分享状态（ok/shareState/sharePlat/time） |
| `dragonboatGameCode` | 游戏 Code（可通过 URL 参数覆盖） |
| `dragonboatRankProfileCache` | 排行榜用户头像/昵称/uid 缓存，TTL 24小时 |
| `dragonboatMyProfile` | 当前用户头像/昵称/uid 缓存，TTL 7天 |
| `dragonboatPlayerPin` | URL 参数中读取到的玩家 pin |
| `dragonboatUploadLogs` | 最近40条上报/查询调试日志 |
| `dragonboatLastUploadLog` | 最近一条上报/查询调试日志 |
| `dragonboatLastRankQuery` | 最近一次排行榜查询状态 |
| `dragonboatLastRankError` | 最近一次排行榜查询错误 |
| `dragonboatRankMissingProfiles` | 调试用：记录头像/昵称获取失败的榜单条目 |

---

## 本地预览

本地预览时（`localhost` / `127.0.0.1`）的特殊行为：

1. **跳过登录检测**：不强制跳转京东登录页
2. **接口可能失败**：网关接口需京东域 Cookie，本地通常无登录态
3. **排行榜兜底本地数据**：接口失败后从 localStorage 读取历史成绩

如需完整测试，建议部署到测试环境或在京东金融 App 内嵌访问。

---

## 控制方式

| 平台 | 控制方式 |
|------|---------|
| 移动端 | 触摸拖拽 / 左右滑动切换赛道 |
| 桌面端 | 方向键 ← → 或 A/D 键切换赛道 |

**最大单帧位移**：48px（防止快速移动穿透障碍物的碰撞检测隧道效应）

---

## 环境配置

| 环境 | 个人页域名 |
|------|-----------|
| 预发 | `utest.jr.jd.com` |
| 生产 | `roma.jd.com` |

可通过 URL 参数 `?personalEnv=preprod` 切换。

---

## 活动信息

| 项目 | 值 |
|------|-----|
| GameCode 规则 | `2026-06-18` 使用 `dragonboat_h5_202606`，之后按北京时间生成 `dragonboat_h5_YYYYMMDD` |
| 活动页 URL | `https://show.jd.com/n/QwMWVE53XAodKr0x/?pageKey=QwMWVE53XAodKr0x&v=20260717-boat-fallback` |
| 分享缩略图 | `https://m.360buyimg.com/babel/jfs/t16171/127/2505983508/7852/4cfd7bdf/5abc8954N23307760.png` |
| 当前 JS/CSS 版本号 | `20260717-boat-fallback` |
