/**
 * 日志行解析器
 *
 * 解析常见格式的日志行，提取时间戳、级别、来源和消息体，
 * 并将消息中的 JSON 片段格式化展开。
 */

import { ParsedLogLine } from './types';
import { extractJsonSegments, formatJson } from './json-formatter';

// ─── 正则模式 ────────────────────────────────────────────────────

/**
 * 格式1: [2026-06-18 09:38:25.816 INFO ClawReco/plugin/ClawReco.cc process():185] message
 */
const BRACKET_LOG_RE =
  /^\[(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}[\.\d]*)\s+(INFO|WARN|ERROR|DEBUG|FATAL|TRACE)\s+([^\]]+)\]\s*(.*)/;

/**
 * 格式2: 2026-06-18 09:38:25.816 INFO path/file.cc:185 message
 */
const PLAIN_LOG_RE =
  /^(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}[\.\d]*)\s+(INFO|WARN|ERROR|DEBUG|FATAL|TRACE)\s+(\S+)\s+(.*)/;

/**
 * 格式3: [timestamp] [LEVEL] message
 */
const BRACKET_SPLIT_RE =
  /^\[([^\]]+)\]\s+\[(INFO|WARN|ERROR|DEBUG|FATAL|TRACE)\]\s*(.*)/;

// ─── parseLogLine ────────────────────────────────────────────────

/**
 * 解析单行日志。
 *
 * 支持的格式：
 * - [2026-06-18 09:38:25.816 INFO ClawReco/plugin/ClawReco.cc process():185] message
 * - 2026-06-18 09:38:25.816 INFO path/file.cc:185 message
 * - [timestamp] [LEVEL] message
 *
 * 如果不匹配任何格式，整行作为 message 返回。
 */
export function parseLogLine(line: string): ParsedLogLine {
  // 尝试格式1
  let match = BRACKET_LOG_RE.exec(line);
  if (match) {
    const message = match[4] || '';
    const jsonBodies = extractJsonBodies(message);
    return {
      timestamp: match[1],
      level: match[2] as ParsedLogLine['level'],
      source: match[3].trim(),
      message,
      jsonBodies,
    };
  }

  // 尝试格式2
  match = PLAIN_LOG_RE.exec(line);
  if (match) {
    const message = match[4] || '';
    const jsonBodies = extractJsonBodies(message);
    return {
      timestamp: match[1],
      level: match[2] as ParsedLogLine['level'],
      source: match[3].trim(),
      message,
      jsonBodies,
    };
  }

  // 尝试格式3
  match = BRACKET_SPLIT_RE.exec(line);
  if (match) {
    const message = match[3] || '';
    const jsonBodies = extractJsonBodies(message);
    return {
      timestamp: match[1].trim(),
      level: match[2] as ParsedLogLine['level'],
      message,
      jsonBodies,
    };
  }

  // 无法识别格式，整行作为 message
  const jsonBodies = extractJsonBodies(line);
  return {
    message: line,
    jsonBodies: jsonBodies && jsonBodies.length > 0 ? jsonBodies : undefined,
  };
}

// ─── formatLog ───────────────────────────────────────────────────

/**
 * 格式化一段日志文本。
 *
 * 1. 按行拆分
 * 2. 对每行调用 parseLogLine
 * 3. 将 header 部分（[timestamp LEVEL source]）单独一行
 * 4. message 中的 JSON 片段格式化展开
 * 5. 返回格式化后的完整文本
 */
export function formatLog(text: string): string {
  const lines = text.split('\n');
  const result: string[] = [];

  for (const line of lines) {
    if (line.trim().length === 0) {
      result.push(line);
      continue;
    }

    const parsed = parseLogLine(line);

    // 构建 header 行
    if (parsed.timestamp || parsed.level || parsed.source) {
      const headerParts: string[] = [];
      if (parsed.timestamp) headerParts.push(parsed.timestamp);
      if (parsed.level) headerParts.push(parsed.level);
      if (parsed.source) headerParts.push(parsed.source);
      result.push(`[${headerParts.join(' ')}]`);
    }

    // 格式化 message（展开其中的 JSON）
    if (parsed.message) {
      const formattedMessage = formatMessageWithJson(parsed.message);
      result.push(formattedMessage);
    }
  }

  return result.join('\n');
}

// ─── 辅助函数 ────────────────────────────────────────────────────

/**
 * 从 message 中提取 JSON 字符串体列表。
 */
function extractJsonBodies(message: string): string[] | undefined {
  const segments = extractJsonSegments(message);
  if (segments.length === 0) return undefined;
  return segments.map((seg) => seg.json);
}

/**
 * 从 message 中提取上下文标签 [key=value,key=value]
 * 返回提取的标签列表和剩余文本
 */
