import { act, renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { DIALOG_MODES } from "~/constants/dialogModes"
import { useAccountCurrentTab } from "~/features/AccountManagement/components/AccountDialog/hooks/useAccountCurrentTab"

const { getActiveTabs, getSiteName } = vi.hoisted(() => ({
  getActiveTabs: vi.fn(),
  getSiteName: vi.fn(),
}))
vi.mock("~/utils/browser/browserApi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/utils/browser/browserApi")>()),
  getActiveTabs,
  onTabActivated: vi.fn(() => vi.fn()),
  onTabUpdated: vi.fn(() => vi.fn()),
}))
vi.mock("~/services/accounts/siteName", () => ({ getSiteName }))

describe("account current tab lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getSiteName.mockImplementation(async (tab: browser.tabs.Tab) => tab.title)
  })

  it.each(["newer lookup", "reset"] as const)(
    "rejects a pending tab query after %s",
    async (transition) => {
      let resolveOld!: (
        tabs: Array<Pick<browser.tabs.Tab, "id" | "url" | "title">>,
      ) => void
      const oldQuery = new Promise<
        Array<Pick<browser.tabs.Tab, "id" | "url" | "title">>
      >((resolve) => {
        resolveOld = resolve
      })
      getActiveTabs
        .mockReturnValueOnce(oldQuery)
        .mockResolvedValue([
          { id: 2, url: "https://current.example.com", title: "Current" },
        ])
      const setSiteName = vi.fn()
      const { result } = renderHook(() =>
        useAccountCurrentTab({ mode: DIALOG_MODES.ADD, url: "", setSiteName }),
      )
      await waitFor(() => expect(getActiveTabs).toHaveBeenCalledOnce())
      if (transition === "newer lookup") {
        await act(async () => {
          await result.current.checkCurrentTab()
        })
        expect(result.current.currentTabUrl).toBe("https://current.example.com")
      } else {
        act(() => result.current.reset(false))
      }
      setSiteName.mockClear()
      await act(async () => {
        resolveOld([{ id: 1, url: "https://old.example.com", title: "Old" }])
        await oldQuery
      })
      expect(result.current.currentTabUrl).toBe(
        transition === "newer lookup" ? "https://current.example.com" : null,
      )
      expect(setSiteName).not.toHaveBeenCalled()
      expect(
        result.current.getBrowserSessionContext("https://old.example.com"),
      ).toBeUndefined()
    },
  )
})
