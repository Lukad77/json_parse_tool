import { useRef, useState } from 'react'
import { useEditorStore } from '../store/useEditorStore'

const modes = [
  { key: 'auto', label: '自动' },
  { key: 'log', label: '日志' },
  { key: 'curl', label: 'curl' },
  { key: 'json', label: 'JSON' },
  { key: 'batch', label: '批量' },
] as const

function formatTime(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function preview(text: string): string {
  const firstLine = text.trim().split('\n')[0] ?? ''
  return firstLine.length > 40 ? `${firstLine.slice(0, 40)}…` : firstLine
}

export function Toolbar() {
  const mode = useEditorStore((s) => s.mode)
  const setMode = useEditorStore((s) => s.setMode)
  const searchQuery = useEditorStore((s) => s.searchQuery)
  const searchMatches = useEditorStore((s) => s.searchMatches)
  const currentMatchIndex = useEditorStore((s) => s.currentMatchIndex)
  const setSearchQuery = useEditorStore((s) => s.setSearchQuery)
  const nextMatch = useEditorStore((s) => s.nextMatch)
  const prevMatch = useEditorStore((s) => s.prevMatch)
  const clearAll = useEditorStore((s) => s.clearAll)
  const importFile = useEditorStore((s) => s.importFile)
  const history = useEditorStore((s) => s.history)
  const restoreHistory = useEditorStore((s) => s.restoreHistory)
  const removeHistory = useEditorStore((s) => s.removeHistory)
  const clearHistory = useEditorStore((s) => s.clearHistory)

  const [showHistory, setShowHistory] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleImportClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (event) => {
      const content = event.target?.result as string
      if (content) {
        importFile(content)
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  return (
    <div className="flex items-center justify-between px-4 h-12 bg-gray-800 border-b border-gray-700 shrink-0">
      <h1 className="text-sm font-semibold text-gray-200 tracking-wide">
        日志解析工具
      </h1>
      <div className="flex items-center gap-1">
        {modes.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setMode(key)}
            className={`px-3 py-1 text-xs rounded transition-colors ${mode === key
                ? 'bg-blue-600 text-white'
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700'
              }`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,.log,.txt,.jsonl"
          className="hidden"
          onChange={handleFileChange}
        />
        <button
          onClick={handleImportClick}
          className="bg-gray-700 text-gray-300 hover:bg-blue-600 hover:text-white rounded px-3 py-1.5 text-sm transition-all"
          title="导入文件"
        >
          📂 导入文件
        </button>
        <span className="text-gray-400 text-sm">🔍</span>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              if (e.shiftKey) {
                prevMatch()
              } else {
                nextMatch()
              }
            }
          }}
          placeholder="搜索..."
          className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm text-white w-[200px] outline-none focus:border-blue-500 transition-colors"
        />
        {searchQuery && (
          <span className="text-xs text-gray-400 whitespace-nowrap">
            {searchMatches > 0
              ? `${currentMatchIndex + 1}/${searchMatches}`
              : '0 个结果'}
          </span>
        )}
        <button
          onClick={prevMatch}
          className="px-2 py-1 text-xs text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors"
          title="上一个"
        >
          ▲
        </button>
        <button
          onClick={nextMatch}
          className="px-2 py-1 text-xs text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors"
          title="下一个"
        >
          ▼
        </button>
        <button
          onClick={clearAll}
          className="bg-gray-700 text-gray-300 hover:bg-red-600 hover:text-white rounded px-3 py-1.5 text-sm transition-all"
          title="清除所有内容"
        >
          🗑 清除
        </button>
        <div className="relative">
          <button
            onClick={() => setShowHistory((v) => !v)}
            className={`rounded px-3 py-1.5 text-sm transition-all ${showHistory
                ? 'bg-blue-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-blue-600 hover:text-white'
              }`}
            title="历史记录"
          >
            🕘 历史记录
          </button>
          {showHistory && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowHistory(false)} />
              <div className="absolute right-0 top-full mt-2 w-96 max-h-96 overflow-auto bg-gray-800 border border-gray-700 rounded shadow-xl z-50">
                <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700 sticky top-0 bg-gray-800">
                  <span className="text-xs font-medium text-gray-300">
                    历史记录（{history.length}）
                  </span>
                  {history.length > 0 && (
                    <button
                      onClick={clearHistory}
                      className="text-xs text-gray-400 hover:text-red-400 transition-colors"
                    >
                      清空
                    </button>
                  )}
                </div>
                {history.length === 0 ? (
                  <div className="px-3 py-6 text-center text-xs text-gray-500">
                    暂无历史记录
                  </div>
                ) : (
                  <ul className="divide-y divide-gray-700/60">
                    {history.map((entry) => (
                      <li key={entry.id}>
                        <div className="group flex items-start gap-2 px-3 py-2 hover:bg-gray-700/50 transition-colors">
                          <button
                            onClick={() => {
                              restoreHistory(entry.id)
                              setShowHistory(false)
                            }}
                            className="flex-1 text-left min-w-0"
                            title="点击恢复此记录"
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-700 text-gray-300 shrink-0">
                                {modes.find((m) => m.key === entry.mode)?.label ?? entry.mode}
                              </span>
                              <span className="text-[11px] text-gray-500 truncate">
                                {formatTime(entry.timestamp)}
                              </span>
                            </div>
                            <div className="mt-1 text-xs text-gray-300 truncate">
                              {preview(entry.left) || preview(entry.right) || '（空）'}
                            </div>
                          </button>
                          <button
                            onClick={() => removeHistory(entry.id)}
                            className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 transition-all shrink-0 px-1"
                            title="删除此记录"
                          >
                            ✕
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
