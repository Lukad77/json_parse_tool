import { create } from 'zustand'
import { parse, compress, detectInputType } from '../parsers'

export type EditorMode = 'auto' | 'log' | 'curl' | 'json' | 'batch'

export interface HistoryEntry {
  id: string
  timestamp: number
  left: string
  right: string
  mode: EditorMode
}

const HISTORY_KEY = 'json-parse-tool:history'
const HISTORY_LIMIT = 20

function loadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as HistoryEntry[]) : []
  } catch {
    return []
  }
}

function persistHistory(history: HistoryEntry[]): void {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history))
  } catch {
    // 忽略写入异常（如隐私模式或超出存储配额）
  }
}

interface EditorState {
  leftContent: string
  rightContent: string
  mode: EditorMode
  history: HistoryEntry[]
  syncDirection: 'left-to-right' | 'right-to-left' | null
  searchQuery: string
  searchMatches: number
  currentMatchIndex: number
  setLeftContent: (content: string) => void
  setRightContent: (content: string) => void
  setMode: (mode: EditorState['mode']) => void
  setSyncDirection: (dir: EditorState['syncDirection']) => void
  setSearchQuery: (query: string) => void
  setSearchMatches: (count: number) => void
  nextMatch: () => void
  prevMatch: () => void
  parseLeftToRight: () => void
  parseRightToLeft: () => void
  importFile: (content: string) => void
  clearAll: () => void
  addHistory: () => void
  restoreHistory: (id: string) => void
  removeHistory: (id: string) => void
  clearHistory: () => void
}

export const useEditorStore = create<EditorState>((set, get) => ({
  leftContent: '',
  rightContent: '',
  mode: 'auto',
  history: loadHistory(),
  syncDirection: null,
  searchQuery: '',
  searchMatches: 0,
  currentMatchIndex: 0,
  setLeftContent: (content) => set({ leftContent: content }),
  setRightContent: (content) => set({ rightContent: content }),
  setMode: (mode) => set({ mode }),
  setSyncDirection: (dir) => set({ syncDirection: dir }),
  setSearchQuery: (query) => set({ searchQuery: query, currentMatchIndex: 0 }),
  setSearchMatches: (count) => set({ searchMatches: count }),
  nextMatch: () => {
    const { currentMatchIndex, searchMatches } = get()
    if (searchMatches === 0) return
    set({ currentMatchIndex: (currentMatchIndex + 1) % searchMatches })
  },
  prevMatch: () => {
    const { currentMatchIndex, searchMatches } = get()
    if (searchMatches === 0) return
    set({ currentMatchIndex: (currentMatchIndex - 1 + searchMatches) % searchMatches })
  },
  parseLeftToRight: () => {
    const { leftContent, mode, syncDirection } = get()
    if (syncDirection === 'right-to-left') {
      set({ syncDirection: null })
      return
    }
    set({ syncDirection: 'left-to-right' })
    const result = parse(leftContent, mode === 'auto' ? undefined : mode)
    set({ rightContent: result, syncDirection: null })
    get().addHistory()
  },
  parseRightToLeft: () => {
    const { rightContent, leftContent, mode, syncDirection } = get()
    if (syncDirection === 'left-to-right') {
      set({ syncDirection: null })
      return
    }

    // batch 模式下不进行反向同步
    const effectiveMode = mode === 'auto' ? detectInputType(leftContent) : mode
    if (effectiveMode === 'batch') {
      return
    }

    set({ syncDirection: 'right-to-left' })
    const result = compress(rightContent, mode === 'auto' ? undefined : mode)
    set({ leftContent: result, syncDirection: null })
    get().addHistory()
  },
  importFile: (content: string) => {
    set({ leftContent: content, syncDirection: null });
    setTimeout(() => {
      get().parseLeftToRight();
    }, 50);
  },
  clearAll: () => {
    set({
      leftContent: '',
      rightContent: '',
      searchQuery: '',
      searchMatches: 0,
      currentMatchIndex: 0,
      syncDirection: null,
    })
  },
  addHistory: () => {
    const { leftContent, rightContent, mode, history } = get()
    // 左右内容均为空时不记录
    if (!leftContent.trim() && !rightContent.trim()) return
    // 与最近一条完全相同则跳过，避免重复记录
    const last = history[0]
    if (last && last.left === leftContent && last.right === rightContent) return
    const entry: HistoryEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
      left: leftContent,
      right: rightContent,
      mode,
    }
    const next = [entry, ...history].slice(0, HISTORY_LIMIT)
    set({ history: next })
    persistHistory(next)
  },
  restoreHistory: (id) => {
    const entry = get().history.find((h) => h.id === id)
    if (!entry) return
    set({
      leftContent: entry.left,
      rightContent: entry.right,
      mode: entry.mode,
      syncDirection: null,
    })
  },
  removeHistory: (id) => {
    const next = get().history.filter((h) => h.id !== id)
    set({ history: next })
    persistHistory(next)
  },
  clearHistory: () => {
    set({ history: [] })
    persistHistory([])
  },
}))
