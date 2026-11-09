# BoardForge 新增桌游接入指南（通用模板）

> 目标：新增一款桌游时，只写「这款游戏特有的东西」，其余（账号、房间、邀请、座位、联机同步、掉线、AI 托管、后台编辑器骨架、部署）全部复用。
> 本文是接入约定的唯一依据。按本文执行，不需要再讨论架构问题。

---

## 1. 四层架构

```
┌───────────────────────────────┐
│ UI 层        js/<game>-ui.js  │  渲染 + 交互 + 联机钩子（继承 OnlineGameBase）
├───────────────────────────────┤
│ AI 层        js/<game>-ai.js  │  pickAction(state, seat) → action
├───────────────────────────────┤
│ 引擎层       js/<game>-engine.js │ 纯函数：init / validate / apply / listValid
├───────────────────────────────┤
│ 数据层       js/<game>-data.js   │  静态数据 + 后台可覆盖（loadAdminData）
└───────────────────────────────┘
         ↑ 联机外壳（js/online-game.js）+ 房间后端（functions/api/room.js）
```

硬性规定：

- **引擎层必须是纯函数**，不碰 DOM、不碰网络、不用 `Date.now()` 以外的随机源（洗牌用引擎内可控随机）。
- **UI 层不写任何联机代码**（不写轮询、不写推送、不写版本号），只实现联机基类的钩子。
- **数据层必须先读后台覆盖**，否则后台可视化编辑器的修改不会生效。
- 所有游戏共用同一套联机外壳与后端，禁止在 `app.js` 里写 `if (game === 'xxx')` 的游戏分支。

---

## 2. 文件清单（以「卡坦岛」为例）

| 文件 | 必须 | 说明 |
|---|---|---|
| `js/catan-data.js` | 是 | 基础数据 + `loadAdminData('catan')` 覆盖 |
| `js/catan-engine.js` | 是 | 纯函数规则引擎 |
| `js/catan-ai.js` | 是 | 电脑玩家决策 |
| `js/catan-ui.js` | 是 | 界面，`class CatanGame extends OnlineGameBase` |
| `js/admin-catan.js` | 是 | 后台可视化编辑器（禁止 JSON） |
| `functions/api/_project.js` | 按需 | 有隐藏信息时增加裁剪规则 |
| `js/app.js` | 是 | `ONLINE_GAMES` 注册一项 |
| `index.html` | 是 | 大厅卡片 + 游戏容器 `#catan-game` |
| `js/admin-ui.js` | 是 | `ADMIN_GAMES` 中把 `ready` 置 true |

---

## 3. 接入五步

### 第一步：数据层

```js
import { loadAdminData } from './admin.js?v=35';

const BASE_CITIES = [...];

const override = loadAdminData('catan');
export const CITIES = override && override.CITIES ? override.CITIES : BASE_CITIES;
```

### 第二步：引擎层（纯函数）

必须导出：

```js
export function initGame(playerNames) { ... }          // 生成初始 state
export function validateAction(state, seat, action) { } // 返回错误字符串或空
export function applyAction(state, seat, action) { }    // 返回新 state，不修改入参
export function listValidActions(state, seat) { }       // AI / 提示用
```

约定：

- `state` 里必须有 `players[]`、`currentPlayer`、`phase`（`'ended'` 表示结束）。
- 玩家对象必须有 `name`、`isAI`、`score`（UI 与结算都依赖）。
- 引擎不能依赖 UI，必须能在 Node 里直接跑（这是自动化测试的前提）。

### 第三步：AI 层

```js
export function pickAction(state, seat) { ... }  // 返回合法动作；找不到时返回兜底动作
```

- 永远不要返回非法动作，也不要抛异常。
- 测试方式：Node 里跑 200 局全 AI 对局，确认能正常终局。

### 第四步：UI 层（继承通用联机基类）

