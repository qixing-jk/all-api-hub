import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  getPendingAccountDialogRecovery,
  openAccountDialogRecovery,
  prepareAccountDialogRecovery,
  receiveAccountDialogRecovery,
} from "~/features/AccountManagement/accountDialogRecovery"
import { createEmptyAccountDialogDraft } from "~/features/AccountManagement/components/AccountDialog/models"
import { setSessionStorageValues } from "~/utils/browser/browserApi"

const {
  sessionValues,
  activeTab,
  openSidePanel,
  createTab,
  supportsSidePanel,
} = vi.hoisted(() => ({
  sessionValues: new Map<string, unknown>(),
  activeTab: { id: 11, windowId: 7 },
  openSidePanel: vi.fn(),
  createTab: vi.fn(),
  supportsSidePanel: vi.fn(() => true),
}))

vi.mock("~/utils/browser/browserApi", () => ({
  getActiveTab: vi.fn(async () => activeTab),
  getExtensionURL: (path: string) => `chrome-extension://test/${path}`,
  getSidePanelSupport: () => ({ supported: supportsSidePanel() }),
  openSidePanel,
  createTab,
  getSessionStorageValues: vi.fn(async (key: string) => ({
    [key]: structuredClone(sessionValues.get(key)),
  })),
  setSessionStorageValues: vi.fn(async (values: Record<string, unknown>) => {
    for (const [key, value] of Object.entries(values)) {
      sessionValues.set(key, structuredClone(value))
    }
    return true
  }),
  removeSessionStorageValues: vi.fn(async (key: string) => {
    sessionValues.delete(key)
    return true
  }),
  onStorageChanged: vi.fn(() => () => {}),
}))

const recoveryState = () => ({
  url: "http://local.example.test/new-api",
  draft: {
    ...createEmptyAccountDialogDraft(SITE_TYPES.NEW_API),
    siteName: "My New API",
    username: "retained-user",
    userId: "42",
    accessToken: "manually-entered-private-token",
    notes: "Keep these notes",
    tagIds: ["my-tag"],
    exchangeRate: "7.1",
  },
  checkInSelectionChanged: false,
  checkInDiscoveryBaseSelection: null,
})

describe("account dialog recovery handoff", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sessionValues.clear()
    supportsSidePanel.mockReturnValue(true)
    openSidePanel.mockResolvedValue(undefined)
    createTab.mockResolvedValue({ id: 12 })
  })

  afterEach(() => vi.restoreAllMocks())

  it("preserves the complete draft across popup loss and opens the side panel in the click turn", async () => {
    const original = recoveryState()
    const prepared = await prepareAccountDialogRecovery(original)

    const opening = openAccountDialogRecovery(prepared)
    // Native open must run before yielding user activation to async storage.
    expect(openSidePanel).toHaveBeenCalledWith(activeTab)
    await expect(opening).resolves.toBe("sidepanel")
    expect(createTab).not.toHaveBeenCalled()

    const accept = vi.fn(() => true)
    await expect(
      receiveAccountDialogRecovery(prepared.id, accept),
    ).resolves.toBe(true)
    expect(accept).toHaveBeenCalledWith(original)
    await expect(
      receiveAccountDialogRecovery(prepared.id, accept),
    ).resolves.toBe(false)
    expect(accept).toHaveBeenCalledTimes(1)
  })

  it("falls back to an account page carrying only an opaque draft reference", async () => {
    const original = recoveryState()
    const prepared = await prepareAccountDialogRecovery(original)
    openSidePanel.mockRejectedValueOnce(
      new Error("Native side panel unavailable"),
    )

    await expect(openAccountDialogRecovery(prepared)).resolves.toBe("tab")

    const url = new URL(createTab.mock.calls[0][0])
    expect(url.pathname).toBe("/options.html")
    expect(url.hash).toBe("#account")
    expect(url.searchParams.get("accountDialogRecovery")).toBe(prepared.id)
    expect(url.toString()).not.toContain(original.draft.accessToken)
    expect(url.toString()).not.toContain(original.url)
    expect(url.toString()).not.toContain(original.draft.username)

    const accept = vi.fn(() => true)
    await expect(
      receiveAccountDialogRecovery(prepared.id, accept),
    ).resolves.toBe(true)
    expect(accept).toHaveBeenCalledWith(original)
  })

  it("uses a full page when native side panels are unsupported", async () => {
    supportsSidePanel.mockReturnValue(false)
    const prepared = await prepareAccountDialogRecovery(recoveryState())
    await expect(openAccountDialogRecovery(prepared)).resolves.toBe("tab")
    expect(openSidePanel).not.toHaveBeenCalled()
    expect(createTab).toHaveBeenCalledTimes(1)
  })

  it("keeps the newest edits and excludes transient authentication from the handoff", async () => {
    const original = recoveryState()
    const prepared = await prepareAccountDialogRecovery(original)
    const edited = {
      ...original,
      draft: { ...original.draft, notes: "Latest notes", userId: "99" },
      transientAuth: { token: "private-dashboard-auth" },
    }
    const updated = await prepareAccountDialogRecovery(edited, prepared)
    expect(updated.id).toBe(prepared.id)
    const accept = vi.fn(() => true)
    await receiveAccountDialogRecovery(updated.id, accept)
    expect(accept).toHaveBeenCalledWith({
      ...original,
      draft: { ...original.draft, notes: "Latest notes", userId: "99" },
    })
    expect(JSON.stringify(accept.mock.calls)).not.toContain(
      "private-dashboard-auth",
    )
  })

  it("leaves the draft intact when another window or an unfinished form cannot accept it", async () => {
    const original = recoveryState()
    const prepared = await prepareAccountDialogRecovery(original)
    const wrongWindow = vi.fn(() => true)
    await expect(
      receiveAccountDialogRecovery(prepared.id, wrongWindow, 99),
    ).resolves.toBe(false)
    expect(wrongWindow).not.toHaveBeenCalled()
    await expect(
      receiveAccountDialogRecovery(prepared.id, () => false, 7),
    ).resolves.toBe(false)
    const accept = vi.fn(() => true)
    await expect(
      receiveAccountDialogRecovery(prepared.id, accept, 7),
    ).resolves.toBe(true)
    expect(accept).toHaveBeenCalledWith(original)
  })

  it("does not reopen a stale draft after its recovery window expires", async () => {
    const now = Date.now()
    const clock = vi.spyOn(Date, "now").mockReturnValue(now)
    const prepared = await prepareAccountDialogRecovery(recoveryState())
    await openAccountDialogRecovery(prepared)
    clock.mockReturnValue(now + 16 * 60 * 1000)
    const accept = vi.fn(() => true)
    await expect(
      receiveAccountDialogRecovery(prepared.id, accept, activeTab.windowId),
    ).resolves.toBe(false)
    expect(accept).not.toHaveBeenCalled()
    await expect(
      getPendingAccountDialogRecovery(activeTab.windowId),
    ).resolves.toBeNull()
  })

  it("keeps navigation closed when the form cannot be staged in session storage", async () => {
    vi.mocked(setSessionStorageValues).mockResolvedValueOnce(false)
    await expect(prepareAccountDialogRecovery(recoveryState())).rejects.toThrow(
      "session storage unavailable",
    )
    expect(openSidePanel).not.toHaveBeenCalled()
    expect(createTab).not.toHaveBeenCalled()
  })
})
