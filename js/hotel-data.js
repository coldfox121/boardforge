// 奥地利大饭店 · 数据层（官方 2021 零售版）
// 数据来源与核实记录见 D:/TREA_project/_refs/gah/DATA-VERIFIED.md
// 后台可覆盖：名称 / 费用 / 描述 / 点单 / VP（效果逻辑按编号固定）
import { loadAdminData } from './admin.js';

// ===== 基础常量 =====
export const FOOD_KEYS = ['strudel', 'cake', 'wine', 'coffee'];
export const FOOD_NAMES = { strudel: '苹果卷', cake: '蛋糕', wine: '红酒', coffee: '咖啡' };
export const FOOD_SHORT = { strudel: '卷', cake: '糕', wine: '酒', coffee: '啡' };
export const FOOD_ICON = { strudel: '🥐', cake: '🍰', wine: '🍷', coffee: '☕' };

export const COLOR_NAMES = { blue: '贵族', red: '市民', yellow: '艺术家', green: '旅人' };
export const COLOR_SHORT = { blue: '蓝', red: '红', yellow: '黄', green: '绿' };

// 皇帝轨 13 格（索引 0-13）对应分值
export const EMPEROR_POINTS = [0, 1, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 8, 9];
export const EMPEROR_MAX = 13;

// 客人队列标价（左→右）
export const MARKET_COST = [3, 2, 1, 0, 0];

// 酒店图板：20 个房间位（索引 = 楼层*5 + 列，楼层 0 = 一楼）
export const ROOM_COLORS = [
  'blue', 'yellow', 'red', 'red', 'blue',      // 1F
  'yellow', 'yellow', 'red', 'red', 'yellow',  // 2F
  'blue', 'red', 'blue', 'yellow', 'yellow',   // 3F
  'blue', 'red', 'blue', 'red', 'blue'         // 4F
];
// 10 个颜色组（同组全部入住触发奖励）
export const ROOM_GROUPS = [
  [0], [1, 5, 6], [2, 3, 7, 8], [4], [9, 13, 14],
  [10, 15], [11, 16], [12, 17], [18], [19]
];
// 楼层准备费用（1F/2F/3F/4F）
export const FLOOR_COST = [0, 1, 2, 3];
// 顶排右侧三间的立即分（索引 17/18/19）
export const IMMEDIATE_VP = { 17: 2, 18: 3, 19: 4 };
// 满组奖励表：蓝=分，红=钱，黄=皇帝格
export const BLUE_BONUS = [0, 2, 5, 9, 15];
export const OTHER_BONUS = [0, 1, 3, 6, 10];

// 骰子数量（按人数）
export const DICE_BY_PLAYERS = { 2: 10, 3: 12, 4: 14 };

// 目标卡分位（高分先抢）
export const POLITICS_SPOTS = [15, 10, 5];

// 员工一次时（one-time）效果，按编号固定
export const STAFF_ONCE = {
  21: [{ type: 'food', food: 0, n: 1 }, { type: 'food', food: 1, n: 1 }, { type: 'food', food: 2, n: 1 }, { type: 'food', food: 3, n: 1 }],
  35: [{ type: 'occupy', n: 2 }],
  36: [{ type: 'food', food: 2, n: 4 }],
  38: [{ type: 'complete' }],
  39: [{ type: 'food', food: 1, n: 4 }],
  43: [{ type: 'food', food: 3, n: 4 }],
  44: [{ type: 'food', food: 0, n: 4 }],
  45: [{ type: 'favor', n: 3 }]
};

// ===== 客人卡 56 张 =====
// 奖励描述符：
//   food(色,数量)  anyFood(数量)  money(数量)  favor(皇帝格)  points(分)  draw(抽员工)
//   prepare(折扣, 最高楼层)  hire(折扣)  offer(抽3选1的折扣)  guest(免费接客)  occupy(额外入住)
//   bonusDie(额外骰子行动)  complete(用公共供应完成一位客人)
const F = (food, n = 1) => ({ type: 'food', food, n });
const ANY = (n = 1) => ({ type: 'anyFood', n });
const M = n => ({ type: 'money', n });
const FAV = n => ({ type: 'favor', n });
const VP = n => ({ type: 'points', n });
const DRAW = n => ({ type: 'draw', n });
const ROOM = (discount = 0, maxFloor = 3) => ({ type: 'prepare', n: 1, discount, maxFloor });
const HIRE = (discount = 0) => ({ type: 'hire', discount });
const OFFER = (discount = 3) => ({ type: 'offer', discount });
const GUEST = () => ({ type: 'guest', n: 1 });
const OCC = (n = 1) => ({ type: 'occupy', n });
const BONUSDIE = () => ({ type: 'bonusDie' });
const COMPLETE = () => ({ type: 'complete' });

