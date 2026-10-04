import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import BrowserApiLab from "~/features/BrowserApiLab/BrowserApiLab"
import toast from "~/lib/notify"
import {
  evaluateJsSnippet,
  invokeBrowserApi,
  PRESET_PROBES,
} from "~/utils/browser/devApiExplorer"

vi.mock("~/lib/notify", () => ({
  default: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}))
vi.mock("~/utils/browser/devApiExplorer", async (original) => ({
  ...(await original<typeof import("~/utils/browser/devApiExplorer")>()),
  invokeBrowserApi: vi.fn(),
  evaluateJsSnippet: vi.fn(),
}))

const result = (success = true) => ({
  success,
  data: success ? { diagnostic: "ok" } : undefined,
  error: success ? undefined : "Permission denied",
  durationMs: 3,
  context: "ui" as const,
  timestamp: 1,
  path: "storage.local.get",
})

describe("Browser API Lab", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(invokeBrowserApi).mockResolvedValue(result())
    vi.mocked(evaluateJsSnippet).mockResolvedValue(result())
  })

  it("disables console and invoker controls until their executions finish", async () => {
    const user = userEvent.setup()
    let finish!: (value: ReturnType<typeof result>) => void
    vi.mocked(evaluateJsSnippet).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    render(<BrowserApiLab />)
    await user.click(screen.getByRole("button", { name: "JS Console" }))
    await user.click(screen.getByRole("button", { name: "Run Code" }))
    expect(screen.getByRole("button", { name: "Running..." })).toBeDisabled()
    finish(result())
    expect(
      await screen.findByRole("button", { name: "Run Code" }),
    ).toBeEnabled()
    vi.mocked(invokeBrowserApi).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    await user.click(screen.getByRole("button", { name: "Structured Invoker" }))
    await user.click(screen.getByRole("button", { name: "Invoke API" }))
    expect(screen.getByRole("button", { name: "Invoking..." })).toBeDisabled()
    finish(result())
    expect(
      await screen.findByRole("button", { name: "Invoke API" }),
    ).toBeEnabled()
  })

  it("runs UI probes, shows running/success/failure state and copies results", async () => {
    const user = userEvent.setup()
    let finish!: (value: unknown) => void
    const run = vi
      .spyOn(PRESET_PROBES[0]!, "run")
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve
          }),
      )
      .mockRejectedValueOnce(new Error("Tab unavailable"))
    render(<BrowserApiLab />)
    await user.click(screen.getAllByRole("button", { name: "Run Probe" })[0]!)
    expect(screen.getByRole("button", { name: "Probing..." })).toBeDisabled()
    finish({ tabCount: 2 })
    expect(await screen.findByText("Passed")).toBeVisible()
    await user.click(screen.getByTitle("Copy result"))
    expect(await navigator.clipboard.readText()).toContain('"tabCount": 2')
    await user.click(screen.getAllByRole("button", { name: "Run Probe" })[0]!)
    expect(await screen.findByText("Tab unavailable")).toBeVisible()
    run.mockRestore()
  })

  it("dispatches every supported background probe to its own API and skips UI-only probes", async () => {
    const user = userEvent.setup()
    render(<BrowserApiLab />)
    await user.click(screen.getByRole("button", { name: "⚙️ Background SW" }))
    expect(
      screen
        .getAllByRole("button", { name: "Run Probe" })
        .filter((button) => (button as HTMLButtonElement).disabled),
    ).toHaveLength(2)
    await user.click(screen.getByRole("button", { name: "Run All Probes" }))
    expect(invokeBrowserApi).toHaveBeenCalledTimes(6)
    for (const [path, args] of [
      ["tabs.query", [{ active: true }]],
      ["storage.local.get", [null]],
      ["cookies.getAll", [{ domain: "google.com" }]],
      ["alarms.getAll", []],
      ["runtime.getPlatformInfo", []],
      ["declarativeNetRequest.getDynamicRules", []],
    ])
      expect(invokeBrowserApi).toHaveBeenCalledWith(path, args, "background")
    expect(screen.getAllByText("Passed")).toHaveLength(6)
    vi.mocked(invokeBrowserApi).mockResolvedValueOnce(result(false))
    await user.click(screen.getAllByRole("button", { name: "Run Probe" })[0]!)
    expect(await screen.findByText("Permission denied")).toBeVisible()
  })

  it("runs snippets, validates empty code, and displays execution errors", async () => {
    const user = userEvent.setup()
    render(<BrowserApiLab />)
    await user.click(screen.getByRole("button", { name: "JS Console" }))
    await user.click(screen.getByRole("button", { name: "⚙️ Background SW" }))
    await user.click(screen.getByRole("button", { name: /UI Thread/ }))
    await user.click(screen.getByRole("button", { name: "Inspect Manifest" }))
    expect(
      (screen.getByRole("textbox") as HTMLTextAreaElement).value,
    ).toContain("getManifest")
    await user.click(screen.getByRole("button", { name: "Run Code" }))
    expect(await screen.findByText("Success")).toBeVisible()
    await user.click(screen.getByRole("button", { name: "Copy Result" }))
    expect(toast.success).toHaveBeenCalledWith("Result copied to clipboard")
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValueOnce(
      new Error("blocked"),
    )
    await user.click(screen.getByRole("button", { name: "Copy Result" }))
    expect(toast.error).toHaveBeenCalledWith("Failed to copy to clipboard")
    vi.mocked(evaluateJsSnippet).mockResolvedValueOnce(result(false))
    await user.click(screen.getByRole("button", { name: "Run Code" }))
    expect(await screen.findByText("Permission denied")).toBeVisible()
    await user.click(screen.getByRole("button", { name: "Clear" }))
    await user.click(screen.getByRole("button", { name: "Run Code" }))
    expect(toast.info).toHaveBeenCalledWith(
      "Please enter JavaScript code to execute",
    )
    await user.type(screen.getByRole("textbox"), "return 123")
    await user.click(screen.getByRole("button", { name: "Run Code" }))
    expect(evaluateJsSnippet).toHaveBeenLastCalledWith("return 123", "ui")
  })

  it("invokes APIs with preset, array, scalar and empty arguments and validates invalid input", async () => {
    const user = userEvent.setup()
    render(<BrowserApiLab />)
    await user.click(screen.getByRole("button", { name: "Structured Invoker" }))
    await user.click(screen.getByRole("button", { name: "tabs.query(active)" }))
    const [path, args] = screen.getAllByRole("textbox") as [
      HTMLElement,
      HTMLElement,
    ]
    await user.click(screen.getByRole("button", { name: "Invoke API" }))
    expect(invokeBrowserApi).toHaveBeenCalledWith(
      "tabs.query",
      [{ active: true }],
      "ui",
    )
    await user.click(screen.getByRole("button", { name: "Copy Result" }))
    expect(await navigator.clipboard.readText()).toContain("diagnostic")
    await user.clear(args)
    await user.type(args, "false")
    await user.click(screen.getByRole("button", { name: "Invoke API" }))
    expect(invokeBrowserApi).toHaveBeenLastCalledWith(
      "tabs.query",
      [false],
      "ui",
    )
    await user.clear(args)
    vi.mocked(invokeBrowserApi).mockResolvedValueOnce(result(false))
    await user.click(screen.getByRole("button", { name: "Invoke API" }))
    expect(invokeBrowserApi).toHaveBeenLastCalledWith("tabs.query", [], "ui")
    expect(await screen.findByText("Permission denied")).toBeVisible()
    await user.type(args, "bad json")
    await user.click(screen.getByRole("button", { name: "Invoke API" }))
    expect(toast.error).toHaveBeenCalledWith(
      expect.stringContaining("Arguments must be a valid JSON array"),
    )
    await user.clear(path)
    await user.click(screen.getByRole("button", { name: "Invoke API" }))
    expect(toast.info).toHaveBeenCalledWith("Please enter an API path")
  })
})
