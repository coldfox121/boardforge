# BoardForge · 开发时间线

> 基于 git 历史反推生成 · 数据来源：`git log main --reverse`
> 全部 49 个提交集中在 **2026-11-06 15:47 ~ 19:06**（约 3.5 小时集中开发）

---

## 总览

| 阶段 | 时间 | 主题 | 提交数 |
|------|------|------|--------|
| ① | 15:47 – 15:52 | 平台骨架 + 账号系统 | 2 |
| ② | 16:11 – 17:07 | 路由 + 房间系统 + 规则纠正 | 10 |
| ③ | 17:09 – 17:17 | Splendor 引擎初版（完整可玩） | 2 |
| ④ | 17:27 – 17:59 | 中文化 + AI 补位 + 缓存坑 | 8 |
| ⑤ | 18:01 – 18:07 | 交互模式重写（直接操作） | 5 |
| ⑥ | 18:08 – 18:30 | UI 打磨 + 规则细化 | 11 |
| ⑦ | 18:32 – 18:39 | 关键 bug 修复（支付/黄金路由） | 6 |
| ⑧ | 18:42 – 18:56 | 高级功能（竖叠/贵族/终局） | 6 |
| ⑨ | 19:02 – 19:06 | Admin 模式 + 终局定稿 + 文档 | 4 |

---

## ① 平台骨架 + 账号系统
**15:47 – 15:52**

| 时间 | 提交 | 内容 |
|------|------|------|
| 15:47 | `dbf5fb6` | init boardforge：平台骨架 + 账号系统 + 前端壳子 |
| 15:52 | `123724b` | fix Functions routing：合并 room-create/room-list 到 rooms.js，加 wrangler.toml |

**产出**：注册/登录/会话（PBKDF2）、大厅页、房间 API 壳子。

---

## ② 路由 + 房间系统 + 规则纠正
**16:11 – 17:07**

| 时间 | 提交 | 内容 |
|------|------|------|
| 16:11 | `29ba9fd` | 移除 wrangler.toml（Pages Git 集成不需要） |
| 16:26 | `cfbc09a` | feat：hash 路由 + 创建/加入房间 modal + 分享链接 |
| 16:36 | `f5286a3` | fix：hash 路由 room view 竞态 + 登录后跳转 + 分享链接复制 |
| 16:43 | `fd333db` | feat：受限访客模式 `/g/<gameId>` —— 朋友只看到一个游戏 |
| 16:53 | `48c8ac7` | chore：cache busting v=3 |
| 16:57 | `e72fe08` | fix：navigate() 同 hash 强制手动触发路由 —— 防止 modal-close-then-click 死锁 |
| 17:04 | `5c80d86` | refactor：移除创建房间人数选择，固定最大 4 人，开始按实际在场人数初始化 |
| 17:06 | `42b44fa` | fix：点游戏卡片不改 URL，只有创建/加入房间才改 URL；清理废弃 /game 路由 |
| 17:07 | `f92e218` | fix：璀璨宝石规则纠正 —— 每级永远翻 4 张，不受人数影响；GAMES 配置加 setup 参数 |
| 17:09 | `330d6cf` | feat：房间页加 📖 规则按钮 + Modal（完整璀璨宝石规则摘要）；后端新增 /api/games 游戏目录接口 |

**关键决策**：
- 房间人数固定最大 4，开局按实际人数初始化
- 每级翻牌恒为 4 张（Splendor 官方规则）
- 引入 cache busting 机制（v=3 起）

---

## ③ Splendor 引擎初版（完整可玩）
**17:17**

| 时间 | 提交 | 内容 |
|------|------|------|
| 17:17 | `a8b82fb` | feat：璀璨宝石完整可玩引擎（纯函数 + AI 贪心）+ CSS 卡牌渲染 + 房间准备界面（AI 补位 + 热座），单机 2-4 人完整四选一回合 |

**里程碑**：引擎核心一次成型 —— `initGame` / `validateAction` / `applyAction` / `listValidActions` + 贪心 AI。

---

