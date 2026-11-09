// 铁路环游：欧洲版 · 静态数据（官方地图）
// 47 座城市 / 101 条线路（含平行双线）/ 40 张普通目的地票 + 6 张长途票
// 数据依据：官方 Europe 版规则书与地图坐标

// ===== 常量 =====
export const TRAIN_COLORS = ['purple', 'white', 'blue', 'yellow', 'orange', 'black', 'red', 'green'];

export const COLOR_NAMES = {
  purple: '紫色',
  white: '白色',
  blue: '蓝色',
  yellow: '黄色',
  orange: '橙色',
  black: '黑色',
  red: '红色',
  green: '绿色',
  gray: '灰色',
  loco: '车头'
};

export const TRAIN_CARS_PER_PLAYER = 45;
export const STATIONS_PER_PLAYER = 3;
export const CARDS_PER_COLOR = 12;
export const LOCOMOTIVES = 14;
export const STARTING_HAND = 4;
export const FACE_UP_COUNT = 5;
export const TICKETS_DRAWN_PER_ACTION = 3;
export const MIN_INITIAL_TICKETS = 2;
export const UNUSED_STATION_POINTS = 4;
export const LONGEST_PATH_BONUS = 10;

// 线路长度 → 得分
export const ROUTE_SCORES = { 1: 1, 2: 2, 3: 4, 4: 7, 5: 10, 6: 15, 7: 18, 8: 21 };

// 建第 1/2/3 个车站的花费（同色卡张数）
export const STATION_COSTS = [1, 2, 3];

// ===== 城市 =====
// x / y 为地图坐标（供后续 UI 渲染，引擎不使用）
export const CITIES = [
  { id: 'edinburgh', en: 'Edinburgh', zh: '爱丁堡', x: 276, y: 127 },
  { id: 'london', en: 'London', zh: '伦敦', x: 311, y: 239 },
  { id: 'dieppe', en: 'Dieppe', zh: '迪耶普', x: 319, y: 354 },
  { id: 'brest', en: 'Brest', zh: '布雷斯特', x: 218, y: 367 },
  { id: 'paris', en: 'Paris', zh: '巴黎', x: 361, y: 444 },
  { id: 'pamplona', en: 'Pamplona', zh: '潘普洛纳', x: 251, y: 556 },
  { id: 'madrid', en: 'Madrid', zh: '马德里', x: 159, y: 640 },
  { id: 'lisboa', en: 'Lisboa', zh: '里斯本', x: 50, y: 662 },
  { id: 'cadiz', en: 'Cadiz', zh: '加的斯', x: 106, y: 731 },
  { id: 'barcelona', en: 'Barcelona', zh: '巴塞罗那', x: 258, y: 670 },
  { id: 'marseille', en: 'Marseille', zh: '马赛', x: 435, y: 566 },
  { id: 'amsterdam', en: 'Amsterdam', zh: '阿姆斯特丹', x: 433, y: 253 },
  { id: 'bruxelles', en: 'Bruxelles', zh: '布鲁塞尔', x: 391, y: 330 },
  { id: 'essen', en: 'Essen', zh: '埃森', x: 500, y: 270 },
  { id: 'frankfurt', en: 'Frankfurt', zh: '法兰克福', x: 475, y: 340 },
  { id: 'zurich', en: 'Zurich', zh: '苏黎世', x: 470, y: 463 },
  { id: 'roma', en: 'Roma', zh: '罗马', x: 587, y: 600 },
  { id: 'venezia', en: 'Venezia', zh: '威尼斯', x: 560, y: 496 },
  { id: 'munchen', en: 'Munchen', zh: '慕尼黑', x: 543, y: 391 },
  { id: 'berlin', en: 'Berlin', zh: '柏林', x: 611, y: 277 },
  { id: 'kobenhavn', en: 'Kobenhavn', zh: '哥本哈根', x: 566, y: 168 },
  { id: 'stockholm', en: 'Stockholm', zh: '斯德哥尔摩', x: 635, y: 82 },
  { id: 'danzig', en: 'Danzig', zh: '但泽', x: 685, y: 205 },
  { id: 'wien', en: 'Wien', zh: '维也纳', x: 654, y: 404 },
  { id: 'zagrab', en: 'Zagrab', zh: '萨格勒布', x: 672, y: 502 },
  { id: 'brindisi', en: 'Brindisi', zh: '布林迪西', x: 688, y: 631 },
  { id: 'palermo', en: 'Palermo', zh: '巴勒莫', x: 653, y: 752 },
  { id: 'sarajevo', en: 'Sarajevo', zh: '萨拉热窝', x: 785, y: 563 },
  { id: 'budapest', en: 'Budapest', zh: '布达佩斯', x: 742, y: 428 },
  { id: 'riga', en: 'Riga', zh: '里加', x: 756, y: 100 },
  { id: 'warszawa', en: 'Warszawa', zh: '华沙', x: 753, y: 252 },
  { id: 'wilno', en: 'Wilno', zh: '维尔纽斯', x: 884, y: 214 },
  { id: 'sofia', en: 'Sofia', zh: '索菲亚', x: 869, y: 529 },
  { id: 'athina', en: 'Athina', zh: '雅典', x: 855, y: 678 },
  { id: 'bucuresti', en: 'Bucuresti', zh: '布加勒斯特', x: 910, y: 452 },
  { id: 'petrograd', en: 'Petrograd', zh: '圣彼得堡', x: 959, y: 36 },
  { id: 'smolensk', en: 'Smolensk', zh: '斯摩棱斯克', x: 954, y: 166 },
  { id: 'moskva', en: 'Moskva', zh: '莫斯科', x: 1070, y: 130 },
  { id: 'kyiv', en: 'Kyiv', zh: '基辅', x: 964, y: 261 },
  { id: 'kharkov', en: 'Kharkov', zh: '哈尔科夫', x: 1083, y: 276 },
  { id: 'rostov', en: 'Rostov', zh: '罗斯托夫', x: 1150, y: 289 },
  { id: 'sochi', en: 'Sochi', zh: '索契', x: 1203, y: 396 },
  { id: 'sevastopol', en: 'Sevastopol', zh: '塞瓦斯托波尔', x: 1067, y: 416 },
  { id: 'constantinople', en: 'Constantinople', zh: '君士坦丁堡', x: 1006, y: 579 },
  { id: 'smyrna', en: 'Smyrna', zh: '士麦那', x: 991, y: 689 },
  { id: 'angora', en: 'Angora', zh: '安卡拉', x: 1093, y: 621 },
  { id: 'erzurum', en: 'Erzurum', zh: '埃尔祖鲁姆', x: 1217, y: 563 }
];

