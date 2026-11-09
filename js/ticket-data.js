// 铁路环游：美国版 · 静态数据（官方地图）
// 36 座城市 / 100 条线路选项（78 组连接，其中 22 组为平行双线）/ 29 张目的地票
// 美国版规则：无隧道、无渡轮、无火车站；开局 3 张任务票，至少保留 2 张

// ===== 常量 =====
export const TRAIN_COLORS = ['purple', 'white', 'blue', 'yellow', 'orange', 'black', 'red', 'green'];

export const COLOR_NAMES = {
  "purple": "紫色",
  "white": "白色",
  "blue": "蓝色",
  "yellow": "黄色",
  "orange": "橙色",
  "black": "黑色",
  "red": "红色",
  "green": "绿色",
  "gray": "灰色",
  "loco": "车头"
};

export const TRAIN_CARS_PER_PLAYER = 45;
export const CARDS_PER_COLOR = 12;
export const LOCOMOTIVES = 14;
export const STARTING_HAND = 4;
export const FACE_UP_COUNT = 5;
export const TICKETS_DRAWN_PER_ACTION = 3;
export const MIN_INITIAL_TICKETS = 2;
export const LONGEST_PATH_BONUS = 10;

// 线路长度 → 得分
export const ROUTE_SCORES = { 1: 1, 2: 2, 3: 4, 4: 7, 5: 10, 6: 15 };

// ===== 城市（坐标为经纬度线性映射的地图坐标） =====
export const CITIES = [
  { id: 'van', en: 'Vancouver', zh: '温哥华', x: 70, y: 77 },
  { id: 'sea', en: 'Seattle', zh: '西雅图', x: 87, y: 122 },
  { id: 'por', en: 'Portland', zh: '波特兰', x: 80, y: 179 },
  { id: 'cgy', en: 'Calgary', zh: '卡尔加里', x: 264, y: 29 },
  { id: 'hel', en: 'Helena', zh: '海伦娜', x: 308, y: 150 },
  { id: 'slc', en: 'Salt Lake City', zh: '盐湖城', x: 311, y: 307 },
  { id: 'sfo', en: 'San Francisco', zh: '旧金山', x: 85, y: 388 },
  { id: 'las', en: 'Las Vegas', zh: '拉斯维加斯', x: 242, y: 431 },
  { id: 'los', en: 'Los Angeles', zh: '洛杉矶', x: 175, y: 489 },
  { id: 'pho', en: 'Phoenix', zh: '菲尼克斯', x: 307, y: 505 },
  { id: 'elp', en: 'El Paso', zh: '埃尔帕索', x: 427, y: 551 },
  { id: 'sfe', en: 'Santa Fe', zh: '圣菲', x: 439, y: 444 },
  { id: 'den', en: 'Denver', zh: '丹佛', x: 459, y: 335 },
  { id: 'win', en: 'Winnipeg', zh: '温尼伯', x: 628, y: 60 },
  { id: 'dul', en: 'Duluth', zh: '杜鲁斯', x: 736, y: 144 },
  { id: 'oma', en: 'Omaha', zh: '奥马哈', x: 654, y: 294 },
  { id: 'kan', en: 'Kansas City', zh: '堪萨斯城', x: 683, y: 352 },
  { id: 'okl', en: 'Oklahoma City', zh: '俄克拉何马城', x: 620, y: 450 },
  { id: 'dal', en: 'Dallas', zh: '达拉斯', x: 635, y: 523 },
  { id: 'hou', en: 'Houston', zh: '休斯顿', x: 666, y: 605 },
  { id: 'lrk', en: 'Little Rock', zh: '小石城', x: 732, y: 470 },
  { id: 'nol', en: 'New Orleans', zh: '新奥尔良', x: 779, y: 600 },
  { id: 'nas', en: 'Nashville', zh: '纳什维尔', x: 850, y: 432 },
  { id: 'atl', en: 'Atlanta', zh: '亚特兰大', x: 901, y: 497 },
  { id: 'mia', en: 'Miami', zh: '迈阿密', x: 991, y: 713 },
  { id: 'cha', en: 'Charleston', zh: '查尔斯顿', x: 997, y: 523 },
  { id: 'ral', en: 'Raleigh', zh: '罗利', x: 1025, y: 442 },
  { id: 'was', en: 'Washington', zh: '华盛顿', x: 1059, y: 357 },
  { id: 'pit', en: 'Pittsburgh', zh: '匹兹堡', x: 995, y: 316 },
  { id: 'nyc', en: 'New York', zh: '纽约', x: 1124, y: 309 },
  { id: 'bos', en: 'Boston', zh: '波士顿', x: 1187, y: 264 },
  { id: 'mon', en: 'Montreal', zh: '蒙特利尔', x: 1133, y: 179 },
  { id: 'tor', en: 'Toronto', zh: '多伦多', x: 1009, y: 229 },
  { id: 'sau', en: 'Sault St Marie', zh: '苏圣玛丽', x: 902, y: 152 },
  { id: 'stl', en: 'Saint Louis', zh: '圣路易斯', x: 777, y: 365 },
  { id: 'ccg', en: 'Chicago', zh: '芝加哥', x: 832, y: 277 }
];

