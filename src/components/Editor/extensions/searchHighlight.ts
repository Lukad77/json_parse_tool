/**
 * CodeMirror 6 搜索高亮扩展
 *
 * 使用 StateField + StateEffect + Decoration 实现：
 * - 大小写不敏感搜索
 * - 普通匹配黄色高亮
 * - 当前聚焦匹配橙色高亮
 * - 滚动到当前匹配项
 */

import { StateField, StateEffect, Extension } from '@codemirror/state';
import { EditorView, Decoration, DecorationSet } from '@codemirror/view';
import { RangeSetBuilder } from '@codemirror/state';

// ─── StateEffect ─────────────────────────────────────────────────

const setSearchState = StateEffect.define<{ query: string; currentIndex: number }>();

// ─── Decoration marks ────────────────────────────────────────────

const matchMark = Decoration.mark({ class: 'cm-search-match' });
const currentMatchMark = Decoration.mark({ class: 'cm-search-match-current' });

// ─── 构建 decorations ────────────────────────────────────────────

function buildSearchDecorations(doc: string, query: string, currentIndex: number): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();

  if (!query) {
    return builder.finish();
  }

  const lowerQuery = query.toLowerCase();
  const lowerDoc = doc.toLowerCase();
  const positions: number[] = [];

  let startPos = 0;
  while (true) {
    const idx = lowerDoc.indexOf(lowerQuery, startPos);
    if (idx === -1) break;
    positions.push(idx);
    startPos = idx + 1;
  }

  // 确保 currentIndex 合法
  const safeCurrentIndex = positions.length > 0 ? currentIndex % positions.length : 0;

  for (let i = 0; i < positions.length; i++) {
    const from = positions[i];
    const to = from + query.length;
    const mark = i === safeCurrentIndex ? currentMatchMark : matchMark;
    builder.add(from, to, mark);
  }

  return builder.finish();
}

// ─── StateField ──────────────────────────────────────────────────

const searchField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(decos, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setSearchState)) {
        const { query, currentIndex } = effect.value;
        const doc = tr.state.doc.toString();
        return buildSearchDecorations(doc, query, currentIndex);
      }
    }
    if (tr.docChanged) {
      // 文档变更时清空 decorations（由外部重新触发更新）
      return Decoration.none;
    }
    return decos;
  },
  provide: (f) => EditorView.decorations.from(f),
});

// ─── 主题样式 ────────────────────────────────────────────────────

const searchHighlightTheme = EditorView.baseTheme({
  '.cm-search-match': {
    backgroundColor: 'rgba(255, 213, 0, 0.3)',
    borderRadius: '2px',
  },
  '.cm-search-match-current': {
    backgroundColor: 'rgba(255, 150, 0, 0.6)',
    borderRadius: '2px',
    outline: '1px solid rgba(255, 150, 0, 0.8)',
  },
});

// ─── 导出函数 ────────────────────────────────────────────────────

/**
 * 返回 CodeMirror Extension（包含 StateField + baseTheme）
 */
export function searchHighlightExtension(): Extension {
  return [searchField, searchHighlightTheme];
}

/**
 * 更新搜索状态：dispatch setSearchState effect
 * 内部会重新计算所有匹配位置和 decorations
 * @returns 匹配总数
 */
export function updateSearch(view: EditorView, query: string, currentIndex: number): number {
  view.dispatch({
    effects: setSearchState.of({ query, currentIndex }),
  });

  if (!query) return 0;

  const doc = view.state.doc.toString().toLowerCase();
  const lowerQuery = query.toLowerCase();
  let count = 0;
  let startPos = 0;
  while (true) {
    const idx = doc.indexOf(lowerQuery, startPos);
    if (idx === -1) break;
    count++;
    startPos = idx + 1;
  }

  return count;
}

/**
 * 滚动到当前匹配项
 * 根据 query 重新计算第 currentIndex 个匹配的位置，
 * 然后使用 EditorView.dispatch + scrollIntoView 滚动
 */
export function scrollToCurrentMatch(view: EditorView, query: string, currentIndex: number): void {
  if (!query) return;

  const doc = view.state.doc.toString().toLowerCase();
  const lowerQuery = query.toLowerCase();
  let count = 0;
  let startPos = 0;

  while (true) {
    const idx = doc.indexOf(lowerQuery, startPos);
    if (idx === -1) break;
    if (count === currentIndex) {
      view.dispatch({
        effects: EditorView.scrollIntoView(idx, { y: 'center' }),
      });
      return;
    }
    count++;
    startPos = idx + 1;
  }
}
