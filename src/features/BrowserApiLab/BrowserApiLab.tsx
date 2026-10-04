import {
  AlertCircle,
  CheckCircle2,
  Code2,
  Copy,
  Layers,
  Play,
  RotateCw,
  Terminal,
  XCircle,
} from "lucide-react"
import { useState } from "react"

import { PageHeader } from "~/components/PageHeader"
import {
  Body,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "~/components/ui"
import toast from "~/lib/notify"
import { cn } from "~/lib/utils"
import {
  DEFAULT_SNIPPETS,
  evaluateJsSnippet,
  invokeBrowserApi,
  PRESET_PROBES,
  type ApiExecutionContext,
  type ApiInvocationResult,
  type ApiProbe,
} from "~/utils/browser/devApiExplorer"

type TabType = "probes" | "console" | "invoker"

interface ProbeState {
  status: "idle" | "running" | "success" | "error"
  durationMs?: number
  result?: unknown
  error?: string
}

/**
 * Developer lab component for probing browser APIs and executing JS.
 */
export default function BrowserApiLab() {
  const [activeTab, setActiveTab] = useState<TabType>("probes")
  const [context, setContext] = useState<ApiExecutionContext>("ui")

  // Probe states
  const [probeStates, setProbeStates] = useState<Record<string, ProbeState>>({})
  const [isRunningAllProbes, setIsRunningAllProbes] = useState(false)

  // Console state
  const [code, setCode] = useState<string>(DEFAULT_SNIPPETS[0]?.code ?? "")
  const [consoleResult, setConsoleResult] =
    useState<ApiInvocationResult | null>(null)
  const [isConsoleRunning, setIsConsoleRunning] = useState(false)

  // Structured invoker state
  const [invokerPath, setInvokerPath] = useState("storage.local.get")
  const [invokerArgs, setInvokerArgs] = useState("[null]")
  const [invokerResult, setInvokerResult] =
    useState<ApiInvocationResult | null>(null)
  const [isInvokerRunning, setIsInvokerRunning] = useState(false)

  const copyToClipboard = async (text: string, label = "Result") => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success(`${label} copied to clipboard`)
    } catch {
      toast.error("Failed to copy to clipboard")
    }
  }

  // Run a single probe
  const handleRunProbe = async (probe: ApiProbe) => {
    setProbeStates((prev) => ({
      ...prev,
      [probe.id]: { status: "running" },
    }))

    const start = performance.now()
    try {
      let data: unknown
      if (context === "background") {
        const bgRes = await invokeBrowserApi(
          probe.id === "tabs-active"
            ? "tabs.query"
            : probe.id === "alarms-lifecycle"
              ? "alarms.getAll"
              : probe.id === "storage-engines"
                ? "storage.local.get"
                : "runtime.getPlatformInfo",
          probe.id === "tabs-active"
            ? [{ active: true }]
            : probe.id === "storage-engines"
              ? [null]
              : [],
          "background",
        )
        if (!bgRes.success) {
          throw new Error(bgRes.error || "Background execution failed")
        }
        data = bgRes.data
      } else {
        data = await probe.run(context)
      }

      const durationMs = Math.round(performance.now() - start)
      setProbeStates((prev) => ({
        ...prev,
        [probe.id]: {
          status: "success",
          durationMs,
          result: data,
        },
      }))
    } catch (err: any) {
      const durationMs = Math.round(performance.now() - start)
      setProbeStates((prev) => ({
        ...prev,
        [probe.id]: {
          status: "error",
          durationMs,
          error: err?.message || String(err),
        },
      }))
    }
  }

  // Run all probes sequentially
  const handleRunAllProbes = async () => {
    setIsRunningAllProbes(true)
    for (const probe of PRESET_PROBES) {
      if (!probe.supportedContexts.includes(context)) continue
      await handleRunProbe(probe)
    }
    setIsRunningAllProbes(false)
    toast.success("All probes completed")
  }

  // Run arbitrary JS
  const handleRunCode = async () => {
    if (!code.trim()) {
      toast.info("Please enter JavaScript code to execute")
      return
    }

    setIsConsoleRunning(true)
    try {
      const result = await evaluateJsSnippet(code, context)
      setConsoleResult(result)
      if (result.success) {
        toast.success(`Executed successfully (${result.durationMs}ms)`)
      } else {
        toast.error("Execution failed")
      }
    } finally {
      setIsConsoleRunning(false)
    }
  }

  // Run structured API invocation
  const handleRunInvoker = async () => {
    if (!invokerPath.trim()) {
      toast.info("Please enter an API path")
      return
    }

    let parsedArgs: unknown[] = []
    if (invokerArgs.trim()) {
      try {
        const parsed = JSON.parse(invokerArgs)
        parsedArgs = Array.isArray(parsed) ? parsed : [parsed]
      } catch (e: any) {
        toast.error(`Arguments must be a valid JSON array: ${e.message}`)
        return
      }
    }

    setIsInvokerRunning(true)
    try {
      const result = await invokeBrowserApi(invokerPath, parsedArgs, context)
      setInvokerResult(result)
      if (result.success) {
        toast.success(`Invoked successfully (${result.durationMs}ms)`)
      } else {
        toast.error("Invocation failed")
      }
    } finally {
      setIsInvokerRunning(false)
    }
  }

  return (
    <div className="py-density-4 sm:py-density-6 space-y-density-6 mx-auto max-w-6xl px-4 sm:px-6">
      <PageHeader
        icon={Terminal}
        title="Browser API Lab (Dev)"
        description="One-click browser capability probes, arbitrary JS console, and structured API invoker with zero extra permissions and CSP resilience across desktop and mobile."
      />

      {/* Top Context & Tab Controls */}
      <div className="bg-muted/40 flex flex-col items-stretch justify-between gap-3 rounded-xl border p-3 sm:flex-row sm:items-center">
        {/* Tab Switcher */}
        <div className="bg-background flex items-center gap-1.5 rounded-lg border p-1">
          <Button
            size="sm"
            variant={activeTab === "probes" ? "default" : "ghost"}
            onClick={() => setActiveTab("probes")}
            className="h-8 text-xs"
          >
            <Layers className="mr-1.5 h-3.5 w-3.5" />
            Probe Matrix
          </Button>
          <Button
            size="sm"
            variant={activeTab === "console" ? "default" : "ghost"}
            onClick={() => setActiveTab("console")}
            className="h-8 text-xs"
          >
            <Code2 className="mr-1.5 h-3.5 w-3.5" />
            JS Console
          </Button>
          <Button
            size="sm"
            variant={activeTab === "invoker" ? "default" : "ghost"}
            onClick={() => setActiveTab("invoker")}
            className="h-8 text-xs"
          >
            <Terminal className="mr-1.5 h-3.5 w-3.5" />
            Structured Invoker
          </Button>
        </div>

        {/* Execution Context Toggle */}
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-xs whitespace-nowrap">
            Execution Context:
          </span>
          <div className="bg-background flex items-center rounded-lg border p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setContext("ui")}
              className={cn(
                "rounded-md px-2.5 py-1 font-medium transition-colors",
                context === "ui"
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              📱 UI Thread (Options)
            </button>
            <button
              type="button"
              onClick={() => setContext("background")}
              className={cn(
                "rounded-md px-2.5 py-1 font-medium transition-colors",
                context === "background"
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              ⚙️ Background SW
            </button>
          </div>
        </div>
      </div>

      {/* TAB 1: PRESET PROBES */}
      {activeTab === "probes" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold">
                Core Capabilities & Probes
              </h3>
              <p className="text-muted-foreground text-xs">
                Run browser capability probes to inspect host environment API
                support across desktop and mobile.
              </p>
            </div>
            <Button
              size="sm"
              onClick={handleRunAllProbes}
              disabled={isRunningAllProbes}
              className="h-8 gap-1.5 text-xs"
            >
              <Play className="h-3.5 w-3.5" />
              {isRunningAllProbes ? "Probing..." : "Run All Probes"}
            </Button>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {PRESET_PROBES.map((probe) => {
              const state = probeStates[probe.id]
              const isSupportedInContext =
                probe.supportedContexts.includes(context)

              return (
                <Card
                  key={probe.id}
                  variant="default"
                  className={cn(
                    "flex flex-col border transition-all",
                    state?.status === "success" && "border-success/40",
                    state?.status === "error" && "border-destructive/40",
                  )}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <CardTitle className="flex items-center gap-1.5 text-sm font-semibold">
                          {state?.status === "success" && (
                            <CheckCircle2 className="text-success h-4 w-4 shrink-0" />
                          )}
                          {state?.status === "error" && (
                            <XCircle className="text-destructive h-4 w-4 shrink-0" />
                          )}
                          {state?.status === "running" && (
                            <RotateCw className="text-theme-500 h-4 w-4 shrink-0 animate-spin" />
                          )}
                          {!state && (
                            <AlertCircle className="text-muted-foreground/50 h-4 w-4 shrink-0" />
                          )}
                          <span className="truncate">{probe.title}</span>
                        </CardTitle>
                        <Body className="text-muted-foreground mt-1 text-xs md:min-h-[2.5rem]">
                          {probe.description}
                        </Body>
                      </div>

                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={
                          !isSupportedInContext || state?.status === "running"
                        }
                        onClick={() => handleRunProbe(probe)}
                        className="h-7 shrink-0 px-2 text-xs"
                      >
                        {state?.status === "running"
                          ? "Probing..."
                          : "Run Probe"}
                      </Button>
                    </div>
                  </CardHeader>

                  <CardContent className="flex flex-1 flex-col pt-3">
                    {!isSupportedInContext && (
                      <p className="text-muted-foreground text-xs italic">
                        ⚠️ This probe is only supported in UI thread context
                      </p>
                    )}

                    {state ? (
                      <div className="bg-muted/50 flex flex-1 flex-col space-y-1 rounded-lg p-2.5 font-mono text-xs">
                        <div className="text-muted-foreground flex items-center justify-between border-b pb-1 text-xs">
                          <span>
                            Status:{" "}
                            {state.status === "success" ? (
                              <span className="text-success font-semibold">
                                Passed
                              </span>
                            ) : state.status === "error" ? (
                              <span className="text-destructive font-semibold">
                                Failed
                              </span>
                            ) : (
                              "Running"
                            )}
                          </span>
                          {state.durationMs !== undefined && (
                            <span>Duration: {state.durationMs}ms</span>
                          )}
                        </div>

                        {state.error && (
                          <div className="text-destructive text-xs break-all">
                            {state.error}
                          </div>
                        )}

                        {state.result !== undefined && (
                          <div className="group relative flex-1">
                            <pre className="max-h-48 overflow-auto py-1 text-xs select-text">
                              {JSON.stringify(state.result, null, 2)}
                            </pre>
                            <button
                              type="button"
                              onClick={() =>
                                copyToClipboard(
                                  JSON.stringify(state.result, null, 2),
                                )
                              }
                              className="bg-background/80 absolute top-1 right-1 rounded p-1 opacity-60 hover:opacity-100"
                              title="Copy result"
                            >
                              <Copy className="h-3 w-3" />
                            </button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-muted-foreground/40 flex flex-1 items-center justify-center py-6 text-xs select-none">
                        Not probed yet
                      </div>
                    )}
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>
      )}

      {/* TAB 2: ARBITRARY JS CONSOLE */}
      {activeTab === "console" && (
        <div className="space-y-4">
          {/* Quick Snippets */}
          <div>
            <div className="text-muted-foreground mb-1.5 text-xs font-medium">
              Quick Snippets (click to populate editor):
            </div>
            <div className="flex flex-wrap gap-1.5">
              {DEFAULT_SNIPPETS.map((snippet) => (
                <button
                  key={snippet.id}
                  type="button"
                  onClick={() => setCode(snippet.code)}
                  className="bg-muted/60 hover:bg-muted text-foreground rounded-md border px-2.5 py-1 text-xs transition-colors"
                >
                  {snippet.name}
                </button>
              ))}
            </div>
          </div>

          {/* Code Editor */}
          <Card>
            <CardHeader className="bg-muted/20 flex flex-row items-center justify-between border-b px-4 py-2.5">
              <span className="flex items-center gap-1.5 text-xs font-semibold">
                <Code2 className="h-4 w-4" /> JavaScript Editor (async / await
                supported)
              </span>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setCode("")}
                  className="h-7 text-xs"
                >
                  Clear
                </Button>
                <Button
                  size="sm"
                  onClick={handleRunCode}
                  disabled={isConsoleRunning}
                  className="h-7 gap-1 text-xs"
                >
                  <Play className="h-3.5 w-3.5" />
                  {isConsoleRunning ? "Running..." : "Run Code"}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-3">
              <textarea
                value={code}
                onChange={(e) => setCode(e.target.value)}
                rows={7}
                placeholder="// Write JavaScript code here. Return any value..."
                className="bg-muted/30 focus:ring-primary w-full resize-y rounded-lg border p-3 font-mono text-xs leading-relaxed outline-hidden focus:ring-1 sm:text-sm"
              />
            </CardContent>
          </Card>

          {/* Console Execution Result */}
          {consoleResult && (
            <Card
              className={cn(
                "border",
                consoleResult.success
                  ? "border-success/40"
                  : "border-destructive/40",
              )}
            >
              <CardHeader className="bg-muted/20 flex flex-row items-center justify-between border-b px-4 py-2">
                <div className="flex items-center gap-2">
                  {consoleResult.success ? (
                    <CheckCircle2 className="text-success h-4 w-4" />
                  ) : (
                    <XCircle className="text-destructive h-4 w-4" />
                  )}
                  <span className="text-xs font-semibold">
                    {consoleResult.success ? "Success" : "Failed"}
                  </span>
                  <span className="text-muted-foreground font-mono text-xs">
                    ({consoleResult.durationMs}ms)
                  </span>
                </div>
                {consoleResult.data !== undefined && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      copyToClipboard(
                        JSON.stringify(consoleResult.data, null, 2),
                      )
                    }
                    className="h-6 gap-1 px-2 text-xs"
                  >
                    <Copy className="h-3 w-3" />
                    Copy Result
                  </Button>
                )}
              </CardHeader>
              <CardContent className="p-3">
                {consoleResult.error ? (
                  <div className="text-destructive font-mono text-xs leading-relaxed whitespace-pre-wrap">
                    {consoleResult.error}
                  </div>
                ) : (
                  <pre className="bg-muted/40 max-h-80 overflow-x-auto rounded-lg p-2 font-mono text-xs">
                    {JSON.stringify(consoleResult.data, null, 2)}
                  </pre>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* TAB 3: STRUCTURED API INVOKER */}
      {activeTab === "invoker" && (
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">
                Structured Browser API Invoker
              </CardTitle>
              <Body className="text-muted-foreground text-xs">
                Invokes chrome.* or browser.* APIs directly via reflection
                without eval, fully immune to CSP restrictions, and supports
                both UI and Background contexts.
              </Body>
            </CardHeader>

            <CardContent className="space-y-3">
              {/* Presets */}
              <div className="flex flex-wrap gap-1.5">
                {[
                  {
                    path: "storage.local.get",
                    args: "[null]",
                    label: "storage.local.get(null)",
                  },
                  {
                    path: "tabs.query",
                    args: '[{"active": true}]',
                    label: "tabs.query(active)",
                  },
                  {
                    path: "alarms.getAll",
                    args: "[]",
                    label: "alarms.getAll()",
                  },
                  {
                    path: "runtime.getPlatformInfo",
                    args: "[]",
                    label: "runtime.getPlatformInfo()",
                  },
                  {
                    path: "runtime.getManifest",
                    args: "[]",
                    label: "runtime.getManifest()",
                  },
                  {
                    path: "cookies.getAll",
                    args: '[{"domain": "google.com"}]',
                    label: "cookies.getAll()",
                  },
                ].map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => {
                      setInvokerPath(item.path)
                      setInvokerArgs(item.args)
                    }}
                    className="bg-muted/60 hover:bg-muted text-foreground rounded border px-2 py-0.5 font-mono text-xs transition-colors"
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              {/* Path input */}
              <div className="space-y-1">
                <label className="text-muted-foreground text-xs font-medium">
                  API Path (omit leading chrome. or browser.):
                </label>
                <input
                  type="text"
                  value={invokerPath}
                  onChange={(e) => setInvokerPath(e.target.value)}
                  placeholder="e.g. storage.local.get or tabs.query"
                  className="bg-muted/30 focus:ring-primary w-full rounded-lg border px-3 py-2 font-mono text-xs outline-hidden focus:ring-1"
                />
              </div>

              {/* Arguments input */}
              <div className="space-y-1">
                <label className="text-muted-foreground text-xs font-medium">
                  {
                    'Arguments (JSON array format, e.g. [null] or [{"active": true}]):'
                  }
                </label>
                <input
                  type="text"
                  value={invokerArgs}
                  onChange={(e) => setInvokerArgs(e.target.value)}
                  placeholder="[]"
                  className="bg-muted/30 focus:ring-primary w-full rounded-lg border px-3 py-2 font-mono text-xs outline-hidden focus:ring-1"
                />
              </div>

              <Button
                size="sm"
                onClick={handleRunInvoker}
                disabled={isInvokerRunning}
                className="h-8 gap-1.5 text-xs"
              >
                <Play className="h-3.5 w-3.5" />
                {isInvokerRunning ? "Invoking..." : "Invoke API"}
              </Button>
            </CardContent>
          </Card>

          {/* Invoker Result */}
          {invokerResult && (
            <Card
              className={cn(
                "border",
                invokerResult.success
                  ? "border-success/40"
                  : "border-destructive/40",
              )}
            >
              <CardHeader className="bg-muted/20 flex flex-row items-center justify-between border-b px-4 py-2">
                <div className="flex items-center gap-2">
                  {invokerResult.success ? (
                    <CheckCircle2 className="text-success h-4 w-4" />
                  ) : (
                    <XCircle className="text-destructive h-4 w-4" />
                  )}
                  <span className="text-xs font-semibold">
                    {invokerResult.path} -{" "}
                    {invokerResult.success ? "Success" : "Failed"}
                  </span>
                  <span className="text-muted-foreground font-mono text-xs">
                    ({invokerResult.durationMs}ms - {invokerResult.context})
                  </span>
                </div>
                {invokerResult.data !== undefined && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      copyToClipboard(
                        JSON.stringify(invokerResult.data, null, 2),
                      )
                    }
                    className="h-6 gap-1 px-2 text-xs"
                  >
                    <Copy className="h-3 w-3" />
                    Copy Result
                  </Button>
                )}
              </CardHeader>
              <CardContent className="p-3">
                {invokerResult.error ? (
                  <div className="text-destructive font-mono text-xs whitespace-pre-wrap">
                    {invokerResult.error}
                  </div>
                ) : (
                  <pre className="bg-muted/40 max-h-80 overflow-x-auto rounded-lg p-2 font-mono text-xs">
                    {JSON.stringify(invokerResult.data, null, 2)}
                  </pre>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}
