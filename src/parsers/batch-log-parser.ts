/**
 * 批量日志解析器
 *
 * 处理 NDJSON（每行一个 JSON 对象）和 JSON Array 格式的日志文件。
 * 从每条记录中提取元数据和 content 字段，格式化输出。
 */

import { formatLog } from './log-parser';

// ─── 类型 ────────────────────────────────────────────────────────

export interface LogRecord {
  index: number;           // 条目序号 (1-based)
  source?: string;         // __source__ 字段
  hostname?: string;       // __tag__:__hostname__ 字段
  path?: string;           // __tag__:__path__ 字段（取最后的文件名部分）
  time?: string;           // __time__ 字段（Unix 时间戳转为可读格式）
  content: string;         // content 字段（实际日志行）
  raw: Record<string, unknown>; // 完整原始对象
}

// ─── 常见日志元数据字段 ──────────────────────────────────────────

const LOG_META_FIELDS = new Set([
  '__source__',
  '__time__',
  '__topic__',
  '__tag__:__hostname__',
  '__tag__:__path__',
  'content',
]);

// ─── isBatchLog ─────────────────────────────────────────────────

/**
 * 检测文本是否为批量日志格式（NDJSON 或 JSON Array）。
 *
 * 判断依据：
 * - 多行文本，每行都是以 { 开头 } 结尾的合法 JSON（NDJSON）
 * - 或者整体是一个 JSON 数组 [...]
 * - 且至少有 2 条记录
 * - 且记录中包含 "content" 字段或其他常见日志元数据字段
 */
export function isBatchLog(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length === 0) return false;

  // 尝试 JSON Array
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    try {
      const arr = JSON.parse(trimmed);
      if (Array.isArray(arr) && arr.length >= 2) {
        return arr.some((item) => isLogLikeObject(item));
      }
    } catch {
      // 不是合法 JSON Array，继续尝试 NDJSON
    }
  }

  // 尝试 NDJSON
  const lines = trimmed.split('\n').filter((l) => l.trim().length > 0);
  if (lines.length < 2) return false;

  let validCount = 0;
  let hasLogMeta = false;

  for (const line of lines) {
    const t = line.trim();
    if (!t.startsWith('{') || !t.endsWith('}')) return false;
    try {
      const obj = JSON.parse(t);
      validCount++;
      if (isLogLikeObject(obj)) hasLogMeta = true;
    } catch {
      return false;
    }
  }

  return validCount >= 2 && hasLogMeta;
}

/**
 * 检查对象是否包含常见日志元数据字段。
 */
function isLogLikeObject(obj: unknown): boolean {
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) return false;
  const keys = Object.keys(obj as Record<string, unknown>);
  return keys.some((k) => LOG_META_FIELDS.has(k));
}

// ─── parseBatchLogs ─────────────────────────────────────────────

/**
 * 解析批量日志文本为 LogRecord 数组。
 *
 * 1. 先尝试 JSON.parse 整体（JSON Array）
 * 2. 失败则按行拆分逐行 JSON.parse（NDJSON）
 * 3. 跳过解析失败的行
 * 4. 从每个对象中提取元数据和 content 字段
 * 5. 如果对象没有 content 字段，将整个对象 JSON.stringify 作为 content
 */
export function parseBatchLogs(text: string): LogRecord[] {
  const trimmed = text.trim();
  let objects: Record<string, unknown>[] = [];

  // 1. 先尝试整体 JSON Array
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      objects = parsed.filter(
        (item) => item !== null && typeof item === 'object' && !Array.isArray(item),
      ) as Record<string, unknown>[];
    }
  } catch {
    // 2. 按行拆分 NDJSON
    const lines = trimmed.split('\n');
    for (const line of lines) {
      const t = line.trim();
      if (t.length === 0) continue;
      try {
        const obj = JSON.parse(t);
        if (obj !== null && typeof obj === 'object' && !Array.isArray(obj)) {
          objects.push(obj as Record<string, unknown>);
        }
      } catch {
        // 跳过解析失败的行
      }
    }
  }

  return objects.map((obj, i) => objectToLogRecord(obj, i + 1));
}

/**
 * 将原始 JSON 对象转换为 LogRecord。
 */
function objectToLogRecord(obj: Record<string, unknown>, index: number): LogRecord {
  const record: LogRecord = {
    index,
    raw: obj,
    content: '',
  };

  // __source__
  if (typeof obj['__source__'] === 'string') {
    record.source = obj['__source__'];
  }

  // __tag__:__hostname__
  if (typeof obj['__tag__:__hostname__'] === 'string') {
    record.hostname = obj['__tag__:__hostname__'];
  }

  // __tag__:__path__ → 取文件名部分
  if (typeof obj['__tag__:__path__'] === 'string') {
    const fullPath = obj['__tag__:__path__'] as string;
    const parts = fullPath.split('/');
    record.path = parts[parts.length - 1] || fullPath;
  }

  // __time__ → Unix 时间戳转可读格式
  if (obj['__time__'] !== undefined) {
    record.time = formatUnixTime(obj['__time__']);
  }

  // content
  if (typeof obj['content'] === 'string') {
    record.content = obj['content'];
  } else {
    // 没有 content 字段，把整个对象 stringify
    record.content = JSON.stringify(obj);
  }

  return record;
}

/**
 * 将 Unix 时间戳（秒，字符串或数字）转为 YYYY-MM-DD HH:mm:ss 格式。
 */
function formatUnixTime(value: unknown): string {
  let ts: number;
  if (typeof value === 'string') {
    ts = parseInt(value, 10);
  } else if (typeof value === 'number') {
    ts = value;
  } else {
    return String(value);
  }

  if (isNaN(ts)) return String(value);

  const date = new Date(ts * 1000);
  const y = date.getFullYear();
  const mo = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const mi = String(date.getMinutes()).padStart(2, '0');
  const s = String(date.getSeconds()).padStart(2, '0');
  return `${y}-${mo}-${d} ${h}:${mi}:${s}`;
}

// ─── formatBatchLogs ────────────────────────────────────────────

const SEPARATOR_CHAR = '\u2501'; // ━
const SEPARATOR_WIDTH = 50;

/**
 * 将 LogRecord 数组格式化为可读文本。
 *
 * 每条记录：
 * - 分隔线 ━━━━━━...━━━━━━ #N
 * - 元数据行（只显示有值的字段）
 * - 空行
 * - content 经 formatLog() 格式化后的内容
 */
export function formatBatchLogs(records: LogRecord[]): string {
  const parts: string[] = [];

  for (const record of records) {
    // 分隔线
    const separator = SEPARATOR_CHAR.repeat(SEPARATOR_WIDTH) + ` #${record.index}`;
    parts.push(separator);

    // 元数据行
    const metaParts: string[] = [];
    if (record.source) metaParts.push(`[source: ${record.source}]`);
    if (record.hostname) metaParts.push(`[host: ${record.hostname}]`);
    if (record.path) metaParts.push(`[path: ${record.path}]`);
    if (record.time) metaParts.push(`[time: ${record.time}]`);

    if (metaParts.length > 0) {
      parts.push(metaParts.join(' '));
    }

    // 空行 + 格式化 content
    parts.push('');
    parts.push(formatLog(record.content));
    parts.push(''); // 记录之间的空行
  }

  return parts.join('\n').trimEnd();
}
