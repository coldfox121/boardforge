# BoardForge · 项目 Checkpoint · 2026-11-09

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
| **D1** | `boardforge-db`（绑定为 `DB`）：users / sessions / rooms / room_members / room_states / game_config / card_images |
| **KV** | `boardforge-images`（绑定为 `CARDS_KV`）：卡牌图片二进制 |
| **测试账号** | `test01` / `uitest01` |
| **Admin 账号** | 注册时用户名写 `admin` 即可（前端硬编码检测 username==='admin' 给 is_admin=true） |
| **当前 cache bust** | `app.js?v=43`、`style.css?v=42`（改文件必须同步升级引用处的版本号） |
| **当前功能完整度** | 璀璨宝石 + 铁路环游（美国版）均支持联机对局；两者都有后台可视化编辑器；新增游戏接入见 `GAME-GUIDE.md` |

## 🏗 文件结构

```
boardforge/
├── index.html              ← SPA 入口，hash 路由（引用 JS 时带 ?v=N）
├── style.css               ← 全局样式 + 组件样式（当前 v=31）
├── CHECKPOINT.md           ← 本文档
├── DEVELOPMENT_TIMELINE.md ← 开发时间线（按天记录做了什么）
├── js/
│   ├── app.js              ← 入口：路由 / 登录 / 大厅 / 房间流程（按需动态 import 游戏模块）
│   ├── splendor-data.js    ← 90 张卡 + 10 贵族静态基线数据
│   ├── splendor-engine.js  ← 纯函数引擎（initGame / validateAction / applyAction / listValidActions）
│   ├── splendor-ai.js      ← 启发式 AI（pickAction）
│   ├── splendor-ui.js      ← UI 控制器（单类，renderAll + 事件绑定）
│   ├── admin.js            ← Admin 数据层（localStorage 缓存 + mergeAdmin + BalanceStats）
│   ├── admin-ui.js         ← Admin 编辑器（平衡性分析 + JSON 编辑 + 卡图上传）
│   └── config-sync.js      ← 云端牌库同步 + 图片压缩上传 + 卡图 URL
├── functions/
│   ├── _shared.js          ← json() / 密码哈希 / getAuthUser() / isAdmin() / 房间清理
│   └── api/
│       ├── register.js / login.js / logout.js / health.js
│       ├── load.js / save.js
│       ├── rooms.js        ← POST 创建 / GET 列表（只查 waiting）
│       ├── games.js
│       ├── config.js       ← GET/PUT 云端牌库配置（D1 game_config）
│       ├── upload.js       ← POST/DELETE 卡图（优先 KV，回落 D1）
│       └── image/[[path]].js ← GET 卡图（KV → D1 回落，带边缘缓存）
├── scripts/
│   └── seed-cards.mjs      ← 批量生成卡图并写入云端
└── d1/schema.sql           ← users / sessions / rooms / game_config / card_images
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

## 🤖 AI 策略（当前版本）

文件：`js/splendor-ai.js`，导出 `pickAction(state, playerIndex)`，纯贪心 + 启发式打分。

### 打分权重

| 动作 | 分值构成 |
|---|---|
| **BUY** | `1000 + vp*80 + 同色已有卡数*6 + 贵族进度*10` |
| **RESERVE** | `6 + vp*4`；差 ≤2 颗 +16、差 ≤4 颗 +6、对手买得起 +16、黄金未满 +4；已预留 ≥2 张 -15、≥3 张 -40 |
| **TAKE_DIFF / TAKE_SAME** | 逐颗结算：需求内 `11/颗`、需求外 `1.5/颗`，再 `+5/颗` 数量奖励；超过 9 颗 -6 |

### 关键：拿取数量必须参与计分

旧版是 `需要的颜色数 × 0.5`，**和实际拿几颗无关**。只有 1 个颜色有需求时，"拿 1 颗"和"拿 3 颗"打平，而比较用 `>`，平局保留列表里靠前的单项动作 → 表现为"明明能拿 3 颗只拿 1-2 颗"。

现在按颗结算并叠加数量奖励，模拟结果（各人数 40 场）：

| 局 | 完成率 | 平均步数 | 平均每次拿 | 1颗 / 2颗 / 3颗 |
|---|---|---|---|---|
| 2 人 | 40/40 | 55.8 | 2.99 | 0 / 7 / 535 |
| 3 人 | 40/40 | 79.6 | 2.98 | 0 / 17 / 809 |
| 4 人 | 40/40 | 104.2 | 2.98 | 0 / 23 / 1277 |

### 需求向量怎么算

1. 收集场上 + 自己预留的所有卡，按"还差几颗宝石"升序
2. 只看最接近买得起的 **3 张**，把每色缺口累加
3. 单色需求封顶 3（一回合最多拿 2 同色，囤更多没意义）

### 调参注意

- RESERVE 的 VP 权重不能太高（`vp*10` 会让 AI 开局连锁 3 张大牌、完全不拿宝石）
- 预留槽惩罚必留（最多 3 个，锁满后必须能靠买预留卡腾位）

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
| **JSON 编辑器** | 完整 JSON 编辑，实时校验（语法+业务规则），保存到云端 D1（`game_config`）+ 本地缓存 |
| **对比基线** | 跟官方基线 diff：新增/删除/修改卡 + 贵族变更 |
| **卡图管理** | 每张卡上传/替换/删除图片（前端压到 1024px WebP，存 KV） |

### 引擎自动应用覆盖

```js
// app.js 进游戏前：await syncGameConfig('splendor') 从 /api/config 拉云端配置写入 localStorage
// splendor-engine.js 模块加载时：
const _admin = loadAdminData('splendor');  // 读本地缓存
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

