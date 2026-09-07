import userEvent from "@testing-library/user-event"
import toast from "react-hot-toast"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  openAccountDialogRecovery,
  prepareAccountDialogRecovery,
  receiveAccountDialogRecovery,
} from "~/features/AccountManagement/accountDialogRecovery"
import { createEmptyAccountDialogDraft } from "~/features/AccountManagement/components/AccountDialog/models"
import {
  DialogStateProvider,
  useDialogStateContext,
} from "~/features/AccountManagement/hooks/DialogStateContext"
import type { DisplaySiteData } from "~/types"
import { buildDisplaySiteData } from "~~/tests/test-utils/factories"
import { testI18n } from "~~/tests/test-utils/i18n"
import { act, render, screen, waitFor } from "~~/tests/test-utils/render"

const { values, listeners, isSidePanel, accountData } = vi.hoisted(() => ({
  values: new Map<string, unknown>(),
  listeners: new Set<
    (changes: Record<string, { newValue: unknown }>, area: string) => void
  >(),
  isSidePanel: vi.fn(() => true),
  accountData: { displayData: [] as DisplaySiteData[] },
}))

vi.mock("~/utils/browser", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/utils/browser")>()),
  isExtensionSidePanel: isSidePanel,
}))
vi.mock("~/utils/browser/browserApi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/utils/browser/browserApi")>()),
  getActiveTab: vi.fn(async () => ({ id: 11, windowId: 7 })),
  getSidePanelSupport: () => ({ supported: true }),
  openSidePanel: vi.fn(async () => {}),
  getSessionStorageValues: vi.fn(async (key: string) => ({
    [key]: structuredClone(values.get(key)),
  })),
  setSessionStorageValues: vi.fn(async (entries: Record<string, unknown>) => {
    for (const [key, value] of Object.entries(entries)) {
      values.set(key, structuredClone(value))
      for (const callback of listeners)
        callback({ [key]: { newValue: value } }, "session")
    }
    return true
  }),
  removeSessionStorageValues: vi.fn(async (key: string) => {
    values.delete(key)
  }),
  onStorageChanged: vi.fn((callback) => {
    listeners.add(callback)
    return () => {
      listeners.delete(callback)
    }
  }),
}))
vi.mock("~/features/AccountManagement/hooks/AccountDataContext", () => ({
  useAccountDataContext: () => ({
    loadAccountData: vi.fn(),
    displayData: accountData.displayData,
    isInitialLoad: false,
  }),
}))
vi.mock(
  "~/features/AccountManagement/sponsors/pendingAddAccountIntent",
  () => ({
    getAndClearPendingSponsorAddAccountPrefill: vi.fn(async () => null),
    watchPendingSponsorAddAccountPrefill: vi.fn(() => () => {}),
    isAddAccountPrefill: vi.fn(() => false),
  }),
)
vi.mock("~/features/AccountManagement/components/AccountDialog", () => ({
  default: (props: {
    recoveryState?: { draft: { siteName: string; notes: string } }
    onClose: () => void
  }) => (
    <div role="dialog" aria-label="Account form">
      <input
        aria-label="Site name"
        value={
          props.recoveryState?.draft.siteName ?? "Existing unfinished form"
        }
        readOnly
      />
      <input
        aria-label="Notes"
        value={props.recoveryState?.draft.notes ?? ""}
        readOnly
      />
      <button onClick={props.onClose}>Close form</button>
    </div>
  ),
}))

const snapshot = () => ({
  url: "https://new-api.example.invalid",
  draft: {
    ...createEmptyAccountDialogDraft(SITE_TYPES.NEW_API),
    siteName: "Carried site name",
    notes: "Carried notes",
    userId: "42",
  },
  checkInSelectionChanged: false,
  checkInDiscoveryBaseSelection: null,
})

function OpenForm() {
  const { openAddAccount, editingAccount } = useDialogStateContext()
  return (
    <>
      <button onClick={() => openAddAccount()}>Start another form</button>
      <output aria-label="Editing account">{editingAccount?.id}</output>
    </>
  )
}

