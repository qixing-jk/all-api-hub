import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { I18nextProvider } from "react-i18next"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import LogHistoryDialog from "~/features/Logging/LogHistoryDialog"
import type { LogHistoryEntry } from "~/types/logging"
import { testI18n } from "~~/tests/test-utils/i18n"

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  clear: vi.fn(),
  send: vi.fn(),
  subscribe: vi.fn(),
  error: vi.fn(),
}))
vi.mock("~/lib/notify", () => ({
  default: { success: vi.fn(), error: mocks.error },
}))
vi.mock("~/utils/browser/runtimeMessages", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/utils/browser/runtimeMessages")>()),
  sendRuntimeActionMessage: mocks.send,
}))
vi.mock("~/services/logging/logHistory", () => ({
  LOG_HISTORY_LIMIT: 1000,
  LOG_HISTORY_RETENTION_MS: 86400000,
  listLogHistory: mocks.list,
  clearLogHistory: mocks.clear,
  subscribeToLogHistory: mocks.subscribe,
}))

const entry = (message: string, id = message): LogHistoryEntry => ({
  id,
  timestamp: Date.now(),
  level: "info",
  context: "Content",
  scope: "AccountDetection",
  message,
  details: '{"requestId":"detection-1"}',
})
let changed: () => void
const unsubscribe = vi.fn()
const renderViewer = () =>
  render(
    <I18nextProvider i18n={testI18n}>
      <LogHistoryDialog />
    </I18nextProvider>,
  )

