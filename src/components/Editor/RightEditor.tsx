import { useRef, useEffect, useState } from 'react'
import { EditorState } from '@codemirror/state'
import { EditorView, keymap, placeholder, lineNumbers } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { oneDark } from '@codemirror/theme-one-dark'
import { json } from '@codemirror/lang-json'
import { foldGutter, foldKeymap } from '@codemirror/language'
import { useEditorStore } from '../../store/useEditorStore'
import { detectInputType } from '../../parsers'
import { logHighlightExtension } from './extensions/logHighlight'
import { searchHighlightExtension, updateSearch, scrollToCurrentMatch } from './extensions/searchHighlight'
import { saveContent } from '../../utils/saveFile'

const editorTheme = EditorView.theme({
  '&': { height: '100%' },
  '.cm-scroller': { overflow: 'auto' },
  '.cm-content': { minHeight: '100%' },
  '.cm-gutters': { backgroundColor: '#1e1e1e', border: 'none' },
  '.cm-foldGutter span': { color: '#858585', cursor: 'pointer', fontSize: '12px' },
})

export function RightEditor() {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const isExternalUpdate = useRef(false)
  const userEditRef = useRef(false)

  const rightContent = useEditorStore((s) => s.rightContent)
  const leftContent = useEditorStore((s) => s.leftContent)
  const mode = useEditorStore((s) => s.mode)
  const setRightContent = useEditorStore((s) => s.setRightContent)
  const parseRightToLeft = useEditorStore((s) => s.parseRightToLeft)
  const searchQuery = useEditorStore((s) => s.searchQuery)
  const currentMatchIndex = useEditorStore((s) => s.currentMatchIndex)
  const setSearchMatches = useEditorStore((s) => s.setSearchMatches)

  const detectedMode = mode === 'auto' ? detectInputType(leftContent) : mode
  const isCurlMode = detectedMode === 'curl'

  useEffect(() => {
    if (!containerRef.current) return

    const state = EditorState.create({
      doc: rightContent,
      extensions: [
        keymap.of([...defaultKeymap, ...historyKeymap, ...foldKeymap]),
        history(),
        lineNumbers(),
        foldGutter({
          markerDOM(open) {
            const span = document.createElement('span')
            span.textContent = open ? '▾' : '▸'
            return span
          },
        }),
        placeholder('结构化输出将显示在此处...'),
        json(),
        oneDark,
        editorTheme,
        // 长行自动软换行（仅视觉换行，不插入真实换行符，复制时不影响结构）
        EditorView.lineWrapping,
        logHighlightExtension(),
        searchHighlightExtension(),
        EditorView.updateListener.of((update) => {
          if (update.docChanged && !isExternalUpdate.current) {
            userEditRef.current = true
            const doc = update.state.doc.toString()
            setRightContent(doc)
          }
        }),
      ],
    })

    const view = new EditorView({
      state,
      parent: containerRef.current,
    })

    viewRef.current = view

    return () => {
      view.destroy()
      viewRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Sync external store changes to the editor
  useEffect(() => {
    const view = viewRef.current
    if (!view) return

    const currentDoc = view.state.doc.toString()
    if (currentDoc !== rightContent) {
      isExternalUpdate.current = true
      view.dispatch({
        changes: {
          from: 0,
          to: currentDoc.length,
          insert: rightContent,
        },
      })
      isExternalUpdate.current = false
    }
  }, [rightContent])

  // Debounced right-to-left compression triggered by user edits
  useEffect(() => {
    if (!userEditRef.current) return
    const timer = setTimeout(() => {
      parseRightToLeft()
      userEditRef.current = false
    }, 300)
    return () => clearTimeout(timer)
  }, [rightContent, parseRightToLeft])

  // Search: update highlights when searchQuery changes
  useEffect(() => {
    if (!viewRef.current) return
    const count = updateSearch(viewRef.current, searchQuery, currentMatchIndex)
    setSearchMatches(count)
    if (count > 0) {
      scrollToCurrentMatch(viewRef.current, searchQuery, 0)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery])

  // Search: scroll to current match when index changes
  useEffect(() => {
    if (!viewRef.current || !searchQuery) return
    updateSearch(viewRef.current, searchQuery, currentMatchIndex)
    scrollToCurrentMatch(viewRef.current, searchQuery, currentMatchIndex)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentMatchIndex])

  const [copiedType, setCopiedType] = useState<'original' | 'formatted' | null>(null)

  const handleCopyOriginal = async () => {
    const content = useEditorStore.getState().leftContent
    if (!content) return
    await navigator.clipboard.writeText(content)
    useEditorStore.getState().addHistory()
    setCopiedType('original')
    setTimeout(() => setCopiedType(null), 2000)
  }

  const handleCopyFormatted = async () => {
    const content = useEditorStore.getState().rightContent
    if (!content) return
    await navigator.clipboard.writeText(content)
    useEditorStore.getState().addHistory()
    setCopiedType('formatted')
    setTimeout(() => setCopiedType(null), 2000)
  }

  const [savedType, setSavedType] = useState<'original' | 'formatted' | null>(null)

  const handleSaveOriginal = async () => {
    const { leftContent: left, mode: currentMode } = useEditorStore.getState()
    if (!left) return
    const res = await saveContent('original', left, currentMode, left)
    if (res.success) {
      setSavedType('original')
      setTimeout(() => setSavedType(null), 2000)
    }
  }

  const handleSaveFormatted = async () => {
    const { leftContent: left, rightContent: right, mode: currentMode } = useEditorStore.getState()
    if (!right) return
    const res = await saveContent('formatted', right, currentMode, left)
    if (res.success) {
      setSavedType('formatted')
      setTimeout(() => setSavedType(null), 2000)
    }
  }

  const btnBase = 'flex items-center gap-1 px-2.5 py-1 rounded text-xs transition-all'

  return (
    <div className="flex flex-col h-full w-full overflow-hidden">
      {/* 顶部工具条 */}
      <div className="bg-gray-800 border-b border-gray-700 px-3 py-1 flex items-center justify-between shrink-0" style={{ minHeight: '34px' }}>
        <span className="text-gray-400 text-xs font-medium">格式化结果</span>
        <div className="flex gap-2">
          {isCurlMode ? (
            <>
              <button
                onClick={handleCopyOriginal}
                disabled={!leftContent}
                className={`${btnBase} ${copiedType === 'original'
                  ? 'bg-green-600 text-white'
                  : leftContent
                    ? 'bg-gray-700 text-gray-300 hover:bg-gray-600 hover:text-white'
                    : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                  }`}
              >
                {copiedType === 'original' ? '已复制 ✓' : '📋 复制原始'}
              </button>
              <button
                onClick={handleCopyFormatted}
                disabled={!rightContent}
                className={`${btnBase} ${copiedType === 'formatted'
                  ? 'bg-green-600 text-white'
                  : rightContent
                    ? 'bg-gray-700 text-gray-300 hover:bg-gray-600 hover:text-white'
                    : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                  }`}
              >
                {copiedType === 'formatted' ? '已复制 ✓' : '📋 复制格式化'}
              </button>
            </>
          ) : (
            <button
              onClick={handleCopyFormatted}
              disabled={!rightContent}
              className={`${btnBase} ${copiedType === 'formatted'
                ? 'bg-green-600 text-white'
                : rightContent
                  ? 'bg-gray-700 text-gray-300 hover:bg-gray-600 hover:text-white'
                  : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                }`}
            >
              {copiedType === 'formatted' ? (
                '已复制 ✓'
              ) : (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                  复制
                </>
              )}
            </button>
          )}
          {/* 保存按钮 */}
          <button
            onClick={handleSaveOriginal}
            disabled={!leftContent}
            className={`${btnBase} ${savedType === 'original'
              ? 'bg-green-600 text-white'
              : leftContent
                ? 'bg-gray-700 text-gray-300 hover:bg-gray-600 hover:text-white'
                : 'bg-gray-700 text-gray-500 cursor-not-allowed'
              }`}
          >
            {savedType === 'original' ? '已保存 ✓' : '💾 保存原始'}
          </button>
          <button
            onClick={handleSaveFormatted}
            disabled={!rightContent}
            className={`${btnBase} ${savedType === 'formatted'
              ? 'bg-green-600 text-white'
              : rightContent
                ? 'bg-gray-700 text-gray-300 hover:bg-gray-600 hover:text-white'
                : 'bg-gray-700 text-gray-500 cursor-not-allowed'
              }`}
          >
            {savedType === 'formatted' ? '已保存 ✓' : '💾 保存格式化'}
          </button>
        </div>
      </div>
      {/* 编辑器区域 */}
      <div ref={containerRef} className="flex-1 min-h-0 w-full" />
    </div>
  )
}
