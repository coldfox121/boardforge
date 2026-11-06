# BoardForge · 项目 Checkpoint · 2026-11-06

## 🚀 快速开始

```bash
# 拉代码
git clone https://github.com/coldfox121/boardforge.git
cd boardforge

# 本地预览（纯静态，不需要构建）
# 用任意静态服务器都行：
python -m http.server 8080
# 或
npx serve .

# 打开 http://localhost:8080
```

## 📦 当前状态

| 项 | 值 |
|---|---|
| **线上** | https://boardforge.pages.dev |
| **GitHub** | https://github.com/coldfox121/boardforge |
| **D1** | `boardforge-db`（绑定为 `DB`） |
| **测试账号** | `test01` / `uitest01` |
| **Admin 账号** | 注册时用户名写 `admin` 即可（前端硬编码检测 username==='admin' 给 is_admin=true） |
| **当前 cache bust** | style.css?v=21 |
| **当前功能完整度** | Splendor 单机 + AI 完整可玩 |

## 🏗 文件结构

```
boardforge/
├── index.html              ← SPA 入口，hash 路由
├── style.css               ← 全局样式 + 组件样式（当前 v=21）
├── js/
│   ├── app.js              ← 入口：路由 / 登录 / 大厅 / Room API
│   ├── splendor-data.js    ← 90 张卡 + 10 贵族静态数据（可被 admin 覆盖）
│   ├── splendor-engine.js  ← 纯函数引擎（initGame / validateAction / applyAction / listValidActions）
│   ├── splendor-ai.js      ← 贪心策略 AI（pickAction）
│   ├── splendor-ui.js      ← UI 控制器（单类，renderAll + 事件绑定）
│   ├── admin.js            ← Admin 数据层（localStorage 覆盖 + mergeAdmin + BalanceStats）
│   └── admin-ui.js         ← Admin 编辑器（平衡性分析 + JSON 编辑 + 基线对比）
├── functions/api/
│   ├── register.js         ← POST /api/register
│   ├── login.js            ← POST /api/login（返回 is_admin）
│   ├── logout.js
│   ├── health.js
│   ├── load.js / save.js
│   ├── rooms.js            ← POST 创建 / GET 列表（只查 waiting）
│   └── games.js
├── functions/_shared.js    ← json() / hashPassword() / getAuthUser() / isAdmin()
└── d1/schema.sql           ← users / sessions / rooms
```

## 🎮 Splendor 引擎核心（已全部确认正确）

### Engine 数据结构

```js
// GEM_COLORS 顺序永远固定：['white','blue','green','red','black']
// 所有排序以此为准，保证手里卡列对齐

// initGame 初始化
setup = {
  gemPool: { white:N, blue:N, green:N, red:N, black:N, gold:5 },  // 2人4/3人5/4人7
  nobles: shuffle(NOBLES).slice(0, players.length + 1),           // 2人3/3人4/4人5
  // 每级永远翻 4 张，不受人数影响
}

// 玩家结构
player = {
  gems: { white:0, blue:0, green:0, red:0, black:0, gold:0 },
  ownedCards: [],        // 已购买卡
  reservedCards: [],     // 预留卡（最多 3 张）
  nobles: [],            // 贵族（满足条件自动获得）
  score: 0               // VP
}
```

### 规则检查清单

| 规则 | 实现 | 位置 |
|---|---|---|
| 每级翻牌永远 4 张 | ✅ | engine.js initGame |
| 宝石堆数量 2人4/3人5/4人7 | ✅ | engine.js initGame |
| 拿宝石：1-3 颗不同色 **或** 2 颗同色（pool≥4） | ✅ | validateAction TAKE_DIFF/TAKE_SAME |
| 拿宝石不强制凑满 3 颗 | ✅ | 允许 1/2/3 颗 |
| 超 10 颗 → UI 层让玩家弃掉 | ✅ | validateAction 也拦了（双保险） |
| 黄金不能与普通宝石同回合 | ✅ | validateAction 互斥 |
| 黄金 = 预留卡组合 | ✅ | RESERVE 动作 |
| 预留最多 3 张 + 1 黄金 | ✅ | validateAction |
| 买卡先卡面抵扣再宝石再黄金补 | ✅ | applyAction 支付顺序 |
| 支付完宝石全部归还公共池 | ✅ | applyAction BUY |
| 贵族自动触发 +3 分 | ✅ | applyAction BUY/RESERVE 后检查 |
| 终局：公平轮（所有人走相同轮数） | ✅ | countdown=N-1, 只非触发者-1 |

