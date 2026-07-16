/**
 * JSON 检测、提取与格式化模块
 *
 * 纯 TypeScript 实现，不依赖 Node.js API。
 * 所有算法保持 O(n) 复杂度，适合处理大文本。
 */

// ─── 类型 ────────────────────────────────────────────────────────

export interface JsonSegment {
  before: string; // JSON 前面的文本
  json: string;   // 提取出的 JSON 原始文本
  after: string;  // JSON 后面的文本（最后一段才有）
}

// ─── isJson ──────────────────────────────────────────────────────

/**
 * 检测一段文本是否是合法的 JSON。
 * 先做简单的首尾字符预判，再调用 JSON.parse。
 */
export function isJson(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length === 0) return false;

  const first = trimmed[0];
  const last = trimmed[trimmed.length - 1];

  // 快速排除：合法 JSON 的顶层值只可能以这些字符开头
  if (
    first !== '{' &&
    first !== '[' &&
    first !== '"' &&
    first !== 't' && // true
    first !== 'f' && // false
    first !== 'n' && // null
    !(first >= '0' && first <= '9') &&
    first !== '-'
  ) {
    return false;
  }

  // 快速排除：大括号/方括号需要配对
  if ((first === '{' && last !== '}') || (first === '[' && last !== ']')) {
    return false;
  }

  try {
    JSON.parse(trimmed);
    return true;
  } catch {
    return false;
  }
}

// ─── 辅助：简单数组过滤 ───────────────────────────────────────────

/**
 * 判断是否是"简单数组"：所有元素为原始类型，长度 <= 3
 */
function isSimpleArray(value: unknown): boolean {
  if (!Array.isArray(value)) return false;
  if (value.length > 3) return false;
  return value.every(
    (item) => item === null || typeof item === 'number' || typeof item === 'string' || typeof item === 'boolean'
  );
}

/**
 * 判断位置 start 前面是否处于"单词上下文"中
 * 即前面紧邻字母/数字/下划线（如 size[0]）或 "字母 [" 模式（如 num [397]）
 */
function isInWordContext(text: string, start: number): boolean {
  if (start <= 0) return false;
  const prevChar = text[start - 1];
  // 直接紧邻字母/数字/下划线（如 size[0]）
  if (/[a-zA-Z0-9_]/.test(prevChar)) return true;
  // 空格前有字母/数字（如 "num [397]"）
  if (prevChar === ' ' && start >= 2 && /[a-zA-Z0-9_)]/.test(text[start - 2])) return true;
  return false;
}

// ─── extractJsonSegments ─────────────────────────────────────────

/**
 * 从文本中提取所有 JSON 片段。
 *
 * 算法：
 * 1. 扫描文本，遇到 `{` 或 `[` 时开始括号匹配。
 * 2. 维护一个计数器跟踪嵌套层级（无需完整栈，只需计数）。
 * 3. 正确跳过字符串内部内容（处理 `\"` 转义）。
 * 4. 栈清空时取得候选 JSON 片段，用 JSON.parse 验证。
 * 5. 不合法的片段视为普通文本。
 *
 * 整体 O(n) 复杂度。
 */
export function extractJsonSegments(text: string): JsonSegment[] {
  const segments: JsonSegment[] = [];
  const len = text.length;
  let lastEnd = 0; // 上一段 JSON 结束后的位置

  let i = 0;
  while (i < len) {
    const ch = text[i];

    // 寻找 JSON 起始字符
    if (ch === '{' || ch === '[') {
      const open = ch;
      const close = open === '{' ? '}' : ']';
      const start = i;
      let depth = 1;
      let j = i + 1;
      let valid = true;

      while (j < len && depth > 0) {
        const c = text[j];

        if (c === '"') {
          // 跳过字符串内容
          j++;
          while (j < len) {
            if (text[j] === '\\') {
              j += 2; // 跳过转义字符
              continue;
            }
            if (text[j] === '"') {
              break;
            }
            j++;
          }
          if (j >= len) {
            // 字符串未闭合，不可能是合法 JSON
            valid = false;
            break;
          }
        } else if (c === open) {
          depth++;
        } else if (c === close) {
          depth--;
        } else if (open === '{' && c === '[') {
          // 对象内部可能包含数组，也需要跟踪
          // 但我们用的 open/close 是配对的，不同类型括号需要独立跟踪
          // 因此切换到通用栈方案
        }
        j++;
      }

      if (valid && depth === 0) {
        const candidate = text.substring(start, j);
        try {
          const parsed = JSON.parse(candidate);
          // 启发式：跳过简单数组（避免 [397]、[0]、["abc"] 等被误提取）
          if (candidate[0] === '[' && isSimpleArray(parsed) && isInWordContext(text, start)) {
            i++;
            continue;
          }
          // 合法 JSON
          segments.push({
            before: text.substring(lastEnd, start),
            json: candidate,
            after: '', // 后续统一赋值
          });
          lastEnd = j;
          i = j;
          continue;
        } catch {
          // 简单计数方案可能不够精确（混合括号类型），
          // 尝试用完整栈方案重新匹配
          const result = tryMatchJsonFull(text, start);
          if (result !== null) {
            // 启发式：跳过简单数组
            if (result.json[0] === '[') {
              try {
                const parsed = JSON.parse(result.json);
                if (isSimpleArray(parsed) && isInWordContext(text, start)) {
                  i++;
                  continue;
                }
              } catch { /* ignore */ }
            }
            segments.push({
              before: text.substring(lastEnd, start),
              json: result.json,
              after: '',
            });
            lastEnd = result.end;
            i = result.end;
            continue;
          }
        }
      } else if (!valid || depth !== 0) {
        // 简单计数失败，尝试完整栈方案
        const result = tryMatchJsonFull(text, start);
        if (result !== null) {
          // 启发式：跳过简单数组
          if (result.json[0] === '[') {
            try {
              const parsed = JSON.parse(result.json);
              if (isSimpleArray(parsed) && isInWordContext(text, start)) {
                i++;
                continue;
              }
            } catch { /* ignore */ }
          }
          segments.push({
            before: text.substring(lastEnd, start),
            json: result.json,
            after: '',
          });
          lastEnd = result.end;
          i = result.end;
          continue;
        }
      }
    }

    i++;
  }

  // 处理 after：最后一段 JSON 之后的文本
  if (segments.length > 0) {
    segments[segments.length - 1].after = text.substring(lastEnd);
  }

  return segments;
}

