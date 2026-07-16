/**
 * 统一解析入口
 *
 * 自动检测输入类型并分派到对应的解析器。
 */

import { InputType } from './types';
import {
  isJson,
  extractJsonSegments,
  formatJson,
  compressJson,
} from './json-formatter';
import { formatLog } from './log-parser';
import { parseCurlAndFormat, parseCurl } from './curl-parser';
import { mergeMultilineEntries, formatMergedEntries } from './stack-merger';
import { isBatchLog, parseBatchLogs, formatBatchLogs } from './batch-log-parser';

// ─── detectInputType ─────────────────────────────────────────────

/**
 * 自动检测输入文本的类型。
 *
 * 优先级：
 * 1. 以 `curl ` 开头（忽略前导空白）→ curl
 * 2. 整体是合法 JSON → json
 * 3. 包含常见日志模式 → log
 * 4. 否则 → unknown
 */
export function detectInputType(text: string): InputType {
  const trimmed = text.trim();
  if (trimmed.length === 0) return 'unknown';

  // 1. curl 命令
  if (/^curl\s/i.test(trimmed)) {
    return 'curl';
  }

  // 2. 批量日志检测（在 JSON 之前，因为 JSON Array 也是合法 JSON）
  if (isBatchLog(trimmed)) {
    return 'batch';
  }

  // 3. 整体是合法 JSON
  if (isJson(trimmed)) {
    return 'json';
  }

  // 4. 日志模式检测
  if (isLogPattern(trimmed)) {
    return 'log';
  }

  return 'unknown';
}

/**
 * 检测文本是否包含常见日志模式。
 * 只检查前几行以提高性能。
 */
function isLogPattern(text: string): boolean {
  // 取前 5 行检查
  const lines = text.split('\n', 5);

  // 常见日志级别关键字
  const levelPattern = /\b(INFO|WARN|ERROR|DEBUG|FATAL|TRACE|WARNING|SEVERE)\b/;

  // 常见时间戳模式
  // 2024-01-01 12:00:00  |  2024-01-01T12:00:00  |  [2024-01-01 12:00:00]
  const timestampPattern =
    /\d{4}[-/]\d{2}[-/]\d{2}[\sT]\d{2}:\d{2}:\d{2}/;

  // 方括号包裹的日志格式 [timestamp LEVEL ...]
  const bracketLogPattern = /^\[.*\]\s/;

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (trimmedLine.length === 0) continue;

    if (levelPattern.test(trimmedLine)) return true;
    if (timestampPattern.test(trimmedLine)) return true;
    if (bracketLogPattern.test(trimmedLine)) return true;
  }

  return false;
}

// ─── parse ───────────────────────────────────────────────────────

/**
 * 主解析方法。
 *
 * @param text 原始输入文本
 * @param mode 指定模式，默认 'auto'（自动检测）
 * @returns 格式化后的文本
 */
export function parse(text: string, mode: InputType | 'auto' = 'auto'): string {
  const detectedType = mode === 'auto' ? detectInputType(text) : mode;

  switch (detectedType) {
    case 'json':
      return formatJson(text.trim());

    case 'curl':
      return parseCurlAndFormat(text);

    case 'batch': {
      const records = parseBatchLogs(text);
      return formatBatchLogs(records);
    }

    case 'log': {
      const entries = mergeMultilineEntries(text);
      const merged = formatMergedEntries(entries);
      return formatLog(merged);
    }

    case 'unknown':
    default:
      // unknown 按 log 模式尝试处理
      return formatLog(text);
  }
}

// ─── compress ────────────────────────────────────────────────────

/**
 * 反向操作：将格式化的文本压缩回紧凑格式。
 *
 * @param formatted 格式化后的文本
 * @param mode 指定模式，默认 'auto'
 * @returns 压缩后的文本
 */
export function compress(
  formatted: string,
  mode: InputType | 'auto' = 'auto',
): string {
  const detectedType = mode === 'auto' ? detectInputType(formatted) : mode;

  switch (detectedType) {
    case 'json':
      return compressJson(formatted.trim());

    case 'curl':
      return compressCurlText(formatted);

    case 'batch':
      return formatted;

    case 'log':
      return compressLogText(formatted);

    case 'unknown':
    default:
      return compressLogText(formatted);
  }
}