// ===== 线路 =====
// parallel: 0/1 表示同一对城市的平行双线；null 表示单线
// color: null 表示灰色（任意颜色）
export const ROUTES = [
  { a: 'atl', b: 'cha', len: 2, color: null, parallel: null },
  { a: 'atl', b: 'mia', len: 5, color: 'blue', parallel: null },
  { a: 'atl', b: 'nas', len: 1, color: null, parallel: null },
  { a: 'atl', b: 'nol', len: 4, color: 'yellow', parallel: 0 },
  { a: 'atl', b: 'nol', len: 4, color: 'orange', parallel: 1 },
  { a: 'atl', b: 'ral', len: 2, color: null, parallel: 0 },
  { a: 'atl', b: 'ral', len: 2, color: null, parallel: 1 },
  { a: 'bos', b: 'mon', len: 2, color: null, parallel: 0 },
  { a: 'bos', b: 'mon', len: 2, color: null, parallel: 1 },
  { a: 'bos', b: 'nyc', len: 2, color: 'yellow', parallel: 0 },
  { a: 'bos', b: 'nyc', len: 2, color: 'red', parallel: 1 },
  { a: 'ccg', b: 'dul', len: 3, color: 'red', parallel: null },
  { a: 'ccg', b: 'oma', len: 4, color: 'blue', parallel: null },
  { a: 'ccg', b: 'pit', len: 3, color: 'orange', parallel: 0 },
  { a: 'ccg', b: 'pit', len: 3, color: 'black', parallel: 1 },
  { a: 'ccg', b: 'stl', len: 2, color: 'green', parallel: 0 },
  { a: 'ccg', b: 'stl', len: 2, color: 'white', parallel: 1 },
  { a: 'ccg', b: 'tor', len: 4, color: 'white', parallel: null },
  { a: 'cgy', b: 'hel', len: 4, color: null, parallel: null },
  { a: 'cgy', b: 'sea', len: 4, color: null, parallel: null },
  { a: 'cgy', b: 'van', len: 3, color: null, parallel: null },
  { a: 'cgy', b: 'win', len: 6, color: 'white', parallel: null },
  { a: 'cha', b: 'mia', len: 4, color: 'purple', parallel: null },
  { a: 'cha', b: 'ral', len: 2, color: null, parallel: null },
  { a: 'dal', b: 'elp', len: 4, color: 'red', parallel: null },
  { a: 'dal', b: 'hou', len: 1, color: null, parallel: 0 },
  { a: 'dal', b: 'hou', len: 1, color: null, parallel: 1 },
  { a: 'dal', b: 'lrk', len: 2, color: null, parallel: null },
  { a: 'dal', b: 'okl', len: 2, color: null, parallel: 0 },
  { a: 'dal', b: 'okl', len: 2, color: null, parallel: 1 },
  { a: 'den', b: 'hel', len: 4, color: 'green', parallel: null },
  { a: 'den', b: 'kan', len: 4, color: 'black', parallel: 0 },
  { a: 'den', b: 'kan', len: 4, color: 'orange', parallel: 1 },
  { a: 'den', b: 'okl', len: 4, color: 'red', parallel: null },
  { a: 'den', b: 'oma', len: 4, color: 'purple', parallel: null },
  { a: 'den', b: 'pho', len: 5, color: 'white', parallel: null },
  { a: 'den', b: 'sfe', len: 2, color: null, parallel: null },
  { a: 'den', b: 'slc', len: 3, color: 'red', parallel: 0 },
  { a: 'den', b: 'slc', len: 3, color: 'yellow', parallel: 1 },
  { a: 'dul', b: 'hel', len: 6, color: 'orange', parallel: null },
  { a: 'dul', b: 'oma', len: 2, color: null, parallel: 0 },
  { a: 'dul', b: 'oma', len: 2, color: null, parallel: 1 },
  { a: 'dul', b: 'sau', len: 3, color: null, parallel: null },
  { a: 'dul', b: 'tor', len: 6, color: 'purple', parallel: null },
  { a: 'dul', b: 'win', len: 4, color: 'black', parallel: null },
  { a: 'elp', b: 'hou', len: 6, color: 'green', parallel: null },
  { a: 'elp', b: 'los', len: 6, color: 'black', parallel: null },
  { a: 'elp', b: 'okl', len: 5, color: 'yellow', parallel: null },
  { a: 'elp', b: 'pho', len: 3, color: null, parallel: null },
  { a: 'elp', b: 'sfe', len: 2, color: null, parallel: null },
  { a: 'hel', b: 'oma', len: 5, color: 'red', parallel: null },
  { a: 'hel', b: 'sea', len: 6, color: 'yellow', parallel: null },
  { a: 'hel', b: 'slc', len: 3, color: 'purple', parallel: null },
  { a: 'hel', b: 'win', len: 4, color: 'blue', parallel: null },
  { a: 'hou', b: 'nol', len: 2, color: null, parallel: null },
  { a: 'kan', b: 'okl', len: 2, color: null, parallel: 0 },
  { a: 'kan', b: 'okl', len: 2, color: null, parallel: 1 },
  { a: 'kan', b: 'oma', len: 2, color: null, parallel: 0 },
  { a: 'kan', b: 'oma', len: 2, color: null, parallel: 1 },
  { a: 'kan', b: 'stl', len: 2, color: 'blue', parallel: 0 },
  { a: 'kan', b: 'stl', len: 2, color: 'purple', parallel: 1 },
  { a: 'las', b: 'los', len: 2, color: null, parallel: null },
  { a: 'las', b: 'slc', len: 3, color: 'orange', parallel: null },
  { a: 'los', b: 'pho', len: 3, color: null, parallel: null },
  { a: 'los', b: 'sfo', len: 3, color: 'purple', parallel: 0 },
  { a: 'los', b: 'sfo', len: 3, color: 'yellow', parallel: 1 },
  { a: 'lrk', b: 'nas', len: 3, color: 'white', parallel: null },
  { a: 'lrk', b: 'nol', len: 3, color: 'green', parallel: null },
  { a: 'lrk', b: 'okl', len: 2, color: null, parallel: null },
  { a: 'lrk', b: 'stl', len: 2, color: null, parallel: null },
  { a: 'mia', b: 'nol', len: 6, color: 'red', parallel: null },
  { a: 'mon', b: 'nyc', len: 3, color: 'blue', parallel: null },
  { a: 'mon', b: 'sau', len: 5, color: 'black', parallel: null },
  { a: 'mon', b: 'tor', len: 3, color: null, parallel: null },
  { a: 'nas', b: 'pit', len: 4, color: 'yellow', parallel: null },
  { a: 'nas', b: 'ral', len: 3, color: 'black', parallel: null },
  { a: 'nas', b: 'stl', len: 2, color: null, parallel: null },
  { a: 'nyc', b: 'pit', len: 2, color: 'green', parallel: 0 },
  { a: 'nyc', b: 'pit', len: 2, color: 'white', parallel: 1 },
  { a: 'nyc', b: 'was', len: 2, color: 'black', parallel: 0 },
  { a: 'nyc', b: 'was', len: 2, color: 'orange', parallel: 1 },
  { a: 'okl', b: 'sfe', len: 3, color: 'blue', parallel: null },
  { a: 'pho', b: 'sfe', len: 3, color: null, parallel: null },
  { a: 'pit', b: 'ral', len: 2, color: null, parallel: null },
  { a: 'pit', b: 'stl', len: 5, color: 'green', parallel: null },
  { a: 'pit', b: 'tor', len: 2, color: null, parallel: null },
  { a: 'pit', b: 'was', len: 2, color: null, parallel: null },
  { a: 'por', b: 'sea', len: 1, color: null, parallel: 0 },
  { a: 'por', b: 'sea', len: 1, color: null, parallel: 1 },
  { a: 'por', b: 'sfo', len: 5, color: 'purple', parallel: 0 },
  { a: 'por', b: 'sfo', len: 5, color: 'green', parallel: 1 },
  { a: 'por', b: 'slc', len: 6, color: 'blue', parallel: null },
  { a: 'ral', b: 'was', len: 2, color: null, parallel: 0 },
  { a: 'ral', b: 'was', len: 2, color: null, parallel: 1 },
  { a: 'sau', b: 'tor', len: 2, color: null, parallel: null },
  { a: 'sau', b: 'win', len: 6, color: null, parallel: null },
  { a: 'sea', b: 'van', len: 1, color: null, parallel: 0 },
  { a: 'sea', b: 'van', len: 1, color: null, parallel: 1 },
  { a: 'sfo', b: 'slc', len: 5, color: 'white', parallel: 0 },
  { a: 'sfo', b: 'slc', len: 5, color: 'orange', parallel: 1 }
];

