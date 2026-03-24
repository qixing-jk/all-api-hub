import { ChildProcess, spawn } from "child_process"
import fs from "fs/promises"
import { Socket } from "net"
import path from "path"
import type { PluginOption, ResolvedConfig, ViteDevServer } from "vite"

interface ReactDevToolsOptions {
  autoStart?: boolean // 是否自动启动 standalone
  port?: number // DevTools 端口
  maxWait?: number // 最大等待时间(ms)
  cacheDuration?: number // 缓存时长(ms)
  forceFetch?: boolean // 是否强制更新 backend.js
}

let devtoolsProcess: ChildProcess | null = null
let ownsDevtoolsProcess = false

/**
 * Vite plugin that auto-starts React DevTools standalone and injects the backend script during dev.
 * Handles caching of backend bundle to avoid repeated fetches between sessions.
 */
export function reactDevToolsAuto(
  options: ReactDevToolsOptions = {},
): PluginOption {
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
      options.forceFetch ?? boolEnv(env.REACT_DEVTOOLS_FORCE_FETCH, false),
  }

  let resolvedPublicDir = path.resolve(process.cwd(), "public")

  /**
   * Returns the backend script path.
   */
  function getBackendPath() {
    return path.join(resolvedPublicDir, "react-devtools-backend.js")
  }

  /**
   * Read a boolean flag from environment variables with fallback default.
   * @param envValue 环境变量中的原始字符串
   * @param defaultValue 若无法解析时使用的默认值
   * @returns boolean 形式的环境值
   */
  function boolEnv(envValue: string | undefined, defaultValue: boolean) {
    if (envValue === "true") return true
    if (envValue === "false") return false
    return defaultValue
  }

  /**
   * Read a numeric flag from environment variables with fallback default.
   * @param envValue 环境变量中的原始字符串
   * @param defaultValue 若无法解析时使用的默认值
   * @returns number 形式的环境值
   */
  function numEnv(envValue: string | undefined, defaultValue: number) {
    return envValue ? Number(envValue) : defaultValue
  }

  // ======== 辅助函数 ========
  /**
   * Heuristically verify the fetched script really looks like the React DevTools backend bundle.
   * @param content HTTP response body from the local DevTools server
   */
  function isDevToolsBackend(content: string) {
    return (
      content.includes("__REACT_DEVTOOLS_GLOBAL_HOOK__") &&
      content.includes("window.__REACT_DEVTOOLS_COMPONENT_FILTERS__")
    )
  }

  /**
   * Fetch the local React DevTools backend if available.
   * @param logUnexpectedResponse whether to warn when the port responds with unexpected content
   */
  async function getDevToolsBackend(
    logUnexpectedResponse = false,
  ): Promise<string | null> {
    try {
      const res = await fetch(`http://localhost:${config.port}`)
      if (!res.ok) return null

      const content = await res.text()
      if (!isDevToolsBackend(content)) {
        if (logUnexpectedResponse) {
          console.warn(
            `⚠️ Port ${config.port} responded, but it does not look like React DevTools. Skipping auto-fetch.`,
          )
        }
        return null
      }

      return content
    } catch {
      return null
    }
  }

  /**
   * Check whether the configured local port is already occupied.
   * @returns true when the port appears to be in use by any process
   */
  async function isPortInUse(): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = new Socket()

      const finalize = (inUse: boolean) => {
        socket.removeAllListeners()
        socket.destroy()
        resolve(inUse)
      }

      socket.setTimeout(300)
      socket.once("connect", () => finalize(true))
      socket.once("timeout", () => finalize(true))
      socket.once("error", (error: NodeJS.ErrnoException) => {
        if (error.code === "ECONNREFUSED") {
          finalize(false)
          return
        }
        finalize(true)
      })

      socket.connect(config.port, "localhost")
    })
  }

  /**
   * Poll local React DevTools server until reachable or timeout.
   * @returns backend script content when DevTools becomes reachable
   */
  async function waitForDevTools(): Promise<string | null> {
    const start = Date.now()
    while (Date.now() - start < config.maxWait) {
      const content = await getDevToolsBackend()
      if (content) return content
      await new Promise((resolve) => setTimeout(resolve, 200))
    }
    return null
  }

  /**
   * 判断缓存文件是否已经过期。
   * @param filePath 缓存文件路径
   * @returns true 表示需要刷新缓存
   */
  async function isCacheExpired(filePath: string): Promise<boolean> {
    try {
      const stats = await fs.stat(filePath)
      return Date.now() - stats.mtimeMs > config.cacheDuration
    } catch {
      return true
    }
  }

  /**
   * Persist the fetched React DevTools backend into the public directory cache.
   */
  async function writeBackend(content: string) {
    try {
      const backendPath = getBackendPath()
      await fs.mkdir(path.dirname(backendPath), { recursive: true })
      await fs.writeFile(backendPath, content)
      console.log("✅ React DevTools backend updated")
    } catch (error) {
      console.warn("⚠️ Failed to cache React DevTools backend:", error)
      console.log("💡 You can manually run: npx react-devtools")
    }
  }

  // ======== Vite 插件逻辑 ========
  const plugin = {
    name: "wxt-react-devtools-auto",
    apply: "serve",

    configResolved(config: ResolvedConfig) {
      if (config.publicDir) resolvedPublicDir = config.publicDir
    },

    async configureServer(server: ViteDevServer) {
      const { mode } = server.config
      // 只在 development 模式运行
      if (mode !== "development") {
        console.log("⏭️  React DevTools skipped (not in development mode)")
        return
      }

      let backendContent = await getDevToolsBackend(true)

      if (backendContent) {
        console.log(
          `✅ React DevTools already running on port ${config.port}, reusing existing instance`,
        )
      } else if (config.autoStart && !devtoolsProcess) {
        const portInUse = await isPortInUse()
        if (portInUse) {
          console.warn(
            `⚠️ Port ${config.port} is already in use by another process. Skipping React DevTools auto-start.`,
          )
        } else {
          devtoolsProcess = spawn("pnpm", ["react-devtools"], {
            env: {
              ...process.env,
              REACT_DEVTOOLS_PORT: String(config.port),
            },
            stdio: "inherit",
            shell: true,
          })
          ownsDevtoolsProcess = true
          devtoolsProcess.once("exit", () => {
            devtoolsProcess = null
            ownsDevtoolsProcess = false
          })
          console.log(
            `🚀 React DevTools standalone starting on port ${config.port}...`,
          )
        }
      }

      backendContent ??= await waitForDevTools()
      const expired = await isCacheExpired(getBackendPath())

      if (backendContent && (config.forceFetch || expired)) {
        await writeBackend(backendContent)
      } else if (!expired) {
        console.log("✅ React DevTools backend cache is valid")
      } else if (!backendContent && expired) {
        console.warn("⚠️ DevTools not started, using stale backend (if exists)")
      }

      server.httpServer?.once("close", () => {
        if (devtoolsProcess && ownsDevtoolsProcess) {
          devtoolsProcess.kill()
          devtoolsProcess = null
          ownsDevtoolsProcess = false
          console.log("🛑 React DevTools standalone stopped")
        }
      })
    },

    transformIndexHtml: {
      order: "pre",
      handler(html: string) {
        if (html.includes("react-devtools-backend.js")) return html
        return [
          {
            tag: "script",
            attrs: { src: "/react-devtools-backend.js" },
            injectTo: "head-prepend",
          },
        ]
      },
    },
  } satisfies PluginOption

  return plugin
}
