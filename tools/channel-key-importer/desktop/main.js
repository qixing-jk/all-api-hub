import { mkdir, readFile, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { app, BrowserWindow, dialog, Menu, safeStorage, shell } from "electron"

let importerServer = null
let mainWindow = null

class ElectronTokenStore {
  #filePath
  #mutation = Promise.resolve()

  constructor(filePath) {
    this.#filePath = filePath
  }

  async #readAll() {
    try {
      const value = JSON.parse(await readFile(this.#filePath, "utf8"))
      return value && typeof value === "object" ? value : {}
    } catch {
      return {}
    }
  }

  async save(account, token) {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error("当前系统暂时无法安全保存管理员令牌")
    }
    const operation = this.#mutation.then(async () => {
      const tokens = await this.#readAll()
      tokens[account] = safeStorage.encryptString(token).toString("base64")
      await mkdir(dirname(this.#filePath), { recursive: true, mode: 0o700 })
      await writeFile(this.#filePath, `${JSON.stringify(tokens, null, 2)}\n`, {
        encoding: "utf8",
        mode: 0o600,
      })
    })
    this.#mutation = operation.catch(() => {})
    return await operation
  }

  async read(account) {
    if (!safeStorage.isEncryptionAvailable()) return ""
    try {
      const encoded = (await this.#readAll())[account]
      return encoded
        ? safeStorage.decryptString(Buffer.from(encoded, "base64"))
        : ""
    } catch {
      return ""
    }
  }
}

const isExternalWebUrl = (value) => {
  try {
    const url = new URL(value)
    return url.protocol === "https:" || url.protocol === "http:"
  } catch {
    return false
  }
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    title: "dataeyesai",
    width: 1440,
    height: 960,
    minWidth: 980,
    minHeight: 700,
    show: false,
    backgroundColor: "#eef4fd",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isExternalWebUrl(url)) void shell.openExternal(url)
    return { action: "deny" }
  })
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (new URL(url).origin !== new URL(importerServer.url).origin) {
      event.preventDefault()
      if (isExternalWebUrl(url)) void shell.openExternal(url)
    }
  })
  mainWindow.once("ready-to-show", () => mainWindow?.show())
  mainWindow.on("closed", () => {
    mainWindow = null
  })
  await mainWindow.loadURL(importerServer.url)
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.show()
      mainWindow.focus()
    }
  })

  app.whenReady().then(async () => {
    try {
      app.setName("dataeyesai")
      Menu.setApplicationMenu(null)
      const dataDir = app.getPath("userData")
      const { migrateDataFiles } = await import("../src/dataMigration.js")
      await migrateDataFiles(join(homedir(), ".config", "dataeyesai"), dataDir)
      process.env.DATAEYESAI_DATA_DIR = dataDir
      const { startImporterServer } = await import("../src/server.js")
      importerServer = await startImporterServer({
        port: 0,
        tokenStore: new ElectronTokenStore(join(dataDir, "secure-tokens.json")),
      })
      await createWindow()
    } catch (error) {
      dialog.showErrorBox(
        "dataeyesai 启动失败",
        error instanceof Error ? error.message : "未知错误",
      )
      app.quit()
    }
  })

  app.on("activate", () => {
    if (!mainWindow && importerServer) void createWindow()
  })

  app.on("window-all-closed", () => app.quit())
  app.on("will-quit", () => {
    if (importerServer) void importerServer.close()
  })
}
