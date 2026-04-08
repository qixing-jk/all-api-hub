import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { AutoCheckinUiOpenPretrigger } from "~/components/AutoCheckinUiOpenPretrigger"
import { RuntimeActionIds } from "~/constants/runtimeActions"
import {
  DEFAULT_PREFERENCES,
  userPreferences,
} from "~/services/preferences/userPreferences"
import { openAutoCheckinPage, pushWithinOptionsPage } from "~/utils/navigation"
import { render, screen, waitFor } from "~~/tests/test-utils/render"

vi.mock("react-hot-toast", () => ({
  default: {
    loading: vi.fn(),
    dismiss: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock("~/utils/navigation", async () => {
  const actual = await vi.importActual<any>("~/utils/navigation")
  return {
    ...actual,
    openAutoCheckinPage: vi.fn(),
    pushWithinOptionsPage: vi.fn(),
  }
})

describe("AutoCheckinUiOpenPretrigger", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.history.replaceState(null, "", "/")
  })

  it("shows a started toast and a completion dialog with a View details button", async () => {
    const toast = (await import("react-hot-toast")).default

    /**
     * The UI-open pretrigger hook reads from UserPreferencesContext and will not
     * send the runtime message until preferences finish loading and the feature
     * is enabled.
     */
    vi.spyOn(userPreferences, "getPreferences").mockResolvedValue({
      ...DEFAULT_PREFERENCES,
      autoCheckin: {
        ...DEFAULT_PREFERENCES.autoCheckin!,
        globalEnabled: true,
        pretriggerDailyOnUiOpen: true,
      },
    })

    const browserApi = await import("~/utils/browser/browserApi")
    const sendRuntimeMessageSpy = vi.spyOn(browserApi, "sendRuntimeMessage")

    sendRuntimeMessageSpy.mockImplementation(async (message: any) => {
      if (
        message.action === RuntimeActionIds.AutoCheckinPretriggerDailyOnUiOpen
      ) {
        void browser.runtime
          .sendMessage({
            action: RuntimeActionIds.AutoCheckinPretriggerStarted,
            requestId: message.requestId,
          })
          .catch(() => undefined)

        return {
          success: true,
          started: true,
          lastRunResult: "partial",
          pendingRetry: true,
          summary: {
            totalEligible: 5,
            executed: 3,
            successCount: 2,
            failedCount: 1,
            skippedCount: 2,
            needsRetry: true,
          },
        }
      }

      return { success: true }
    })

    render(<AutoCheckinUiOpenPretrigger />)

    await waitFor(() => {
      expect(sendRuntimeMessageSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          action: RuntimeActionIds.AutoCheckinPretriggerDailyOnUiOpen,
        }),
      )
    })

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        "autoCheckin:messages.success.pretriggerStarted",
      )
    })

    expect(
      await screen.findByText("autoCheckin:uiOpenPretrigger.dialogTitle"),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", {
        name: "autoCheckin:uiOpenPretrigger.viewDetails",
      }),
    ).toBeInTheDocument()
  })

  it("pushes the auto-checkin page into history when view details is clicked from options", async () => {
    window.history.replaceState(null, "", "/options.html")

    vi.spyOn(userPreferences, "getPreferences").mockResolvedValue({
      ...DEFAULT_PREFERENCES,
      autoCheckin: {
        ...DEFAULT_PREFERENCES.autoCheckin!,
        globalEnabled: true,
        pretriggerDailyOnUiOpen: true,
      },
    })

    const browserApi = await import("~/utils/browser/browserApi")
    vi.spyOn(browserApi, "sendRuntimeMessage").mockImplementation(
      async (message: any) => {
        if (
          message.action === RuntimeActionIds.AutoCheckinPretriggerDailyOnUiOpen
        ) {
          void browser.runtime
            .sendMessage({
              action: RuntimeActionIds.AutoCheckinPretriggerStarted,
              requestId: message.requestId,
            })
            .catch(() => undefined)

          return {
            success: true,
            started: true,
            lastRunResult: "success",
            pendingRetry: false,
            summary: {
              totalEligible: 1,
              executed: 1,
              successCount: 1,
              failedCount: 0,
              skippedCount: 0,
              needsRetry: false,
            },
          }
        }

        return { success: true }
      },
    )

    render(<AutoCheckinUiOpenPretrigger />)

    const user = userEvent.setup()
    await user.click(
      await screen.findByRole("button", {
        name: "autoCheckin:uiOpenPretrigger.viewDetails",
      }),
    )

    expect(vi.mocked(pushWithinOptionsPage)).toHaveBeenCalledWith(
      "#autoCheckin",
    )
    expect(vi.mocked(openAutoCheckinPage)).not.toHaveBeenCalled()
  })
})
