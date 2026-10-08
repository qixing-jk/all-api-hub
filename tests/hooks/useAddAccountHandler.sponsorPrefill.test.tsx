import { act, renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { useAddAccountHandler } from "~/hooks/useAddAccountHandler"
import { atIndex } from "~~/tests/test-utils/indexedAccess"

const { openAddAccountMock, showFirefoxWarningDialogMock } = vi.hoisted(() => ({
  openAddAccountMock: vi.fn(),
  showFirefoxWarningDialogMock: vi.fn(),
}))

const { openSidePanelPageMock, openOptionsMock, runtime } = vi.hoisted(() => ({
  openSidePanelPageMock: vi.fn(),
  openOptionsMock: vi.fn(),
  runtime: { inPopup: true, supported: true },
}))

vi.mock("~/features/AccountManagement/hooks/DialogStateContext", () => ({
  useDialogStateContext: () => ({
    openAddAccount: openAddAccountMock,
  }),
}))

vi.mock(
  "~/entrypoints/popup/components/FirefoxAddAccountWarningDialog/showFirefoxWarningDialog",
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

vi.mock("~/utils/navigation/sidepanel", () => ({
  openSidePanelWithFallback: openSidePanelPageMock,
}))
vi.mock("~/utils/navigation/optionsPage", () => ({
  openOrFocusOptionsMenuItem: openOptionsMock,
}))
vi.mock("~/utils/navigation/popup", () => ({ closeIfPopup: vi.fn() }))

vi.mock(
  "~/features/AccountManagement/sponsors/pendingAddAccountIntent",
  () => ({
    isSponsorAddAccountPrefill: (value: unknown) =>
      typeof value === "object" &&
      value !== null &&
      (value as any).source === "sponsor" &&
      typeof (value as any).sponsorId === "string" &&
      typeof (value as any).siteUrl === "string" &&
      typeof (value as any).siteType === "string",
    setPendingSponsorAddAccountPrefill: vi.fn(),
  }),
)

vi.mock("~/utils/browser/browserApi", async (original) => ({
  ...(await original<typeof import("~/utils/browser/browserApi")>()),
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
    expect(openOptionsMock).toHaveBeenCalledWith("account", { action: "add" })
    expect(openSidePanelPageMock).not.toHaveBeenCalled()
  })

  it("persists sponsor prefill before opening the Firefox side-panel warning target", async () => {
    const { setPendingSponsorAddAccountPrefill } = await import(
      "~/features/AccountManagement/sponsors/pendingAddAccountIntent"
    )
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

    expect(setPendingSponsorAddAccountPrefill).toHaveBeenCalledWith(prefill)
    expect(openSidePanelPageMock).toHaveBeenCalledTimes(1)
    const persistCallOrder = atIndex(
      vi.mocked(setPendingSponsorAddAccountPrefill).mock.invocationCallOrder,
      0,
    )
    const navigateCallOrder = atIndex(
      openSidePanelPageMock.mock.invocationCallOrder,
      0,
    )
    expect(persistCallOrder).toBeLessThan(navigateCallOrder)
  })

  it("does not persist sponsor prefill when invoked from a click event", async () => {
    const { setPendingSponsorAddAccountPrefill } = await import(
      "~/features/AccountManagement/sponsors/pendingAddAccountIntent"
    )
    const { result } = renderHook(() => useAddAccountHandler())

    act(() => {
      result.current.handleAddAccountClick({
        source: "sponsor",
      } as any)
    })

    const onConfirm = showFirefoxWarningDialogMock.mock.calls[0]?.[0]
    expect(onConfirm).toEqual(expect.any(Function))

    await onConfirm()

    expect(setPendingSponsorAddAccountPrefill).not.toHaveBeenCalled()
    expect(openSidePanelPageMock).toHaveBeenCalledTimes(1)
  })
})