### 终局逻辑（极其重要，不要改反）

```
触发者 BUY 后 score >= 15:
  endTriggeredBy = playerIndex
  _endCountdown = players.length - 1
  _justTriggeredEnd = true（UI toast + 一次性标记）

每个非触发者走完回合:
  _endCountdown--
  if _endCountdown <= 0:
    gameOver = true
    算赢家（同分比卡数多者胜）
```

**Trace 验证 3 人局 A 触发**：
```
A 走完第 K 轮触发 → countdown=2
B 走第 K 轮 → countdown=1   (B 补到 K)
C 走第 K 轮 → countdown=0 → gameOver  (C 补到 K)
最终：A=K, B=K, C=K ✅ 公平！
```

**2 人局**：A 触发 → B 补一轮 → gameOver。A=K, B=K ✅

**千万不要改成**：`countdown=players.length` + 所有人都 -1 → 触发者多走一轮 ❌

### 卡面抵扣顺序（极其重要）

```
cost = { blue: 4 }
player.gems.blue = 3
player 已有蓝色卡 1 张（cardBonus）

// 先卡面 → 再宝石 → 最后黄金
payFromBonus = min(cardBonus, need) = min(1,4) = 1
gemNeed = 4 - 1 = 3
payFromGems = min(gems, gemNeed) = min(3, 3) = 3
goldNeed = 3 - 3 = 0

// 正确！扣 3 颗蓝宝石，不用黄金
```

## 🎨 UI 层关键设计

### 四面环绕布局（CSS Grid）

```
grid-template-rows: auto 1fr auto
grid-template-columns: auto 1fr auto

        [ top: AI-2 ]      ← row 1, max-height: 125px, overflow: visible
[ left: AI-1 ]  [ center: board ]  [ right: AI-3 ]  ← row 2, 1fr
        [ bottom: 我（横跨全宽）] ← row 3, auto

2人局只显示 left + bottom
3人局 left + top + bottom
```

### 黄金 vs 普通宝石的 click 路由（历史坑点）

```
// 正确
gold pile click → _onGemClick('gold') → 检查池有黄金 → goldTaken=true → 进预留模式
color pile click → _onGemPlus(color) → push ops.gems

// 错误（之前踩过）
gold pile click 绑了 _onGemPlus → goldTaken 永远 false → 点完黄金点棋盘卡还走买卡分支
```

### VP=0 的卡对齐

```js
// 正确：?? 0 而不是 || ''
`${card.vp ?? 0}`  // vp=0 时显示 "0"，div 高度保持一致

// 错误：vp=0 时空字符串，card-vp div 高度塌了，颜色条和费用块整体上移
`${card.vp || ''}`
```

### 手里同色卡竖叠

按颜色分组 → 同色卡叠在一起（`position: absolute` + 每张向左上偏 3px）+ 右下角金色 `×N` 角标，顶层卡显示 VP 加和。

### 没有内部滚轮

`.splendor-side` 和 `.ps-owned` 都设 `overflow: visible`，内容多了自然撑高，**浏览器原生滚动条**。

## 🛠 Admin 模式

### 怎么进

1. 注册时用户名写 `admin`（前端 `isAdmin = (username === 'admin')`）
2. 登录后大厅右上角金色 `🛠 Admin 牌库编辑` 按钮
3. URL：`#/admin`

### 三层功能

| Tab | 功能 |
|---|---|
| **平衡性分析** | 三级卡分别显示：数量/平均费用/性价比/VP分布条形图/费用颜色分布% |
| **JSON 编辑器** | 完整 JSON 编辑，实时校验（语法+业务规则），保存到 localStorage |
| **对比基线** | 跟官方基线 diff：新增/删除/修改卡 + 贵族变更 |

### 引擎自动应用覆盖

```js
// splendor-engine.js 模块加载时：
const _admin = loadAdminData('splendor');  // 读 localStorage
const E_CARDS = _admin?.CARDS || CARDS;
const E_NOBLES = _admin?.NOBLES || NOBLES;
// initGame 用 E_ 前缀版本
```

UI 层和 AI 层完全透明（从 state 读数据）。

### 架构（以后新游戏通用）

