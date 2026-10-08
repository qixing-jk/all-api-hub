/**
 * Developer tools adapter for browser API introspection, probing, and execution.
 */

import { RuntimeActionIds } from "~/constants/runtimeActions"
import { sendRuntimeMessage } from "~/utils/browser/runtimeMessages"
import { getErrorMessage } from "~/utils/core/error"

export type ApiExecutionContext = "ui" | "background"

export interface ApiInvocationResult {
  success: boolean
  data?: unknown
  error?: string
  durationMs: number
  context: ApiExecutionContext
  path?: string
  timestamp: number
}

export interface ApiProbe {
  id: string
  title: string
  description: string
  category:
    | "tabs"
    | "storage"
    | "cookies"
    | "alarms"
    | "runtime"
    | "permissions"
    | "device"
  supportedContexts: ApiExecutionContext[]
  run: (context: ApiExecutionContext) => Promise<unknown>
}

export interface CodeSnippet {
  id: string
  name: string
  description: string
  code: string
}

/**
 * Returns the raw extension global (chrome or browser) for introspection and dev tools.
 * @param preferredNamespace Optional preferred namespace ('chrome' | 'browser').
 */
export function getRawExtensionApi(
  preferredNamespace?: "chrome" | "browser",
): any {
  if (preferredNamespace === "chrome") {
    return (globalThis as any).chrome || (globalThis as any).browser || null
  }
  if (preferredNamespace === "browser") {
    return (globalThis as any).browser || (globalThis as any).chrome || null
  }
  return (globalThis as any).chrome || (globalThis as any).browser || null
}

/**
 * Safely resolves an object by a dot-separated property path.
 */
function resolveObjectPath(
  root: any,
  path: string,
): { target: unknown; parent: unknown } {
  const segments = path.split(".").filter(Boolean)
  let parent: unknown = null
  let current: unknown = root

  for (const seg of segments) {
    if (current == null) {
      throw new Error(`Cannot read property '${seg}' of ${String(current)}`)
    }
    parent = current
    current = (current as Record<string, unknown>)[seg]
  }

  return { target: current, parent }
}

/**
 * Executes a target browser API method or property access by path.
 * @param path Dot-separated path (e.g. "storage.local.get", "tabs.query", "runtime.getPlatformInfo")
 * @param args Array of arguments to pass to the function
 * @param context Target execution environment ('ui' | 'background')
 */
export async function invokeBrowserApi(
  path: string,
  args: unknown[] = [],
  context: ApiExecutionContext = "ui",
): Promise<ApiInvocationResult> {
  const startTime = performance.now()
  const timestamp = Date.now()

  const isBrowserNs = path.startsWith("browser.")
  const namespace: "chrome" | "browser" = isBrowserNs ? "browser" : "chrome"
  // Clean path (strip leading chrome. or browser.)
  const cleanPath = path.replace(/^(chrome|browser)\./, "")

  if (context === "background") {
    try {
      const response = await sendRuntimeMessage<{
        success: boolean
        data?: unknown
        error?: string
      }>({
        action: RuntimeActionIds.DevExecuteBrowserApi,
        payload: { path: cleanPath, args },
      })

      const durationMs = Math.round(performance.now() - startTime)
      return {
        success: Boolean(response?.success),
        data: response?.data,
        error: response?.error,
        durationMs,
        context,
        path: cleanPath,
        timestamp,
      }
    } catch (err) {
      return {
        success: false,
        error: `Background execution failed: ${getErrorMessage(err)}`,
        durationMs: Math.round(performance.now() - startTime),
        context,
        path: cleanPath,
        timestamp,
      }
    }
  }

  // Local UI thread execution
  try {
    const root = getRawExtensionApi(namespace) || globalThis
    if (!root) {
      throw new Error(
        "No chrome or browser API object available in current context",
      )
    }

    const { target, parent } = resolveObjectPath(root, cleanPath)

    let data: unknown
    if (typeof target === "function") {
      data = await target.apply(parent, args)
    } else {
      data = target
    }

    return {
      success: true,
      data,
      durationMs: Math.round(performance.now() - startTime),
      context,
      path: cleanPath,
      timestamp,
    }
  } catch (err) {
    return {
      success: false,
      error: getErrorMessage(err),
      durationMs: Math.round(performance.now() - startTime),
      context,
      path: cleanPath,
      timestamp,
    }
  }
}

