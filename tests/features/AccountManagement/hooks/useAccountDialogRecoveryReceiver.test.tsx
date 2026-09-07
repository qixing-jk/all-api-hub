import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { createEmptyAccountDialogDraft } from "~/features/AccountManagement/components/AccountDialog/models"
import { useAccountDialogRecoveryReceiver } from "~/features/AccountManagement/hooks/useAccountDialogRecoveryReceiver"
import { createDeferred } from "~~/tests/test-utils/deferred"
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
    listeners.clear()
    watchPending.mockImplementation((_windowId, onPending: () => void) => {
      listeners.add(onPending)
      return () => listeners.delete(onPending)
    })
  })

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
})