```
admin.js → 数据层（save/load/clear + mergeAdmin + BalanceStats）
admin-ui.js → UI 层（Tab + JSON 编辑器 + 分析）
admin.GAMES 注册表 → 每个游戏只需 push 一个：
  splendor: { id, name, getDefaultData, validate, analyze }
```

### 安全诚实说明

- admin 权限 = 登录时 username === 'admin' → localStorage bf_is_admin=true
- 数据只存 localStorage，**不碰服务端**
- DevTools 改 localStorage 能绕过 admin 检查（但只影响自己浏览器）
- 以后 DO 联机时升级：服务端 users.role='admin' + 牌库版本管理

## 🔑 部署笔记

### Cloudflare Pages 集成

- Git 集成，push 到 main 自动部署
- D1 绑定为 `DB`
- **wrangler.toml 不能在仓库里**（Pages 不需要）
- `build_config` 三字段必须是空字符串 `""`（不是 "/" 或 null）

### 缓存地狱（必须记住）

- **style.css?v=N** 每次必须递增（v=21 当前）
- JS 文件不需要 cache bust（用 type=module，浏览器会 ETag）
- Ctrl+Shift+R 偶尔不够 → DevTools 打开 → 右键刷新 → 清空缓存硬性重载
- 浏览器 computed styles vs 代码：之前浏览器还在用 v=11 旧 CSS，cache bust v=12 才生效

## 🐛 踩过的坑（不要再踩）

### PowerShell 替换灾难

用 PowerShell `$content -replace '\bCARDS\b', 'E_CARDS'` 会把**所有**出现 CARDS 的地方都替换（包括业务属性 `setup.NOBLES` 被换成 `setup.ADMIN_CARDS`，`p.nobles` 被换成 `p.ADMIN_nobles`）。

**正确做法**：只在 initGame 数据加载点手动替换，不要用正则批量。

### dot CSS 选择器

旧：`.card-cost .dot.white`（嵌套在 .card-cost 下）
新：`.cost-chip .dot.white`（或更外层）

HTML 结构变了 → 选择器不匹配 → 颜色丢失。**dot 颜色规则挂的父类要跟 HTML 结构匹配**，或者直接用全局 `.dot.white { background: ... }`。

### AI 不动的历史根因

不是 AI 逻辑问题，是 `playerNames` 数组只有 1 人导致 initGame throw。保底：
```js
while (names.length < 2) names.push(`AI-${names.length + 1}`);
```

### 黄金池预检查

UI 层之前拦住黄金池空的情况不让进预留模式。但"点黄金 = 我要预留"这个认知下，应该让 UI 放行，最终由引擎 validateAction 统一校验。不过用户反馈还是想先有黄金才能进 → 恢复 UI 层检查。

### 自动切预留要同步设 goldTaken

用户没点黄金、直接点棋盘卡、买不了 → 系统自动切预留时，**必须同时设 `this.ops.goldTaken = true`**，否则 confirm 时 `_analyzeIntent()` 检测到 `ops.card && !goldTaken` → 走 buy 分支 → validate BUY → 失败 → 假错。

## 📡 Room / 联机状态

当前 Room API 只是个壳：
- ✅ `POST /api/rooms` 创建
- ✅ `GET /api/rooms` 列出（只查 waiting, LIMIT 20）
- ❌ 没有 DELETE / leave / close
- ❌ 没有 join / update current_players
- ❌ 没有 Workers Cron 自动清理僵尸房
- ❌ 没有 Durable Objects 联机

计划：DO 联机时一起补（join / leave / start / end + Cron 清 24h 前的僵尸房）。

## 📊 平衡数据

Splendor 原版平衡数据（admin 页面"平衡性分析"tab 展示的基线）：
- 1级卡 40 张 / 2级卡 30 张 / 3级卡 20 张
- 10 张贵族
- 性价比曲线：1级最低 → 2级中间 → 3级最高（合理）

## 🎯 下一步

1. **Durable Objects 联机**：每个房间一个 DO 实例，WebSocket 广播状态
2. **魔改框架**：自定义规则覆盖引擎，作为平台特性
3. **卡坦岛 / 铁路环游 / 奥地利大饭店**：按顺序实现
4. **卡牌美术替换接口**：BGG 图上传 / AI 生成接口预留
5. **观战 / 好友邀请推送**
6. **房间生命周期**：join / leave API + D1 迁移 + 自动清理