let sandboxIframe: HTMLIFrameElement | null = null
let sandboxReady = false
let sandboxReadyWaiters: Array<{
  resolve: (iframe: HTMLIFrameElement) => void
  reject: (error: Error) => void
}> = []
let sandboxMessageListenerAttached = false
const pendingExecutions = new Map<
  string,
  (res: { success: boolean; data?: unknown; error?: string }) => void
>()

/**
 * Attaches the window message listener for sandbox communication once.
 */
function attachSandboxMessageListener(): void {
  if (sandboxMessageListenerAttached || typeof window === "undefined") return
  sandboxMessageListenerAttached = true

  window.addEventListener("message", async (event) => {
    // Authenticate sender: only accept messages from our sandbox iframe
    if (
      !sandboxIframe?.contentWindow ||
      event.source !== sandboxIframe.contentWindow
    ) {
      return
    }

    const data = event.data
    if (!data || typeof data !== "object" || data.source !== "aah-sandbox") {
      return
    }

    if (data.type === "SANDBOX_READY") {
      sandboxReady = true
      sandboxReadyWaiters.forEach((waiter) => waiter.resolve(sandboxIframe!))
      sandboxReadyWaiters = []
      return
    }

    if (data.type === "RPC_REQUEST") {
      const { rpcId, path, args } = data
      try {
        const res = await invokeBrowserApi(path, args, "ui")
        try {
          sandboxIframe?.contentWindow?.postMessage(
            {
              source: "aah-sandbox-host",
              type: "RPC_RESPONSE",
              rpcId,
              success: res.success,
              data: res.data,
              error: res.error,
            },
            "*",
          )
        } catch {
          sandboxIframe?.contentWindow?.postMessage(
            {
              source: "aah-sandbox-host",
              type: "RPC_RESPONSE",
              rpcId,
              success: res.success,
              data: JSON.parse(JSON.stringify(res.data)),
              error: res.error,
            },
            "*",
          )
        }
      } catch (e: any) {
        sandboxIframe?.contentWindow?.postMessage(
          {
            source: "aah-sandbox-host",
            type: "RPC_RESPONSE",
            rpcId,
            success: false,
            error: e.message,
          },
          "*",
        )
      }
      return
    }

    if (data.type === "EXECUTION_RESULT") {
      const { runId, success, result, error } = data
      const waiter = pendingExecutions.get(runId)
      if (waiter) {
        pendingExecutions.delete(runId)
        waiter({ success, data: result, error })
      }
    }
  })
}

/**
 * Returns the resolved runtime URL for the sandbox page.
 */
function getSandboxUrl(): string | null {
  try {
    const runtime = getRawExtensionApi()?.runtime
    if (typeof runtime?.getURL === "function") {
      return runtime.getURL("sandbox.html")
    }
  } catch {
    // Ignore runtime lookup errors outside extension
  }
  return null
}

/**
 * Spawns and returns a singleton hidden iframe pointing to sandbox.html.
 */