// ===== 目的地票 =====
export const TICKETS = [
  { id: 't1', a: 'den', b: 'elp', points: 4 },
  { id: 't2', a: 'hou', b: 'kan', points: 5 },
  { id: 't3', a: 'atl', b: 'nyc', points: 6 },
  { id: 't4', a: 'cgy', b: 'slc', points: 7 },
  { id: 't5', a: 'ccg', b: 'nol', points: 7 },
  { id: 't6', a: 'dul', b: 'hou', points: 8 },
  { id: 't7', a: 'hel', b: 'los', points: 8 },
  { id: 't8', a: 'nas', b: 'sau', points: 8 },
  { id: 't9', a: 'atl', b: 'mon', points: 9 },
  { id: 't10', a: 'ccg', b: 'sfe', points: 9 },
  { id: 't11', a: 'los', b: 'sea', points: 9 },
  { id: 't12', a: 'okl', b: 'sau', points: 9 },
  { id: 't13', a: 'dul', b: 'elp', points: 10 },
  { id: 't14', a: 'mia', b: 'tor', points: 10 },
  { id: 't15', a: 'dal', b: 'nyc', points: 11 },
  { id: 't16', a: 'den', b: 'pit', points: 11 },
  { id: 't17', a: 'lrk', b: 'win', points: 11 },
  { id: 't18', a: 'pho', b: 'por', points: 11 },
  { id: 't19', a: 'bos', b: 'mia', points: 12 },
  { id: 't20', a: 'hou', b: 'win', points: 12 },
  { id: 't21', a: 'mon', b: 'nol', points: 13 },
  { id: 't22', a: 'sfe', b: 'van', points: 13 },
  { id: 't23', a: 'ccg', b: 'los', points: 16 },
  { id: 't24', a: 'atl', b: 'sfo', points: 17 },
  { id: 't25', a: 'nas', b: 'por', points: 17 },
  { id: 't26', a: 'los', b: 'mia', points: 20 },
  { id: 't27', a: 'mon', b: 'van', points: 20 },
  { id: 't28', a: 'los', b: 'nyc', points: 21 },
  { id: 't29', a: 'nyc', b: 'sea', points: 22 }
];

// ===== 派生索引 =====
export const CITY_MAP = {};
for (const c of CITIES) CITY_MAP[c.id] = c;

export const TICKET_MAP = {};
for (const t of TICKETS) TICKET_MAP[t.id] = t;

export function normalizeColor(c) {
  return TRAIN_COLORS.includes(c) ? c : null;
}
