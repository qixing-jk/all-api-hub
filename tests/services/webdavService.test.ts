import { beforeEach, describe, expect, it, vi } from "vitest"

import { userPreferences } from "~/services/userPreferences"
import {
  downloadBackup,
  downloadBackupRaw,
  testWebdavConnection,
  uploadBackup,
} from "~/services/webdav/webdavService"

// Mock i18n so error messages are deterministic
vi.mock("i18next", () => ({
  t: (key: string, params?: { status?: number }) =>
    params && typeof params.status !== "undefined"
      ? `${key}:${params.status}`
      : key,
}))

vi.mock("~/services/userPreferences", () => ({
  userPreferences: {
    getPreferences: vi.fn(),
  },
}))

const mockedUserPreferences = userPreferences as any

const globalAny = globalThis as any

describe("webdavService", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Fresh fetch mock for each test
    globalAny.fetch = vi.fn()
  })

  const basePrefs = {
    webdav: {
      url: "https://example.com/webdav",
      username: "user",
      password: "pass",
      backupEncryptionEnabled: false,
      backupEncryptionPassword: "",
    },
  }

  describe("testWebdavConnection", () => {
    it("throws when config is incomplete", async () => {
      mockedUserPreferences.getPreferences.mockResolvedValue({
        webdav: { url: "", username: "u", password: "p" },
      })

      await expect(testWebdavConnection()).rejects.toThrow(
        "messages:webdav.configIncomplete",
      )
      expect(globalAny.fetch).not.toHaveBeenCalled()
    })

    it("returns true when status is 200", async () => {
      mockedUserPreferences.getPreferences.mockResolvedValue(basePrefs)
      globalAny.fetch.mockResolvedValue({ status: 200 })

      const ok = await testWebdavConnection()

      expect(ok).toBe(true)
      expect(globalAny.fetch).toHaveBeenCalledTimes(1)
      const [url, init] = globalAny.fetch.mock.calls[0]
      expect(typeof url).toBe("string")
      expect((init as RequestInit).method).toBe("GET")
    })

    it("returns true when status is 404 (file missing but auth ok)", async () => {
      mockedUserPreferences.getPreferences.mockResolvedValue(basePrefs)
      globalAny.fetch.mockResolvedValue({ status: 404 })

      const ok = await testWebdavConnection()
      expect(ok).toBe(true)
    })

    it("treats other non-auth 4xx (e.g. 405/409) as connectivity success", async () => {
      mockedUserPreferences.getPreferences.mockResolvedValue(basePrefs)
      globalAny.fetch.mockResolvedValue({ status: 405 })

      const ok = await testWebdavConnection()
      expect(ok).toBe(true)
    })

    it("throws auth error for 401/403", async () => {
      mockedUserPreferences.getPreferences.mockResolvedValue(basePrefs)
      globalAny.fetch.mockResolvedValue({ status: 401 })

      await expect(testWebdavConnection()).rejects.toThrow(
        "messages:webdav.authFailed",
      )
    })

    it("throws connectionFailed for 5xx status codes", async () => {
      mockedUserPreferences.getPreferences.mockResolvedValue(basePrefs)
      globalAny.fetch.mockResolvedValue({ status: 500 })

      await expect(testWebdavConnection()).rejects.toThrow(
        "messages:webdav.connectionFailed:500",
      )
    })
  })

  describe("downloadBackup", () => {
    it("returns response text when status is 200", async () => {
      mockedUserPreferences.getPreferences.mockResolvedValue(basePrefs)
      globalAny.fetch.mockResolvedValue({
        status: 200,
        text: vi.fn().mockResolvedValue('{"ok":true}'),
      })

      const content = await downloadBackup()
      expect(content).toBe('{"ok":true}')
    })

    it("downloadBackupRaw returns raw response text when status is 200", async () => {
      mockedUserPreferences.getPreferences.mockResolvedValue(basePrefs)
      globalAny.fetch.mockResolvedValue({
        status: 200,
        text: vi.fn().mockResolvedValue('{"raw":true}'),
      })

      const content = await downloadBackupRaw()
      expect(content).toBe('{"raw":true}')
    })

    it("throws configIncomplete when credentials missing", async () => {
      mockedUserPreferences.getPreferences.mockResolvedValue({
        webdav: { url: "", username: "", password: "" },
      })

      await expect(downloadBackup()).rejects.toThrow(
        "messages:webdav.configIncomplete",
      )
    })

    it("throws fileNotFound for 404", async () => {
      mockedUserPreferences.getPreferences.mockResolvedValue(basePrefs)
      globalAny.fetch.mockResolvedValue({ status: 404 })

      await expect(downloadBackup()).rejects.toThrow(
        "messages:webdav.fileNotFound",
      )
    })

    it("throws authFailed for 401/403", async () => {
      mockedUserPreferences.getPreferences.mockResolvedValue(basePrefs)
      globalAny.fetch.mockResolvedValue({ status: 403 })

      await expect(downloadBackup()).rejects.toThrow(
        "messages:webdav.authFailed",
      )
    })

    it("throws downloadFailed for other status codes", async () => {
      mockedUserPreferences.getPreferences.mockResolvedValue(basePrefs)
      globalAny.fetch.mockResolvedValue({ status: 500 })

      await expect(downloadBackup()).rejects.toThrow(
        "messages:webdav.downloadFailed:500",
      )
    })
  })

  describe("uploadBackup", () => {
    it("creates backup dir then uploads successfully", async () => {
      mockedUserPreferences.getPreferences.mockResolvedValue(basePrefs)

      // First call: MKCOL for backup directory
      // Second call: PUT for actual backup file
      globalAny.fetch
        .mockResolvedValueOnce({ status: 201 })
        .mockResolvedValueOnce({ status: 204 })

      const result = await uploadBackup('{"foo":"bar"}')

      expect(result).toBe(true)
      expect(globalAny.fetch).toHaveBeenCalledTimes(2)

      const firstCallUrl = globalAny.fetch.mock.calls[0][0] as string
      const secondCallArgs = globalAny.fetch.mock.calls[1]
      const secondInit = secondCallArgs[1] as RequestInit

      // Ensure PUT request is issued
      expect(secondInit.method).toBe("PUT")
      expect(typeof firstCallUrl).toBe("string")
    })

    it("throws configIncomplete when credentials missing", async () => {
      mockedUserPreferences.getPreferences.mockResolvedValue({
        webdav: { url: "", username: "", password: "" },
      })

      await expect(uploadBackup("{}")).rejects.toThrow(
        "messages:webdav.configIncomplete",
      )
    })

    it("throws authFailed for 401/403 from PUT", async () => {
      mockedUserPreferences.getPreferences.mockResolvedValue(basePrefs)

      globalAny.fetch
        .mockResolvedValueOnce({ status: 201 }) // MKCOL ok
        .mockResolvedValueOnce({ status: 401 }) // PUT unauthorized

      await expect(uploadBackup("{}")).rejects.toThrow(
        "messages:webdav.authFailed",
      )
    })

    it("throws uploadFailed for other error codes from PUT", async () => {
      mockedUserPreferences.getPreferences.mockResolvedValue(basePrefs)

      globalAny.fetch
        .mockResolvedValueOnce({ status: 201 })
        .mockResolvedValueOnce({ status: 500 })

      await expect(uploadBackup("{}")).rejects.toThrow(
        "messages:webdav.uploadFailed:500",
      )
    })
  })
})
