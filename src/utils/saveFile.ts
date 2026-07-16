import { detectInputType } from '../parsers'
import type { SaveFileResult } from '../electron-api'

type Mode = 'auto' | 'log' | 'curl' | 'json' | 'batch'

/**
 * 根据当前模式推断默认保存格式：
 * JSON / 批量日志默认 .json，其余（普通日志、curl、未知）默认 .txt。
 */
function suggestFormat(mode: Mode, leftContent: string): 'json' | 'txt' {
    const effective = mode === 'auto' ? detectInputType(leftContent) : mode
    return effective === 'json' || effective === 'batch' ? 'json' : 'txt'
}

/**
 * 保存内容到文件。
 *
 * 优先走 Electron 原生"另存为"对话框；若不在 Electron 环境（纯浏览器 dev），
 * 回退到 Blob + <a download> 下载。
 *
 * @param target   保存目标：原始输入或格式化结果
 * @param content  要写入的文本内容
 * @param mode     当前编辑器模式
 * @param leftContent 左侧原始内容（mode 为 auto 时用于自动检测）
 */
export async function saveContent(
    target: 'original' | 'formatted',
    content: string,
    mode: Mode,
    leftContent: string,
): Promise<SaveFileResult> {
    const format = suggestFormat(mode, leftContent)
    const defaultFileName = `${target === 'original' ? 'original' : 'formatted'}.${format}`

    if (window.electronAPI?.saveFile) {
        return window.electronAPI.saveFile({ content, defaultFileName, format })
    }

    // 回退：浏览器下载
    try {
        const blob = new Blob([content], {
            type: format === 'json' ? 'application/json' : 'text/plain',
        })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = defaultFileName
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
        return { success: true, filePath: defaultFileName }
    } catch (err) {
        return { success: false, error: String(err) }
    }
}