/**
 * 完整栈方案匹配 JSON，正确处理混合的 {} 和 [] 嵌套。
 * 从 text[start] 开始（必须是 `{` 或 `[`）。
 * 返回 null 表示匹配失败。
 */
function tryMatchJsonFull(
  text: string,
  start: number,
): { json: string; end: number } | null {
  const len = text.length;
  const stack: string[] = [];
  let i = start;

  while (i < len) {
    const c = text[i];

    if (c === '"') {
      // 跳过字符串
      i++;
      while (i < len) {
        if (text[i] === '\\') {
          i += 2;
          continue;
        }
        if (text[i] === '"') break;
        i++;
      }
      if (i >= len) return null;
    } else if (c === '{' || c === '[') {
      stack.push(c);
    } else if (c === '}') {
      if (stack.length === 0 || stack[stack.length - 1] !== '{') return null;
      stack.pop();
      if (stack.length === 0) {
        const candidate = text.substring(start, i + 1);
        try {
          JSON.parse(candidate);
          return { json: candidate, end: i + 1 };
        } catch {
          return null;
        }
      }
    } else if (c === ']') {
      if (stack.length === 0 || stack[stack.length - 1] !== '[') return null;
      stack.pop();
      if (stack.length === 0) {
        const candidate = text.substring(start, i + 1);
        try {
          JSON.parse(candidate);
          return { json: candidate, end: i + 1 };
        } catch {
          return null;
        }
      }
    }

    i++;
  }

  return null;
}

// ─── formatJson ──────────────────────────────────────────────────

/**
 * 格式化 JSON 字符串（pretty print）。
 *
 * - 如果不是合法 JSON，原样返回。
 * - indent 默认 2 空格。
 * - 支持深层递归：如果某个字符串值本身是合法 JSON，会递归展开（最多 3 层）。
 */
export function formatJson(jsonStr: string, indent: number = 2): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    return jsonStr;
  }

  // 递归展开嵌套 JSON 字符串（最多 3 层）
  const expanded = expandNestedJson(parsed, 3);

  return JSON.stringify(expanded, null, indent);
}

/**
 * 递归展开值中嵌套的 JSON 字符串。
 * @param value 任意 JSON 值
 * @param depth 剩余可递归层数（默认 3）
 */
function expandNestedJson(value: unknown, depth: number): unknown {
  if (depth <= 0) return value;

  if (typeof value === 'string') {
    const trimmed = value.trim();

    // 情况1：整体是 JSON
    if (
      (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
      (trimmed.startsWith('[') && trimmed.endsWith(']'))
    ) {
      try {
        const inner = JSON.parse(trimmed);
        // 成功解析 → 递归展开，深度减 1
        return expandNestedJson(inner, depth - 1);
      } catch {
        // 不是合法 JSON，保留原字符串
      }
    }

    // 情况2：字符串中包含大型 JSON 片段（如 "prefix text {...json...}"）
    if (depth > 0 && trimmed.length > 80) {
      const braceIndex = trimmed.indexOf('{');
      const bracketIndex = trimmed.indexOf('[');
      let jsonStart = -1;

      if (braceIndex >= 0 && (bracketIndex < 0 || braceIndex <= bracketIndex)) {
        jsonStart = braceIndex;
      } else if (bracketIndex >= 0) {
        jsonStart = bracketIndex;
      }

      // JSON 开始位置在前 30% 以内（有短前缀），且不是从位置 0 开始（情况1已处理）
      if (jsonStart > 0 && jsonStart < trimmed.length * 0.3) {
        const possibleJson = trimmed.substring(jsonStart);
        if (possibleJson.endsWith('}') || possibleJson.endsWith(']')) {
          try {
            const inner = JSON.parse(possibleJson);
            const prefix = trimmed.substring(0, jsonStart).trim();
            const expandedInner = expandNestedJson(inner, depth - 1);
            return {
              __text_prefix__: prefix,
              __json_content__: expandedInner,
            };
          } catch {
            // 不是合法 JSON，保留原字符串
          }
        }
      }
    }

    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => expandNestedJson(item, depth));
  }

  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      result[k] = expandNestedJson(v, depth);
    }
    return result;
  }

  return value;
}

// ─── compressJson ────────────────────────────────────────────────

/**
 * 压缩 JSON（移除缩进和多余空格）。
 * 如果不是合法 JSON，原样返回。
 */
export function compressJson(formatted: string): string {
  try {
    const parsed = JSON.parse(formatted);
    return JSON.stringify(parsed);
  } catch {
    return formatted;
  }
}