- admin 权限 = 登录时 username === 'admin'（服务端 `isAdmin()` 与前端一致）
- 牌库配置存 D1（`game_config`），卡图存 KV，localStorage 只是本地缓存
- 上传/删除/写配置接口都会校验登录 + admin
- 以后 DO 联机时升级：users.role 字段 + 牌库版本号，避免编辑中途影响进行中的对局

## 🖼 卡图存储（KV）

### 为什么不用 R2

R2 免额度也要绑信用卡，直接排除。卡图这体量（单张压缩后 30–80KB）**完全用不上对象存储**。

### 当前链路

```
前端选图 → canvas 压到最长边 1024px / WebP → ≤600KB（逐步降质，最低 0.5）
        → POST /api/upload（multipart）
        → 优先 KV：cardimg:<game>:<cardId>（二进制，不 base64）
        → 未绑定 KV 时回落 D1 card_images（base64，单张约 675KB 上限）
        → 返回 /api/image/<game>/<cardId>?v=<时间戳>
```

读取：`GET /api/image/<game>/<cardId>` → **先 KV，读不到回落 D1**（历史图不用重传）→ 响应带 `Cache-Control: immutable` 并写入 `caches.default`，避免反复消耗 KV 读次数。

### KV 规格

| 项 | 值 |
|---|---|
| 绑定名 | `CARDS_KV` |
| 命名空间 | `boardforge-images` |
| 单值上限 | 25 MB |
| 免费额度 | 1 GB 存储 / 10 万读/天 / 1000 写/天 |
| 本项目用量 | 100 张卡约 8 MB |

### 注意

- 上传/删除接口都要求登录 + admin
- 换图必须更新 URL 的 `?v=`（`upload.js` 自动带时间戳），否则边缘缓存会返回旧图
- 删除时会同时清 KV 和 D1，避免回落路径读到旧数据
- 绑定在 Pages 后台：Settings → Functions → KV namespace bindings（不需要 wrangler.toml）

## 🔑 部署笔记

### Cloudflare Pages 集成

- Git 集成，push 到 main 自动部署
- D1 绑定为 `DB`，KV 绑定为 `CARDS_KV`
- **wrangler.toml 不能在仓库里**（Pages 不需要）
- `build_config` 三字段必须是空字符串 `""`（不是 "/" 或 null）
- 可通过 API 改部署配置：`PATCH /accounts/{acc}/pages/projects/{name}`，`deployment_configs.{production,preview}.kv_namespaces`（PATCH 是合并，不会清掉 D1 绑定）

### 缓存地狱（必须记住）

- **style.css?v=N** 每次必须递增（当前 v=31）
- **JS 模块引用**也要带版本：`import ... from './x.js?v=27'`；所有文件必须用**同一个版本号**，否则同一模块被加载两份
- `index.html` 里 `app.js?v=N` 同步递增
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

房间与联机已上线（D1 轮询方案，未使用 Durable Objects）：

- ✅ `POST /api/rooms` 创建、`GET /api/rooms` 列出
- ✅ `GET /api/room?code=` 同步房间 / 成员 / 在线状态 / 对局版本
- ✅ `POST /api/room`：join / leave / start / push / reset
- ✅ 座位按入座顺序分配；15 秒无心跳判离线，60 秒移出房间
- ✅ 对局状态推送带版本号乐观锁（冲突 409），房主端代跑 AI 座位
- ✅ 按座位裁剪隐藏信息（铁路环游任务票），推送落库前自动补回
- ✅ 前端通用联机外壳：`js/online-game.js`（`OnlineGameBase`）+ `app.js` 的 `ONLINE_GAMES` 注册表
- ✅ 已接入联机：璀璨宝石、铁路环游（美国版）
- ❌ 没有 Workers Cron 自动清理僵尸房

新增游戏接入方式、联机契约、裁剪规则见 `GAME-GUIDE.md`。

## 📊 平衡数据

Splendor 原版平衡数据（admin 页面"平衡性分析"tab 展示的基线）：
- 1级卡 40 张 / 2级卡 30 张 / 3级卡 20 张
- 10 张贵族
- 性价比曲线：1级最低 → 2级中间 → 3级最高（合理）

## 🎯 下一步

1. **卡坦岛**：按 `GAME-GUIDE.md` 五步接入（数据 / 引擎 / AI / UI / 注册 + 可视化编辑器）
2. **奥地利大饭店**：同上
3. **魔改框架**：自定义规则覆盖引擎，作为平台特性
4. **卡图增强**：批量导入 BGG 图包 / AI 生成卡图
5. **观战 / 好友邀请推送**
6. **房间生命周期**：Cron 自动清理僵尸房
