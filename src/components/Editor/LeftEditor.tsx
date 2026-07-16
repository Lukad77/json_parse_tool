import { useRef, useEffect, useState } from 'react'
import { EditorState } from '@codemirror/state'
import { EditorView, keymap, placeholder } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { oneDark } from '@codemirror/theme-one-dark'
import { useEditorStore } from '../../store/useEditorStore'

const editorTheme = EditorView.theme({
  '&': { height: '100%' },
  '.cm-scroller': { overflow: 'auto' },
  '.cm-content': { minHeight: '100%' },
})

export function LeftEditor() {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const isExternalUpdate = useRef(false)
  const userEditRef = useRef(false)

  const leftContent = useEditorStore((s) => s.leftContent)
  const setLeftContent = useEditorStore((s) => s.setLeftContent)
  const parseLeftToRight = useEditorStore((s) => s.parseLeftToRight)
  const importFile = useEditorStore((s) => s.importFile)

  const [isDragOver, setIsDragOver] = useState(false)

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)

    const file = e.dataTransfer.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (event) => {
      const content = event.target?.result as string
      if (content) {
        importFile(content)
      }
    }
    reader.readAsText(file)
  }

  useEffect(() => {
    if (!containerRef.current) return

    const state = EditorState.create({
      doc: leftContent,
      extensions: [
        keymap.of([...defaultKeymap, ...historyKeymap]),
        history(),
        placeholder('粘贴日志或 curl 命令...'),
        oneDark,
        editorTheme,
        EditorView.updateListener.of((update) => {
          if (update.docChanged && !isExternalUpdate.current) {
            userEditRef.current = true
            const doc = update.state.doc.toString()
            setLeftContent(doc)
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
    if (currentDoc !== leftContent) {
      isExternalUpdate.current = true
      view.dispatch({
        changes: {
          from: 0,
          to: currentDoc.length,
          insert: leftContent,
        },
      })
      isExternalUpdate.current = false
    }
  }, [leftContent])

  // Debounced left-to-right parsing triggered by user edits
  useEffect(() => {
    if (!userEditRef.current) return
    const timer = setTimeout(() => {
      parseLeftToRight()
      userEditRef.current = false
    }, 300)
    return () => clearTimeout(timer)
  }, [leftContent, parseLeftToRight])

  return (
    <div
      className="flex flex-col h-full w-full overflow-hidden relative"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDragOver && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-blue-600/20 border-2 border-dashed border-blue-400 rounded">
          <span className="text-blue-300 text-lg font-medium">放开以导入文件</span>
        </div>
      )}
      {/* 顶部工具条 */}
      <div className="bg-gray-800 border-b border-gray-700 px-3 py-1 flex items-center justify-between shrink-0" style={{ minHeight: '34px' }}>
        <span className="text-gray-400 text-xs font-medium">原始输入</span>
      </div>
      {/* 编辑器区域 */}
      <div ref={containerRef} className="flex-1 min-h-0 w-full" />
    </div>
  )
}
