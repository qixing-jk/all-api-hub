import { act, renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { useAddAccountHandler } from "~/features/AccountManagement/opening/useAddAccountHandler"
import { SPONSOR_WORKFLOW_KINDS } from "~/features/AccountManagement/sponsors/constants"

const { openAddAccountMock, showFirefoxWarningDialogMock } = vi.hoisted(() => ({
  openAddAccountMock: vi.fn(),
  showFirefoxWarningDialogMock: vi.fn(),
}))

const { openSidePanelPageMock, openOptionsMock, runtime } = vi.hoisted(() => ({
  openSidePanelPageMock: vi.fn(),
  openOptionsMock: vi.fn(),
  runtime: { inPopup: true, supported: true },
}))

vi.mock("~/features/AccountManagement/dialogs/useDialogStateContext", () => ({
  useDialogStateContext: () => ({
    openAddAccount: openAddAccountMock,
  }),
}))

vi.mock(
  "~/features/AccountManagement/opening/FirefoxAddAccountWarningDialog/showFirefoxWarningDialog",
  () => ({
    showFirefoxWarningDialog: showFirefoxWarningDialogMock,
  }),
)

vi.mock("~/utils/browser", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/utils/browser")>()
  return {
    ...actual,
    isDesktopDevice: () => true,
    isExtensionSidePanel: () => false,
    isFirefox: () => true,
    isExtensionPopup: () => runtime.inPopup,
  }
})

const openWorkflowMock = vi.hoisted(() => vi.fn())
vi.mock("~/features/AccountManagement/sponsors/openSponsorWorkflow", () => ({
  openSponsorWorkflow: openWorkflowMock,
}))

vi.mock("~/utils/navigation/sidepanel", () => ({
  openSidePanelWithFallback: openSidePanelPageMock,
}))
vi.mock("~/utils/navigation/optionsPage", () => ({
  openOrFocusOptionsMenuItem: openOptionsMock,
}))
vi.mock("~/utils/navigation/popup", () => ({ closeIfPopup: vi.fn() }))

vi.mock("~/features/AccountManagement/sponsors/addAccountPrefill", () => ({
  isSponsorAddAccountPrefill: (value: unknown) =>
    typeof value === "object" &&
    value !== null &&
    (value as any).source === "sponsor" &&
    typeof (value as any).sponsorId === "string" &&
    typeof (value as any).siteUrl === "string" &&
    typeof (value as any).siteType === "string",
}))

vi.mock("~/utils/browser/sidePanel", async (original) => ({
  ...(await original<typeof import("~/utils/browser/sidePanel")>()),
  getSidePanelSupport: () => ({ supported: runtime.supported }),
}))

describe("useAddAccountHandler sponsor prefill", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    runtime.inPopup = true
    runtime.supported = true
  })

  it("adds accounts directly in Options instead of recommending a side panel", () => {
    runtime.inPopup = false
    const { result } = renderHook(() => useAddAccountHandler())
    act(() => result.current.handleAddAccountClick())
    expect(showFirefoxWarningDialogMock).not.toHaveBeenCalled()
    expect(openAddAccountMock).toHaveBeenCalledWith(null)
  })

  it("offers and opens the Options add-account page when Firefox has no usable sidebar", async () => {
    runtime.supported = false
    const { result } = renderHook(() => useAddAccountHandler())
    act(() => result.current.handleAddAccountClick())
    expect(showFirefoxWarningDialogMock).toHaveBeenCalledWith(
      expect.any(Function),
      false,
    )
    await showFirefoxWarningDialogMock.mock.calls[0]?.[0]()
    expect(openSidePanelPageMock).toHaveBeenCalledWith(
      undefined,
      expect.any(Function),
    )
    await openSidePanelPageMock.mock.calls[0]?.[1]()
    expect(openOptionsMock).toHaveBeenCalledWith("account", { action: "add" })
  })

  it("delegates sponsor continuation to the shared workflow after Firefox confirmation", async () => {
    const prefill = {
      source: "sponsor" as const,
      sponsorId: "supported-provider",
      siteType: SITE_TYPES.NEW_API,
      siteUrl: "https://supported.example.test",
    }
    const { result } = renderHook(() => useAddAccountHandler())

    act(() => {
      result.current.handleAddAccountClick(prefill)
    })

    expect(showFirefoxWarningDialogMock).toHaveBeenCalledTimes(1)
    expect(openAddAccountMock).not.toHaveBeenCalled()

    const onConfirm = showFirefoxWarningDialogMock.mock.calls[0]?.[0]
    expect(onConfirm).toEqual(expect.any(Function))

    await onConfirm()

    expect(openWorkflowMock).toHaveBeenCalledWith(
      { kind: SPONSOR_WORKFLOW_KINDS.Account, prefill },
      expect.any(Function),
    )
  })

  it("does not persist sponsor prefill when invoked from a click event", async () => {
    const { result } = renderHook(() => useAddAccountHandler())

    act(() => {
      result.current.handleAddAccountClick({
        source: "sponsor",
      } as any)
    })

    const onConfirm = showFirefoxWarningDialogMock.mock.calls[0]?.[0]
    expect(onConfirm).toEqual(expect.any(Function))

    await onConfirm()

    expect(openWorkflowMock).not.toHaveBeenCalled()
    expect(openSidePanelPageMock).toHaveBeenCalledTimes(1)
  })
})
