import Database from "better-sqlite3";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, "..", ".env.local") });
dotenv.config();

const databasePath = process.env.STRIDE_DB_PATH || join(__dirname, "..", "stride.db");

const db = new Database(databasePath);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    password_hash TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS auth_identities (
    provider TEXT NOT NULL,
    provider_user_id TEXT NOT NULL,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (provider, provider_user_id),
    UNIQUE (provider, user_id)
  );

  CREATE TABLE IF NOT EXISTS meals (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    name TEXT NOT NULL,
    calories REAL NOT NULL,
    protein REAL NOT NULL DEFAULT 0,
    carbs REAL NOT NULL DEFAULT 0,
    fat REAL NOT NULL DEFAULT 0,
    time TEXT NOT NULL,
    ai_suggestion TEXT,
    meal_type TEXT DEFAULT 'unspecified',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS workouts (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    name TEXT NOT NULL,
    sets TEXT NOT NULL,
    reps TEXT,
    weight TEXT,
    duration TEXT,
    intensity TEXT NOT NULL DEFAULT 'MODERATE',
    exercises TEXT,
    rationale TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS daily_goals (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    calorie_goal REAL NOT NULL DEFAULT 2400,
    protein_goal REAL NOT NULL DEFAULT 180,
    carb_goal REAL NOT NULL DEFAULT 280,
    fat_goal REAL NOT NULL DEFAULT 80,
    UNIQUE(user_id, date)
  );

  CREATE TABLE IF NOT EXISTS insights (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, date)
  );

  CREATE TABLE IF NOT EXISTS weekly_summaries (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    week_start TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, week_start)
  );

  CREATE TABLE IF NOT EXISTS user_profiles (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    weight REAL,
    height REAL,
    age INTEGER,
    activity_level TEXT NOT NULL DEFAULT 'moderate',
    calorie_target REAL,
    protein_target REAL,
    carb_target REAL,
    fat_target REAL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS chat_sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL DEFAULT 'New Chat',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS chat_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    session_id TEXT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_auth_identities_user ON auth_identities(user_id);
  CREATE INDEX IF NOT EXISTS idx_meals_user_date ON meals(user_id, date);
  CREATE INDEX IF NOT EXISTS idx_workouts_user_date ON workouts(user_id, date);
  CREATE INDEX IF NOT EXISTS idx_daily_goals_user_date ON daily_goals(user_id, date);
  CREATE INDEX IF NOT EXISTS idx_insights_user_date ON insights(user_id, date);
  CREATE INDEX IF NOT EXISTS idx_chat_messages_user ON chat_messages(user_id);
  CREATE INDEX IF NOT EXISTS idx_chat_sessions_user ON chat_sessions(user_id);
`);

function hasColumn(table: string, column: string): boolean {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return columns.some((candidate) => candidate.name === column);
}

type Migration = {
  version: number;
  name: string;
  up: () => void;
};

const migrations: Migration[] = [
  {
    version: 1,
    name: "add workout exercises",
    up: () => {
      if (!hasColumn("workouts", "exercises")) {
        db.exec("ALTER TABLE workouts ADD COLUMN exercises TEXT");
      }
    },
  },
  {
    version: 2,
    name: "add meal type",
    up: () => {
      if (!hasColumn("meals", "meal_type")) {
        db.exec("ALTER TABLE meals ADD COLUMN meal_type TEXT DEFAULT 'unspecified'");
      }
    },
  },
  {
    version: 3,
    name: "add workout rationale",
    up: () => {
      if (!hasColumn("workouts", "rationale")) {
        db.exec("ALTER TABLE workouts ADD COLUMN rationale TEXT");
      }
    },
  },
  {
    version: 4,
    name: "add external auth identities",
    up: () => {
      if (!hasColumn("users", "password_hash")) {
        db.exec("ALTER TABLE users ADD COLUMN password_hash TEXT");
      }
      db.exec(`
        CREATE TABLE IF NOT EXISTS auth_identities (
          provider TEXT NOT NULL,
          provider_user_id TEXT NOT NULL,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          PRIMARY KEY (provider, provider_user_id),
          UNIQUE (provider, user_id)
        );
        CREATE INDEX IF NOT EXISTS idx_auth_identities_user ON auth_identities(user_id);
      `);
    },
  },
  {
    version: 5,
    name: "add and backfill chat sessions",
    up: () => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS chat_sessions (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          title TEXT NOT NULL DEFAULT 'New Chat',
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_chat_sessions_user ON chat_sessions(user_id);
      `);

      if (!hasColumn("chat_messages", "session_id")) {
        db.exec(
          "ALTER TABLE chat_messages ADD COLUMN session_id TEXT REFERENCES chat_sessions(id) ON DELETE CASCADE",
        );
      }

      const affectedUsers = db
        .prepare(`
          SELECT user_id, MIN(created_at) AS first_at, MAX(created_at) AS last_at
          FROM chat_messages
          WHERE session_id IS NULL
          GROUP BY user_id
        `)
        .all() as { user_id: string; first_at: string; last_at: string }[];

      const getSession = db.prepare("SELECT user_id FROM chat_sessions WHERE id = ?");
      const insertSession = db.prepare(`
        INSERT OR IGNORE INTO chat_sessions (id, user_id, title, created_at, updated_at)
        VALUES (?, ?, 'Legacy Chat', ?, ?)
      `);
      const updateSession = db.prepare(`
        UPDATE chat_sessions
        SET created_at = ?, updated_at = ?
        WHERE id = ? AND user_id = ?
      `);
      const assignMessages = db.prepare(`
        UPDATE chat_messages
        SET session_id = ?
        WHERE user_id = ? AND session_id IS NULL
      `);

      for (const user of affectedUsers) {
        const sessionId = `legacy:${user.user_id}`;
        const existing = getSession.get(sessionId) as { user_id: string } | undefined;
        if (existing && existing.user_id !== user.user_id) {
          throw new Error(`Legacy chat session collision for user ${user.user_id}`);
        }

        insertSession.run(sessionId, user.user_id, user.first_at, user.last_at);
        updateSession.run(user.first_at, user.last_at, sessionId, user.user_id);
        assignMessages.run(sessionId, user.user_id);
      }

      const remaining = db
        .prepare("SELECT COUNT(*) AS count FROM chat_messages WHERE session_id IS NULL")
        .get() as { count: number };
      if (remaining.count !== 0) {
        throw new Error(`Chat session backfill left ${remaining.count} messages unassigned`);
      }

      db.exec("CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id)");
    },
  },
];

const isMigrationApplied = db.prepare("SELECT 1 FROM schema_migrations WHERE version = ?");
const recordMigration = db.prepare(
  "INSERT INTO schema_migrations (version, name) VALUES (?, ?)",
);

for (const migration of migrations) {
  if (isMigrationApplied.get(migration.version)) continue;

  db.transaction(() => {
    if (isMigrationApplied.get(migration.version)) return;
    migration.up();
    recordMigration.run(migration.version, migration.name);
  }).immediate();
}

export default db;