const GUEST_ROWS = [
  [49, 'Sculptor', '雕塑家', '0010', 0, [ROOM(99, 1)]],
  [50, 'Musician', '音乐家', '0010', 0, [DRAW(1), ROOM()]],
  [51, 'Composer', '作曲家', '0010', 1, [F(0)]],
  [52, 'Tailor', '裁缝', '0011', 0, [F(0), M(2)]],
  [53, 'FlamencoDancer', '弗拉门戈舞者', '1010', 0, [F(3), FAV(2)]],
  [54, 'PortraitPainter', '肖像画家', '0020', 0, [ANY(1), M(2)]],
  [55, 'Photographer', '摄影师', '0030', 7, [DRAW(2)]],
  [56, 'Vocalist', '声乐家', '1020', 0, [F(1), HIRE(3)]],
  [57, 'Architect', '建筑师', '0021', 1, [ROOM(1), ROOM(1)]],
  [58, 'Actress', '女演员', '0031', 7, [OCC()]],
  [59, 'Poet', '诗人', '3010', 5, [F(1), HIRE(2)]],
  [60, 'JewelryDesigner', '珠宝设计师', '0220', 5, [F(3), M(3)]],
  [61, 'Painter', '画家', '1030', 2, [ROOM(1), ROOM()]],
  [62, 'OperaSinger', '歌剧演员', '1120', 4, [GUEST(), FAV(3)]],
  [63, 'Dame', '贵妇', '0001', 0, [GUEST()]],
  [64, 'Duchess', '女公爵', '0001', 0, [HIRE(1)]],
  [65, 'KnightOfTheEmpire', '帝国骑士', '0001', 3, []],
  [66, 'Landgrave', '领地伯爵', '0101', 3, [HIRE(1), ROOM()]],
  [67, 'Sovereign', '君主', '0002', 2, [DRAW(2), FAV(2)]],
  [68, 'Princess', '公主', '2001', 4, [FAV(3)]],
  [69, 'Countess', '女伯爵', '0201', 7, [M(3)]],
  [70, 'Elector', '选帝侯', '1011', 1, [HIRE(1), FAV(3)]],
  [71, 'Baron', '男爵', '1002', 4, [ROOM(99)]],
  [72, 'Prince', '王子', '1101', 7, [OCC()]],
  [73, 'Count', '伯爵', '0012', 4, [HIRE(1), HIRE(1)]],
  [74, 'Earl', '勋爵', '0102', 10, [M(1)]],
  [75, 'Baroness', '女男爵', '0022', 5, [OFFER(3)]],
  [76, 'Duke', '公爵', '2002', 4, [OFFER(99)]],
  [77, 'Apothecary', '药剂师', '0100', 1, [M(1)]],
  [78, 'PostCouncillor', '邮政顾问', '0100', 0, [GUEST()]],
  [79, 'PrivyCouncillor', '枢密顾问', '0100', 0, [M(1), FAV(1)]],
  [80, 'ProfessorEmeritus', '荣休教授', '0110', 4, [GUEST()]],
  [81, 'General', '将军', '0200', 0, [F(2), M(3)]],
  [82, 'SeniorCouncillor', '高级顾问', '0111', 7, [OCC()]],
  [83, 'CouncillorOfCommerce', '商务顾问', '1110', 0, [M(5)]],
  [84, 'CourtCounsellor', '宫廷顾问', '0210', 2, [M(3), GUEST()]],
  [85, 'Major', '少校', '2100', 3, [M(3)]],
  [86, 'VeterinaryCouncillor', '兽医顾问', '0120', 3, [HIRE(3)]],
  [87, 'MedicinalCouncillor', '医疗顾问', '0202', 3, [M(3), GUEST(), GUEST()]],
  [88, 'Procurator', '检察官', '0130', 0, [ROOM(99), ROOM(99)]],
  [89, 'LordHighCommissioner', '高级专员', '2110', 5, [M(4)]],
  [90, 'SeniorLegalSecretary', '高级法务秘书', '1300', 7, [F(2), M(3)]],
  [91, 'Tezcatlipoca', '特斯卡特利波卡', '1000', 0, [DRAW(3)]],
  [92, 'CaptGoldhaken', '金钩船长', '1000', 0, [M(1)]],
  [93, 'MrHorsa', '霍萨先生', '1000', 0, [FAV(1)]],
  [94, 'MichaelIngalls', '英格尔斯', '2000', 0, [HIRE(1)]],
  [95, 'MrBoydell', '博伊德尔先生', '1100', 2, [FAV(2)]],
  [96, 'MrOundo', '翁多先生', '1001', 0, [HIRE(3)]],
  [97, 'EGizia', '吉萨先生', '2010', 4, [BONUSDIE()]],
  [98, 'MPolo', '马可·波罗', '3000', 0, [M(4)]],
  [99, 'Cramersopholus', '克拉默索菲勒斯', '1200', 5, [DRAW(1), FAV(2)]],
  [100, 'FarmerFranz', '农夫弗朗茨', '1003', 4, [FAV(3), OCC()]],
  [101, 'BrotherUwe', '乌韦修士', '3001', 3, [FAV(3), GUEST()]],
  [102, 'Conductor', '列车长', '1001', 0, [FAV(1), OCC()]],
  [103, 'Durgoing', '杜尔戈因', '1010', 4, [DRAW(2)]],
  [104, 'MacLeod', '麦克劳德', '2200', 2, [HIRE(99)]]
];

