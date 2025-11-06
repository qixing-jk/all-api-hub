import { ChildProcess, spawn } from "child_process"
import fs from "fs/promises"
import path from "path"
import { Plugin } from "vite"

interface ReactDevToolsOptions {
  autoStart?: boolean // 是否自动启动 standalone
  port?: number // DevTools 端口
  maxWait?: number // 最大等待时间(ms)
  cacheDuration?: number // 缓存时长(ms)
  forceFetch?: boolean // 是否强制更新 backend.js
}

let devtoolsProcess: ChildProcess | null = null

export function reactDevToolsAuto(options: ReactDevToolsOptions = {}): Plugin {
  const env = process.env

  // ======== 参数合并与优先级 ========
  const config = {
    autoStart:
      options.autoStart ?? boolEnv(env.REACT_DEVTOOLS_AUTO_START, true),
    port: options.port ?? numEnv(env.REACT_DEVTOOLS_PORT, 8097),
    maxWait: options.maxWait ?? numEnv(env.REACT_DEVTOOLS_MAX_WAIT, 5000),
    cacheDuration:
      options.cacheDuration ??
      numEnv(env.REACT_DEVTOOLS_CACHE_DURATION, 86400000),
    forceFetch:
      options.forceFetch ?? boolEnv(env.REACT_DEVTOOLS_FORCE_FETCH, false)
  }

  const publicDir = path.resolve(process.cwd(), "public")
  const backendPath = path.join(publicDir, "react-devtools-backend.js")

  function boolEnv(envValue: string | undefined, defaultValue: boolean) {
    if (envValue === "true") return true
    if (envValue === "false") return false
    return defaultValue
  }

  function numEnv(envValue: string | undefined, defaultValue: number) {
    return envValue ? Number(envValue) : defaultValue
  }

  // ======== 辅助函数 ========
  async function waitForDevTools(): Promise<boolean> {
    const start = Date.now()
    while (Date.now() - start < config.maxWait) {
      try {
        const res = await fetch(`http://localhost:${config.port}`)
        if (res.ok) return true
      } catch (error) {
        console.error(error)
      }
      await new Promise((resolve) => setTimeout(resolve, 200))
    }
    return false
  }

  async function isCacheExpired(filePath: string): Promise<boolean> {
    try {
      const stats = await fs.stat(filePath)
      return Date.now() - stats.mtimeMs > config.cacheDuration
    } catch {
      return true
    }
  }

  async function fetchBackend() {
    try {
      const content = await fetch(`http://localhost:${config.port}`).then((r) =>
        r.text()
      )
      await fs.mkdir(path.dirname(backendPath), { recursive: true })
      await fs.writeFile(backendPath, content)
      console.log("✅ React DevTools backend updated")
    } catch (error) {
      console.warn("⚠️ Failed to fetch React DevTools backend:", error)
      console.log("💡 You can manually run: npx react-devtools")
    }
  }

  // ======== Vite 插件逻辑 ========
  return {
    name: "wxt-react-devtools-auto",
    apply: "serve",

    async configureServer(server) {
      if (config.autoStart && !devtoolsProcess) {
        devtoolsProcess = spawn("npx", ["react-devtools"], {
          stdio: "inherit",
          shell: true
        })
        console.log(
          `🚀 React DevTools standalone starting on port ${config.port}...`
        )
      }

      const ready = await waitForDevTools()
      const expired = await isCacheExpired(backendPath)

      if (config.forceFetch || (ready && expired)) {
        await fetchBackend()
      } else if (!expired) {
        console.log("✅ React DevTools backend cache is valid")
      } else if (!ready && expired) {
        console.warn("⚠️ DevTools not started, using stale backend (if exists)")
      }

      server.httpServer?.once("close", () => {
        if (devtoolsProcess) {
          devtoolsProcess.kill()
          devtoolsProcess = null
          console.log("🛑 React DevTools standalone stopped")
        }
      })
    },

    transformIndexHtml: {
      order: "pre",
      handler(html) {
        if (html.includes("react-devtools-backend.js")) return html
        return [
          {
            tag: "script",
            attrs: { src: "/react-devtools-backend.js" },
            injectTo: "head-prepend"
          }
        ]
      }
    }
  }
}