function ensureSandboxIframe(): Promise<HTMLIFrameElement> {
  return new Promise((resolve, reject) => {
    if (typeof document === "undefined") {
      return reject(new Error("Document not available"))
    }

    const sandboxUrl = getSandboxUrl()
    if (!sandboxUrl) {
      return reject(new Error("Cannot resolve sandbox.html URL"))
    }

    if (sandboxIframe && sandboxIframe.isConnected) {
      if (sandboxReady) {
        return resolve(sandboxIframe)
      }
      sandboxReadyWaiters.push({ resolve, reject })
      return
    }

    attachSandboxMessageListener()

    const iframe = document.createElement("iframe")
    iframe.id = "__aah_dev_sandbox__"
    iframe.src = sandboxUrl
    iframe.style.display = "none"

    sandboxReady = false
    sandboxReadyWaiters.push({ resolve, reject })

    const timeout = setTimeout(() => {
      if (!sandboxReady) {
        if (iframe.parentNode) {
          iframe.parentNode.removeChild(iframe)
        }
        if (sandboxIframe === iframe) {
          sandboxIframe = null
        }
        sandboxReady = false
        const waiters = sandboxReadyWaiters
        sandboxReadyWaiters = []
        waiters.forEach((waiter) =>
          waiter.reject(new Error("Sandbox iframe initialization timed out")),
        )
      }
    }, 5000)

    sandboxReadyWaiters.push({
      resolve: () => clearTimeout(timeout),
      reject: () => clearTimeout(timeout),
    })

    sandboxIframe = iframe
    document.body.appendChild(iframe)
  })
}

/**
 * Executes dynamic JavaScript code within the sandboxed iframe and waits for RPC response.
 * @param code JavaScript code string to evaluate.
 */
async function runInSandbox(
  code: string,
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  const iframe = await ensureSandboxIframe()
  const runId = Math.random().toString(36).slice(2) + Date.now().toString(36)

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      pendingExecutions.delete(runId)
      resolve({ success: false, error: "Execution timed out (15s)" })
    }, 15000)

    pendingExecutions.set(runId, (res) => {
      clearTimeout(timeout)
      resolve(res)
    })

    iframe.contentWindow?.postMessage(
      {
        source: "aah-sandbox-host",
        type: "EXECUTE_CODE",
        runId,
        code,
      },
      "*",
    )
  })
}

/**
 * Executes arbitrary JS code snippet within the UI thread.
 * Uses an MV3 compliant sandboxed iframe with automatic chrome.* RPC proxying.
 * @param code The JS code string to evaluate.
 * @param context Target execution environment.
 */
export async function evaluateJsSnippet(
  code: string,
  context: ApiExecutionContext = "ui",
): Promise<ApiInvocationResult> {
  const startTime = performance.now()
  const timestamp = Date.now()

  if (context === "background") {
    return {
      success: false,
      error:
        "Background Service Worker does not support evaluating dynamic script strings under MV3 CSP. Please switch to UI context or use structured API invocation.",
      durationMs: Math.round(performance.now() - startTime),
      context,
      timestamp,
    }
  }

  // Sandboxed execution (allows eval under MV3 CSP + proxies chrome.* API)
  try {
    const sandboxResult = await runInSandbox(code)
    return {
      success: sandboxResult.success,
      data: sandboxResult.data,
      error: sandboxResult.error,
      durationMs: Math.round(performance.now() - startTime),
      context,
      timestamp,
    }
  } catch (sandboxErr) {
    return {
      success: false,
      error: `Sandbox execution failed: ${getErrorMessage(sandboxErr)}`,
      durationMs: Math.round(performance.now() - startTime),
      context,
      timestamp,
    }
  }
}