function extractContextTags(message: string): { contextTags: string[]; remaining: string } {
  const CONTEXT_TAG_RE = /\[([a-zA-Z_]\w*=[^,\]]+(?:,\s*[a-zA-Z_]\w*=[^,\]]+)*)\]/g;
  const contextTags: string[] = [];
  let remaining = message;

  let match;
  while ((match = CONTEXT_TAG_RE.exec(message)) !== null) {
    contextTags.push(match[0]);
  }

  // 从 remaining 中移除上下文标签
  remaining = message.replace(CONTEXT_TAG_RE, '').trim();

  return { contextTags, remaining };
}

/**
 * 检测文本中的键值对模式并格式化
 * 如果检测到 >= 2 个键值对，拆分为每行一个（缩进 2 空格）
 * 否则原样返回（缩进 2 空格）
 */
function formatKeyValueText(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return '';

  // 匹配 key=value 或 key: value 模式
  const KV_PATTERN = /\b([a-zA-Z_]\w*)(?:=|:\s*)(\S+)/g;
  const matches: { key: string; value: string; index: number; length: number }[] = [];

  let m;
  while ((m = KV_PATTERN.exec(trimmed)) !== null) {
    matches.push({
      key: m[1],
      value: m[2],
      index: m.index,
      length: m[0].length,
    });
  }

  // 至少 2 个键值对才拆分
  if (matches.length < 2) {
    return '  ' + trimmed;
  }

  // 检查键值对是否覆盖了文本的大部分（避免对普通句子误匹配）
  const totalKvLength = matches.reduce((sum, m) => sum + m.length, 0);
  if (totalKvLength < trimmed.length * 0.5) {
    return '  ' + trimmed;
  }

  // 拆分为每行一对
  const lines: string[] = [];

  // 计算最长 key 用于对齐
  const maxKeyLen = Math.max(...matches.map((m) => m.key.length));

  // 检查 matches[0].index 之前是否有前导文本
  const prefix = trimmed.substring(0, matches[0].index).trim();
  if (prefix) {
    lines.push('  ' + prefix);
  }

  for (let i = 0; i < matches.length; i++) {
    const { key, value } = matches[i];
    const padding = ' '.repeat(maxKeyLen - key.length + 1);

    // 检查当前 match 的 value 是否需要扩展（到下一个 match 之间的文本）
    const currentEnd = matches[i].index + matches[i].length;
    const nextStart = i < matches.length - 1 ? matches[i + 1].index : trimmed.length;
    const between = trimmed.substring(currentEnd, nextStart).trim();

    if (i < matches.length - 1) {
      // 非最后一个：将 between 附加到当前 value
      const fullValue = between ? value + ' ' + between : value;
      const cleanValue = fullValue.replace(/,\s*$/, '');
      lines.push(`  ${key}:${padding}${cleanValue}`);
    } else {
      // 最后一个：去除尾部逗号，剩余文本单独一行
      const cleanValue = value.replace(/,\s*$/, '');
      lines.push(`  ${key}:${padding}${cleanValue}`);
      if (between) {
        lines.push('  ' + between);
      }
    }
  }

  return lines.join('\n');
}

/**
 * 格式化消息，将其中的 JSON 片段展开，同时处理上下文标签和键值对。
 */
function formatMessageWithJson(message: string): string {
  const parts: string[] = [];

  // 第1步：提取上下文标签 [key=value,key=value]
  const { contextTags, remaining } = extractContextTags(message);

  // 第2步：对剩余文本检查是否有 JSON
  const segments = extractJsonSegments(remaining);

  if (segments.length > 0) {
    // 有 JSON 片段的情况
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const before = seg.before;

      const cleanedBefore = cleanBeforeJson(before);
      parts.push(formatKeyValueText(cleanedBefore));
      parts.push(formatJson(seg.json));

      if (i === segments.length - 1 && seg.after) {
        const cleanedAfter = cleanAfterJson(seg.after);
        if (cleanedAfter.trim().length > 0) {
          parts.push(formatKeyValueText(cleanedAfter));
        }
      }
    }
  } else {
    // 无 JSON 片段：对整段文本做键值对解析
    parts.push(formatKeyValueText(remaining));
  }

  // 组装输出
  const result: string[] = [];
  for (const tag of contextTags) {
    result.push('  ' + tag);
  }
  for (const part of parts) {
    if (part.trim()) {
      result.push(part);
    }
  }

  return result.join('\n');
}

/**
 * 清理 JSON 前面的文本：
 * 如果以 `[` 结尾（表示 JSON 用方括号包裹），则去掉并加冒号。
 */
function cleanBeforeJson(text: string): string {
  // 去除尾部的 [ 和空格
  const trimmed = text.replace(/\s*\[\s*$/, '');
  if (trimmed !== text) {
    // 原文以 [ 结尾，用冒号替代
    return trimmed + ':';
  }
  return text;
}

/**
 * 清理 JSON 后面的文本：
 * 如果以 `]` 开头（与前面的 `[` 配对），则去掉。
 */
function cleanAfterJson(text: string): string {
  return text.replace(/^\s*\]\s*/, '');
}