// ─── Curl 模式压缩 ──────────────────────────────────────────────

/**
 * 将格式化的 curl 命令压缩回单行格式。
 * 由于右侧输出的就是合法 curl 命令（只是带了格式化换行），
 * 直接去掉续行符合并为单行即可。
 */
function compressCurlText(text: string): string {
  // 去掉反斜杠+换行+前导空白，合并为单行
  let result = text.replace(/\\\s*\n\s*/g, ' ');
  result = result.replace(/\s+/g, ' ').trim();

  // 如果 body 中有 JSON，压缩 JSON 部分
  const parsed = parseCurl(result);
  if (parsed.body && isJson(parsed.body)) {
    const compressedBody = compressJson(parsed.body);
    result = result.replace(parsed.body, compressedBody);
  }

  return result;
}

// ─── Log 模式处理 ────────────────────────────────────────────────
// 日志格式化已迁移到 log-parser.ts 中的 formatLog()

/**
 * 逐行扫描格式化后的文本，将多行 JSON 压缩回单行。
 *
 * 策略：识别格式化的 JSON 块（以 `{` 或 `[` 开始的独立行，
 * 到配对的 `}` 或 `]` 结束），将其压缩。
 */
function compressLogText(text: string): string {
  const lines = text.split('\n');
  const result: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const trimmed = lines[i].trimStart();

    // 检查当前行是否可能是多行 JSON 的开始
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      // 收集可能的多行 JSON
      const leadingSpaces = lines[i].length - lines[i].trimStart().length;
      const prefix = lines[i].substring(0, leadingSpaces);
      const jsonLines: string[] = [trimmed];
      let j = i + 1;
      let depth = countBracketDepth(trimmed);

      while (j < lines.length && depth > 0) {
        jsonLines.push(lines[j].trim());
        depth += countBracketDepth(lines[j]);
        j++;
      }

      if (depth === 0) {
        const candidate = jsonLines.join('');
        const compressed = compressJson(candidate);
        if (compressed !== candidate) {
          // 成功压缩
          result.push(prefix + compressed);
          i = j;
          continue;
        }
      }
    }

    // 对单行也检查是否包含格式化的 JSON
    const segments = extractJsonSegments(lines[i]);
    if (segments.length > 0) {
      let compressed = '';
      for (let s = 0; s < segments.length; s++) {
        const seg = segments[s];
        compressed += seg.before;
        compressed += compressJson(seg.json);
        if (s === segments.length - 1) {
          compressed += seg.after;
        }
      }
      result.push(compressed);
    } else {
      result.push(lines[i]);
    }

    i++;
  }

  return result.join('\n');
}

/**
 * 简单计算一行中未配对的括号数量（开括号 +1，闭括号 -1）。
 * 忽略字符串内部的括号。
 */
function countBracketDepth(line: string): number {
  let depth = 0;
  let inString = false;

  for (let i = 0; i < line.length; i++) {
    const c = line[i];

    if (inString) {
      if (c === '\\') {
        i++; // 跳过转义字符
      } else if (c === '"') {
        inString = false;
      }
      continue;
    }

    if (c === '"') {
      inString = true;
    } else if (c === '{' || c === '[') {
      depth++;
    } else if (c === '}' || c === ']') {
      depth--;
    }
  }

  return depth;
}

// ─── 导出类型和子模块 ──────────────────────────────────────────────

export type { InputType, ParseResult, ParsedLogLine, ParsedCurl, MergedLogEntry } from './types';
export { isJson, extractJsonSegments, formatJson, compressJson } from './json-formatter';
export { parseLogLine, formatLog } from './log-parser';
export { parseCurl, formatCurl, parseCurlAndFormat } from './curl-parser';
export { mergeMultilineEntries, formatMergedEntries } from './stack-merger';
export { isBatchLog, parseBatchLogs, formatBatchLogs } from './batch-log-parser';
export type { LogRecord } from './batch-log-parser';