function guestColor(id) {
  if (id < 63) return 'yellow';
  if (id < 77) return 'blue';
  if (id < 91) return 'red';
  return 'green';
}

const BASE_GUESTS = GUEST_ROWS.map(([id, key, name, order, vp, rewards]) => ({
  id, key, name, color: guestColor(id),
  order: [...order].map(Number),
  vp, rewards
}));

// ===== 员工卡 48 张 =====
// kind: once 立即一次 / round 每轮一次 / permanent 永久 / end 终局结算
const STAFF_ROWS = [
  [1, 'BreakfastServer', '早餐侍者', 4, 'round', '每轮获得 1 份苹果卷。'],
  [2, 'Waitress', '女侍者', 6, 'round', '每轮获得 1 份蛋糕。'],
  [3, 'Barkeeper', '酒保', 4, 'round', '每轮获得 1 份红酒。'],
  [4, 'SousChef', '副厨师长', 6, 'round', '每轮获得 1 份咖啡。'],
  [5, 'Groom', '门童', 4, 'permanent', '红色客人入住后，获得 2 克朗。'],
  [6, 'Stableman', '马夫', 1, 'permanent', '蓝色客人入住后，皇帝轨前进 1 格。'],
  [7, 'Masseuse', '按摩师', 1, 'permanent', '黄色客人入住后，获得 1 克朗。'],
  [8, 'TourGuide', '导游', 2, 'permanent', '绿色客人入住后，额外获得 2 分。'],
  [9, 'Butler', '管家', 5, 'permanent', '准备蓝房免付楼层费用。'],
  [10, 'Chauffeur', '司机', 5, 'permanent', '准备红房免付楼层费用。'],
  [11, 'Florist', '花艺师', 5, 'permanent', '准备黄房免付楼层费用。'],
  [12, 'ExecutiveHousekeeper', '行政房务主管', 2, 'permanent', '取走点数 3 或 4 的骰子时，获得 2 分。'],
  [13, 'RestaurantManager', '餐厅经理', 2, 'permanent', '取走点数 1 或 2 的骰子时，行动强度 +1。'],
  [14, 'Decorator', '装饰师', 2, 'permanent', '取走点数 1 或 2 的骰子时，可额外按原价准备 1 间房。'],
  [15, 'Bootblack', '擦鞋匠', 4, 'permanent', '取走点数 4 的骰子时，每点强度同时获得克朗并在皇帝轨前进相同格数。'],
  [16, 'Laundress', '洗衣工', 2, 'permanent', '取走点数 4 的骰子时，获得 4 分。'],
  [17, 'KitchenHand', '厨房帮工', 5, 'permanent', '取走点数 6 的骰子免付模仿费，行动强度 +1。'],
  [18, 'Checker', '核账员', 2, 'permanent', '取走点数 5 的骰子时，雇佣折扣额外 +2。'],
  [19, 'InteriorArchitect', '室内设计师', 3, 'permanent', '取走点数 3 的骰子时，获得 5 分。'],
  [20, 'Detective', '侦探', 2, 'permanent', '取走点数 5 的骰子时，皇帝轨前进 2 格。'],
  [21, 'Chef', '主厨', 3, 'once', '立即获得四种餐饮各 1 份。'],
  [22, 'StaffManager', '人事经理', 3, 'permanent', '取走点数 3 的骰子时，可额外按原价雇佣 1 名员工。'],
  [23, 'Custodian', '管理员', 5, 'permanent', '每次使 1 间房变为已入住，获得 1 克朗。'],
  [24, 'ChiefWaiter', '领班', 1, 'permanent', '从厨房向客人送餐免费。'],
  [25, 'DeliveryBoy', '送货员', 6, 'permanent', '接待队列中的客人免付接待费。'],
  [26, 'ConferenceManager', '会议经理', 5, 'permanent', '皇帝结算时可支付 1 克朗免除惩罚。'],
  [27, 'BookingManager', '预订经理', 4, 'end', '终局：每间已入住红房 +3 分。'],
  [28, 'Concierge', '礼宾员', 4, 'end', '终局：每间已入住蓝房 +3 分。'],
  [29, 'Secretary', '秘书', 5, 'end', '终局：选择一名对手的终局员工，按你的酒店计算其效果。'],
  [30, 'ReceptionClerk', '接待员', 4, 'end', '终局：每间已入住黄房 +3 分。'],
  [31, 'Chambermaid', '客房女佣', 4, 'end', '终局：每间已入住房间 +1 分。'],
  [32, 'AssistantManager', '副经理', 4, 'end', '终局：每名已雇佣员工 +2 分（含自己）。'],
  [33, 'MaleFloorHousekeeper', '男楼层管家', 5, 'permanent', '点单总数 ≥4 的客人入住后，额外 +4 分。'],
  [34, 'Receptionist', '前台', 5, 'end', '终局：每间已准备或已入住的房间 +1 分。'],
  [35, 'Pageboy', '侍童', 2, 'once', '立即将最多 2 间已准备客房改为已入住。'],
  [36, 'Sommelier', '侍酒师', 2, 'once', '立即获得 4 份红酒。'],
  [37, 'RoomService', '客房服务员', 3, 'end', '终局：每个全部入住的房间组 +2 分。'],
  [38, 'Porter', '行李员', 5, 'once', '立即用公共供应满足 1 位客人的全部餐饮需求。'],
  [39, 'Confectioner', '甜点师', 3, 'once', '立即获得 4 份蛋糕。'],
  [40, 'MarketingDirector', '市场总监', 2, 'end', '终局：每张你放了标记的目标卡 +5 分。'],
  [41, 'Operator', '话务员', 3, 'end', '终局：皇帝轨位置 ×2 分。'],
  [42, 'Gardener', '园丁', 3, 'permanent', '每次获得皇帝奖励时，额外 +5 分。'],
  [43, 'Barista', '咖啡师', 3, 'once', '立即获得 4 份咖啡。'],
  [44, 'LarderCook', '备餐厨师', 2, 'once', '立即获得 4 份苹果卷。'],
  [45, 'PoolAttendant', '泳池服务员', 1, 'once', '立即在皇帝轨前进 3 格。'],
  [46, 'FemaleFloorHousekeeper', '女楼层管家', 2, 'end', '终局：每个全部入住的楼层 +5 分。'],
  [47, 'Liftboy', '电梯员', 4, 'end', '终局：每个全部入住的列 +5 分。'],
  [48, 'HotelManager', '酒店经理', 4, 'end', '终局：每套红、蓝、黄已入住房间 +4 分。']
];

