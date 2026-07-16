import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import path from 'node:path'
import fs from 'node:fs/promises'

const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']

interface SaveFileOptions {
  content: string
  defaultFileName: string
  format: 'json' | 'txt'
}

ipcMain.handle('save-file', async (_event, options: SaveFileOptions) => {
  const { content, defaultFileName, format } = options

  const jsonFilter = { name: 'JSON', extensions: ['json'] }
  const txtFilter = { name: '文本', extensions: ['txt'] }
  const filters = format === 'json' ? [jsonFilter, txtFilter] : [txtFilter, jsonFilter]

  try {
    const win = BrowserWindow.getFocusedWindow()
    const { canceled, filePath } = await dialog.showSaveDialog(win ?? undefined, {
      defaultPath: defaultFileName,
      filters,
    })

    if (canceled || !filePath) {
      return { success: false, canceled: true }
    }

    await fs.writeFile(filePath, content, 'utf-8')
    return { success: true, filePath }
  } catch (err) {
    return { success: false, error: String(err) }
  }
})

function createWindow() {
  const preload = path.join(__dirname, 'preload.js')

  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload,
    },
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
    win.webContents.openDevTools()
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'))
  }
}

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
