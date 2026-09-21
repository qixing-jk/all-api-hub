import { describe, expect, it, vi } from "vitest"

import { OpenInCherryStudio } from "~/services/integrations/cherryStudio"
import type { CredentialExportData } from "~/services/integrations/credentialExport"
import { atIndex } from "~~/tests/test-utils/indexedAccess"

vi.mock("~/lib/notify", () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

const mockCredential: CredentialExportData = {
  providerId: "test-id",
  providerName: "Test Account",
  baseUrl: "https://api.test.com",
  apiKey: "sk-test-key",
}

describe("cherryStudio", () => {
  describe("OpenInCherryStudio", () => {
    it("opens Cherry Studio URL with valid data", () => {
      const openSpy = vi.spyOn(window, "open").mockImplementation(() => null)
      OpenInCherryStudio(mockCredential)

      expect(openSpy).toHaveBeenCalled()
      const url = atIndex(openSpy.mock.calls, 0)[0] as string
      expect(url).toContain("cherrystudio://providers/api-keys")
      expect(url).toContain("v=1")
      expect(url).toContain("data=")

      openSpy.mockRestore()
    })

    it("shows error for a missing credential", async () => {
      const toast = (await import("~/lib/notify")).default
      OpenInCherryStudio(null as any)
      expect(toast.error).toHaveBeenCalled()
    })

    it("encodes data correctly", () => {
      const openSpy = vi.spyOn(window, "open").mockImplementation(() => null)
      OpenInCherryStudio(mockCredential)

      const url = atIndex(openSpy.mock.calls, 0)[0] as string
      const dataParam = atIndex(url.split("data="), 1)
      expect(dataParam).toBeTruthy()
      expect(dataParam.length).toBeGreaterThan(0)
      expect(JSON.parse(atob(dataParam))).toEqual({
        id: "test-id",
        name: "Test Account",
        baseUrl: "https://api.test.com",
        apiKey: "sk-test-key",
      })

      openSpy.mockRestore()
    })
  })
})