describe("account dialog token recovery destinations", () => {
  beforeEach(() => {
    values.clear()
    listeners.clear()
    isSidePanel.mockReturnValue(true)
    accountData.displayData = []
    vi.spyOn(toast, "error").mockReturnValue("")
    vi.stubGlobal("navigator", {
      locks: {
        request: (
          _name: string,
          _options: LockOptions,
          callback: (lock: Lock | null) => Promise<unknown>,
        ) => callback(null),
      },
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it("restores a handoff that arrives after the side panel has mounted", async () => {
    const prepared = await prepareAccountDialogRecovery(snapshot())
    render(
      <DialogStateProvider>
        <OpenForm />
      </DialogStateProvider>,
    )
    await act(async () => {
      await openAccountDialogRecovery(prepared)
    })
    expect(
      await screen.findByRole("textbox", { name: "Site name" }),
    ).toHaveValue("Carried site name")
    expect(screen.getByRole("textbox", { name: "Notes" })).toHaveValue(
      "Carried notes",
    )
  })

  it("preserves an existing form and resumes the handoff after that form closes", async () => {
    const user = userEvent.setup()
    const prepared = await prepareAccountDialogRecovery(snapshot())
    render(
      <DialogStateProvider>
        <OpenForm />
      </DialogStateProvider>,
    )
    await user.click(
      await screen.findByRole("button", { name: "Start another form" }),
    )
    await act(async () => {
      await openAccountDialogRecovery(prepared)
    })
    expect(screen.getByRole("textbox", { name: "Site name" })).toHaveValue(
      "Existing unfinished form",
    )
    await user.click(screen.getByRole("button", { name: "Close form" }))
    expect(
      await screen.findByRole("textbox", { name: "Site name" }),
    ).toHaveValue("Carried site name")
  })

  it("restores the explicit fallback draft when opening a full account page", async () => {
    isSidePanel.mockReturnValue(false)
    const prepared = await prepareAccountDialogRecovery(snapshot())
    render(
      <DialogStateProvider initialRecoveryId={prepared.id}>
        <OpenForm />
      </DialogStateProvider>,
    )
    expect(
      await screen.findByRole("textbox", { name: "Site name" }),
    ).toHaveValue("Carried site name")
    expect(screen.getByRole("textbox", { name: "Notes" })).toHaveValue(
      "Carried notes",
    )
  })

  it("restores an edited draft to its original account", async () => {
    const account = buildDisplaySiteData({
      id: "edited-account",
      siteType: SITE_TYPES.NEW_API,
    })
    accountData.displayData = [
      buildDisplaySiteData({ id: "other-account" }),
      account,
    ]
    const prepared = await prepareAccountDialogRecovery({
      ...snapshot(),
      accountId: account.id,
    })
    render(
      <DialogStateProvider initialRecoveryId={prepared.id}>
        <OpenForm />
      </DialogStateProvider>,
    )

    expect(
      await screen.findByRole("textbox", { name: "Site name" }),
    ).toHaveValue("Carried site name")
    expect(screen.getByLabelText("Editing account")).toHaveTextContent(
      account.id,
    )
  })

  it("keeps a deleted account's edit draft unclaimed instead of opening an add form", async () => {
    const original = { ...snapshot(), accountId: "deleted-account" }
    const prepared = await prepareAccountDialogRecovery(original)
    render(
      <DialogStateProvider initialRecoveryId={prepared.id}>
        <OpenForm />
      </DialogStateProvider>,
    )

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        testI18n.t("accountDialog:accessTokenVerification.restoreFailed"),
      ),
    )
    expect(
      screen.queryByRole("dialog", { name: "Account form" }),
    ).not.toBeInTheDocument()
    const accept = vi.fn(() => true)
    await expect(
      receiveAccountDialogRecovery(prepared.id, accept),
    ).resolves.toBe(true)
    expect(accept).toHaveBeenCalledWith(original)
  })
})