export const PRESET_PROBES: ApiProbe[] = [
  {
    id: "tabs-active",
    title: "Active Tabs (tabs.query)",
    description:
      "Query active tab and verify currentWindow filtering support (unsupported on some mobile browsers like Firefox Android)",
    category: "tabs",
    supportedContexts: ["ui", "background"],
    run: async () => {
      const chromeApi = getRawExtensionApi()
      if (!chromeApi?.tabs?.query) {
        throw new Error("chrome.tabs.query is unavailable")
      }

      let supportedCurrentWindow = false
      let tabs: any[] = []
      try {
        tabs = await chromeApi.tabs.query({ active: true, currentWindow: true })
        supportedCurrentWindow = true
      } catch (_err) {
        tabs = await chromeApi.tabs.query({ active: true })
        supportedCurrentWindow = false
      }

      return {
        supportedCurrentWindow,
        tabCount: tabs.length,
        firstTab: tabs[0]
          ? {
              id: tabs[0].id,
              title: tabs[0].title,
              url: tabs[0].url ? tabs[0].url.slice(0, 50) + "..." : undefined,
            }
          : null,
      }
    },
  },
  {
    id: "storage-engines",
    title: "Storage Availability (local / sync / session)",
    description:
      "Validate presence and perform read/write verification across all storage engines",
    category: "storage",
    supportedContexts: ["ui", "background"],
    run: async () => {
      const storage = getRawExtensionApi()?.storage
      if (!storage) {
        throw new Error("chrome.storage namespace not found")
      }

      const hasLocal = Boolean(storage.local)
      const hasSync = Boolean(storage.sync)
      const hasSession = Boolean(storage.session)

      let writeVerified = false
      if (hasLocal) {
        const testKey = "__dev_test_probe_key__"
        const testVal = Date.now()
        await storage.local.set({ [testKey]: testVal })
        const readBack = await storage.local.get(testKey)
        writeVerified = readBack?.[testKey] === testVal
        await storage.local.remove(testKey)
      }

      return {
        hasLocal,
        hasSync,
        hasSession,
        localWriteVerified: writeVerified,
      }
    },
  },
  {
    id: "cookies-access",
    title: "Cookie Access (cookies.getAll)",
    description:
      "Test whether host browser grants cookie read/write permissions",
    category: "cookies",
    supportedContexts: ["ui", "background"],
    run: async () => {
      const cookies = getRawExtensionApi()?.cookies
      if (!cookies) {
        return {
          supported: false,
          reason:
            "cookies namespace not found (permissions may not be granted or unsupported on mobile)",
        }
      }

      try {
        const sample = await cookies.getAll({ domain: "google.com" })
        return {
          supported: true,
          permissionGranted: true,
          sampleResultCount: sample.length,
        }
      } catch (err: any) {
        return {
          supported: true,
          permissionGranted: false,
          error: err.message,
        }
      }
    },
  },
  {
    id: "alarms-lifecycle",
    title: "Timer & Alarms (alarms)",
    description:
      "Test creation, retrieval, and clearance lifecycle of chrome.alarms",
    category: "alarms",
    supportedContexts: ["ui", "background"],
    run: async () => {
      const alarms = getRawExtensionApi()?.alarms
      if (!alarms) {
        return { supported: false, reason: "alarms namespace not found" }
      }

      const probeName = "__dev_probe_alarm__"
      await alarms.create(probeName, { delayInMinutes: 10 })
      const all = await alarms.getAll()
      const found = all.some((a: any) => a.name === probeName)
      await alarms.clear(probeName)

      return {
        supported: true,
        createdAndVerified: found,
        totalActiveAlarms: all.length,
      }
    },
  },
  {
    id: "runtime-env",
    title: "Extension Runtime (runtime)",
    description:
      "Inspect manifest version, platform architecture, ID, and runtime status",
    category: "runtime",
    supportedContexts: ["ui", "background"],
    run: async () => {
      const runtime = getRawExtensionApi()?.runtime
      if (!runtime) {
        throw new Error("runtime is unavailable")
      }

      const manifest = runtime.getManifest?.() || {}
      let platformInfo: any = null
      try {
        platformInfo = await runtime.getPlatformInfo?.()
      } catch {
        platformInfo = "getPlatformInfo unsupported"
      }

      return {
        extensionId: runtime.id,
        manifestVersion: manifest.manifest_version,
        extensionVersion: manifest.version,
        platformInfo,
      }
    },
  },
  {
    id: "sidepanel-check",
    title: "Side Panel Support (sidePanel)",
    description:
      "Detect chrome.sidePanel API availability (often unsupported on mobile browsers)",
    category: "runtime",
    supportedContexts: ["ui"],
    run: async () => {
      const sidePanel = getRawExtensionApi()?.sidePanel

      if (!sidePanel) {
        return {
          supported: false,
          note: "chrome.sidePanel is undefined, indicating current browser engine (such as mobile) does not support side panels",
        }
      }

      return {
        supported: true,
        hasSetOptions: typeof sidePanel.setOptions === "function",
        hasOpen: typeof sidePanel.open === "function",
      }
    },
  },
  {
    id: "dnr-rules",
    title: "Declarative Net Request (declarativeNetRequest)",
    description:
      "Check availability and dynamic rules count of declarativeNetRequest API",
    category: "runtime",
    supportedContexts: ["ui", "background"],
    run: async () => {
      const dnr = getRawExtensionApi()?.declarativeNetRequest

      if (!dnr) {
        return { supported: false, reason: "declarativeNetRequest not found" }
      }

      try {
        const rules = await dnr.getDynamicRules?.()
        return {
          supported: true,
          dynamicRulesCount: rules ? rules.length : 0,
        }
      } catch (err: any) {
        return {
          supported: false,
          error: err.message,
        }
      }
    },
  },
  {
    id: "device-screen",
    title: "Device & Viewport (Device & Screen)",
    description:
      "Inspect real user agent, screen dimensions, DPR, and touch points",
    category: "device",
    supportedContexts: ["ui"],
    run: async () => {
      const win = typeof window !== "undefined" ? window : (globalThis as any)
      const screenObj = win.screen || {
        width: 0,
        height: 0,
        availWidth: 0,
        availHeight: 0,
      }
      const nav = typeof navigator !== "undefined" ? navigator : ({} as any)
      return {
        userAgent: nav.userAgent || "N/A",
        userAgentData: (nav as any).userAgentData?.brands ?? "N/A",
        platform: nav.platform || "N/A",
        screen: `${screenObj.width} × ${screenObj.height}`,
        availScreen: `${screenObj.availWidth} × ${screenObj.availHeight}`,
        devicePixelRatio: win.devicePixelRatio || 1,
        maxTouchPoints: nav.maxTouchPoints || 0,
        isSecureContext: Boolean(win.isSecureContext),
      }
    },
  },
]