const BASE_STAFF = STAFF_ROWS.map(([id, key, name, cost, kind, text]) => ({ id, key, name, cost, kind, text }));

// ===== 目标卡 12 张 =====
const BASE_OBJECTIVES = [
  { id: 105, group: 'A', text: '拥有 20 克朗', test: 'money' },
  { id: 106, group: 'A', text: '准备或入住至少 12 间房', test: 'prepared' },
  { id: 107, group: 'A', text: '雇佣至少 6 名员工', test: 'staff' },
  { id: 108, group: 'A', text: '皇帝轨到达至少 10', test: 'emperor' },
  { id: 109, group: 'B', text: '至少 2 个楼层全部入住', test: 'rows' },
  { id: 110, group: 'B', text: '至少 6 个房间组全部入住', test: 'groups' },
  { id: 111, group: 'B', text: '一种颜色的全部房间均已入住', test: 'color' },
  { id: 112, group: 'B', text: '至少 2 列全部入住', test: 'cols' },
  { id: 113, group: 'C', text: '红、黄、蓝各入住至少 3 间', test: 'rgb' },
  { id: 114, group: 'C', text: '至少入住 4 红房和 3 黄房', test: 'ry' },
  { id: 115, group: 'C', text: '至少入住 4 黄房和 3 蓝房', test: 'yb' },
  { id: 116, group: 'C', text: '至少入住 4 蓝房和 3 红房', test: 'br' }
];

