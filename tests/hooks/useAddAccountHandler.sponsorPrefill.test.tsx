import { act, renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { useAddAccountHandler } from "~/hooks/useAddAccountHandler"

const { openAddAccountMock, showFirefoxWarningDialogMock } = vi.hoisted(() => ({
  openAddAccountMock: vi.fn(),
  showFirefoxWarningDialogMock: vi.fn(),
}))

const { openSidePanelPageMock } = vi.hoisted(() => ({
  openSidePanelPageMock: vi.fn(),
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
  }
})

vi.mock("~/utils/navigation", () => ({
  openSidePanelPage: openSidePanelPageMock,
}))

vi.mock(
  "~/features/AccountManagement/sponsors/pendingAddAccountIntent",
  () => ({
    setPendingSponsorAddAccountPrefill: vi.fn(),
  }),
)

describe("useAddAccountHandler sponsor prefill", () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
  })
})
