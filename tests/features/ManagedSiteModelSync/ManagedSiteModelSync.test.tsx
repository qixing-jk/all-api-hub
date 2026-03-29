import {
  fireEvent,
  render as rtlRender,
  screen,
  waitFor,
  within,
} from "@testing-library/react"
import type { ReactNode } from "react"
import toast from "react-hot-toast"
import { I18nextProvider } from "react-i18next"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { RuntimeActionIds } from "~/constants/runtimeActions"
import ManagedSiteModelSync from "~/features/ManagedSiteModelSync/ManagedSiteModelSync"
import { testI18n } from "~~/tests/test-utils/i18n"

const { mockSendRuntimeMessage, mockUseUserPreferencesContext, loggerMocks } =
  vi.hoisted(() => ({
    mockSendRuntimeMessage: vi.fn(),
    mockUseUserPreferencesContext: vi.fn(),
    loggerMocks: {
      error: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    },
  }))

vi.mock("react-hot-toast", () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock("~/utils/core/logger", () => ({
  createLogger: () => loggerMocks,
}))

vi.mock("~/utils/browser/browserApi", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/utils/browser/browserApi")>()
  return {
    ...actual,
    sendRuntimeMessage: mockSendRuntimeMessage,
  }
})

vi.mock("~/contexts/UserPreferencesContext", () => ({
  useUserPreferencesContext: mockUseUserPreferencesContext,
}))

vi.mock("~/components/ManagedSiteTypeSwitcher", () => ({
  default: ({ ariaLabel }: { ariaLabel: string }) => (
    <div data-testid="managed-site-switcher">{ariaLabel}</div>
  ),
}))

vi.mock("~/components/ManagedSiteChannelLinkButton", () => ({
  default: ({
    channelId,
    channelName,
  }: {
    channelId: number
    channelName: string
  }) => <span>{`${channelName}#${channelId}`}</span>,
}))

/**
 *
 */
function render(ui: ReactNode) {
  return rtlRender(<I18nextProvider i18n={testI18n}>{ui}</I18nextProvider>)
}

describe("ManagedSiteModelSync page", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseUserPreferencesContext.mockReturnValue({
      managedSiteType: "new-api",
    })
    mockSendRuntimeMessage.mockImplementation(async (message: any) => {
      switch (message.action) {
        case RuntimeActionIds.ModelSyncGetLastExecution:
          return {
            success: true,
            data: {
              items: [
                {
                  channelId: 101,
                  channelName: "Alpha",
                  ok: false,
                  message: "failed",
                  attempts: 2,
                  finishedAt: 1_700_000_000_000,
                  httpStatus: 500,
                },
                {
                  channelId: 102,
                  channelName: "Beta",
                  ok: true,
                  attempts: 1,
                  finishedAt: 1_700_000_001_000,
                },
              ],
              statistics: {
                total: 2,
                successCount: 1,
                failureCount: 1,
                durationMs: 4000,
                startedAt: 1_700_000_000_000,
                endedAt: 1_700_000_004_000,
              },
            },
          }
        case RuntimeActionIds.ModelSyncGetProgress:
          return {
            success: true,
            data: { isRunning: false, completed: 0, total: 0, failed: 0 },
          }
        case RuntimeActionIds.ModelSyncGetNextRun:
          return {
            success: true,
            data: { nextScheduledAt: "2026-03-28T10:00:00.000Z" },
          }
        case RuntimeActionIds.ModelSyncGetPreferences:
          return {
            success: true,
            data: { enableSync: true, intervalMs: 2 * 60 * 60 * 1000 },
          }
        case RuntimeActionIds.ModelSyncTriggerSelected:
          return {
            success: true,
            data: {
              items: [
                {
                  channelId: 101,
                  channelName: "Alpha",
                  ok: true,
                  attempts: 1,
                  finishedAt: 1_700_000_005_000,
                },
              ],
              statistics: {
                total: 1,
                successCount: 1,
                failureCount: 0,
                durationMs: 1000,
                startedAt: 1_700_000_004_000,
                endedAt: 1_700_000_005_000,
              },
            },
          }
        case RuntimeActionIds.ModelSyncListChannels:
          return {
            success: true,
            data: {
              items: [
                { id: 201, name: "Manual Alpha" },
                { id: 202, name: "Manual Beta" },
              ],
            },
          }
        default:
          return { success: true }
      }
    })
  })

  it("loads history data, filters results, and runs selected rows", async () => {
    render(<ManagedSiteModelSync />)

    expect(
      await screen.findByText(
        "managedSiteModelSync:execution.overview.enabled",
      ),
    ).toBeInTheDocument()
    expect(screen.getByText("Alpha#101")).toBeInTheDocument()
    expect(screen.getByText("Beta#102")).toBeInTheDocument()

    fireEvent.click(
      screen.getByRole("button", {
        name: /managedSiteModelSync:execution.filters.failed/,
      }),
    )

    await waitFor(() => {
      expect(screen.getByText("Alpha#101")).toBeInTheDocument()
      expect(screen.queryByText("Beta#102")).not.toBeInTheDocument()
    })

    fireEvent.click(screen.getAllByRole("checkbox")[1])
    fireEvent.click(
      screen.getByRole("button", {
        name: "managedSiteModelSync:execution.actions.runSelected (1)",
      }),
    )

    await waitFor(() => {
      expect(mockSendRuntimeMessage).toHaveBeenCalledWith({
        action: RuntimeActionIds.ModelSyncTriggerSelected,
        channelIds: [101],
      })
    })
    expect(toast.success).toHaveBeenCalled()
  })

  it("uses manual route params to load and preselect channels", async () => {
    mockSendRuntimeMessage.mockImplementation(async (message: any) => {
      switch (message.action) {
        case RuntimeActionIds.ModelSyncGetLastExecution:
          return {
            success: true,
            data: {
              items: [],
              statistics: {
                total: 0,
                successCount: 0,
                failureCount: 0,
                durationMs: 0,
                startedAt: 1_700_000_000_000,
                endedAt: 1_700_000_000_000,
              },
            },
          }
        case RuntimeActionIds.ModelSyncGetProgress:
          return {
            success: true,
            data: { isRunning: false, completed: 0, total: 0, failed: 0 },
          }
        case RuntimeActionIds.ModelSyncGetNextRun:
          return { success: true, data: { nextScheduledAt: null } }
        case RuntimeActionIds.ModelSyncGetPreferences:
          return { success: true, data: { enableSync: false, intervalMs: 0 } }
        case RuntimeActionIds.ModelSyncListChannels:
          return {
            success: true,
            data: {
              items: [
                { id: 42, name: "Route Match" },
                { id: 99, name: "Other" },
              ],
            },
          }
        default:
          return { success: true }
      }
    })

    render(
      <ManagedSiteModelSync routeParams={{ channelId: "42", tab: "manual" }} />,
    )

    expect(await screen.findByText("Route Match#42")).toBeInTheDocument()
    const row = screen.getByText("Route Match#42").closest("tr")
    expect(row).toBeTruthy()
    expect(within(row!).getByRole("checkbox")).toBeChecked()
  })
})