```js
import { OnlineGameBase } from './online-game.js?v=1';

export class CatanGame extends OnlineGameBase {
  constructor(container, options = {}) {
    super(options);                 // 有 options.online 时自动创建联机会话
    this.root = ...;
    this.humanIndex = options.humanIndex ?? 0;
    this.initialState = options.initialState || null;
    this.state = null;
    this.online = options.online || null;
    this.memberOnline = null;
  }

  start() {
    this.state = this.initialState
      ? JSON.parse(JSON.stringify(this.initialState))   // 联机：用云端权威数据
      : initGame(this.playerNames);
    if (!this.initialState) {
      this.state.players.forEach((p, i) => { p.isAI = i !== this.humanIndex; });
    }
    this.render();
    if (this.session) this.scheduleAI(); else this.localAILoop();
  }

  // 玩家本地操作成功后必须调用
  afterChange() { this.scheduleAI(); this.pushLocal(); }

  render() { /* 重绘整个界面 */ }

  // ---- 联机基类钩子 ----
  aiAction(state, seat) { return pickAction(state, seat); }
  applyAIAction(seat, action) { this.state = applyAction(this.state, seat, action); }
  canRunAI() {
    return !!this.root && this.root.isConnected &&
      !this.root.classList.contains('hidden') && this.root.offsetParent !== null;
  }
  setMemberOnline(map) { this.memberOnline = map; }     // 座位 → 是否在线
  onRemoteState() { /* 清空本地未提交的交互草稿 */ }
  onSyncConflict() { this.msg = '同步冲突，正在重新拉取…'; this.render(); }
  onAIFailed(err) { this.msg = 'AI 动作失败：' + err.message; this.render(); }
}
```

联机基类自动处理：

| 能力 | 说明 |
|---|---|
| 状态拉取 | 房间轮询拿到更高版本时替换本地 state 并重绘 |
| 本地推送 | 串行合并，避免并发覆盖；版本号乐观锁，冲突自动提示 |
| AI 托管 | **仅房主端**代跑 AI 座位；人类座位永远等本人操作 |
| 掉线标记 | 成员 `online` 映射注入 `memberOnline`，UI 自行加「离线」徽标 |
| 房间内多人 | 座位 = 入座顺序，人数上限取房间设置 |

单机 / 联机同一套代码：`this.session` 为空即单机，AI 在本地跑。

### 第五步：注册

**大厅卡片**（`index.html`）：已开放的游戏排在前面，未开发的占位卡片放后面。

**联机注册表**（`js/app.js`）：

```js
const ONLINE_GAMES = {
  catan: {
    name: '卡坦岛',
    async prepare() {  // 可选：拉取后台覆盖数据（必须在 load 之前）
      const { syncGameConfig } = await import('./config-sync.js?v=35');
      await syncGameConfig('catan');
    },
    async load() {
      const [{ CatanGame }, engine] = await Promise.all([
        import('./catan-ui.js?v=1'),
        import('./catan-engine.js?v=1')
      ]);
      return {
        initState: (names) => engine.initGame(names),
        create: ({ data, isHost, push }) => {
          // 显示自己的容器、隐藏其他游戏容器
          document.getElementById('catan-game').classList.remove('hidden');
          const game = new CatanGame(document.getElementById('catan-game'), {
            humanIndex: typeof data.me.seat === 'number' ? data.me.seat : 0,
            initialState: data.state,
            online: { isHost, version: data.version, push }
          });
          game.start();
          return game;
        }
      };
    }
  }
};
```

注册后，邀请链接 / 等待页 / 开局 / 轮流操作 / 掉线 / AI 全部自动可用。

**后台编辑器**（`js/admin-ui.js`）：`ADMIN_GAMES` 里把对应项 `ready: true`，并在 `renderAdminPage` 中调用自己的可视化编辑器模块。

---

## 4. 隐藏信息裁剪（`functions/api/_project.js`）

原理：GET 房间状态时按「请求者座位」裁剪；POST 推送落库前，用数据库里的真实值补回被裁字段。

```js
const GAMES = {
  catan: {
    project(state, seat) { /* 返回裁剪后的副本：别人的手牌 → 张数 */ },
    merge(stored, incoming, seat) { /* 用 stored 恢复被裁字段 */ }
  }
};
```

规则：

- **纯展示**的隐藏信息必须裁（任务票、对手手牌、牌堆顺序）。
- **客户端执行规则必须读取**的数据不能裁（例如铁路环游的抽牌堆：客户端盲抽要拿真实牌），否则会拿到占位符。
- AI 座位的信息不用裁（房主要代跑 AI）。
- 不写 `project/merge` 的游戏 = 全公开，不做任何处理。

当前状态：铁路环游裁「其他人类玩家的任务票」；璀璨宝石全部公开，不裁。

---

## 5. UI 交互设计原则（硬性）

核心：**直接操作，不先选动作类型**。玩家点哪个东西，就是对哪个东西执行操作；禁止先点「购买 / 占领 / 抽牌」这类动作按钮再点目标。

