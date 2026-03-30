import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import { RuntimeActionIds } from "~/constants/runtimeActions"
import AutoCheckin from "~/entrypoints/options/pages/AutoCheckin"
import { CHECKIN_RESULT_STATUS } from "~/types/autoCheckin"
import { render, screen, waitFor } from "~~/tests/test-utils/render"

const { toast } = vi.hoisted(() => ({
  toast: {
    loading: vi.fn(),
    dismiss: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock("react-hot-toast", () => ({
  default: toast,
}))

afterEach(() => {
  vi.restoreAllMocks()
  vi.clearAllMocks()
})

describe("AutoCheckin account actions", () => {
  it("retries a failed account, reloads status, and hides row actions after success", async () => {
    const user = userEvent.setup()
    const browserApi = await import("~/utils/browser/browserApi")

    let statusCalls = 0
    const sendRuntimeMessageSpy = vi
      .spyOn(browserApi, "sendRuntimeMessage")
      .mockImplementation(async (message: any) => {
        if (message.action === RuntimeActionIds.AutoCheckinGetStatus) {
          statusCalls += 1

          return {
            success: true,
            data: {
              perAccount: {
                alpha: {
                  accountId: "alpha",
                  accountName: "Alpha",
                  status:
                    statusCalls === 1
                      ? CHECKIN_RESULT_STATUS.FAILED
                      : CHECKIN_RESULT_STATUS.SUCCESS,
                  timestamp: 1700000000000,
                  message: statusCalls === 1 ? "needs retry" : "ok",
                },
              },
            },
          }
        }

        if (message.action === RuntimeActionIds.AutoCheckinRetryAccount) {
          return { success: true }
        }

        return { success: true }
      })

    render(<AutoCheckin routeParams={{}} />)

    await user.click(
      await screen.findByRole("button", {
        name: "autoCheckin:execution.actions.retryAccount",
      }),
    )

    await waitFor(() => {
      expect(sendRuntimeMessageSpy).toHaveBeenCalledWith({
        action: RuntimeActionIds.AutoCheckinRetryAccount,
        accountId: "alpha",
      })
    })
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        "autoCheckin:messages.success.retryCompleted",
      )
    })
    await waitFor(() => {
      expect(
        screen.queryByRole("button", {
          name: "autoCheckin:execution.actions.retryAccount",
        }),
      ).not.toBeInTheDocument()
    })

    expect(statusCalls).toBeGreaterThanOrEqual(2)
  })

  it("shows a retry failure toast and restores the retry button after the request settles", async () => {
    const user = userEvent.setup()
    const browserApi = await import("~/utils/browser/browserApi")

    let resolveRetry:
      | ((value: { success: boolean; error?: string }) => void)
      | undefined
    vi.spyOn(browserApi, "sendRuntimeMessage").mockImplementation(
      async (message: any) => {
        if (message.action === RuntimeActionIds.AutoCheckinGetStatus) {
          return {
            success: true,
            data: {
              perAccount: {
                alpha: {
                  accountId: "alpha",
                  accountName: "Alpha",
                  status: CHECKIN_RESULT_STATUS.FAILED,
                  timestamp: 1700000000000,
                  message: "needs retry",
                },
              },
            },
          }
        }

        if (message.action === RuntimeActionIds.AutoCheckinRetryAccount) {
          return await new Promise<{ success: boolean; error?: string }>(
            (resolve) => {
              resolveRetry = resolve
            },
          )
        }

        return { success: true }
      },
    )

    render(<AutoCheckin routeParams={{}} />)

    const retryButton = await screen.findByRole("button", {
      name: "autoCheckin:execution.actions.retryAccount",
    })
    await user.click(retryButton)

    await waitFor(() => {
      expect(retryButton).toBeDisabled()
    })

    resolveRetry?.({ success: false, error: "backend rejected retry" })

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "autoCheckin:messages.error.retryFailed",
      )
    })
    await waitFor(() => {
      expect(retryButton).not.toBeDisabled()
    })
  })

  it("shows an error when manual sign-in page opening fails and restores the button state", async () => {
    const user = userEvent.setup()
    const browserApi = await import("~/utils/browser/browserApi")
    const navigation = await import("~/utils/navigation")

    let rejectOpen: ((reason?: unknown) => void) | undefined
    vi.spyOn(browserApi, "sendRuntimeMessage").mockImplementation(
      async (message: any) => {
        if (message.action === RuntimeActionIds.AutoCheckinGetStatus) {
          return {
            success: true,
            data: {
              perAccount: {
                alpha: {
                  accountId: "alpha",
                  accountName: "Alpha",
                  status: CHECKIN_RESULT_STATUS.FAILED,
                  timestamp: 1700000000000,
                  message: "needs manual sign-in",
                },
              },
            },
          }
        }

        if (message.action === RuntimeActionIds.AutoCheckinGetAccountInfo) {
          return { success: true, data: { id: "alpha", name: "Alpha" } }
        }

        return { success: true }
      },
    )
    vi.spyOn(navigation, "openCheckInPage").mockReturnValue(
      new Promise((_, reject) => {
        rejectOpen = reject
      }) as any,
    )

    render(<AutoCheckin routeParams={{}} />)

    const openButton = await screen.findByRole("button", {
      name: "autoCheckin:execution.actions.openManual",
    })
    await user.click(openButton)

    await waitFor(() => {
      expect(openButton).toBeDisabled()
    })

    rejectOpen?.(new Error("popup blocked"))

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "autoCheckin:messages.error.openManualFailed",
      )
    })
    await waitFor(() => {
      expect(openButton).not.toBeDisabled()
    })
  })

  it("opens the provider site from the row action", async () => {
    const user = userEvent.setup()
    const browserApi = await import("~/utils/browser/browserApi")
    const navigation = await import("~/utils/navigation")

    const sendRuntimeMessageSpy = vi
      .spyOn(browserApi, "sendRuntimeMessage")
      .mockImplementation(async (message: any) => {
        if (message.action === RuntimeActionIds.AutoCheckinGetStatus) {
          return {
            success: true,
            data: {
              perAccount: {
                alpha: {
                  accountId: "alpha",
                  accountName: "Alpha",
                  status: CHECKIN_RESULT_STATUS.SUCCESS,
                  timestamp: 1700000000000,
                  message: "ok",
                },
              },
            },
          }
        }

        if (message.action === RuntimeActionIds.AutoCheckinGetAccountInfo) {
          return {
            success: true,
            data: {
              id: "alpha",
              name: "Alpha",
              baseUrl: "https://alpha.example",
            },
          }
        }

        return { success: true }
      })
    const openAccountBaseUrlSpy = vi
      .spyOn(navigation, "openAccountBaseUrl")
      .mockResolvedValue(undefined as any)

    render(<AutoCheckin routeParams={{}} />)

    await user.click(
      await screen.findByRole("button", {
        name: "autoCheckin:execution.actions.openSite",
      }),
    )

    await waitFor(() => {
      expect(sendRuntimeMessageSpy).toHaveBeenCalledWith({
        action: RuntimeActionIds.AutoCheckinGetAccountInfo,
        accountId: "alpha",
        includeDisabled: true,
      })
    })
    expect(openAccountBaseUrlSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "alpha",
        baseUrl: "https://alpha.example",
      }),
    )
  })

  it("shows an error when site opening fails and restores the button state", async () => {
    const user = userEvent.setup()
    const browserApi = await import("~/utils/browser/browserApi")
    const navigation = await import("~/utils/navigation")

    let rejectOpen: ((reason?: unknown) => void) | undefined
    vi.spyOn(browserApi, "sendRuntimeMessage").mockImplementation(
      async (message: any) => {
        if (message.action === RuntimeActionIds.AutoCheckinGetStatus) {
          return {
            success: true,
            data: {
              perAccount: {
                alpha: {
                  accountId: "alpha",
                  accountName: "Alpha",
                  status: CHECKIN_RESULT_STATUS.ALREADY_CHECKED,
                  timestamp: 1700000000000,
                  message: "already checked",
                },
              },
            },
          }
        }

        if (message.action === RuntimeActionIds.AutoCheckinGetAccountInfo) {
          return {
            success: true,
            data: {
              id: "alpha",
              name: "Alpha",
              baseUrl: "https://alpha.example",
            },
          }
        }

        return { success: true }
      },
    )
    vi.spyOn(navigation, "openAccountBaseUrl").mockReturnValue(
      new Promise((_, reject) => {
        rejectOpen = reject
      }) as any,
    )

    render(<AutoCheckin routeParams={{}} />)

    const openButton = await screen.findByRole("button", {
      name: "autoCheckin:execution.actions.openSite",
    })
    await user.click(openButton)

    await waitFor(() => {
      expect(openButton).toBeDisabled()
    })

    rejectOpen?.(new Error("popup blocked"))

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "autoCheckin:messages.error.openSiteFailed",
      )
    })
    await waitFor(() => {
      expect(openButton).not.toBeDisabled()
    })
  })

  it("reports a bulk-open failure when every failed account lookup fails", async () => {
    const user = userEvent.setup()
    const browserApi = await import("~/utils/browser/browserApi")
    const navigation = await import("~/utils/navigation")
    const sendRuntimeMessageSpy = vi
      .spyOn(browserApi, "sendRuntimeMessage")
      .mockImplementation(async (message: any) => {
        if (message.action === RuntimeActionIds.AutoCheckinGetStatus) {
          return {
            success: true,
            data: {
              perAccount: {
                alpha: {
                  accountId: "alpha",
                  accountName: "Alpha",
                  status: CHECKIN_RESULT_STATUS.FAILED,
                  timestamp: 1700000000000,
                  message: "alpha failed",
                },
                beta: {
                  accountId: "beta",
                  accountName: "Beta",
                  status: CHECKIN_RESULT_STATUS.FAILED,
                  timestamp: 1700000001000,
                  message: "beta failed",
                },
              },
            },
          }
        }

        if (message.action === RuntimeActionIds.AutoCheckinGetAccountInfo) {
          return { success: false, error: `missing-${message.accountId}` }
        }

        return { success: true }
      })
    const openCheckInPagesSpy = vi.spyOn(navigation, "openCheckInPages")

    render(<AutoCheckin routeParams={{}} />)

    await user.click(
      await screen.findByRole("button", {
        name: "autoCheckin:execution.actions.openFailedManual",
      }),
    )

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "autoCheckin:messages.error.openFailedManualFailed",
      )
    })

    expect(openCheckInPagesSpy).not.toHaveBeenCalled()
    expect(sendRuntimeMessageSpy).toHaveBeenCalledWith({
      action: RuntimeActionIds.AutoCheckinGetAccountInfo,
      accountId: "alpha",
    })
    expect(sendRuntimeMessageSpy).toHaveBeenCalledWith({
      action: RuntimeActionIds.AutoCheckinGetAccountInfo,
      accountId: "beta",
    })
  })

  it("filters already-checked results as success, searches translated message keys, and renders snapshots", async () => {
    const user = userEvent.setup()
    const browserApi = await import("~/utils/browser/browserApi")

    vi.spyOn(browserApi, "sendRuntimeMessage").mockResolvedValue({
      success: true,
      data: {
        perAccount: {
          already: {
            accountId: "already",
            accountName: "Already Account",
            status: CHECKIN_RESULT_STATUS.ALREADY_CHECKED,
            timestamp: 1700000000000,
            message: "already checked",
          },
          skipped: {
            accountId: "skipped",
            accountName: "Skipped Account",
            status: CHECKIN_RESULT_STATUS.SKIPPED,
            timestamp: 1700000001000,
            messageKey: "autoCheckin:skipReasons.no_provider",
          },
          failed: {
            accountId: "failed",
            accountName: "Failed Account",
            status: CHECKIN_RESULT_STATUS.FAILED,
            timestamp: 1700000002000,
            message: "failed",
          },
        },
        accountsSnapshot: [
          {
            accountId: "snapshot-1",
            accountName: "Snapshot Account",
            detectionEnabled: true,
            autoCheckinEnabled: false,
            providerAvailable: true,
            skipReason: "auto_checkin_disabled",
          },
        ],
      },
    } as any)

    render(<AutoCheckin routeParams={{}} />)

    expect(
      await screen.findByText("autoCheckin:snapshot.title"),
    ).toBeInTheDocument()
    expect(screen.getByText("Snapshot Account")).toBeInTheDocument()

    await user.click(
      screen.getByRole("button", {
        name: /autoCheckin:execution\.filters\.success/i,
      }),
    )

    await waitFor(() => {
      expect(screen.getByText("Already Account")).toBeInTheDocument()
      expect(screen.queryByText("Skipped Account")).not.toBeInTheDocument()
      expect(screen.queryByText("Failed Account")).not.toBeInTheDocument()
    })

    const searchInput = screen.getByPlaceholderText(
      "autoCheckin:execution.filters.searchPlaceholder",
    )
    await user.clear(searchInput)
    await user.type(searchInput, "autoCheckin:skipReasons.no_provider")
    await user.click(
      screen.getByRole("button", {
        name: /autoCheckin:execution\.filters\.skipped/i,
      }),
    )

    await waitFor(() => {
      expect(screen.getByText("Skipped Account")).toBeInTheDocument()
      expect(screen.queryByText("Already Account")).not.toBeInTheDocument()
    })

    await user.clear(searchInput)
    await user.type(searchInput, "missing result")

    await waitFor(() => {
      expect(
        screen.getByText("autoCheckin:execution.empty.noResults"),
      ).toBeInTheDocument()
    })
  })
})