describe("log history viewer", () => {
  afterEach(() => vi.restoreAllMocks())
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.list.mockResolvedValue([entry("Earlier session")])
    mocks.clear.mockResolvedValue(undefined)
    mocks.send.mockResolvedValue({ success: true })
    mocks.subscribe.mockImplementation((listener: () => void) => {
      changed = listener
      return unsubscribe
    })
  })

  it("shows earlier logs, live changes, and history again after reopening", async () => {
    const first = renderViewer()
    expect(await screen.findByText("Earlier session")).toBeInTheDocument()
    mocks.list.mockResolvedValue([
      entry("New live event"),
      entry("Earlier session"),
    ])
    act(() => changed())
    expect(await screen.findByText("New live event")).toBeInTheDocument()
    first.unmount()
    expect(unsubscribe).toHaveBeenCalled()
    renderViewer()
    expect(await screen.findByText("Earlier session")).toBeInTheDocument()
  })

  it("clears through the background queue owner instead of the settings context", async () => {
    const user = userEvent.setup()
    renderViewer()
    await screen.findByText("Earlier session")
    await user.click(
      screen.getByRole("button", { name: "common:actions.clear" }),
    )
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "common:actions.clear",
      }),
    )
    await waitFor(() =>
      expect(mocks.send).toHaveBeenCalledWith({ action: "logHistory:clear" }),
    )
    expect(mocks.clear).not.toHaveBeenCalled()
  })

  it("freezes displayed logs while paused and catches up when resumed", async () => {
    renderViewer()
    await screen.findByText("Earlier session")
    fireEvent.click(
      screen.getByRole("button", { name: "settings:logging.history.pause" }),
    )
    mocks.list.mockResolvedValue([entry("New while paused")])
    act(() => changed())
    expect(screen.queryByText("New while paused")).not.toBeInTheDocument()
    fireEvent.click(
      screen.getByRole("button", { name: "settings:logging.history.resume" }),
    )
    expect(await screen.findByText("New while paused")).toBeInTheDocument()
  })

  it("searches trace details and copies the filtered logs", async () => {
    mocks.list.mockResolvedValue([
      entry("Tracked event"),
      { ...entry("Other event"), details: null },
    ])
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    })
    renderViewer()
    await screen.findByText("Tracked event")
    fireEvent.change(
      screen.getByRole("textbox", { name: "settings:logging.history.search" }),
      { target: { value: "detection-1" } },
    )
    expect(screen.queryByText("Other event")).not.toBeInTheDocument()
    fireEvent.click(
      screen.getByRole("button", { name: "settings:logging.history.copy" }),
    )
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(
        expect.stringContaining("Tracked event"),
      ),
    )
    expect(writeText.mock.calls[0]?.[0]).not.toContain("Other event")
  })

  it("preserves displayed logs and reports a failed reload", async () => {
    renderViewer()
    await screen.findByText("Earlier session")
    mocks.list.mockRejectedValue(new Error("storage unavailable"))
    act(() => changed())
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "settings:logging.history.loadError",
    )
    expect(screen.getByText("Earlier session")).toBeInTheDocument()
  })

  it("does not replace live logs with a slower initial snapshot", async () => {
    let resolveInitial!: (entries: LogHistoryEntry[]) => void
    mocks.list.mockReturnValueOnce(
      new Promise<LogHistoryEntry[]>((resolve) => {
        resolveInitial = resolve
      }),
    )
    renderViewer()
    mocks.list.mockResolvedValue([entry("Latest event")])
    act(() => changed())
    await screen.findByText("Latest event")
    await act(async () => resolveInitial([entry("Stale snapshot")]))
    expect(screen.getByText("Latest event")).toBeInTheDocument()
    expect(screen.queryByText("Stale snapshot")).not.toBeInTheDocument()
  })

  it("filters retained logs by time, level and source", async () => {
    const user = userEvent.setup()
    mocks.list.mockResolvedValue([
      {
        ...entry("Recent background error"),
        level: "error",
        context: "Background",
      },
      entry("Recent content info"),
      {
        ...entry("Older background error"),
        level: "error",
        context: "Background",
        timestamp: Date.now() - 20 * 60_000,
      },
      { ...entry("Yesterday event"), timestamp: Date.now() - 2 * 60 * 60_000 },
    ])
    renderViewer()
    await screen.findByText("Yesterday event")
    const select = async (name: string, option: string) => {
      await user.click(screen.getByRole("combobox", { name }))
      await user.click(screen.getByRole("option", { name: option }))
    }
    await select(
      "settings:logging.history.period",
      "settings:logging.history.lastHour",
    )
    expect(screen.queryByText("Yesterday event")).not.toBeInTheDocument()
    await select(
      "settings:logging.history.level",
      "settings:logging.levels.error",
    )
    expect(screen.queryByText("Recent content info")).not.toBeInTheDocument()
    await select("settings:logging.history.context", "Background")
    expect(screen.getByText("Older background error")).toBeInTheDocument()
    await select(
      "settings:logging.history.period",
      "settings:logging.history.lastMinutes",
    )
    expect(screen.queryByText("Older background error")).not.toBeInTheDocument()
    expect(screen.getByText("Recent background error")).toBeInTheDocument()
  })

  it("loads older rows and copies all filtered logs including rows not displayed", async () => {
    const user = userEvent.setup()
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    })
    mocks.list.mockResolvedValue(
      Array.from({ length: 120 }, (_, index) => entry(`Event ${index}`)),
    )
    renderViewer()
    await screen.findByText("Event 0")
    expect(screen.queryByText("Event 119")).not.toBeInTheDocument()
    await user.click(
      screen.getByRole("button", { name: "settings:logging.history.copy" }),
    )
    expect(JSON.parse(writeText.mock.calls[0]![0])).toHaveLength(120)
    await user.click(
      screen.getByRole("button", { name: "settings:logging.history.more" }),
    )
    expect(screen.getByText("Event 119")).toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: "settings:logging.history.more" }),
    ).not.toBeInTheDocument()
  })

  it("reports clipboard failure while preserving logs for another copy attempt", async () => {
    const user = userEvent.setup()
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
    })
    renderViewer()
    await screen.findByText("Earlier session")
    await user.click(
      screen.getByRole("button", { name: "settings:logging.history.copy" }),
    )
    await waitFor(() =>
      expect(mocks.error).toHaveBeenCalledWith(
        "settings:logging.history.copyError",
      ),
    )
    expect(screen.getByText("Earlier session")).toBeInTheDocument()
  })

  it("requires clear confirmation and preserves history on failure before retrying", async () => {
    const user = userEvent.setup()
    renderViewer()
    await screen.findByText("Earlier session")
    await user.click(
      screen.getByRole("button", { name: "common:actions.clear" }),
    )
    let confirmation = within(screen.getByRole("dialog"))
    await user.click(
      confirmation.getByRole("button", { name: "common:actions.cancel" }),
    )
    expect(mocks.clear).not.toHaveBeenCalled()
    await user.click(
      screen.getByRole("button", { name: "common:actions.clear" }),
    )
    confirmation = within(screen.getByRole("dialog"))
    mocks.send.mockResolvedValueOnce({ success: false })
    await user.click(
      confirmation.getByRole("button", { name: "common:actions.clear" }),
    )
    await waitFor(() =>
      expect(mocks.error).toHaveBeenCalledWith(
        "settings:logging.history.clearError",
      ),
    )
    expect(screen.getByRole("dialog")).toBeInTheDocument()
    expect(screen.getByText("Earlier session")).toBeInTheDocument()
    mocks.list.mockResolvedValue([])
    await user.click(
      confirmation.getByRole("button", { name: "common:actions.clear" }),
    )
    await screen.findByText("settings:logging.history.empty")
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    expect(screen.queryByText("Earlier session")).not.toBeInTheDocument()
  })

  it("refreshes periodically while live and supports manual refresh while paused", async () => {
    const interval = vi.spyOn(window, "setInterval")
    renderViewer()
    await screen.findByText("Earlier session")
    const tick = interval.mock.calls.find(
      ([, delay]) => delay === 30_000,
    )?.[0] as () => void
    mocks.list.mockResolvedValue([entry("Periodic event")])
    act(() => tick())
    await screen.findByText("Periodic event")
    fireEvent.click(
      screen.getByRole("button", { name: "settings:logging.history.pause" }),
    )
    mocks.list.mockResolvedValue([entry("Manual event")])
    act(() => tick())
    expect(screen.queryByText("Manual event")).not.toBeInTheDocument()
    fireEvent.click(
      screen.getByRole("button", { name: "common:actions.refresh" }),
    )
    await screen.findByText("Manual event")
  })
})
