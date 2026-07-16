export interface SaveFileResult {
    success: boolean
    filePath?: string
    canceled?: boolean
    error?: string
}

export interface SaveFileOptions {
    content: string
    defaultFileName: string
    format: 'json' | 'txt'
}

export interface ElectronAPI {
    saveFile(opts: SaveFileOptions): Promise<SaveFileResult>
}

declare global {
    interface Window {
        electronAPI?: ElectronAPI
    }
}

export { }
