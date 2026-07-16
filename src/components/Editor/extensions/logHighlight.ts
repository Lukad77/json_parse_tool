/**
 * CodeMirror 6 日志字段高亮扩展
 *
 * 对格式化后的日志文本进行视觉高亮：
 * - 时间戳 → 蓝色 (#61afef)
 * - INFO → 绿色 (#98c379)
 * - WARN → 黄色 (#e5c07b)
 * - ERROR/FATAL → 红色 (#e06c75)
 * - DEBUG/TRACE → 灰色 (#5c6370)
 * - 文件路径+行号 → 灰色斜体 (#7f848e)
 *
 * 批量日志模式额外高亮：
 * - 分隔线 (━━━...━━━ #N) → 暗灰色 (#555555)
 * - 序号标记 (#N) → 青色 (#56b6c2)
 * - 元数据行 [source/host/path/time: ...] → 灰色斜体 (#5c6370)
 */

import {
  ViewPlugin,
  ViewUpdate,
  Decoration,
  DecorationSet,
  EditorView,
} from '@codemirror/view';
import { RangeSetBuilder } from '@codemirror/state';

// ─── 正则模式 ────────────────────────────────────────────────────

/** 时间戳: 2026-06-18 09:38:25.816 */
const TIMESTAMP_RE = /\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}[\.\d]*/g;

/** 日志级别 */
const LEVEL_RE = /\b(INFO|WARN|ERROR|DEBUG|FATAL|TRACE)\b/g;

/** 文件路径+行号: ClawReco/plugin/ClawReco.cc process():185 或 path/file.cc:185 */
const SOURCE_RE = /(?:[A-Za-z0-9_\-]+\/)+[A-Za-z0-9_\-]+\.\w+(?:\s+\w+\(\))?:\d+/g;

// ─── 批量日志模式正则 ────────────────────────────────────────────

/** 分隔线中的序号标记 #N */
const BATCH_INDEX_RE = /#(\d+)/g;

/** 元数据标签 [source: ...] [host: ...] [path: ...] [time: ...] */
const BATCH_META_RE = /\[(source|host|path|time):\s*[^\]]*\]/g;

// ─── 结构化展示正则 ────────────────────────────────────────────

/** 缩进行中的 key: 部分（如 "  reqid:  value"） */
const KV_KEY_RE = /^(\s{2,})([a-zA-Z_]\w*)\s*:/;

/** 上下文标签 [key=value,key=value] */
const CONTEXT_TAG_RE = /\[[a-zA-Z_]\w*=[^,\]]+(?:,\s*[a-zA-Z_]\w*=[^,\]]+)*\]/g;

// ─── Decoration marks ────────────────────────────────────────────

const timestampMark = Decoration.mark({ class: 'cm-log-timestamp' });
const infoMark = Decoration.mark({ class: 'cm-log-info' });
const warnMark = Decoration.mark({ class: 'cm-log-warn' });
const errorMark = Decoration.mark({ class: 'cm-log-error' });
const debugMark = Decoration.mark({ class: 'cm-log-debug' });
const sourceMark = Decoration.mark({ class: 'cm-log-source' });
const batchSeparatorMark = Decoration.mark({ class: 'cm-batch-separator' });
const batchIndexMark = Decoration.mark({ class: 'cm-batch-index' });
const batchMetaMark = Decoration.mark({ class: 'cm-batch-meta' });
const kvKeyMark = Decoration.mark({ class: 'cm-kv-key' });
const contextTagMark = Decoration.mark({ class: 'cm-context-tag' });

function getMarkForLevel(level: string): Decoration {
  switch (level) {
    case 'INFO':
      return infoMark;
    case 'WARN':
      return warnMark;
    case 'ERROR':
    case 'FATAL':
      return errorMark;
    case 'DEBUG':
    case 'TRACE':
      return debugMark;
    default:
      return infoMark;
  }
}

// ─── 构建 decorations ────────────────────────────────────────────

interface DecoEntry {
  from: number;
  to: number;
  deco: Decoration;
}

function buildDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const entries: DecoEntry[] = [];

  for (const { from, to } of view.visibleRanges) {
    const doc = view.state.doc;
    let pos = from;

    while (pos <= to) {
      const line = doc.lineAt(pos);
      const lineFrom = line.from;
      const lineTo = line.to;
      const lineText = line.text;

      // 判断是否为分隔线（以 ━ 开头）
      if (lineText.startsWith('\u2501')) {
        // 整行标记为分隔线
        if (lineTo > lineFrom) {
          entries.push({ from: lineFrom, to: lineTo, deco: batchSeparatorMark });
        }

        // 分隔线内的 #N 序号标记
        BATCH_INDEX_RE.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = BATCH_INDEX_RE.exec(lineText)) !== null) {
          entries.push({
            from: lineFrom + match.index,
            to: lineFrom + match.index + match[0].length,
            deco: batchIndexMark,
          });
        }
      } else {
        // 非分隔线：应用已有日志高亮规则 + 元数据规则
        let match: RegExpExecArray | null;

        // 时间戳
        TIMESTAMP_RE.lastIndex = 0;
        while ((match = TIMESTAMP_RE.exec(lineText)) !== null) {
          entries.push({
            from: lineFrom + match.index,
            to: lineFrom + match.index + match[0].length,
            deco: timestampMark,
          });
        }

        // 日志级别
        LEVEL_RE.lastIndex = 0;
        while ((match = LEVEL_RE.exec(lineText)) !== null) {
          entries.push({
            from: lineFrom + match.index,
            to: lineFrom + match.index + match[0].length,
            deco: getMarkForLevel(match[1]),
          });
        }

        // 文件路径+行号
        SOURCE_RE.lastIndex = 0;
        while ((match = SOURCE_RE.exec(lineText)) !== null) {
          entries.push({
            from: lineFrom + match.index,
            to: lineFrom + match.index + match[0].length,
            deco: sourceMark,
          });
        }

        // 批量日志元数据标签
        BATCH_META_RE.lastIndex = 0;
        while ((match = BATCH_META_RE.exec(lineText)) !== null) {
          entries.push({
            from: lineFrom + match.index,
            to: lineFrom + match.index + match[0].length,
            deco: batchMetaMark,
          });
        }

        // 缩进行中的键值对 key:
        const kvMatch = KV_KEY_RE.exec(lineText);
        if (kvMatch) {
          const keyStart = kvMatch[1].length; // 跳过缩进
          const keyEnd = keyStart + kvMatch[2].length;
          entries.push({
            from: lineFrom + keyStart,
            to: lineFrom + keyEnd,
            deco: kvKeyMark,
          });
        }

        // 上下文标签 [key=value,...]
        CONTEXT_TAG_RE.lastIndex = 0;
        while ((match = CONTEXT_TAG_RE.exec(lineText)) !== null) {
          entries.push({
            from: lineFrom + match.index,
            to: lineFrom + match.index + match[0].length,
            deco: contextTagMark,
          });
        }
      }

      // 移到下一行
      pos = line.to + 1;
    }
  }

  // DecorationSet 要求按 from 升序排列
  entries.sort((a, b) => a.from - b.from || a.to - b.to);

  for (const entry of entries) {
    builder.add(entry.from, entry.to, entry.deco);
  }

  return builder.finish();
}

// ─── ViewPlugin ──────────────────────────────────────────────────

class LogHighlightPlugin {
  decorations: DecorationSet;

  constructor(view: EditorView) {
    this.decorations = buildDecorations(view);
  }

  update(update: ViewUpdate) {
    if (update.docChanged || update.viewportChanged) {
      this.decorations = buildDecorations(update.view);
    }
  }
}

const logHighlightPlugin = ViewPlugin.fromClass(LogHighlightPlugin, {
  decorations: (v) => v.decorations,
});

// ─── 主题样式 ────────────────────────────────────────────────────

const logHighlightTheme = EditorView.baseTheme({
  '.cm-log-timestamp': {
    color: '#61afef',
  },
  '.cm-log-info': {
    color: '#98c379',
    fontWeight: 'bold',
  },
  '.cm-log-warn': {
    color: '#e5c07b',
    fontWeight: 'bold',
  },
  '.cm-log-error': {
    color: '#e06c75',
    fontWeight: 'bold',
  },
  '.cm-log-debug': {
    color: '#5c6370',
  },
  '.cm-log-source': {
    color: '#7f848e',
    fontStyle: 'italic',
  },
  '.cm-batch-separator': {
    color: '#555555',
    fontWeight: 'bold',
  },
  '.cm-batch-index': {
    color: '#56b6c2',
    fontWeight: 'bold',
  },
  '.cm-batch-meta': {
    color: '#5c6370',
    fontStyle: 'italic',
  },
  '.cm-kv-key': {
    color: '#c678dd',
  },
  '.cm-context-tag': {
    color: '#56b6c2',
    fontStyle: 'italic',
  },
});

// ─── 导出 ────────────────────────────────────────────────────────

/**
 * 创建日志字段高亮扩展。
 * 返回包含 ViewPlugin 和 baseTheme 的扩展数组。
 */
export function logHighlightExtension() {
  return [logHighlightPlugin, logHighlightTheme];
}