- 点棋盘上的卡牌 = 买卡或预留（按当前资源自动判定），不提供动作下拉
- 点地图上的路线 = 占领，点票堆 = 抽票，点盲抽堆 = 盲抽
- 只有确实存在多种合法方案（如占领路线的支付组合）或误触代价高时，才进入二次确认；确认面板必须列出全部合法方案，默认选消耗最少的一种，并允许改选
- 选中态：再次点击同一对象取消选择；点击无关区域或开始其他操作时自动清除选中、收起面板
- 操作成功/失败原因一律走底部状态栏，不用弹窗；弹窗只用于终局、关键提醒
- 不可执行的操作不隐藏入口：点击后明确说明原因，禁止静默失败，也禁止「置灰且无提示」
- 联机：只有轮到自己时响应操作，否则不响应并提示「等待 XX 行动」
- 隐藏信息不上屏：别人的任务票只显示张数，不显示具体城市

## 6. 后台可视化编辑器（硬性）

- 禁止 JSON / 原始文本编辑入口；每个可配置项都必须有可视化控件。
- 交互模式统一为「左侧画布 + 右侧列表」或「分 tab 表单」，参考 `js/admin-ticket.js`。
- 地图类编辑器统一支持：拖动元素改坐标、点击选中并联动右侧列表、双击快捷编辑、右键删除、滚轮缩放 + 拖空白平移。
- 保存走 `saveAdminData(id, data)` + `saveConfigToCloud(id, data)`，前端数据层通过 `loadAdminData` 读取。
- 引用保护：删除被引用的实体（城市、卡牌类型等）必须拦截并提示。

---

## 7. 房间、路由与联机参数

**路由**

| 用途 | 形式 |
|---|---|
| 登录 / 大厅 | `#/login` / `#/lobby` |
| 房间 | `#/room/<CODE>` |
| 单游戏受限入口的房间 | `#/g/<gid>/room/<CODE>` |
| 后台 | `#/admin` |

- 房间的游戏类型解析顺序固定为：URL 显式参数 > URL 提示 > 当前会话 > `/api/rooms` 返回值 > 本机记忆。**禁止为任何游戏写死默认值**（历史 bug：刷新后铁路环游房间变成璀璨宝石）。
- 分享链接优先使用 `#/g/<gid>/room/<CODE>`，保证对方打开即知道游戏。
- 未登录点开房间链接时，先记下目标路由，登录/注册成功后自动跳回。
- 刷新后必须能恢复：房间、座位、对局进度、AI 代跑身份（房主由服务端 `me.is_owner` 判定，不能依赖内存标记）。

**联机参数（统一，不要各游戏自定义）**

- 房间状态轮询：2 秒
- 在线判定：15 秒内有心跳
- 移出房间：60 秒无心跳
- 座位：按入座顺序分配最小空位
- 开局人数：2 ~ 房间上限；AI 补位数量 = min(房主设置, 上限 − 实际人数)
- 初始状态只由房主生成一次，`POST start` 后其他端一律使用云端 state；禁止各端自行 `initGame`
- 随机（洗牌等）只在房主端发生一次
- 推送使用版本号乐观锁，冲突返回 409，前端提示并等待下一轮拉取
- 联机对局不提供本地「再来一局」，统一回大厅重建房间

## 8. 图片与静态资源

- 项目未开通 R2（需信用卡）：图片统一走 `POST /api/upload`（multipart，仅 admin），优先存 KV，未绑定 KV 时回落 D1；读取 `GET /api/image/<game>/<id>`（KV → D1 → CDN 缓存）。
- 上传限制：单张 ≤ 10MB，仅 PNG / JPEG / WebP / GIF；前端先压缩再上传。
- 图片 URL 必须带 `?v=<时间戳>`，否则换图后玩家仍看到旧图。
- 新增游戏若需要卡面图，沿用 `<game>:<id>` 作为存储键，不要另建图床。

## 9. 布局与容器规范

- 每个游戏一个独立容器 `#<game>-game`，进入对局时只显示自己的，其余隐藏。
- 重新进入房间或重开时，用 `cloneNode(false)` 重建容器（清空旧事件监听），避免重复绑定。
- 页面使用浏览器原生滚动，**禁止给游戏容器加内部滚动条**（历史上导致内容被裁剪）。
- 关键状态不能只靠颜色区分，必须同时有文字或图标（如「离线」徽标）。

## 10. 数据与表结构

- 新表必须在代码里 `CREATE TABLE IF NOT EXISTS` 自动创建（参考 `room.js` 的 `ensureTables`），不依赖手工执行 SQL。
- 后台覆盖数据：本地 `saveAdminData` + 云端 `saveConfigToCloud` 双写；游戏数据层通过 `loadAdminData` 读取。
- 后台保存后，已打开的玩家页面不会自动更新（模块级缓存），需刷新；编辑器页也需刷新才能看到最新数据。
- `state` 必须是可 JSON 序列化的纯数据，不存 DOM、函数、Date 实例；控制体积（建议 < 200KB）。