export const CITY_MAP = Object.fromEntries(CITIES.map(c => [c.id, c]));

// ===== 线路 =====
// color: null 表示灰色（可用任意单一颜色）
// ferries: 车头符号数量（必须支付等量车头卡）
// tunnel: 是否为隧道（占领时翻 3 张牌，同色需额外加付）
// parallel: null | 0 | 1 —— 同一对城市的平行双线分组
export const ROUTES = [
  { a: 'edinburgh', b: 'london', len: 4, color: 'black', ferries: 0, tunnel: false, parallel: 0 },
  { a: 'edinburgh', b: 'london', len: 4, color: 'orange', ferries: 0, tunnel: false, parallel: 1 },
  { a: 'london', b: 'dieppe', len: 2, color: null, ferries: 1, tunnel: false, parallel: 0 },
  { a: 'london', b: 'dieppe', len: 2, color: null, ferries: 1, tunnel: false, parallel: 1 },
  { a: 'london', b: 'amsterdam', len: 2, color: null, ferries: 2, tunnel: false, parallel: null },

  { a: 'amsterdam', b: 'essen', len: 3, color: 'yellow', ferries: 0, tunnel: false, parallel: null },
  { a: 'essen', b: 'kobenhavn', len: 3, color: null, ferries: 1, tunnel: false, parallel: 0 },
  { a: 'essen', b: 'kobenhavn', len: 3, color: null, ferries: 1, tunnel: false, parallel: 1 },
  { a: 'kobenhavn', b: 'stockholm', len: 3, color: 'yellow', ferries: 0, tunnel: false, parallel: 0 },
  { a: 'kobenhavn', b: 'stockholm', len: 3, color: 'white', ferries: 0, tunnel: false, parallel: 1 },
  { a: 'stockholm', b: 'petrograd', len: 8, color: null, ferries: 0, tunnel: true, parallel: null },

  { a: 'petrograd', b: 'moskva', len: 4, color: 'white', ferries: 0, tunnel: false, parallel: null },
  { a: 'riga', b: 'petrograd', len: 4, color: null, ferries: 0, tunnel: false, parallel: null },
  { a: 'danzig', b: 'riga', len: 3, color: 'black', ferries: 0, tunnel: false, parallel: null },
  { a: 'berlin', b: 'danzig', len: 4, color: null, ferries: 0, tunnel: false, parallel: null },
  { a: 'essen', b: 'berlin', len: 2, color: 'blue', ferries: 0, tunnel: false, parallel: null },

  { a: 'essen', b: 'frankfurt', len: 2, color: 'green', ferries: 0, tunnel: false, parallel: null },
  { a: 'amsterdam', b: 'frankfurt', len: 2, color: 'white', ferries: 0, tunnel: false, parallel: null },
  { a: 'amsterdam', b: 'bruxelles', len: 1, color: 'black', ferries: 0, tunnel: false, parallel: null },
  { a: 'dieppe', b: 'bruxelles', len: 2, color: 'green', ferries: 0, tunnel: false, parallel: null },

  { a: 'dieppe', b: 'brest', len: 2, color: 'orange', ferries: 0, tunnel: false, parallel: null },
  { a: 'brest', b: 'paris', len: 3, color: 'black', ferries: 0, tunnel: false, parallel: null },
  { a: 'dieppe', b: 'paris', len: 1, color: 'purple', ferries: 0, tunnel: false, parallel: null },
  { a: 'paris', b: 'bruxelles', len: 2, color: 'yellow', ferries: 0, tunnel: false, parallel: 0 },
  { a: 'paris', b: 'bruxelles', len: 2, color: 'red', ferries: 0, tunnel: false, parallel: 1 },

  { a: 'bruxelles', b: 'frankfurt', len: 2, color: 'blue', ferries: 0, tunnel: false, parallel: null },
  { a: 'frankfurt', b: 'berlin', len: 3, color: 'black', ferries: 0, tunnel: false, parallel: 0 },
  { a: 'frankfurt', b: 'berlin', len: 3, color: 'red', ferries: 0, tunnel: false, parallel: 1 },
  { a: 'paris', b: 'frankfurt', len: 3, color: 'white', ferries: 0, tunnel: false, parallel: 0 },
  { a: 'paris', b: 'frankfurt', len: 3, color: 'orange', ferries: 0, tunnel: false, parallel: 1 },

  { a: 'berlin', b: 'warszawa', len: 4, color: 'purple', ferries: 0, tunnel: false, parallel: 0 },
  { a: 'berlin', b: 'warszawa', len: 4, color: 'yellow', ferries: 0, tunnel: false, parallel: 1 },
  { a: 'danzig', b: 'warszawa', len: 2, color: null, ferries: 0, tunnel: false, parallel: null },
  { a: 'warszawa', b: 'wilno', len: 3, color: 'red', ferries: 0, tunnel: false, parallel: null },
  { a: 'riga', b: 'wilno', len: 4, color: 'green', ferries: 0, tunnel: false, parallel: null },

  { a: 'wilno', b: 'petrograd', len: 4, color: 'blue', ferries: 0, tunnel: false, parallel: null },
  { a: 'wilno', b: 'smolensk', len: 3, color: 'yellow', ferries: 0, tunnel: false, parallel: null },
  { a: 'smolensk', b: 'moskva', len: 2, color: 'orange', ferries: 0, tunnel: false, parallel: null },
  { a: 'moskva', b: 'kharkov', len: 4, color: null, ferries: 0, tunnel: false, parallel: null },
  { a: 'smolensk', b: 'kyiv', len: 3, color: 'red', ferries: 0, tunnel: false, parallel: null },

  { a: 'wilno', b: 'kyiv', len: 2, color: null, ferries: 0, tunnel: false, parallel: null },
  { a: 'warszawa', b: 'kyiv', len: 4, color: null, ferries: 0, tunnel: false, parallel: null },
  { a: 'kyiv', b: 'kharkov', len: 4, color: null, ferries: 0, tunnel: false, parallel: null },
  { a: 'kharkov', b: 'rostov', len: 2, color: 'green', ferries: 0, tunnel: false, parallel: null },
  { a: 'wien', b: 'warszawa', len: 4, color: 'blue', ferries: 0, tunnel: false, parallel: null },

  { a: 'berlin', b: 'wien', len: 3, color: 'green', ferries: 0, tunnel: false, parallel: null },
  { a: 'frankfurt', b: 'munchen', len: 2, color: 'purple', ferries: 0, tunnel: false, parallel: null },
  { a: 'budapest', b: 'kyiv', len: 6, color: null, ferries: 0, tunnel: true, parallel: null },
  { a: 'bucuresti', b: 'kyiv', len: 4, color: null, ferries: 0, tunnel: false, parallel: null },
  { a: 'munchen', b: 'wien', len: 3, color: 'orange', ferries: 0, tunnel: false, parallel: null },

  { a: 'wien', b: 'budapest', len: 1, color: 'red', ferries: 0, tunnel: false, parallel: 0 },
  { a: 'wien', b: 'budapest', len: 1, color: 'white', ferries: 0, tunnel: false, parallel: 1 },
  { a: 'budapest', b: 'bucuresti', len: 4, color: null, ferries: 0, tunnel: true, parallel: null },
  { a: 'bucuresti', b: 'sevastopol', len: 4, color: 'white', ferries: 0, tunnel: false, parallel: null },
  { a: 'rostov', b: 'sevastopol', len: 4, color: null, ferries: 0, tunnel: false, parallel: null },

  { a: 'rostov', b: 'sochi', len: 2, color: null, ferries: 0, tunnel: false, parallel: null },
  { a: 'sochi', b: 'sevastopol', len: 2, color: null, ferries: 1, tunnel: false, parallel: null },
  { a: 'sochi', b: 'erzurum', len: 3, color: 'red', ferries: 0, tunnel: true, parallel: null },
  { a: 'sevastopol', b: 'erzurum', len: 4, color: null, ferries: 2, tunnel: false, parallel: null },
  { a: 'sevastopol', b: 'constantinople', len: 4, color: null, ferries: 2, tunnel: false, parallel: null },

  { a: 'angora', b: 'erzurum', len: 3, color: 'black', ferries: 0, tunnel: false, parallel: null },
  { a: 'constantinople', b: 'angora', len: 2, color: null, ferries: 0, tunnel: true, parallel: null },
  { a: 'smyrna', b: 'angora', len: 3, color: 'orange', ferries: 0, tunnel: true, parallel: null },
  { a: 'constantinople', b: 'smyrna', len: 2, color: null, ferries: 0, tunnel: true, parallel: null },
  { a: 'bucuresti', b: 'constantinople', len: 3, color: 'yellow', ferries: 0, tunnel: false, parallel: null },

  { a: 'sofia', b: 'bucuresti', len: 2, color: null, ferries: 0, tunnel: true, parallel: null },
  { a: 'sofia', b: 'constantinople', len: 3, color: 'blue', ferries: 0, tunnel: false, parallel: null },
  { a: 'athina', b: 'smyrna', len: 2, color: null, ferries: 1, tunnel: false, parallel: null },
  { a: 'sofia', b: 'athina', len: 3, color: 'purple', ferries: 0, tunnel: false, parallel: null },
  { a: 'sarajevo', b: 'sofia', len: 2, color: null, ferries: 0, tunnel: true, parallel: null },

  { a: 'sarajevo', b: 'budapest', len: 3, color: 'purple', ferries: 0, tunnel: false, parallel: null },
  { a: 'zagrab', b: 'budapest', len: 2, color: 'orange', ferries: 0, tunnel: false, parallel: null },
  { a: 'zagrab', b: 'sarajevo', len: 3, color: 'red', ferries: 0, tunnel: false, parallel: null },
  { a: 'wien', b: 'zagrab', len: 2, color: null, ferries: 0, tunnel: false, parallel: null },
  { a: 'sarajevo', b: 'athina', len: 4, color: 'green', ferries: 0, tunnel: false, parallel: null },

  { a: 'brindisi', b: 'athina', len: 4, color: null, ferries: 1, tunnel: false, parallel: null },
  { a: 'venezia', b: 'zagrab', len: 2, color: null, ferries: 0, tunnel: false, parallel: null },
  { a: 'venezia', b: 'munchen', len: 2, color: 'blue', ferries: 0, tunnel: true, parallel: null },
  { a: 'zurich', b: 'munchen', len: 2, color: 'yellow', ferries: 0, tunnel: true, parallel: null },
  { a: 'zurich', b: 'venezia', len: 2, color: 'green', ferries: 0, tunnel: true, parallel: null },

  { a: 'paris', b: 'zurich', len: 3, color: null, ferries: 0, tunnel: true, parallel: null },
  { a: 'marseille', b: 'zurich', len: 2, color: 'purple', ferries: 0, tunnel: true, parallel: null },
  { a: 'roma', b: 'venezia', len: 2, color: 'black', ferries: 0, tunnel: false, parallel: null },
  { a: 'roma', b: 'brindisi', len: 2, color: 'white', ferries: 0, tunnel: false, parallel: null },
  { a: 'palermo', b: 'smyrna', len: 6, color: null, ferries: 2, tunnel: false, parallel: null },

  { a: 'brindisi', b: 'palermo', len: 3, color: null, ferries: 1, tunnel: false, parallel: null },
  { a: 'roma', b: 'palermo', len: 4, color: null, ferries: 1, tunnel: false, parallel: null },
  { a: 'marseille', b: 'roma', len: 4, color: null, ferries: 0, tunnel: true, parallel: null },
  { a: 'paris', b: 'marseille', len: 4, color: null, ferries: 0, tunnel: false, parallel: null },
  { a: 'paris', b: 'pamplona', len: 4, color: 'blue', ferries: 0, tunnel: false, parallel: 0 },

  { a: 'paris', b: 'pamplona', len: 4, color: 'green', ferries: 0, tunnel: false, parallel: 1 },
  { a: 'brest', b: 'pamplona', len: 4, color: 'purple', ferries: 0, tunnel: false, parallel: null },
  { a: 'pamplona', b: 'marseille', len: 4, color: 'red', ferries: 0, tunnel: false, parallel: null },
  { a: 'barcelona', b: 'marseille', len: 4, color: null, ferries: 0, tunnel: false, parallel: null },
  { a: 'pamplona', b: 'barcelona', len: 2, color: null, ferries: 0, tunnel: true, parallel: null },

  { a: 'madrid', b: 'barcelona', len: 2, color: 'yellow', ferries: 0, tunnel: false, parallel: null },
  { a: 'pamplona', b: 'madrid', len: 3, color: 'white', ferries: 0, tunnel: true, parallel: 0 },
  { a: 'pamplona', b: 'madrid', len: 3, color: 'black', ferries: 0, tunnel: true, parallel: 1 },
  { a: 'madrid', b: 'lisboa', len: 3, color: 'purple', ferries: 0, tunnel: false, parallel: null },
  { a: 'lisboa', b: 'cadiz', len: 2, color: 'blue', ferries: 0, tunnel: false, parallel: null },

  { a: 'madrid', b: 'cadiz', len: 3, color: 'orange', ferries: 0, tunnel: false, parallel: null }
];