## ④ 中文化 + AI 补位 + 缓存坑
**17:27 – 17:59**

| 时间 | 提交 | 内容 |
|------|------|------|
| 17:27 | `dbf2dbb` | fix：Noble → 贵族，所有用户可见文本中文化 |
| 17:30 | `fccb3d5` | fix：所有 Noble 可见文本 + 注释统一改为贵族 |
| 17:31 | `0b9dc1c` | fix：AI 补位不操作 —— initGame 后给非人类玩家打 isAI: true 标记 |
| 17:45 | `28bd777` | fix+refactor：AI 不动根因排查 + 交互彻底重写为「选动作 → 点选宝石/卡 → 预览 → 确认执行/撤回」，全带视觉反馈 |
| 17:46 | `c08907e` | fix：贵族条件显示 + 引擎读取 —— NOBLES 数据结构是 `noble.req[color]` 不是 `noble[color]`，引擎和 UI 之前都读错层了 |
| 17:48 | `ae4aecf` | feat：黄金宝石视觉拉开距离 + 点击自动进入预留模式并提示选牌 |
| 17:51 | `2fae796` | refactor：玩家四面环绕布局 + 对手资源全显示 + 预留卡背面隐藏 |
| 17:55 | `d50c4cc` | fix：AI 不动根因 —— 游戏没启动！aiToggle 未勾选导致 names 只有 1 人，initGame 直接抛错。修复：默认勾选 + 保底 while |
| 17:59 | `bef0be8` | bust cache：v=9 强制浏览器重新加载 JS/CSS（上一轮修复被缓存拦截） |

**踩坑总结**：
- AI 不动的真正根因不是 AI 逻辑，而是 `playerNames` 数组只有 1 人 → initGame throw
- 浏览器缓存导致修复不生效，必须 cache bust

---

## ⑤ 交互模式重写（直接操作）
**18:01 – 18:07**

| 时间 | 提交 | 内容 |
|------|------|------|
| 18:01 | `a7ec6dd` | refactor：彻底重写交互为**直接操作模式** —— 不选动作类型，直接点宝石/黄金/卡，系统实时推断意图 + 校验冲突 |
| 18:03 | `5258a0f` | ui：自己宝石改为彩色圆点 + 无文字；卡牌 cost 按颜色 5 列 grid 对齐堆叠 dots |
| 18:05 | `a83cf45` | fix：BUY 支付的宝石归还公共资源池（之前扣了没还，宝石凭空消失）+ 规则 Modal 新增买卡支付说明 |
| 18:05 | `d9dd378` | fix：去掉 alert 弹窗，全部改用底部状态栏红色提示 |
| 18:07 | `26e4699` | fix：点击宝石堆永远 +1（之前点同色第二次被当成取消，无法凑 2 颗同色）；状态栏加可点击的已选宝石圆点，点掉单个减 |

**关键设计转变**：从「选动作类型 → 选目标」改为「直接点目标 → 系统推断意图」，交互更直觉。

---

## ⑥ UI 打磨 + 规则细化
**18:08 – 18:30**

| 时间 | 提交 | 内容 |
|------|------|------|
| 18:08 | `badd140` | ui：手里的卡/预留卡只显示 VP + 颜色条，去掉 cost dots；按颜色排序对齐宝石列 |
| 18:11 | `df6fab5` | ui：场上卡 cost 改成颜色圆点 + 数字简洁格式；颜色条 8px → 14px + 边框；三级卡黑色条 #434343 → #888（不再隐形） |
| 18:12 | `46ac19a` | ui：宝石堆加 +/- 按钮直接加减数量 |
| 18:14 | `3480adf` | fix：颜色条 + 宝石圆点高对比度渐变 + 边框，cache bust v=12 |
| 18:18 | `186ae33` | feat：不同色可拿 1-3 颗（不强制 3）；超 10 颗允许拿完后弃掉手里宝石；弃宝石 badge 带橙色脉冲提示 |
| 18:24 | `9b5e64b` | fix：dot 颜色从 .card-cost 上下文改为全局定义，cost-chip 里的颜色圆点终于能显示；cache bust v=13 |
| 18:25 | `8794376` | fix：点黄金后 gem-pile 没加 selected class（selected 判断只看 ops.gems 不看 ops.goldTaken） |
| 18:26 | `afccfdf` | feat：预留卡也显示费用（cost-chip），之前故意砍了但买的时候还得看 |
| 18:28 | `3a37fae` | fix：黑白宝石渐变撞色 → 白=纯白+暗描边 / 黑=纯黑+亮描边；预留卡去掉 rotate 歪头上下对齐；cache bust v=14 |
| 18:28 | `2337c3d` | feat：对手已持有卡也用颜色条 + VP 卡片展示，不再暴露 tier 等级；按 GEM_COLORS 排序对齐 |
| 18:29 | `763ff2e` | fix：VP=0 的卡不再显示空，统一显示 0 保持 card-vp 高度一致 → 颜色条位置对齐不凌乱 |
| 18:30 | `b5a0498` | fix：对手侧栏加 max-height + overflow 约束；cache bust v=15 |

