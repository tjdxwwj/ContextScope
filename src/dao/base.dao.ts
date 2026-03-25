/**
 * DAO Base — shared JSON helpers and dynamic WHERE builder
 */

export function toJson(value: unknown): string | null {
  if (value == null) return null;
  try { return JSON.stringify(value); } catch { return null; }
}

export function parseJson<T>(value: unknown): T | undefined {
  if (typeof value !== 'string' || value.length === 0) return undefined;
  try { return JSON.parse(value) as T; } catch { return undefined; }
}

/**
 * Build a "WHERE col = ? AND col2 = ?" clause from a plain object.
 * Supports `>=` and `<=` suffixes on key names (e.g. "timestamp>=").
 */
export function buildWhere(filters: Record<string, unknown>): { clause: string; params: unknown[] } {
  const parts: string[] = [];
  const params: unknown[] = [];
  for (const [key, val] of Object.entries(filters)) {
    if (val === undefined || val === null) continue;
    if (key.endsWith('>=')) {
      parts.push(`${key.slice(0, -2)} >= ?`);
    } else if (key.endsWith('<=')) {
      parts.push(`${key.slice(0, -2)} <= ?`);
    } else {
      parts.push(`${key} = ?`);
    }
    params.push(val);
  }
  const clause = parts.length > 0 ? `WHERE ${parts.join(' AND ')}` : '';
  return { clause, params };
}
