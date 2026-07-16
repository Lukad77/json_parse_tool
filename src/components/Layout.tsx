import { useRef, useState, useCallback } from 'react'
import { Toolbar } from './Toolbar'
import { LeftEditor } from './Editor/LeftEditor'
import { RightEditor } from './Editor/RightEditor'

export function Layout() {
  const [leftWidth, setLeftWidth] = useState(50) // percentage
  const containerRef = useRef<HTMLDivElement>(null)
  const isDragging = useRef(false)

  const handleMouseDown = useCallback(() => {
    isDragging.current = true
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current || !containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const x = e.clientX - rect.left
      const percentage = (x / rect.width) * 100
      // Clamp between 20% and 80%
      setLeftWidth(Math.min(80, Math.max(20, percentage)))
    }

    const handleMouseUp = () => {
      isDragging.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }, [])

  return (
    <div className="flex flex-col h-full">
      <Toolbar />
      <div ref={containerRef} className="flex flex-1 min-h-0">
        {/* Left Editor Panel */}
        <div style={{ width: `${leftWidth}%` }} className="h-full min-w-0">
          <LeftEditor />
        </div>

        {/* Draggable Divider */}
        <div
          onMouseDown={handleMouseDown}
          className="w-1 bg-gray-700 hover:bg-blue-500 cursor-col-resize transition-colors shrink-0"
        />

        {/* Right Editor Panel */}
        <div style={{ width: `${100 - leftWidth}%` }} className="h-full min-w-0">
          <RightEditor />
        </div>
      </div>
    </div>
  )
}