## 11. 管理员与权限可见性

- 普通玩家界面不得出现任何管理入口；管理员判定以服务端返回为准。
- 切换账号/登出时必须清理管理员入口 DOM（`#admin-entry`），仅刷新页面不算。
- 后台接口一律服务端校验 admin 身份，不能只靠前端隐藏按钮。
- 房间管理动作（开始、重置）仅房主可用，服务端校验 `is_owner`。

## 12. 新增游戏检查清单

逐项勾选后再提测：

- [ ] 数据层读取 `loadAdminData`，后台改动能生效
- [ ] 引擎为纯函数，Node 可跑，200 局 AI 自对弈正常终局
- [ ] AI 永不返回非法动作，异常有兜底
- [ ] UI 继承 `OnlineGameBase`，实现全部钩子
- [ ] 本地操作成功后调用 `afterChange()`
- [ ] `ONLINE_GAMES` 注册（含 `prepare` 拉取后台数据）
- [ ] 大厅卡片 + `#<game>-game` 容器与显示/隐藏正确
- [ ] 隐藏信息已接入 `_project.js` 的 project / merge
- [ ] 后台可视化编辑器可用，`ready: true`
- [ ] 所有引用处的版本号同步升级
- [ ] 双账号实测：入座、开局、轮换、掉线、刷新恢复
- [ ] 部署后抓取线上文件确认版本已生效

## 13. 版本号与缓存

- 所有 ES module 引用都带 `?v=N`；改文件后**必须**同步升级引用处的版本号。
- 入口 `index.html` 里 `app.js?v=N`、`style.css?v=N` 是最外层缓存开关，改样式或入口必经此处升级。
- 动态 import 的版本号写在 `app.js` 注册表里，改对应 UI 时升级。
- 不做版本升级会导致用户看到旧代码，是最常见的「改了没生效」原因。

---

## 14. 测试清单

新增或修改游戏后按顺序执行：

1. `node --check` 所有改动文件。
2. 引擎纯函数测试：初始状态合法、非法动作被拦截、AI 自对弈 100~200 局全部正常终局。
3. 联机基类测试（Node + 假游戏）：推送合并、旧版本忽略、新版本应用、掉线映射、房主代跑 AI。
4. 编辑器驱动器测试（Node + 假 DOM）：SVG/表单渲染数量正确、非法数据被校验拦截、页面不存在 JSON 编辑入口。
5. 浏览器双账号实测：
   - A 建房 → 分享链接 → B 打开并自动入座
   - 等待页人数/在线状态正确，B 掉线 15 秒后显示离线
   - 房主开局，两端座位一致，轮到自己才能操作
   - 双方交替操作，刷新页面后进度不丢
   - 房主端 AI 自动行动，客人端只读
   - 交互走直接操作：不经过任何"动作类型"按钮即可完成一次完整回合

---

## 15. 部署

1. `git add` 具体文件 → commit → `git push origin main`。
2. Cloudflare Pages Git 集成自动部署（约 30~60 秒），无需 wrangler、无需 Token。
3. 部署后验证：抓取 `index.html` 确认版本号、抓取对应 JS/CSS 确认新代码已上线。
4. 让用户 `Ctrl+Shift+R` 强刷。

---

## 16. 常见坑

- **忘了 `loadAdminData`**：后台改了数据但游戏里没变。
- **引擎用了 DOM / 网络**：没法跑自动化测试，也无法迁移到服务端。
- **UI 自己写轮询或推送**：与通用联机外壳叠加会导致版本错乱。
- **AI 在客人端也跑**：两个客户端同时推进，状态互相覆盖。
- **裁剪了客户端必须读取的数据**：盲抽、随机事件会拿到占位符。
- **改了文件没升版本号**：用户看到旧界面，误判为「没生效」。
- **等待页用本地占位成员**：必须用 `/api/room` 返回的成员列表。
- **先选动作类型再点目标**：破坏直接操作原则，玩家要多点一步且容易选错；应改成点目标即操作。
- **房间类型写死默认游戏**：刷新后房间会变成别的游戏；必须按「URL > 提示 > 会话 > 房间接口 > 本机记忆」解析，不设默认值。
- **各端自行 `initGame` 或各自随机**：开局数据分叉、AI 与玩家看到不同的牌；初始状态只能由房主生成一次。
- **换了图片但 URL 没带 `?v=`**：玩家仍看到旧卡图。
- **游戏容器内部滚动**：内容被裁剪，移动端尤其明显。
