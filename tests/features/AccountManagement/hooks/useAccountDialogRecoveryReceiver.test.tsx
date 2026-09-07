import toast from "react-hot-toast"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { createEmptyAccountDialogDraft } from "~/features/AccountManagement/components/AccountDialog/models"
import { useAccountDialogRecoveryReceiver } from "~/features/AccountManagement/hooks/useAccountDialogRecoveryReceiver"
import { getActiveTab } from "~/utils/browser/browserApi"
import { createDeferred } from "~~/tests/test-utils/deferred"
import { testI18n } from "~~/tests/test-utils/i18n"
import { act, renderHook, waitFor } from "~~/tests/test-utils/render"

const { getPending, receiveRecovery, watchPending, listeners } = vi.hoisted(
  () => ({
    getPending: vi.fn(),
    receiveRecovery: vi.fn(),
    watchPending: vi.fn(),
    listeners: new Set<() => void>(),
  }),
)

vi.mock("~/features/AccountManagement/accountDialogRecovery", () => ({
  getPendingAccountDialogRecovery: getPending,
  receiveAccountDialogRecovery: receiveRecovery,
  watchPendingAccountDialogRecovery: watchPending,
}))
vi.mock("~/utils/browser", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/utils/browser")>()),
  isExtensionSidePanel: () => true,
}))
vi.mock("~/utils/browser/browserApi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/utils/browser/browserApi")>()),
  getActiveTab: vi.fn(async () => ({ id: 11, windowId: 7 })),
}))

describe("account dialog recovery receiver", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(toast, "error").mockReturnValue("")
    getPending.mockReset().mockResolvedValue(null)
    receiveRecovery.mockReset().mockResolvedValue(false)
    vi.mocked(getActiveTab).mockResolvedValue({
      id: 11,
      windowId: 7,
    } as browser.tabs.Tab)
    listeners.clear()
    watchPending.mockImplementation((_windowId, onPending: () => void) => {
      listeners.add(onPending)
      return () => listeners.delete(onPending)
    })
  })

  afterEach(() => vi.restoreAllMocks())

  it("receives a newer pending form after an earlier reception finishes", async () => {
    const firstId = "00000000-0000-4000-8000-000000000001"
    const secondId = "00000000-0000-4000-8000-000000000002"
    const secondState = {
      url: "https://new-api.example.invalid",
      draft: {
        ...createEmptyAccountDialogDraft(SITE_TYPES.NEW_API),
        notes: "Keep the newer form",
      },
      checkInSelectionChanged: false,
      checkInDiscoveryBaseSelection: null,
    }
    const firstReception = createDeferred<boolean>()
    getPending.mockResolvedValue(firstId)
    receiveRecovery.mockImplementation((id, accept) =>
      id === firstId
        ? firstReception.promise
        : Promise.resolve(accept(secondState)),
    )
    const onReceive = vi.fn(() => "accepted" as const)
    renderHook(
      () => useAccountDialogRecoveryReceiver({ enabled: true, onReceive }),
      { withUserPreferencesProvider: false, withThemeProvider: false },
    )
    await waitFor(() => {
      expect(receiveRecovery).toHaveBeenCalledWith(
        firstId,
        expect.any(Function),
        7,
      )
    })

    getPending.mockResolvedValue(secondId)
    await act(async () => {
      for (const listener of listeners) listener()
    })
    await act(async () => {
      firstReception.resolve(false)
    })

    await waitFor(() => expect(onReceive).toHaveBeenCalledWith(secondState))
    expect(onReceive).toHaveBeenCalledTimes(1)
  })

  it.each(["pending lookup", "draft claim"])(
    "reports a failed %s and accepts a later notification without losing the form",
    async (operation) => {
      const id = "00000000-0000-4000-8000-000000000003"
      const state = {
        url: "https://new-api.example.invalid",
        draft: createEmptyAccountDialogDraft(SITE_TYPES.NEW_API),
        checkInSelectionChanged: false,
        checkInDiscoveryBaseSelection: null,
      }
      getPending.mockResolvedValue(id)
      receiveRecovery.mockImplementation((_id, accept) =>
        Promise.resolve(accept(state)),
      )
      const failingOperation =
        operation === "pending lookup" ? getPending : receiveRecovery
      failingOperation.mockRejectedValueOnce(new Error("Session read failed"))
      const onReceive = vi.fn(() => "accepted" as const)
      renderHook(
        () => useAccountDialogRecoveryReceiver({ enabled: true, onReceive }),
        {
          withUserPreferencesProvider: false,
          withThemeProvider: false,
        },
      )

      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith(
          testI18n.t("accountDialog:accessTokenVerification.restoreFailed"),
        ),
      )
      expect(onReceive).not.toHaveBeenCalled()
      await act(async () => {
        for (const listener of listeners) listener()
      })

      await waitFor(() =>
        expect(onReceive).toHaveBeenCalledExactlyOnceWith(state),
      )
      expect(toast.error).toHaveBeenCalledTimes(1)
    },
  )

  it("reports when the receiving browser window cannot be determined", async () => {
    vi.mocked(getActiveTab).mockRejectedValueOnce(
      new Error("Tab lookup failed"),
    )
    const onReceive = vi.fn(() => "accepted" as const)
    renderHook(
      () => useAccountDialogRecoveryReceiver({ enabled: true, onReceive }),
      {
        withUserPreferencesProvider: false,
        withThemeProvider: false,
      },
    )

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        testI18n.t("accountDialog:accessTokenVerification.restoreFailed"),
      ),
    )
    expect(watchPending).not.toHaveBeenCalled()
    expect(onReceive).not.toHaveBeenCalled()
  })

  it.each(["window lookup", "pending lookup", "draft claim"])(
    "ignores a late %s failure after the receiving view closes",
    async (operation) => {
      const pending = createDeferred<never>()
      getPending.mockResolvedValue("00000000-0000-4000-8000-000000000004")
      const failingOperation =
        operation === "window lookup"
          ? vi.mocked(getActiveTab)
          : operation === "pending lookup"
            ? getPending
            : receiveRecovery
      failingOperation.mockReturnValueOnce(pending.promise)
      const onReceive = vi.fn(() => "accepted" as const)
      const { unmount } = renderHook(
        () => useAccountDialogRecoveryReceiver({ enabled: true, onReceive }),
        {
          withUserPreferencesProvider: false,
          withThemeProvider: false,
        },
      )
      await waitFor(() => expect(failingOperation).toHaveBeenCalledTimes(1))
      unmount()

      await act(async () => pending.reject(new Error("Late failure")))

      expect(toast.error).not.toHaveBeenCalled()
      expect(onReceive).not.toHaveBeenCalled()
      expect(listeners.size).toBe(0)
    },
  )
})
