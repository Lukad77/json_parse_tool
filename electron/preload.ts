import { contextBridge, ipcRenderer } from 'electron'

console.log('[preload] Preload script loaded.')

contextBridge.exposeInMainWorld('electronAPI', {
    saveFile: (opts: { content: string; defaultFileName: string; format: 'json' | 'txt' }) =>
        ipcRenderer.invoke('save-file', opts),
})
console.log('[preload] Preload script loaded.')
