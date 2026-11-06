-- boardforge D1 schema
-- 复制自 test1，新增 rooms 表

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  pass_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  save TEXT NOT NULL DEFAULT '',
  last_seen INTEGER,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

-- 游戏房间（Durable Object 有状态，但房间元数据需要持久化）
CREATE TABLE IF NOT EXISTS rooms (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  game TEXT NOT NULL,           -- 游戏ID，如 'splendor'
  created_by TEXT NOT NULL,     -- 创建者 user_id
  room_code TEXT NOT NULL UNIQUE, -- 6位房间号
  status TEXT NOT NULL DEFAULT 'waiting', -- waiting / playing / ended
  max_players INTEGER NOT NULL DEFAULT 4,
  current_players INTEGER NOT NULL DEFAULT 0,
  durable_object_id TEXT,       -- Durable Object 实例ID
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rooms_code ON rooms(room_code);
CREATE INDEX IF NOT EXISTS idx_rooms_status ON rooms(status);

-- 牌库配置（admin 编辑后上云，所有人共享，含卡图 image 字段）
CREATE TABLE IF NOT EXISTS game_configs (
  game_id TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  updated_by TEXT
);

-- 卡牌图片（base64 存 D1，id 形如 splendor:1-01）
CREATE TABLE IF NOT EXISTS card_images (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL,
  card_id TEXT NOT NULL,
  mime TEXT NOT NULL,
  data TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_card_images_game ON card_images(game_id);
