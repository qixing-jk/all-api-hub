import { fireEvent, renderHook, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { RuntimeActionIds } from "~/constants/runtimeActions"
import { useTempContextDevSection } from "~/features/DevPanel/sections/tempContextSection"
import { createDeferred } from "~~/tests/test-utils/deferred"
import { renderDevPanelSection } from "~~/tests/test-utils/devPanelSection"

const { reloadRuntimeMock, sendRuntimeMessageMock, toastMock } = vi.hoisted(
  () => ({
    reloadRuntimeMock: vi.fn(),
    sendRuntimeMessageMock: vi.fn(),
    toastMock: Object.assign(vi.fn(), {
      dismiss: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      loading: vi.fn(() => "toast-id"),
      success: vi.fn(),
    }),
  }),
)

// Only the two calls this section makes are replaced: the rest of the adapter
// stays real, because the render harness reads other exports from it.
vi.mock("~/utils/browser/browserApi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/utils/browser/browserApi")>()),
  reloadRuntime: reloadRuntimeMock,
  sendRuntimeMessage: sendRuntimeMessageMock,
}))

vi.mock("~/lib/notify", () => ({ default: toastMock }))

const LIST_MARKERS = { action: RuntimeActionIds.TempContextDebugListMarkers }

const CURRENT_SESSION = "browser-session-current"

const MARKED_STATE = {
  success: true,
  data: {
    browserSession: CURRENT_SESSION,
    retryArmed: true,
    markers: [
      {
        tabId: 11,
        windowScope: "owned",
        createdAt: 1,
        browserSession: CURRENT_SESSION,
        tracked: true,
      },
      {
        tabId: 12,
        windowScope: "shared",
        createdAt: 1,
        browserSession: CURRENT_SESSION,
        tracked: false,
      },
      {
        tabId: 13,
        windowScope: "owned",
        createdAt: 1,
        browserSession: "browser-session-previous",
        tracked: false,
      },
    ],
    runs: [
      {
        at: 1,
        summary: {
          reclaimedCount: 1,
          outcomes: [{ tabId: 9, kind: "closed-window" }],
        },
      },
    ],
  },
}

/** Clicks an action by its label and lets the async handler settle. */
async function runAction(label: string) {
  fireEvent.click(screen.getByRole("button", { name: label }))
  await waitFor(() => expect(sendRuntimeMessageMock).toHaveBeenCalled())
}

