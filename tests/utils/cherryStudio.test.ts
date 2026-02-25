import { describe, expect, it, vi } from "vitest"

import {
  AuthTypeEnum,
  SiteHealthStatus,
  type ApiToken,
  type DisplaySiteData,
} from "~/types"
import { OpenInCherryStudio } from "~/utils/cherryStudio"

vi.mock("react-hot-toast", () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

const mockAccount: DisplaySiteData = {
  id: "test-id",
  name: "Test Account",
  username: "testuser",
  baseUrl: "https://api.test.com",
  token: "sk-test",
  userId: 123,
  balance: { USD: 10, CNY: 70 },
  todayConsumption: { USD: 1, CNY: 7 },
  todayIncome: { USD: 0, CNY: 0 },
  todayTokens: { upload: 100, download: 200 },
  checkIn: { enableDetection: false },
  health: { status: SiteHealthStatus.Healthy },
  last_sync_time: Date.now(),
  siteType: "one-api",
  authType: AuthTypeEnum.AccessToken,
}

const mockToken: ApiToken = {
  id: 1,
  user_id: 123,
  key: "sk-test-key",
  name: "Test Token",
  created_time: Date.now(),
  accessed_time: Date.now(),
  expired_time: -1,
  remain_quota: 1000000,
  used_quota: 0,
  unlimited_quota: true,
  status: 1,
}

describe("cherryStudio", () => {
  describe("OpenInCherryStudio", () => {
    it("opens Cherry Studio URL with valid data", () => {
      const openSpy = vi.spyOn(window, "open").mockImplementation(() => null)
      OpenInCherryStudio(mockAccount, mockToken)

      expect(openSpy).toHaveBeenCalled()
      const url = openSpy.mock.calls[0][0] as string
      expect(url).toContain("cherrystudio://providers/api-keys")
      expect(url).toContain("v=1")
      expect(url).toContain("data=")

      openSpy.mockRestore()
    })

    it("shows error for missing account", async () => {
      const toast = (await import("react-hot-toast")).default
      OpenInCherryStudio(null as any, mockToken)
      expect(toast.error).toHaveBeenCalled()
    })

    it("shows error for missing token", async () => {
      const toast = (await import("react-hot-toast")).default
      OpenInCherryStudio(mockAccount, null as any)
      expect(toast.error).toHaveBeenCalled()
    })

    it("encodes data correctly", () => {
      const openSpy = vi.spyOn(window, "open").mockImplementation(() => null)
      OpenInCherryStudio(mockAccount, mockToken)

      const url = openSpy.mock.calls[0][0] as string
      const dataParam = url.split("data=")[1]
      expect(dataParam).toBeTruthy()
      expect(dataParam.length).toBeGreaterThan(0)

      openSpy.mockRestore()
    })
  })
})