// ===== 皇帝板块 12 张 =====
const BASE_EMPERORS = [
  { id: 'A1', group: 'A', reward: '获得 3 克朗', penalty: '支付 3 克朗；不足则扣 5 分',
    bonus: [{ type: 'money', n: 3 }],
    penaltyOpts: [{ type: 'moneyOrVp', money: 3, vp: 5 }] },
  { id: 'A2', group: 'A', reward: '任选 2 份餐饮', penalty: '清空厨房餐饮',
    bonus: [{ type: 'anyFood', n: 2 }],
    penaltyOpts: [{ type: 'clearKitchen' }] },
  { id: 'A3', group: 'A', reward: '抽 3 名员工，选 1 名折扣 3 雇佣', penalty: '弃 2 张手牌；不足则扣 5 分',
    bonus: [{ type: 'offer', discount: 3 }],
    penaltyOpts: [{ type: 'discardHand', n: 2, orVp: 5 }] },
  { id: 'A4', group: 'A', reward: '免费准备 1 间房', penalty: '移除最高层的 1 间空房；没有则扣 5 分',
    bonus: [{ type: 'prepare', discount: 99, maxFloor: 3 }],
    penaltyOpts: [{ type: 'removeVacant', n: 1, orVp: 5 }] },
  { id: 'B1', group: 'B', reward: '获得四种餐饮各 1 份', penalty: '清空厨房与客人上的餐饮',
    bonus: [{ type: 'food', food: 0, n: 1 }, { type: 'food', food: 1, n: 1 }, { type: 'food', food: 2, n: 1 }, { type: 'food', food: 3, n: 1 }],
    penaltyOpts: [{ type: 'clearAllFood' }] },
  { id: 'B2', group: 'B', reward: '获得 5 克朗', penalty: '支付 5 克朗；不足则扣 7 分',
    bonus: [{ type: 'money', n: 5 }],
    penaltyOpts: [{ type: 'moneyOrVp', money: 5, vp: 7 }] },
  { id: 'B3', group: 'B', reward: '抽 3 名员工，选 1 名免费雇佣', penalty: '弃 3 张手牌；不足则扣 7 分',
    bonus: [{ type: 'offer', discount: 99 }],
    penaltyOpts: [{ type: 'discardHand', n: 3, orVp: 7 }] },
  { id: 'B4', group: 'B', reward: '免费准备并入住底部两层 1 间房', penalty: '从最高层起移除 2 间空房；不足则扣 7 分',
    bonus: [{ type: 'prepareOccupy', maxFloor: 1 }],
    penaltyOpts: [{ type: 'removeVacant', n: 2, orVp: 7 }] },
  { id: 'C1', group: 'C', reward: '获得 8 分', penalty: '扣 8 分',
    bonus: [{ type: 'points', n: 8 }],
    penaltyOpts: [{ type: 'points', n: -8 }] },
  { id: 'C2', group: 'C', reward: '免费准备并入住任意 1 间房', penalty: '最高的两个有住客楼层各移除 1 间已入住房间',
    bonus: [{ type: 'prepareOccupy', maxFloor: 3 }],
    penaltyOpts: [{ type: 'removeOccupied', n: 2 }] },
  { id: 'C3', group: 'C', reward: '每名已雇佣员工 +2 分', penalty: '每名已雇佣员工 −2 分',
    bonus: [{ type: 'staffPoints', n: 2 }],
    penaltyOpts: [{ type: 'vpPerStaff', n: -2 }] },
  { id: 'C4', group: 'C', reward: '免费雇佣 1 名手牌员工', penalty: '弃 1 名终局员工；没有则扣 10 分',
    bonus: [{ type: 'hire', discount: 99 }],
    penaltyOpts: [{ type: 'discardEndStaff', orVp: 10 }] }
];

// ===== 后台覆盖 =====
const _admin = (typeof localStorage !== 'undefined') ? loadAdminData('hotel') : null;

export const GUESTS = _admin?.GUESTS || BASE_GUESTS;
export const STAFF = _admin?.STAFF || BASE_STAFF;
export const OBJECTIVES = _admin?.OBJECTIVES || BASE_OBJECTIVES;
export const EMPERORS = _admin?.EMPERORS || BASE_EMPERORS;

export const GUEST_BY_ID = Object.fromEntries(GUESTS.map(g => [g.id, g]));
export const STAFF_BY_ID = Object.fromEntries(STAFF.map(s => [s.id, s]));

export const BASE_DATA = {
  GUESTS: BASE_GUESTS, STAFF: BASE_STAFF, OBJECTIVES: BASE_OBJECTIVES, EMPERORS: BASE_EMPERORS
};
