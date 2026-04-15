import {
  act,
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

const {
  mockSendRuntimeMessage,
  mockUseUserPreferencesContext,
  mockShowWarningToast,
  loggerMocks,
} = vi.hoisted(() => ({
  mockSendRuntimeMessage: vi.fn(),
  mockUseUserPreferencesContext: vi.fn(),
  mockShowWarningToast: vi.fn(),
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

vi.mock("~/utils/core/toastHelpers", () => ({
  showWarningToast: mockShowWarningToast,
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

  it("keeps the current history snapshot rendered while a manual refresh is loading", async () => {
    let lastExecutionCalls = 0
    let resolveRefresh:
      | ((value: { success: boolean; data: any }) => void)
      | undefined

    mockSendRuntimeMessage.mockImplementation(async (message: any) => {
      switch (message.action) {
        case RuntimeActionIds.ModelSyncGetLastExecution:
          lastExecutionCalls += 1

          if (lastExecutionCalls === 1) {
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
                ],
                statistics: {
                  total: 1,
                  successCount: 0,
                  failureCount: 1,
                  durationMs: 4000,
                  startedAt: 1_700_000_000_000,
                  endedAt: 1_700_000_004_000,
                },
              },
            }
          }

          return await new Promise<{ success: boolean; data: any }>(
            (resolve) => {
              resolveRefresh = resolve
            },
          )
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

    render(<ManagedSiteModelSync />)

    expect(await screen.findByText("Alpha#101")).toBeInTheDocument()

    fireEvent.click(
      screen.getByRole("button", {
        name: "managedSiteModelSync:execution.actions.refresh",
      }),
    )

    await waitFor(() => {
      expect(lastExecutionCalls).toBe(2)
    })

    expect(screen.getByText("Alpha#101")).toBeInTheDocument()

    resolveRefresh?.({
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
    })

    await waitFor(() => {
      expect(screen.getByText("Alpha#101")).toBeInTheDocument()
    })
    expect(screen.queryByText("failed")).not.toBeInTheDocument()
  })

  it("uses a warning toast when run-all completes with failed channels still present", async () => {
    mockSendRuntimeMessage.mockImplementation(async (message: any) => {
      switch (message.action) {
        case RuntimeActionIds.ModelSyncTriggerAll:
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
                {
                  channelId: 102,
                  channelName: "Beta",
                  ok: false,
                  message: "rate limited",
                  attempts: 2,
                  finishedAt: 1_700_000_006_000,
                },
              ],
              statistics: {
                total: 2,
                successCount: 1,
                failureCount: 1,
                durationMs: 2000,
                startedAt: 1_700_000_004_000,
                endedAt: 1_700_000_006_000,
              },
            },
          }
        default:
          return {
            success: true,
            data:
              message.action === RuntimeActionIds.ModelSyncGetLastExecution
                ? {
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
                  }
                : message.action === RuntimeActionIds.ModelSyncGetProgress
                  ? {
                      isRunning: false,
                      completed: 0,
                      total: 0,
                      failed: 0,
                    }
                  : message.action === RuntimeActionIds.ModelSyncGetNextRun
                    ? { nextScheduledAt: "2026-03-28T10:00:00.000Z" }
                    : message.action ===
                        RuntimeActionIds.ModelSyncGetPreferences
                      ? {
                          enableSync: true,
                          intervalMs: 2 * 60 * 60 * 1000,
                        }
                      : message.action ===
                          RuntimeActionIds.ModelSyncListChannels
                        ? {
                            items: [
                              { id: 201, name: "Manual Alpha" },
                              { id: 202, name: "Manual Beta" },
                            ],
                          }
                        : undefined,
          }
      }
    })

    render(<ManagedSiteModelSync />)

    expect(await screen.findByText("Alpha#101")).toBeInTheDocument()

    fireEvent.click(
      screen.getByRole("button", {
        name: "managedSiteModelSync:execution.actions.runAll",
      }),
    )

    await waitFor(() => {
      expect(mockShowWarningToast).toHaveBeenCalledWith(
        "managedSiteModelSync:messages.warning.syncCompletedWithFailures",
        expect.objectContaining({
          action: expect.objectContaining({
            label: "managedSiteModelSync:execution.actions.retryFailed",
          }),
        }),
      )
    })

    expect(toast.success).not.toHaveBeenCalled()
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

  it("uses route search params to prefilter both history and manual tabs", async () => {
    render(<ManagedSiteModelSync routeParams={{ search: "  Beta  " }} />)

    expect(await screen.findByDisplayValue("Beta")).toBeInTheDocument()
    expect(screen.getByText("Beta#102")).toBeInTheDocument()
    expect(screen.queryByText("Alpha#101")).not.toBeInTheDocument()

    fireEvent.click(
      screen.getByRole("tab", {
        name: "managedSiteModelSync:execution.tabs.manual",
      }),
    )

    expect(await screen.findByDisplayValue("Beta")).toBeInTheDocument()
    expect(screen.getByText("Manual Beta#202")).toBeInTheDocument()
    expect(screen.queryByText("Manual Alpha#201")).not.toBeInTheDocument()
  })

  it("shows the manual empty-state error when channel loading fails and recovers on reload", async () => {
    let channelLoadAttempt = 0

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
          channelLoadAttempt += 1
          if (channelLoadAttempt === 1) {
            return { success: false, error: "channel load failed" }
          }
          return {
            success: true,
            data: {
              items: [{ id: 301, name: "Recovered Channel" }],
            },
          }
        default:
          return { success: true }
      }
    })

    render(<ManagedSiteModelSync />)

    expect(await screen.findByText("channel load failed")).toBeInTheDocument()
    expect(toast.error).toHaveBeenCalledWith(
      "managedSiteModelSync:messages.error.loadFailed",
    )

    fireEvent.click(
      screen.getByRole("button", {
        name: "managedSiteModelSync:execution.manual.reload",
      }),
    )

    expect(await screen.findByText("Recovered Channel#301")).toBeInTheDocument()
  })

  it("supports selecting all visible history rows and clearing them again", async () => {
    render(<ManagedSiteModelSync />)

    expect(await screen.findByText("Alpha#101")).toBeInTheDocument()

    fireEvent.click(
      screen.getByRole("button", {
        name: /managedSiteModelSync:execution.filters.failed/,
      }),
    )

    await waitFor(() => {
      expect(screen.queryByText("Beta#102")).not.toBeInTheDocument()
    })

    const [selectAllCheckbox] = screen.getAllByRole("checkbox")
    fireEvent.click(selectAllCheckbox)

    expect(
      screen.getByRole("button", {
        name: "managedSiteModelSync:execution.actions.runSelected (1)",
      }),
    ).toBeEnabled()

    const alphaRow = screen.getByText("Alpha#101").closest("tr")
    expect(alphaRow).toBeTruthy()

    fireEvent.click(within(alphaRow!).getByRole("checkbox"))
    expect(
      screen.getByRole("button", {
        name: "managedSiteModelSync:execution.actions.runSelected (0)",
      }),
    ).toBeDisabled()

    fireEvent.click(selectAllCheckbox)
    expect(
      screen.getByRole("button", {
        name: "managedSiteModelSync:execution.actions.runSelected (1)",
      }),
    ).toBeEnabled()

    fireEvent.click(selectAllCheckbox)
    expect(
      screen.getByRole("button", {
        name: "managedSiteModelSync:execution.actions.runSelected (0)",
      }),
    ).toBeDisabled()
  })

  it("filters history rows by channel id and failure message and shows a no-results state", async () => {
    render(<ManagedSiteModelSync />)

    const searchInput = (await screen.findByPlaceholderText(
      "managedSiteModelSync:execution.filters.searchPlaceholder",
    )) as HTMLInputElement

    fireEvent.change(searchInput, { target: { value: "102" } })
    await waitFor(() => {
      expect(screen.getByText("Beta#102")).toBeInTheDocument()
      expect(screen.queryByText("Alpha#101")).not.toBeInTheDocument()
    })

    fireEvent.change(searchInput, { target: { value: "failed" } })
    await waitFor(() => {
      expect(screen.getByText("Alpha#101")).toBeInTheDocument()
      expect(screen.queryByText("Beta#102")).not.toBeInTheDocument()
    })

    fireEvent.change(searchInput, { target: { value: "zzz" } })
    expect(
      await screen.findByText("managedSiteModelSync:execution.empty.noResults"),
    ).toBeInTheDocument()
  })

  it("updates a single channel row with an inline failure result", async () => {
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
                  ok: true,
                  attempts: 1,
                  finishedAt: 1_700_000_001_000,
                },
              ],
              statistics: {
                total: 1,
                successCount: 1,
                failureCount: 0,
                durationMs: 1000,
                startedAt: 1_700_000_000_000,
                endedAt: 1_700_000_001_000,
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
                  ok: false,
                  message: "rate limited",
                  attempts: 2,
                  finishedAt: 1_700_000_002_000,
                },
              ],
              statistics: {
                total: 1,
                successCount: 0,
                failureCount: 1,
                durationMs: 1000,
                startedAt: 1_700_000_001_000,
                endedAt: 1_700_000_002_000,
              },
            },
          }
        case RuntimeActionIds.ModelSyncListChannels:
          return {
            success: true,
            data: { items: [] },
          }
        default:
          return { success: true }
      }
    })

    render(<ManagedSiteModelSync />)

    expect(await screen.findByText("Alpha#101")).toBeInTheDocument()

    fireEvent.click(
      screen.getByTitle("managedSiteModelSync:execution.table.syncChannel"),
    )

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "managedSiteModelSync:messages.error.syncFailed",
      )
      expect(screen.getByText("rate limited")).toBeInTheDocument()
    })
  })

  it("supports selecting and clearing all manual rows", async () => {
    render(<ManagedSiteModelSync routeParams={{ tab: "manual" }} />)

    expect(await screen.findByText("Manual Alpha#201")).toBeInTheDocument()
    expect(screen.getByText("Manual Beta#202")).toBeInTheDocument()

    const [selectAllCheckbox] = screen.getAllByRole("checkbox")
    fireEvent.click(selectAllCheckbox)

    expect(
      screen.getByRole("button", {
        name: "managedSiteModelSync:execution.actions.runSelected (2)",
      }),
    ).toBeEnabled()

    const manualAlphaRow = screen.getByText("Manual Alpha#201").closest("tr")
    expect(manualAlphaRow).toBeTruthy()

    fireEvent.click(within(manualAlphaRow!).getByRole("checkbox"))
    expect(
      screen.getByRole("button", {
        name: "managedSiteModelSync:execution.actions.runSelected (1)",
      }),
    ).toBeEnabled()

    fireEvent.click(selectAllCheckbox)
    expect(
      screen.getByRole("button", {
        name: "managedSiteModelSync:execution.actions.runSelected (2)",
      }),
    ).toBeEnabled()

    fireEvent.click(selectAllCheckbox)
    expect(
      screen.getByRole("button", {
        name: "managedSiteModelSync:execution.actions.runSelected (0)",
      }),
    ).toBeDisabled()
  })

  it("runs selected manual channels and clears the manual selection after success", async () => {
    render(<ManagedSiteModelSync routeParams={{ tab: "manual" }} />)

    expect(await screen.findByText("Manual Alpha#201")).toBeInTheDocument()

    const manualAlphaRow = screen.getByText("Manual Alpha#201").closest("tr")
    expect(manualAlphaRow).toBeTruthy()

    fireEvent.click(within(manualAlphaRow!).getByRole("checkbox"))
    expect(
      screen.getByRole("button", {
        name: "managedSiteModelSync:execution.actions.runSelected (1)",
      }),
    ).toBeEnabled()

    fireEvent.click(
      screen.getByRole("button", {
        name: "managedSiteModelSync:execution.actions.runSelected (1)",
      }),
    )

    await waitFor(() => {
      expect(mockSendRuntimeMessage).toHaveBeenCalledWith({
        action: RuntimeActionIds.ModelSyncTriggerSelected,
        channelIds: [201],
      })
    })

    expect(toast.success).toHaveBeenCalled()
    expect(
      screen.getByRole("button", {
        name: "managedSiteModelSync:execution.actions.runSelected (0)",
      }),
    ).toBeDisabled()
  })

  it("replaces the last execution snapshot when running all channels succeeds", async () => {
    mockSendRuntimeMessage.mockImplementation(async (message: any) => {
      switch (message.action) {
        case RuntimeActionIds.ModelSyncTriggerAll:
          return {
            success: true,
            data: {
              items: [
                {
                  channelId: 101,
                  channelName: "Alpha",
                  ok: true,
                  attempts: 1,
                  finishedAt: 1_700_000_006_000,
                },
                {
                  channelId: 102,
                  channelName: "Beta",
                  ok: true,
                  attempts: 1,
                  finishedAt: 1_700_000_006_500,
                },
              ],
              statistics: {
                total: 2,
                successCount: 2,
                failureCount: 0,
                durationMs: 1500,
                startedAt: 1_700_000_005_000,
                endedAt: 1_700_000_006_500,
              },
            },
          }
        default:
          return {
            success: true,
            data:
              message.action === RuntimeActionIds.ModelSyncGetLastExecution
                ? {
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
                  }
                : message.action === RuntimeActionIds.ModelSyncGetProgress
                  ? { isRunning: false, completed: 0, total: 0, failed: 0 }
                  : message.action === RuntimeActionIds.ModelSyncGetNextRun
                    ? { nextScheduledAt: "2026-03-28T10:00:00.000Z" }
                    : message.action ===
                        RuntimeActionIds.ModelSyncGetPreferences
                      ? {
                          enableSync: true,
                          intervalMs: 2 * 60 * 60 * 1000,
                        }
                      : message.action ===
                          RuntimeActionIds.ModelSyncListChannels
                        ? {
                            items: [
                              { id: 201, name: "Manual Alpha" },
                              { id: 202, name: "Manual Beta" },
                            ],
                          }
                        : undefined,
          }
      }
    })

    render(<ManagedSiteModelSync />)

    expect(await screen.findByText("failed")).toBeInTheDocument()

    fireEvent.click(
      screen.getByRole("button", {
        name: "managedSiteModelSync:execution.actions.runAll",
      }),
    )

    await waitFor(() => {
      expect(mockSendRuntimeMessage).toHaveBeenCalledWith({
        action: RuntimeActionIds.ModelSyncTriggerAll,
      })
    })

    expect(toast.success).toHaveBeenCalled()
    await waitFor(() => {
      expect(screen.queryByText("failed")).not.toBeInTheDocument()
    })
    expect(screen.getByText("Alpha#101")).toBeInTheDocument()
    expect(screen.getByText("Beta#102")).toBeInTheDocument()
  })

  it("keeps the current execution snapshot when running all channels fails", async () => {
    mockSendRuntimeMessage.mockImplementation(async (message: any) => {
      if (message.action === RuntimeActionIds.ModelSyncTriggerAll) {
        return {
          success: false,
          error: "backend unavailable",
        }
      }

      return {
        success: true,
        data:
          message.action === RuntimeActionIds.ModelSyncGetLastExecution
            ? {
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
              }
            : message.action === RuntimeActionIds.ModelSyncGetProgress
              ? { isRunning: false, completed: 0, total: 0, failed: 0 }
              : message.action === RuntimeActionIds.ModelSyncGetNextRun
                ? { nextScheduledAt: "2026-03-28T10:00:00.000Z" }
                : message.action === RuntimeActionIds.ModelSyncGetPreferences
                  ? {
                      enableSync: true,
                      intervalMs: 2 * 60 * 60 * 1000,
                    }
                  : message.action === RuntimeActionIds.ModelSyncListChannels
                    ? {
                        items: [
                          { id: 201, name: "Manual Alpha" },
                          { id: 202, name: "Manual Beta" },
                        ],
                      }
                    : undefined,
      }
    })

    render(<ManagedSiteModelSync />)

    expect(await screen.findByText("failed")).toBeInTheDocument()

    fireEvent.click(
      screen.getByRole("button", {
        name: "managedSiteModelSync:execution.actions.runAll",
      }),
    )

    await waitFor(() => {
      expect(mockSendRuntimeMessage).toHaveBeenCalledWith({
        action: RuntimeActionIds.ModelSyncTriggerAll,
      })
      expect(toast.error).toHaveBeenCalledWith(
        "managedSiteModelSync:messages.error.syncFailed",
      )
    })

    expect(screen.getByText("failed")).toBeInTheDocument()
    expect(screen.getByText("Alpha#101")).toBeInTheDocument()
  })

  it("keeps selected history rows checked when a targeted sync fails", async () => {
    mockSendRuntimeMessage.mockImplementation(async (message: any) => {
      if (message.action === RuntimeActionIds.ModelSyncTriggerSelected) {
        return {
          success: false,
          error: "permission denied",
        }
      }

      return {
        success: true,
        data:
          message.action === RuntimeActionIds.ModelSyncGetLastExecution
            ? {
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
              }
            : message.action === RuntimeActionIds.ModelSyncGetProgress
              ? { isRunning: false, completed: 0, total: 0, failed: 0 }
              : message.action === RuntimeActionIds.ModelSyncGetNextRun
                ? { nextScheduledAt: "2026-03-28T10:00:00.000Z" }
                : message.action === RuntimeActionIds.ModelSyncGetPreferences
                  ? {
                      enableSync: true,
                      intervalMs: 2 * 60 * 60 * 1000,
                    }
                  : message.action === RuntimeActionIds.ModelSyncListChannels
                    ? {
                        items: [
                          { id: 201, name: "Manual Alpha" },
                          { id: 202, name: "Manual Beta" },
                        ],
                      }
                    : undefined,
      }
    })

    render(<ManagedSiteModelSync />)

    expect(await screen.findByText("Alpha#101")).toBeInTheDocument()

    const alphaRow = screen.getByText("Alpha#101").closest("tr")
    expect(alphaRow).toBeTruthy()

    fireEvent.click(within(alphaRow!).getByRole("checkbox"))
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
      expect(toast.error).toHaveBeenCalledWith(
        "managedSiteModelSync:messages.error.syncFailed",
      )
    })

    expect(within(alphaRow!).getByRole("checkbox")).toBeChecked()
    expect(screen.getByText("failed")).toBeInTheDocument()
  })

  it("retries failed rows and replaces them with the successful result", async () => {
    mockSendRuntimeMessage.mockImplementation(async (message: any) => {
      if (message.action === RuntimeActionIds.ModelSyncTriggerFailedOnly) {
        return {
          success: true,
          data: {
            items: [
              {
                channelId: 101,
                channelName: "Alpha",
                ok: true,
                attempts: 3,
                finishedAt: 1_700_000_006_000,
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
              successCount: 2,
              failureCount: 0,
              durationMs: 2000,
              startedAt: 1_700_000_004_000,
              endedAt: 1_700_000_006_000,
            },
          },
        }
      }

      return {
        success: true,
        data:
          message.action === RuntimeActionIds.ModelSyncGetLastExecution
            ? {
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
              }
            : message.action === RuntimeActionIds.ModelSyncGetProgress
              ? { isRunning: false, completed: 0, total: 0, failed: 0 }
              : message.action === RuntimeActionIds.ModelSyncGetNextRun
                ? { nextScheduledAt: "2026-03-28T10:00:00.000Z" }
                : message.action === RuntimeActionIds.ModelSyncGetPreferences
                  ? {
                      enableSync: true,
                      intervalMs: 2 * 60 * 60 * 1000,
                    }
                  : message.action === RuntimeActionIds.ModelSyncListChannels
                    ? {
                        items: [
                          { id: 201, name: "Manual Alpha" },
                          { id: 202, name: "Manual Beta" },
                        ],
                      }
                    : undefined,
      }
    })

    render(<ManagedSiteModelSync />)

    expect(await screen.findByText("failed")).toBeInTheDocument()

    fireEvent.click(
      screen.getByRole("button", {
        name: "managedSiteModelSync:execution.actions.retryFailed",
      }),
    )

    await waitFor(() => {
      expect(mockSendRuntimeMessage).toHaveBeenCalledWith({
        action: RuntimeActionIds.ModelSyncTriggerFailedOnly,
      })
    })

    expect(toast.success).toHaveBeenCalled()
    await waitFor(() => {
      expect(screen.queryByText("failed")).not.toBeInTheDocument()
    })
    expect(
      screen.getByRole("button", {
        name: "managedSiteModelSync:execution.actions.retryFailed",
      }),
    ).toBeDisabled()
  })

  it("creates the first execution snapshot from a manual single-channel sync", async () => {
    mockSendRuntimeMessage.mockImplementation(async (message: any) => {
      switch (message.action) {
        case RuntimeActionIds.ModelSyncGetLastExecution:
          throw new Error("history unavailable")
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
              items: [{ id: 201, name: "Manual Alpha" }],
            },
          }
        case RuntimeActionIds.ModelSyncTriggerSelected:
          return {
            success: true,
            data: {
              items: [
                {
                  channelId: 201,
                  channelName: "Manual Alpha",
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
        default:
          return { success: true }
      }
    })

    render(<ManagedSiteModelSync routeParams={{ tab: "manual" }} />)

    expect(await screen.findByText("Manual Alpha#201")).toBeInTheDocument()
    expect(loggerMocks.error).toHaveBeenCalledWith(
      "Failed to load last execution",
      expect.any(Error),
    )

    fireEvent.click(
      screen.getByTitle("managedSiteModelSync:execution.table.syncChannel"),
    )

    await waitFor(() => {
      expect(mockSendRuntimeMessage).toHaveBeenCalledWith({
        action: RuntimeActionIds.ModelSyncTriggerSelected,
        channelIds: [201],
      })
    })
    expect(toast.success).toHaveBeenCalled()

    fireEvent.click(
      screen.getByRole("tab", {
        name: "managedSiteModelSync:execution.tabs.history",
      }),
    )

    expect(await screen.findByText("Manual Alpha#201")).toBeInTheDocument()
    expect(
      screen.queryByText("managedSiteModelSync:execution.empty.title"),
    ).not.toBeInTheDocument()
  })

  it("reacts to runtime progress events and reloads execution data when a sync completes", async () => {
    const addListener = vi.spyOn(browser.runtime.onMessage, "addListener")
    const removeListener = vi.spyOn(browser.runtime.onMessage, "removeListener")

    const { unmount } = render(<ManagedSiteModelSync />)

    expect(await screen.findByText("Alpha#101")).toBeInTheDocument()

    const listener = addListener.mock.calls.at(-1)?.[0] as (
      message: any,
    ) => void
    expect(listener).toBeTypeOf("function")

    const getLastExecutionCallsBefore =
      mockSendRuntimeMessage.mock.calls.filter(
        ([message]) =>
          message?.action === RuntimeActionIds.ModelSyncGetLastExecution,
      ).length
    const getNextRunCallsBefore = mockSendRuntimeMessage.mock.calls.filter(
      ([message]) => message?.action === RuntimeActionIds.ModelSyncGetNextRun,
    ).length

    await act(async () => {
      listener({
        type: "MANAGED_SITE_MODEL_SYNC_PROGRESS",
        payload: {
          isRunning: true,
          completed: 1,
          total: 2,
          failed: 0,
          currentChannel: "Manual Alpha",
        },
      })
    })

    expect(
      await screen.findByText("managedSiteModelSync:execution.status.running"),
    ).toBeInTheDocument()
    expect(screen.getByText(/Manual Alpha/)).toBeInTheDocument()

    await act(async () => {
      listener({
        type: "MANAGED_SITE_MODEL_SYNC_PROGRESS",
        payload: {
          isRunning: false,
          completed: 2,
          total: 2,
          failed: 0,
        },
      })
    })

    await waitFor(() => {
      expect(
        mockSendRuntimeMessage.mock.calls.filter(
          ([message]) =>
            message?.action === RuntimeActionIds.ModelSyncGetLastExecution,
        ).length,
      ).toBeGreaterThan(getLastExecutionCallsBefore)
      expect(
        mockSendRuntimeMessage.mock.calls.filter(
          ([message]) =>
            message?.action === RuntimeActionIds.ModelSyncGetNextRun,
        ).length,
      ).toBeGreaterThan(getNextRunCallsBefore)
    })

    await waitFor(() => {
      expect(
        screen.queryByText("managedSiteModelSync:execution.status.running"),
      ).not.toBeInTheDocument()
    })

    unmount()
    expect(removeListener).toHaveBeenCalledWith(listener)
  })
})
