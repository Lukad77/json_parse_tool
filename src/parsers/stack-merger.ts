import type { MergedLogEntry } from './types';

/**
 * 判断一行是否是堆栈跟踪的续行（不是新日志的起始行）
 *
 * 匹配模式：
 * - Java: \tat, " at ", Caused by:, ... N more, Suppressed:
 * - C++: #数字开头, 纯数字开头后跟地址
 * - Python: "  File \"", 4空格缩进
 * - 通用: >= 4空格或 tab 开头, 空行
 */
function isStackLine(line: string): boolean {
  // 空行归入当前条目
  if (line.trim() === '') {
    return true;
  }

  // Java 堆栈
  if (line.startsWith('\tat ')) return true;
  if (/^\s+at /.test(line)) return true;
  if (line.startsWith('Caused by:')) return true;
  if (/^\.\.\.\s*\d+\s*more/.test(line)) return true;
  if (line.startsWith('Suppressed:')) return true;

  // C++ 堆栈: #数字 开头
  if (/^#\d+\s/.test(line)) return true;
  // C++ 堆栈: 纯数字开头后跟地址（如 "0  libsystem..."）
  if (/^\d+\s{2,}/.test(line)) return true;

  // Python traceback: "  File \"" 开头
  if (/^\s+File "/.test(line)) return true;

  // 通用续行: 以 >= 4 空格或 tab 开头
  if (/^(\s{4,}|\t)/.test(line)) return true;

  return false;
}

/**
 * 判断一行是否是新日志条目的起始行
 * 判断依据：以时间戳开头、或以 [时间戳 开头
 */
function isLogStart(line: string): boolean {
  // [2026-06-18 09:38:25 或 2026-06-18 09:38:25 或 2026/06/18 09:38:25
  if (/^\[?\d{4}[-/]\d{2}[-/]\d{2}[T ]\d{2}:\d{2}:\d{2}/.test(line)) return true;

  // syslog 格式: Jun 18 09:38:25
  if (/^\[?[A-Z][a-z]{2}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}/.test(line)) return true;

  // 仅时间开头: 09:38:25
  if (/^\[?\d{2}:\d{2}:\d{2}/.test(line)) return true;

  return false;
}

/**
 * 将多行文本合并为日志条目数组
 *
 * 逻辑：
 * 1. 逐行扫描
 * 2. 如果当前行是日志起始行（isLogStart），开始新的 entry
 * 3. 如果当前行是堆栈续行（isStackLine），归入当前 entry 的 stackLines
 * 4. 如果当前行既不是日志起始也不是堆栈续行，也归入当前 entry 的 stackLines
 */
export function mergeMultilineEntries(text: string): MergedLogEntry[] {
  if (!text || text.trim() === '') {
    return [];
  }

  const lines = text.split('\n');
  const entries: MergedLogEntry[] = [];
  let current: MergedLogEntry | null = null;

  for (const line of lines) {
    if (isLogStart(line)) {
      // 当前行是新日志的起始，保存之前的 entry 并开始新的
      if (current) {
        entries.push(current);
      }
      current = {
        header: line,
        stackLines: [],
        isStack: false,
      };
    } else if (current) {
      // 归入当前 entry 的 stackLines（无论是堆栈续行还是其他行）
      current.stackLines.push(line);
      // 如果是真正的堆栈行（非空行），标记 isStack
      if (!current.isStack && line.trim() !== '' && isStackLine(line)) {
        current.isStack = true;
      }
    } else {
      // 没有 header 的情况（文本开头就是堆栈或续行）
      // 特殊处理：Python Traceback 作为 header
      if (line.startsWith('Traceback (most recent call last):')) {
        current = {
          header: line,
          stackLines: [],
          isStack: true,
        };
      } else if (line.trim() !== '') {
        // 非空行但没有匹配到日志起始，作为独立 header
        current = {
          header: line,
          stackLines: [],
          isStack: false,
        };
      }
      // 空行在没有 current 时跳过
    }
  }

  // 推入最后一个 entry
  if (current) {
    entries.push(current);
  }

  return entries;
}

/**
 * 将合并后的条目格式化为输出文本
 * - header 保持原样
 * - stackLines 保持原有缩进
 * - 条目之间空一行
 */
export function formatMergedEntries(entries: MergedLogEntry[]): string {
  if (!entries || entries.length === 0) {
    return '';
  }

  const blocks: string[] = [];

  for (const entry of entries) {
    const lines: string[] = [entry.header];
    // 添加 stackLines，保持原有缩进
    for (const stackLine of entry.stackLines) {
      lines.push(stackLine);
    }
    // 移除尾部空行
    while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
      lines.pop();
    }
    blocks.push(lines.join('\n'));
  }

  // 条目之间空一行
  return blocks.join('\n\n');
}

// 导出辅助函数供测试使用
export { isStackLine, isLogStart };