// 兼容两种颜色写法（历史数据中可能用 pink 表示紫色）
export function normalizeColor(c) {
  if (!c || c === 'gray' || c === 'grey') return null;
  if (c === 'pink') return 'purple';
  return c;
}

// ===== 目的地票 =====
// long: 是否为长途票（蓝底）
export const TICKETS = [
  // 40 张普通票
  { id: 't01', a: 'frankfurt', b: 'kobenhavn', points: 5, long: false },
  { id: 't02', a: 'marseille', b: 'essen', points: 8, long: false },
  { id: 't03', a: 'smolensk', b: 'rostov', points: 8, long: false },
  { id: 't04', a: 'kyiv', b: 'sochi', points: 8, long: false },
  { id: 't05', a: 'paris', b: 'zagrab', points: 7, long: false },
  { id: 't06', a: 'london', b: 'wien', points: 10, long: false },
  { id: 't07', a: 'riga', b: 'bucuresti', points: 10, long: false },
  { id: 't08', a: 'berlin', b: 'bucuresti', points: 8, long: false },
  { id: 't09', a: 'berlin', b: 'moskva', points: 12, long: false },
  { id: 't10', a: 'erzurum', b: 'rostov', points: 5, long: false },
  { id: 't11', a: 'brest', b: 'marseille', points: 7, long: false },
  { id: 't12', a: 'venezia', b: 'constantinople', points: 10, long: false },
  { id: 't13', a: 'stockholm', b: 'wien', points: 11, long: false },
  { id: 't14', a: 'sarajevo', b: 'sevastopol', points: 8, long: false },
  { id: 't15', a: 'kyiv', b: 'petrograd', points: 6, long: false },
  { id: 't16', a: 'paris', b: 'wien', points: 8, long: false },
  { id: 't17', a: 'berlin', b: 'roma', points: 9, long: false },
  { id: 't18', a: 'madrid', b: 'dieppe', points: 8, long: false },
  { id: 't19', a: 'zagrab', b: 'brindisi', points: 6, long: false },
  { id: 't20', a: 'bruxelles', b: 'danzig', points: 9, long: false },
  { id: 't21', a: 'athina', b: 'wilno', points: 11, long: false },
  { id: 't22', a: 'zurich', b: 'brindisi', points: 6, long: false },
  { id: 't23', a: 'essen', b: 'kyiv', points: 10, long: false },
  { id: 't24', a: 'zurich', b: 'budapest', points: 6, long: false },
  { id: 't25', a: 'barcelona', b: 'munchen', points: 8, long: false },
  { id: 't26', a: 'palermo', b: 'constantinople', points: 8, long: false },
  { id: 't27', a: 'athina', b: 'angora', points: 5, long: false },
  { id: 't28', a: 'warszawa', b: 'smolensk', points: 6, long: false },
  { id: 't29', a: 'edinburgh', b: 'paris', points: 7, long: false },
  { id: 't30', a: 'budapest', b: 'sofia', points: 5, long: false },
  { id: 't31', a: 'barcelona', b: 'bruxelles', points: 8, long: false },
  { id: 't32', a: 'sofia', b: 'smyrna', points: 5, long: false },
  { id: 't33', a: 'madrid', b: 'zurich', points: 8, long: false },
  { id: 't34', a: 'amsterdam', b: 'wilno', points: 12, long: false },
  { id: 't35', a: 'brest', b: 'venezia', points: 8, long: false },
  { id: 't36', a: 'roma', b: 'smyrna', points: 8, long: false },
  { id: 't37', a: 'angora', b: 'kharkov', points: 10, long: false },
  { id: 't38', a: 'frankfurt', b: 'smolensk', points: 13, long: false },
  { id: 't39', a: 'london', b: 'berlin', points: 7, long: false },
  { id: 't40', a: 'amsterdam', b: 'pamplona', points: 7, long: false },

  // 6 张长途票
  { id: 'L1', a: 'edinburgh', b: 'athina', points: 21, long: true },
  { id: 'L2', a: 'brest', b: 'petrograd', points: 20, long: true },
  { id: 'L3', a: 'cadiz', b: 'stockholm', points: 21, long: true },
  { id: 'L4', a: 'lisboa', b: 'danzig', points: 20, long: true },
  { id: 'L5', a: 'kobenhavn', b: 'erzurum', points: 21, long: true },
  { id: 'L6', a: 'palermo', b: 'moskva', points: 20, long: true }
];

export const TICKET_MAP = Object.fromEntries(TICKETS.map(t => [t.id, t]));

// 城市名（中文）快捷查询
export function cityName(id) {
  return CITY_MAP[id]?.zh || id;
}