**此阶段核心**：视觉一致性（颜色条高度、VP=0 对齐、dot 颜色全局化）+ 规则放宽（可拿 1-3 颗）。

---

## ⑦ 关键 bug 修复（支付 / 黄金路由）
**18:32 – 18:39**

| 时间 | 提交 | 内容 |
|------|------|------|
| 18:32 | `76aea87` | fix：黄金池空也允许进入预留模式（UI 层不再拦截，最终校验留给引擎） |
| 18:33 | `8b4b286` | fix：引擎 validateAction 补全 TAKE_DIFF/TAKE_SAME 的宝石上限校验（≤10），之前 RESERVE 有但拿宝石没有 → AI 轻松绕过上限 |
| 18:34 | `95e88b2` | **critical fix**：applyAction BUY 支付逻辑完全没用 cardBonus 抵扣！validate 正确算 gems+cardBonus≥cost 但 apply 直接拿原始 need 扣宝石 → 多扣/错扣 |
| 18:37 | `4c07dee` | fix：1) 恢复 UI 层黄金池检查 → 池空不能进预留；2) _onBoardCardClick 自动切预留时补设 goldTaken=true，否则 confirm 被当买卡 → 报假错 |
| 18:38 | `ba4c695` | fix：棋盘卡 vp=0 也显示 0 防 card-vp 塌；CSS card-vp 加 min-height + flex-shrink 双保险；cache bust v=16 |
| 18:39 | `dfc39a0` | **critical fix**：黄金 pile click 绑错函数！之前全走 _onGemPlus（当普通宝石 push 进 ops.gems，goldTaken 永远 false）→ 现在黄金走 _onGemClick（正确设 goldTaken=true 进入预留模式） |

**最严重的两个 bug**：
1. BUY 支付没抵扣卡面 bonus（多扣宝石）
2. 黄金 click 绑错函数（预留模式完全失效）

---

## ⑧ 高级功能（竖叠 / 贵族 / 终局）
**18:42 – 18:56**

| 时间 | 提交 | 内容 |
|------|------|------|
| 18:42 | `c0e3fac` | fix：对手侧栏整体 compact 化 + top 限高 125px；卡缩 28×38 宝石 15px 间距压缩；cache bust v=17 |
| 18:44 | `ce7aded` | feat：1) 手里同色卡竖叠（pos absolute 偏移 + ×N 角标）；2) 买卡状态栏显示精确消耗（XX×白(3白+1蓝卡面)·⛏消耗1黄金），完全对齐引擎先卡面→宝石→黄金逻辑 |
| 18:46 | `7a9ee17` | fix：预留卡跟棋盘卡一样大（80×110），cost-chip 正常尺寸；手里卡保留 40×56 紧凑通过 owned-stack 子选择器隔离；cache bust v=19 |
| 18:47 | `de9ba9d` | feat：手里同色竖叠最顶层卡显示 VP 总和，底层各卡仍显示自身 VP；加 z-index 保证叠层视觉正确 |
| 18:52 | `5febdde` | fix：去掉所有内部 overflow-y:auto 和 overflow:hidden，让页面自然滚动；grid row2 改 minmax(300px,1fr) 保障棋盘最低高度；splendor-side 和 splendor-bottom overflow 全 visible |
| 18:52 | `8cb76fe` | cache bust v=20 |
| 18:53 | `bfa736b` | feat：贵族触发时引擎挂 _lastNoblesGained，UI 自动 toast 提示（👑获得贵族！满足条件 3 蓝+3 绿，+3 分）；个人区域贵族展示从 👑+3 改成带彩色 dot 的具体条件徽章 |
| 18:56 | `339f484` | fix：1) 终局逻辑重写为正确的 Splendor 规则（触发者不再走，其他人各走最后一轮 → _endCountdown 倒计时归零即 gameOver）；2) 引擎挂 _justTriggeredEnd 让 UI 知道刚触发；3) 人类触发 15 分 toast 提示；4) 终局倒计时条全程显示在底部区 |

