import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { I18nextProvider } from "react-i18next"
import { beforeEach, describe, expect, it, vi } from "vitest"

import LogHistoryDialog from "~/features/Logging/LogHistoryDialog"
import type { LogHistoryEntry } from "~/types/logging"
import { testI18n } from "~~/tests/test-utils/i18n"

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  clear: vi.fn(),
  subscribe: vi.fn(),
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
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.list.mockResolvedValue([entry("Earlier session")])
    mocks.clear.mockResolvedValue(undefined)
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
})