describe("temp context dev section", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sendRuntimeMessageMock.mockResolvedValue(MARKED_STATE)
  })

  it("reads the marked temp pages and the recent runs on mount", async () => {
    const { result } = renderHook(() => useTempContextDevSection())

    await waitFor(() =>
      expect(result.current.rows?.[0]?.value).toBe("3 (2 orphan)"),
    )
    const rows = result.current.rows ?? []
    expect(rows[0]).toMatchObject({
      id: "markers",
      label: "Marked temp pages",
      value: "3 (2 orphan)",
      tone: "runtime",
    })
    // The hint names each marker and the decision recorded for it, which the
    // panel harness does not render.
    expect(rows[0]?.hint).toContain("tab 11 · owned · tracked")
    expect(rows[0]?.hint).toContain("tab 12 · shared · orphan")
    // A marker from a finished browser session is called out, because it will
    // only be cleared.
    expect(rows[0]?.hint).toContain("tab 13 · owned · orphan")
    expect(rows[0]?.hint).toContain("other session")

    expect(rows[1]).toMatchObject({
      id: "retry",
      label: "Reclamation retry",
      value: "armed (about a minute)",
      tone: "runtime",
    })
    expect(rows[1]?.hint).toContain("A close was rejected")

    expect(rows[2]).toMatchObject({
      id: "last-run",
      label: "Recent reclamations (this worker)",
      value: "1 reclaimed",
      tone: "best-effort",
    })
    expect(rows[2]?.hint).toMatch(/old: tab 9 · closed-window/)
    expect(sendRuntimeMessageMock).toHaveBeenCalledWith(LIST_MARKERS)
  })

  it("leaks the shape the chosen action asks for", async () => {
    renderDevPanelSection(useTempContextDevSection)
    await screen.findByTestId("row-markers")
    sendRuntimeMessageMock.mockClear()

    await runAction("Dev: Leak an owned popup window")

    expect(sendRuntimeMessageMock).toHaveBeenCalledWith({
      action: RuntimeActionIds.TempContextDebugCreateOrphan,
      scenario: "owned-window",
    })
    // The read follows the action so the rows show what it left behind.
    expect(sendRuntimeMessageMock).toHaveBeenCalledWith(LIST_MARKERS)
  })

  it("reports how many temp pages a run reclaimed", async () => {
    renderDevPanelSection(useTempContextDevSection)
    await screen.findByTestId("row-markers")
    sendRuntimeMessageMock.mockImplementation(async (request) =>
      (request as { action: string }).action ===
      RuntimeActionIds.TempContextDebugReclaimNow
        ? {
            success: true,
            data: {
              summary: {
                reclaimedCount: 2,
                outcomes: [{ tabId: 12, kind: "closed-tab" }],
              },
            },
          }
        : MARKED_STATE,
    )

    await runAction("Dev: Run reclamation now")

    expect(sendRuntimeMessageMock).toHaveBeenCalledWith({
      action: RuntimeActionIds.TempContextDebugReclaimNow,
    })
    await waitFor(() =>
      expect(toastMock.success).toHaveBeenCalledWith(
        "Reclaimed 2 temp page(s).",
        { id: "toast-id" },
      ),
    )
  })

  it("opens a tracked temp context and says it must be skipped", async () => {
    renderDevPanelSection(useTempContextDevSection)
    await screen.findByTestId("row-markers")
    sendRuntimeMessageMock.mockImplementation(async (request) =>
      (request as { action: string }).action ===
      RuntimeActionIds.TempContextDebugCreateTrackedContext
        ? { success: true, data: { tabId: 77, requestId: "debug-1" } }
        : MARKED_STATE,
    )

    await runAction("Dev: Open a tracked temp context")

    expect(sendRuntimeMessageMock).toHaveBeenCalledWith({
      action: RuntimeActionIds.TempContextDebugCreateTrackedContext,
    })
    await waitFor(() =>
      expect(toastMock.success).toHaveBeenCalledWith(
        expect.stringContaining("tracked temp context on tab 77"),
        { id: "toast-id" },
      ),
    )
  })

  it("restarts the background worker after telling the user to reopen the page", async () => {
    renderDevPanelSection(useTempContextDevSection)
    await screen.findByTestId("row-markers")

    fireEvent.click(
      screen.getByRole("button", { name: "Dev: Restart background worker" }),
    )

    expect(toastMock.info).toHaveBeenCalledWith(
      expect.stringContaining("Reloading the extension"),
    )
    expect(reloadRuntimeMock).toHaveBeenCalledTimes(1)
  })

  it("surfaces a failed action as an error and keeps the rows it had", async () => {
    renderDevPanelSection(useTempContextDevSection)
    await screen.findByTestId("row-markers")
    sendRuntimeMessageMock.mockResolvedValue({
      success: false,
      error: "Debug action unavailable",
    })

    await runAction("Dev: Run reclamation now")

    await waitFor(() =>
      expect(toastMock.error).toHaveBeenCalledWith("Debug action unavailable", {
        id: "toast-id",
      }),
    )
    expect(screen.getByTestId("row-markers")).toHaveTextContent("3 (2 orphan)")
  })

  it("disables the other actions while one is running", async () => {
    renderDevPanelSection(useTempContextDevSection)
    await screen.findByTestId("row-markers")
    const pending = createDeferred<unknown>()
    sendRuntimeMessageMock.mockImplementationOnce(
      async () => await pending.promise,
    )

    fireEvent.click(
      screen.getByRole("button", { name: "Dev: Run reclamation now" }),
    )

    await waitFor(() =>
      expect(
        screen.getByRole("button", {
          name: "Dev: Leak a shared background tab",
        }),
      ).toBeDisabled(),
    )

    pending.resolve(MARKED_STATE)
    await waitFor(() =>
      expect(
        screen.getByRole("button", {
          name: "Dev: Leak a shared background tab",
        }),
      ).toBeEnabled(),
    )
  })
})
