import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  openAccountDialogRecovery,
  prepareAccountDialogRecovery,
} from "~/features/AccountManagement/accountDialogRecovery"
import { createEmptyAccountDialogDraft } from "~/features/AccountManagement/components/AccountDialog/models"
import {
  DialogStateProvider,
  useDialogStateContext,
} from "~/features/AccountManagement/hooks/DialogStateContext"
import { act, render, screen } from "~~/tests/test-utils/render"

const { values, listeners, isSidePanel } = vi.hoisted(() => ({
  values: new Map<string, unknown>(),
  listeners: new Set<
    (changes: Record<string, { newValue: unknown }>, area: string) => void
  >(),
  isSidePanel: vi.fn(() => true),
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
    displayData: [],
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
  const { openAddAccount } = useDialogStateContext()
  return <button onClick={() => openAddAccount()}>Start another form</button>
}

describe("account dialog token recovery destinations", () => {
  beforeEach(() => {
    values.clear()
    listeners.clear()
    isSidePanel.mockReturnValue(true)
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

  afterEach(() => vi.unstubAllGlobals())

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
})