**亮点**：手里同色卡竖叠 + VP 总和显示、贵族获取 toast、终局公平轮逻辑初版。

---

## ⑨ Admin 模式 + 终局定稿 + 文档
**19:02 – 19:06**

| 时间 | 提交 | 内容 |
|------|------|------|
| 19:02 | `d229b39` | feat：admin 模式 POC —— admin.js 数据层（localStorage 覆盖 + mergeAdmin）、admin-ui.js 编辑器（平衡性分析 + JSON 编辑 + 基线对比）、login 返回 is_admin、engine 加载自动应用 admin 覆盖数据；admin 账号 = 用户名 admin；cache bust v=21 |
| 19:04 | `12e131f` | fix：公平轮终局规则 —— 触发后 _endCountdown=players.length（步），**每个人**走完都 -1（包括触发者自己），所有人轮数相同才 gameOver |
| 19:05 | `bbe10dc` | fix：公平轮终局恢复正确 —— 触发者本轮已走完，countdown=players.length-1，只有非触发者走完才 -1 → 所有人总轮数相同才结束 |
| 19:06 | `e3d7bab` | docs：加入项目 CHECKPOINT.md（快速开始/文件结构/引擎规则/UI 设计/admin 架构/部署笔记/踩过的坑/下一步），方便跨设备继续 |

**终局规则的反复**（2 次来回才定稿）：
- 初版：触发者不走，其他人各走最后一轮（countdown = players.length - 1，非触发者 -1）
- 改错：改成 countdown = players.length，所有人都 -1（触发者多走一轮 ❌）
- 定稿：恢复 countdown = players.length - 1，只有非触发者 -1 ✅

---

## 关键技术决策一览

| 决策点 | 结论 | 出现阶段 |
|--------|------|----------|
| 每级翻牌数 | 恒为 4 张，不受人数影响 | ② |
| 交互模式 | 直接操作（不点动作类型，系统推断意图） | ⑤ |
| 卡面抵扣顺序 | 先卡面 bonus → 再宝石 → 最后黄金 | ⑦ |
| VP=0 显示 | `?? 0` 而非 `\|\| ''`，保持 div 高度 | ⑥ |
| dot 颜色作用域 | 全局定义，不嵌套在 .card-cost 下 | ⑥ |
| 终局公平轮 | countdown = players.length - 1，只非触发者 -1 | ⑨ |
| Admin 数据存储 | 仅 localStorage，不碰服务端 | ⑨ |
| 缓存策略 | style.css?v=N 每次递增，JS 用 type=module 靠 ETag | 全程 |

---

## 反复出现的坑

1. **浏览器缓存**：v=9、v=12、v=13、v=14、v=15、v=16、v=17、v=19、v=20、v=21 —— 共 10 次 cache bust，多次修复因缓存未生效被误判为无效
2. **黄金 click 路由**：先后踩了「绑错函数」「selected class 判断漏 goldTaken」「自动切预留忘设 goldTaken」三次
3. **终局规则**：2 次来回才定稿
4. **AI 不动**：根因是 playerNames 只有 1 人，不是 AI 逻辑问题
