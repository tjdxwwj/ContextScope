/**
 * DDL — SQLite schema for ContextScope
 * All CREATE TABLE and CREATE INDEX statements live here only.
 */

export const SCHEMA_SQL = `
PRAGMA journal_mode=WAL;
PRAGMA synchronous=NORMAL;

CREATE TABLE IF NOT EXISTS requests (
  id INTEGER PRIMARY KEY,
  type TEXT NOT NULL,
  run_id TEXT NOT NULL,
  task_id TEXT,
  session_id TEXT NOT NULL,
  session_key TEXT,
  provider TEXT,
  model TEXT,
  timestamp INTEGER NOT NULL,
  prompt TEXT,
  system_prompt TEXT,
  history_messages TEXT,
  assistant_texts TEXT,
  usage_json TEXT,
  images_count INTEGER,
  metadata_json TEXT
);
CREATE INDEX IF NOT EXISTS idx_requests_run_ts     ON requests(run_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_requests_session_ts ON requests(session_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_requests_ts         ON requests(timestamp DESC);

CREATE TABLE IF NOT EXISTS tool_calls (
  id INTEGER PRIMARY KEY,
  run_id TEXT NOT NULL,
  session_id TEXT,
  session_key TEXT,
  tool_name TEXT NOT NULL,
  tool_call_id TEXT,
  timestamp INTEGER NOT NULL,
  started_at INTEGER,
  duration_ms INTEGER,
  params_json TEXT,
  result_json TEXT,
  error TEXT,
  metadata_json TEXT
);
CREATE INDEX IF NOT EXISTS idx_tool_calls_run_ts     ON tool_calls(run_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_tool_calls_session_ts ON tool_calls(session_id, timestamp DESC);

CREATE TABLE IF NOT EXISTS subagent_links (
  id INTEGER PRIMARY KEY,
  kind TEXT,
  parent_run_id TEXT NOT NULL,
  child_run_id TEXT,
  parent_session_id TEXT,
  parent_session_key TEXT,
  child_session_key TEXT,
  runtime TEXT,
  mode TEXT,
  label TEXT,
  tool_call_id TEXT,
  timestamp INTEGER NOT NULL,
  ended_at INTEGER,
  outcome TEXT,
  error TEXT,
  metadata_json TEXT
);
CREATE INDEX IF NOT EXISTS idx_subagent_links_parent_run_ts     ON subagent_links(parent_run_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_subagent_links_child_run_ts      ON subagent_links(child_run_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_subagent_links_parent_session_ts ON subagent_links(parent_session_id, timestamp DESC);

CREATE TABLE IF NOT EXISTS tasks (
  task_id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  session_key TEXT,
  parent_task_id TEXT,
  parent_session_id TEXT,
  start_time INTEGER NOT NULL,
  end_time INTEGER,
  duration INTEGER,
  status TEXT,
  end_reason TEXT,
  error TEXT,
  llm_calls INTEGER DEFAULT 0,
  tool_calls INTEGER DEFAULT 0,
  subagent_spawns INTEGER DEFAULT 0,
  total_input INTEGER DEFAULT 0,
  total_output INTEGER DEFAULT 0,
  total_tokens INTEGER DEFAULT 0,
  estimated_cost REAL DEFAULT 0,
  run_ids_json TEXT,
  child_task_ids_json TEXT,
  metadata_json TEXT
);
CREATE INDEX IF NOT EXISTS idx_tasks_session_ts ON tasks(session_id, start_time DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_status     ON tasks(status);
`;