export const DEFAULT_SNIPPETS: CodeSnippet[] = [
  {
    id: "query-storage",
    name: "Read Storage",
    description: "Retrieve all local storage keys",
    code: `const data = await chrome.storage.local.get(null);\nreturn {\n  totalKeys: Object.keys(data).length,\n  keys: Object.keys(data),\n};`,
  },
  {
    id: "query-tabs",
    name: "Query Active Tab",
    description: "Get active tab title and ID",
    code: `const tabs = await chrome.tabs.query({ active: true });\nreturn tabs.map(t => ({ id: t.id, title: t.title, url: t.url }));`,
  },
  {
    id: "inspect-manifest",
    name: "Inspect Manifest",
    description:
      "Retrieve extension manifest and platform info via runtime RPC",
    code: `const manifest = await chrome.runtime.getManifest();\nconst platform = await chrome.runtime.getPlatformInfo();\nreturn {\n  name: manifest.name,\n  version: manifest.version,\n  manifestVersion: manifest.manifest_version,\n  permissions: manifest.permissions,\n  platform,\n};`,
  },
  {
    id: "ping-background",
    name: "Test Background SW",
    description: "Send runtime message to background worker and await reply",
    code: `return await chrome.runtime.sendMessage({\n  action: "dev:executeBrowserApi",\n  payload: { path: "runtime.getPlatformInfo", args: [] }\n});`,
  },
  {
    id: "inspect-device",
    name: "Device & Screen",
    description:
      "Inspect device viewport, screen dimensions, and touch capability",
    code: `return {\n  ua: navigator.userAgent,\n  screen: \`\${screen.width}x\${screen.height}\`,\n  dpr: window.devicePixelRatio,\n  touch: navigator.maxTouchPoints\n};`,
  },
]
