import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"

import { userPreferences } from "~/services/preferences/userPreferences"
import {
  downloadBackup,
  downloadBackupRaw,
  isWebdavFileNotFoundError,
  parseWebdavBackupJson,
  testWebdavConnection,
  uploadBackup,
  WEBDAV_FILE_NOT_FOUND_ERROR_CODE,
  WebdavFileNotFoundError,
} from "~/services/webdav/webdavService"

const {
  mockDecryptWebdavBackupEnvelope,
  mockEncryptWebdavBackupContent,
  mockTryParseEncryptedWebdavBackupEnvelope,
} = vi.hoisted(() => ({
  mockDecryptWebdavBackupEnvelope: vi.fn(),
  mockEncryptWebdavBackupContent: vi.fn(),
  mockTryParseEncryptedWebdavBackupEnvelope: vi.fn(),
}))

vi.mock("~/services/preferences/userPreferences", () => ({
  userPreferences: {
    getPreferences: vi.fn(),
  },
}))

vi.mock("~/services/webdav/webdavBackupEncryption", () => ({
  decryptWebdavBackupEnvelope: mockDecryptWebdavBackupEnvelope,
  encryptWebdavBackupContent: mockEncryptWebdavBackupContent,
  tryParseEncryptedWebdavBackupEnvelope:
    mockTryParseEncryptedWebdavBackupEnvelope,
}))

const mockedUserPreferences = userPreferences as any

const globalAny = globalThis as any
const originalFetch = globalAny.fetch

describe("webdavService", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Fresh fetch mock for each test
    globalAny.fetch = vi.fn()
    mockTryParseEncryptedWebdavBackupEnvelope.mockReturnValue(null)
    mockDecryptWebdavBackupEnvelope.mockResolvedValue('{"decrypted":true}')
    mockEncryptWebdavBackupContent.mockResolvedValue({
      type: "all-api-hub-webdav-backup-encrypted",
      v: 1,
      kdf: "PBKDF2",
      cipher: "AES-GCM",
      iter: 250000,
      salt: "salt",
      iv: "iv",
      ct: "cipher",
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  afterAll(() => {
    if (typeof originalFetch === "undefined") {
      delete globalAny.fetch
      return
    }

    globalAny.fetch = originalFetch
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

  describe("isWebdavFileNotFoundError", () => {
    it("recognizes both typed errors and serialized error objects", () => {
      expect(isWebdavFileNotFoundError(new WebdavFileNotFoundError())).toBe(
        true,
      )
      expect(
        isWebdavFileNotFoundError({
          code: WEBDAV_FILE_NOT_FOUND_ERROR_CODE,
        }),
      ).toBe(true)
      expect(isWebdavFileNotFoundError("missing")).toBe(false)
      expect(isWebdavFileNotFoundError({ code: "OTHER" })).toBe(false)
    })
  })

  describe("parseWebdavBackupJson", () => {
    it("parses valid backup JSON", () => {
      expect(parseWebdavBackupJson('{"version":"2.0"}')).toEqual({
        version: "2.0",
      })
    })

    it("throws a stable WebDAV backup error for malformed JSON", () => {
      expect(() =>
        parseWebdavBackupJson('{"version":"2.0","accounts":"'),
      ).toThrow("messages:webdav.invalidBackupJson")
    })
  })

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

    it("returns true when a collection probe returns WebDAV multistatus", async () => {
      mockedUserPreferences.getPreferences.mockResolvedValue(basePrefs)
      globalAny.fetch.mockResolvedValue({ status: 207 })

      const ok = await testWebdavConnection()

      expect(ok).toBe(true)
      expect(globalAny.fetch).toHaveBeenCalledTimes(1)
      const [url, init] = globalAny.fetch.mock.calls[0]
      expect(typeof url).toBe("string")
      expect((init as RequestInit).method).toBe("PROPFIND")
      expect((init as RequestInit).headers).toEqual(
        expect.objectContaining({
          Authorization: "Basic dXNlcjpwYXNz",
          Depth: "0",
        }),
      )
    })

    it("tests directory-like WebDAV URLs without expanding them to backup files", async () => {
      mockedUserPreferences.getPreferences.mockResolvedValue({
        webdav: {
          ...basePrefs.webdav,
          url: "http://127.0.0.1:1900/configSync/ALL-API-HUB",
        },
      })
      globalAny.fetch.mockResolvedValue({ status: 200 })

      const ok = await testWebdavConnection()

      expect(ok).toBe(true)
      expect(globalAny.fetch).toHaveBeenCalledWith(
        "http://127.0.0.1:1900/configSync/ALL-API-HUB",
        expect.objectContaining({
          method: "PROPFIND",
          headers: expect.objectContaining({
            Depth: "0",
          }),
        }),
      )
    })

    it("keeps using GET for explicit JSON file URLs", async () => {
      mockedUserPreferences.getPreferences.mockResolvedValue({
        webdav: {
          ...basePrefs.webdav,
          url: "https://webdav.example.invalid/backups/export.json",
        },
      })
      globalAny.fetch.mockResolvedValue({ status: 200 })

      const ok = await testWebdavConnection()

      expect(ok).toBe(true)
      expect(globalAny.fetch).toHaveBeenCalledWith(
        "https://webdav.example.invalid/backups/export.json",
        expect.objectContaining({
          headers: expect.not.objectContaining({
            Depth: expect.any(String),
          }),
          method: "GET",
        }),
      )
    })

    it("returns true when explicit JSON file status is 404 (file missing but auth ok)", async () => {
      mockedUserPreferences.getPreferences.mockResolvedValue({
        webdav: {
          ...basePrefs.webdav,
          url: "https://webdav.example.invalid/backups/export.json",
        },
      })
      globalAny.fetch.mockResolvedValue({ status: 404 })

      const ok = await testWebdavConnection()
      expect(ok).toBe(true)
    })

    it("treats other explicit JSON file non-auth 4xx as connectivity success", async () => {
      mockedUserPreferences.getPreferences.mockResolvedValue({
        webdav: {
          ...basePrefs.webdav,
          url: "https://webdav.example.invalid/backups/export.json",
        },
      })
      globalAny.fetch.mockResolvedValue({ status: 405 })

      const ok = await testWebdavConnection()
      expect(ok).toBe(true)
    })

    it("throws auth error for 401/403", async () => {
      mockedUserPreferences.getPreferences.mockResolvedValue(basePrefs)
      globalAny.fetch.mockResolvedValue({ status: 401 })

      const error = await testWebdavConnection().catch((thrown) => thrown)

      expect(error).toBeInstanceOf(Error)
      expect(error.message).toBe("messages:webdav.authFailed")
      expect(error.statusCode).toBe(401)
    })

    it("throws connectionFailed for 5xx status codes", async () => {
      mockedUserPreferences.getPreferences.mockResolvedValue(basePrefs)
      globalAny.fetch.mockResolvedValue({ status: 500 })

      const error = await testWebdavConnection().catch((thrown) => thrown)

      expect(error).toBeInstanceOf(Error)
      expect(error.message).toBe("messages:webdav.connectionFailed")
      expect(error.statusCode).toBe(500)
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

    it("returns response text when status is 206", async () => {
      mockedUserPreferences.getPreferences.mockResolvedValue(basePrefs)
      globalAny.fetch.mockResolvedValue({
        status: 206,
        text: vi.fn().mockResolvedValue('{"partial":true}'),
      })

      const content = await downloadBackup()
      expect(content).toBe('{"partial":true}')
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

      const error = await downloadBackup().catch((thrown) => thrown)

      expect(error).toBeInstanceOf(WebdavFileNotFoundError)
      expect(error.code).toBe(WEBDAV_FILE_NOT_FOUND_ERROR_CODE)
      expect(error.message).toBe("messages:webdav.fileNotFound")
    })

    it("prepares the backup directory before write-like reads", async () => {
      mockedUserPreferences.getPreferences.mockResolvedValue(basePrefs)
      globalAny.fetch
        .mockResolvedValueOnce({ status: 201 })
        .mockResolvedValueOnce({ status: 404 })

      const error = await downloadBackup(undefined, {
        prepareForWrite: true,
      }).catch((thrown) => thrown)

      expect(error).toBeInstanceOf(WebdavFileNotFoundError)
      expect(globalAny.fetch).toHaveBeenCalledTimes(2)
      expect((globalAny.fetch.mock.calls[0][1] as RequestInit).method).toBe(
        "MKCOL",
      )
      expect((globalAny.fetch.mock.calls[1][1] as RequestInit).method).toBe(
        "GET",
      )
    })

    it("treats empty successful prepare-for-write reads as fileNotFound", async () => {
      mockedUserPreferences.getPreferences.mockResolvedValue(basePrefs)
      globalAny.fetch
        .mockResolvedValueOnce({ status: 405 })
        .mockResolvedValueOnce({
          status: 200,
          text: vi.fn().mockResolvedValue(""),
        })

      const error = await downloadBackup(undefined, {
        prepareForWrite: true,
      }).catch((thrown) => thrown)

      expect(error).toBeInstanceOf(WebdavFileNotFoundError)
      expect(error.code).toBe(WEBDAV_FILE_NOT_FOUND_ERROR_CODE)
      expect(globalAny.fetch).toHaveBeenCalledTimes(2)
      expect((globalAny.fetch.mock.calls[0][1] as RequestInit).method).toBe(
        "MKCOL",
      )
      expect((globalAny.fetch.mock.calls[1][1] as RequestInit).method).toBe(
        "GET",
      )
    })

    it("treats Nutstore 409 AncestorsNotFound as fileNotFound", async () => {
      mockedUserPreferences.getPreferences.mockResolvedValue(basePrefs)
      const text = vi
        .fn()
        .mockResolvedValue(
          '<?xml version="1.0"?><d:error><s:exception>AncestorsNotFound</s:exception></d:error>',
        )
      globalAny.fetch.mockResolvedValue({
        status: 409,
        text,
      })

      const error = await downloadBackup().catch((thrown) => thrown)

      expect(text).toHaveBeenCalledTimes(1)
      expect(error).toBeInstanceOf(WebdavFileNotFoundError)
      expect(error.code).toBe(WEBDAV_FILE_NOT_FOUND_ERROR_CODE)
      expect(error.message).toBe("messages:webdav.fileNotFound")
    })

    it("keeps unrelated 409 responses as downloadFailed", async () => {
      mockedUserPreferences.getPreferences.mockResolvedValue(basePrefs)
      globalAny.fetch.mockResolvedValue({
        status: 409,
        text: vi
          .fn()
          .mockResolvedValue(
            '<?xml version="1.0"?><d:error><s:exception>Conflict</s:exception></d:error>',
          ),
      })

      await expect(downloadBackup()).rejects.toThrow(
        "messages:webdav.downloadFailed",
      )
    })

    it("throws authFailed for 401/403", async () => {
      mockedUserPreferences.getPreferences.mockResolvedValue(basePrefs)
      globalAny.fetch.mockResolvedValue({ status: 403 })

      const error = await downloadBackup().catch((thrown) => thrown)

      expect(error).toBeInstanceOf(Error)
      expect(error.message).toBe("messages:webdav.authFailed")
      expect(error.statusCode).toBe(403)
    })

    it("throws downloadFailed for other status codes", async () => {
      mockedUserPreferences.getPreferences.mockResolvedValue(basePrefs)
      globalAny.fetch.mockResolvedValue({ status: 500 })

      const error = await downloadBackup().catch((thrown) => thrown)

      expect(error).toBeInstanceOf(Error)
      expect(error.message).toBe("messages:webdav.downloadFailed")
      expect(error.statusCode).toBe(500)
    })

    it("treats unreadable 409 bodies as a generic download failure", async () => {
      mockedUserPreferences.getPreferences.mockResolvedValue(basePrefs)
      globalAny.fetch.mockResolvedValue({
        status: 409,
        text: vi.fn().mockRejectedValue(new Error("body stream failed")),
      })

      await expect(downloadBackup()).rejects.toThrow(
        "messages:webdav.downloadFailed",
      )
    })

    it("decrypts encrypted envelopes with the stored password", async () => {
      mockedUserPreferences.getPreferences.mockResolvedValue({
        webdav: {
          ...basePrefs.webdav,
          backupEncryptionEnabled: true,
          backupEncryptionPassword: "stored-secret",
        },
      })
      globalAny.fetch.mockResolvedValue({
        status: 200,
        text: vi.fn().mockResolvedValue('{"encrypted":true}'),
      })
      mockTryParseEncryptedWebdavBackupEnvelope.mockReturnValue({
        type: "all-api-hub-webdav-backup-encrypted",
        v: 1,
        kdf: "PBKDF2",
        cipher: "AES-GCM",
        iter: 250000,
        salt: "salt",
        iv: "iv",
        ct: "cipher",
      })

      await expect(downloadBackup()).resolves.toBe('{"decrypted":true}')
      expect(mockDecryptWebdavBackupEnvelope).toHaveBeenCalledWith({
        envelope: {
          type: "all-api-hub-webdav-backup-encrypted",
          v: 1,
          kdf: "PBKDF2",
          cipher: "AES-GCM",
          iter: 250000,
          salt: "salt",
          iv: "iv",
          ct: "cipher",
        },
        password: "stored-secret",
      })
    })

    it("throws when an encrypted backup is downloaded without a stored decrypt password", async () => {
      mockedUserPreferences.getPreferences.mockResolvedValue({
        webdav: {
          ...basePrefs.webdav,
          backupEncryptionEnabled: true,
          backupEncryptionPassword: "   ",
        },
      })
      globalAny.fetch.mockResolvedValue({
        status: 200,
        text: vi.fn().mockResolvedValue('{"encrypted":true}'),
      })
      mockTryParseEncryptedWebdavBackupEnvelope.mockReturnValue({
        type: "all-api-hub-webdav-backup-encrypted",
        v: 1,
        kdf: "PBKDF2",
        cipher: "AES-GCM",
        iter: 250000,
        salt: "salt",
        iv: "iv",
        ct: "cipher",
      })

      await expect(downloadBackup()).rejects.toThrow(
        "messages:webdav.decryptFailedNoPassword",
      )
      expect(mockDecryptWebdavBackupEnvelope).not.toHaveBeenCalled()
    })

    it("throws a localized decrypt failure when decryption fails", async () => {
      mockedUserPreferences.getPreferences.mockResolvedValue(basePrefs)
      globalAny.fetch.mockResolvedValue({
        status: 200,
        text: vi.fn().mockResolvedValue('{"encrypted":true}'),
      })
      mockTryParseEncryptedWebdavBackupEnvelope.mockReturnValue({
        type: "all-api-hub-webdav-backup-encrypted",
        v: 1,
        kdf: "PBKDF2",
        cipher: "AES-GCM",
        iter: 250000,
        salt: "salt",
        iv: "iv",
        ct: "cipher",
      })
      mockDecryptWebdavBackupEnvelope.mockRejectedValueOnce(
        new Error("wrong password"),
      )

      await expect(downloadBackup()).rejects.toThrow(
        "messages:webdav.decryptFailed",
      )
    })
  })

  describe("uploadBackup", () => {
    it("starts stale temp cleanup without delaying the upload", async () => {
      mockedUserPreferences.getPreferences.mockResolvedValue(basePrefs)
      vi.setSystemTime(new Date("2026-05-31T04:15:00.000Z"))
      let resolveCleanupResponse: (response: {
        status: number
        text: () => Promise<string>
      }) => void = () => {}
      const cleanupResponse = new Promise<{
        status: number
        text: () => Promise<string>
      }>((resolve) => {
        resolveCleanupResponse = resolve
      })

      globalAny.fetch
        .mockResolvedValueOnce({ status: 201 })
        .mockReturnValueOnce(cleanupResponse)
        .mockResolvedValueOnce({ status: 204 })
        .mockResolvedValueOnce({
          status: 200,
          text: vi.fn().mockResolvedValue('{"cleanup":true}'),
        })
        .mockResolvedValueOnce({ status: 201 })

      await expect(uploadBackup('{"cleanup":true}')).resolves.toBe(true)

      expect((globalAny.fetch.mock.calls[1][1] as RequestInit).method).toBe(
        "PROPFIND",
      )
      expect((globalAny.fetch.mock.calls[2][1] as RequestInit).method).toBe(
        "PUT",
      )
      expect((globalAny.fetch.mock.calls[3][1] as RequestInit).method).toBe(
        "GET",
      )
      expect((globalAny.fetch.mock.calls[4][1] as RequestInit).method).toBe(
        "MOVE",
      )

      resolveCleanupResponse({
        status: 207,
        text: vi.fn().mockResolvedValue(`<?xml version="1.0" encoding="utf-8"?>
        <d:multistatus xmlns:d="DAV:">
          <d:response>
            <d:href>/webdav/all-api-hub-backup/.all-api-hub-1-0.json.tmp.20260529T041400Z.oldone</d:href>
          </d:response>
          <d:response>
            <d:href>/webdav/all-api-hub-backup/.all-api-hub-1-0.json.tmp.20260531T041400Z.newone</d:href>
          </d:response>
          <d:response>
            <d:href>/webdav/all-api-hub-backup/all-api-hub-1-0.json</d:href>
          </d:response>
        </d:multistatus>`),
      })
      await vi.waitFor(() => {
        expect(globalAny.fetch.mock.calls[5][0]).toBe(
          "https://example.com/webdav/all-api-hub-backup/.all-api-hub-1-0.json.tmp.20260529T041400Z.oldone",
        )
      })
      expect((globalAny.fetch.mock.calls[5][1] as RequestInit).method).toBe(
        "DELETE",
      )
      expect(globalAny.fetch.mock.calls[5][0]).toBe(
        "https://example.com/webdav/all-api-hub-backup/.all-api-hub-1-0.json.tmp.20260529T041400Z.oldone",
      )
      expect(
        globalAny.fetch.mock.calls.some(([url]: [unknown]) =>
          String(url).includes("20260531T041400Z.newone"),
        ),
      ).toBe(false)
    })

    it("continues uploading when stale temp cleanup is unsupported", async () => {
      mockedUserPreferences.getPreferences.mockResolvedValue(basePrefs)

      globalAny.fetch
        .mockResolvedValueOnce({ status: 201 })
        .mockResolvedValueOnce({
          status: 405,
          text: vi.fn().mockResolvedValue(""),
        })
        .mockResolvedValueOnce({ status: 204 })
        .mockResolvedValueOnce({
          status: 200,
          text: vi.fn().mockResolvedValue('{"ok":true}'),
        })
        .mockResolvedValueOnce({ status: 201 })

      await expect(uploadBackup('{"ok":true}')).resolves.toBe(true)

      expect((globalAny.fetch.mock.calls[1][1] as RequestInit).method).toBe(
        "PROPFIND",
      )
      expect((globalAny.fetch.mock.calls[2][1] as RequestInit).method).toBe(
        "PUT",
      )
    })

    it("uses Math.random for temp names when crypto random values are unavailable", async () => {
      mockedUserPreferences.getPreferences.mockResolvedValue(basePrefs)
      vi.setSystemTime(new Date("2026-05-31T04:15:00.000Z"))
      vi.stubGlobal("crypto", {})
      vi.spyOn(Math, "random").mockReturnValueOnce(0.123456789)

      globalAny.fetch
        .mockResolvedValueOnce({ status: 201 })
        .mockResolvedValueOnce({ status: 405 })
        .mockResolvedValueOnce({ status: 204 })
        .mockResolvedValueOnce({
          status: 200,
          text: vi.fn().mockResolvedValue('{"random":true}'),
        })
        .mockResolvedValueOnce({ status: 201 })

      await expect(uploadBackup('{"random":true}')).resolves.toBe(true)

      expect(globalAny.fetch.mock.calls[2][0]).toBe(
        "https://example.com/webdav/all-api-hub-backup/all-api-hub-1-0.json.tmp.20260531T041500Z.4fzzzxjylrx",
      )
    })

    it("uses non-hidden temp file names for provider compatibility", async () => {
      mockedUserPreferences.getPreferences.mockResolvedValue(basePrefs)

      globalAny.fetch
        .mockResolvedValueOnce({ status: 201 })
        .mockResolvedValueOnce({ status: 405 })
        .mockResolvedValueOnce({ status: 204 })
        .mockResolvedValueOnce({
          status: 200,
          text: vi.fn().mockResolvedValue('{"visibleTemp":true}'),
        })
        .mockResolvedValueOnce({ status: 201 })

      await expect(uploadBackup('{"visibleTemp":true}')).resolves.toBe(true)

      expect(globalAny.fetch.mock.calls[2][0]).toMatch(
        /^https:\/\/example\.com\/webdav\/all-api-hub-backup\/all-api-hub-1-0\.json\.tmp\.\d{8}T\d{6}Z\.[a-z0-9]+$/,
      )
    })

    it("ignores temp files with impossible timestamp dates during cleanup", async () => {
      mockedUserPreferences.getPreferences.mockResolvedValue(basePrefs)
      vi.setSystemTime(new Date("2026-05-31T04:15:00.000Z"))

      globalAny.fetch
        .mockResolvedValueOnce({ status: 201 })
        .mockResolvedValueOnce({
          status: 207,
          text: vi.fn()
            .mockResolvedValue(`<?xml version="1.0" encoding="utf-8"?>
        <d:multistatus xmlns:d="DAV:">
          <d:response>
            <d:href>/webdav/all-api-hub-backup/.all-api-hub-1-0.json.tmp.20261301T000000Z.invaliddate</d:href>
          </d:response>
        </d:multistatus>`),
        })
        .mockResolvedValueOnce({ status: 204 })
        .mockResolvedValueOnce({
          status: 200,
          text: vi.fn().mockResolvedValue('{"invalidDate":true}'),
        })
        .mockResolvedValueOnce({ status: 201 })

      await expect(uploadBackup('{"invalidDate":true}')).resolves.toBe(true)

      expect(
        globalAny.fetch.mock.calls.some(
          ([url, init]: [unknown, RequestInit]) =>
            String(url).includes("20261301T000000Z.invaliddate") &&
            init?.method === "DELETE",
        ),
      ).toBe(false)
      expect((globalAny.fetch.mock.calls[2][1] as RequestInit).method).toBe(
        "PUT",
      )
    })

    it("ignores stale temp hrefs outside the backup collection", async () => {
      mockedUserPreferences.getPreferences.mockResolvedValue(basePrefs)
      vi.setSystemTime(new Date("2026-05-31T04:15:00.000Z"))

      globalAny.fetch
        .mockResolvedValueOnce({ status: 201 })
        .mockResolvedValueOnce({
          status: 207,
          text: vi.fn()
            .mockResolvedValue(`<?xml version="1.0" encoding="utf-8"?>
        <d:multistatus xmlns:d="DAV:">
          <d:response>
            <d:href>/webdav/other/.all-api-hub-1-0.json.tmp.20260529T041400Z.sibling</d:href>
          </d:response>
        </d:multistatus>`),
        })
        .mockResolvedValueOnce({ status: 204 })
        .mockResolvedValueOnce({
          status: 200,
          text: vi.fn().mockResolvedValue('{"outside":true}'),
        })
        .mockResolvedValueOnce({ status: 201 })

      await expect(uploadBackup('{"outside":true}')).resolves.toBe(true)

      expect(
        globalAny.fetch.mock.calls.some(
          ([url, init]: [unknown, RequestInit]) =>
            String(url).includes("/webdav/other/") && init?.method === "DELETE",
        ),
      ).toBe(false)
      expect((globalAny.fetch.mock.calls[2][1] as RequestInit).method).toBe(
        "PUT",
      )
    })

    it("ignores stale temp hrefs that resolve outside the WebDAV origin", async () => {
      mockedUserPreferences.getPreferences.mockResolvedValue(basePrefs)
      vi.setSystemTime(new Date("2026-05-31T04:15:00.000Z"))

      globalAny.fetch
        .mockResolvedValueOnce({ status: 201 })
        .mockResolvedValueOnce({
          status: 207,
          text: vi.fn()
            .mockResolvedValue(`<?xml version="1.0" encoding="utf-8"?>
        <d:multistatus xmlns:d="DAV:">
          <d:response>
            <d:href>https://other.example.com/webdav/all-api-hub-backup/.all-api-hub-1-0.json.tmp.20260529T041400Z.other</d:href>
          </d:response>
        </d:multistatus>`),
        })
        .mockResolvedValueOnce({ status: 204 })
        .mockResolvedValueOnce({
          status: 200,
          text: vi.fn().mockResolvedValue('{"origin":true}'),
        })
        .mockResolvedValueOnce({ status: 201 })

      await expect(uploadBackup('{"origin":true}')).resolves.toBe(true)

      expect(
        globalAny.fetch.mock.calls.some(
          ([url, init]: [unknown, RequestInit]) =>
            String(url).startsWith("https://other.example.com/") &&
            init?.method === "DELETE",
        ),
      ).toBe(false)
      expect((globalAny.fetch.mock.calls[2][1] as RequestInit).method).toBe(
        "PUT",
      )
    })

    it("ignores nested stale temp hrefs under the backup collection", async () => {
      mockedUserPreferences.getPreferences.mockResolvedValue(basePrefs)
      vi.setSystemTime(new Date("2026-05-31T04:15:00.000Z"))

      globalAny.fetch
        .mockResolvedValueOnce({ status: 201 })
        .mockResolvedValueOnce({
          status: 207,
          text: vi.fn()
            .mockResolvedValue(`<?xml version="1.0" encoding="utf-8"?>
        <d:multistatus xmlns:d="DAV:">
          <d:response>
            <d:href>/webdav/all-api-hub-backup/nested/.all-api-hub-1-0.json.tmp.20260529T041400Z.nested</d:href>
          </d:response>
        </d:multistatus>`),
        })
        .mockResolvedValueOnce({ status: 204 })
        .mockResolvedValueOnce({
          status: 200,
          text: vi.fn().mockResolvedValue('{"nested":true}'),
        })
        .mockResolvedValueOnce({ status: 201 })

      await expect(uploadBackup('{"nested":true}')).resolves.toBe(true)

      expect(
        globalAny.fetch.mock.calls.some(
          ([url, init]: [unknown, RequestInit]) =>
            String(url).includes("/nested/") && init?.method === "DELETE",
        ),
      ).toBe(false)
      expect((globalAny.fetch.mock.calls[2][1] as RequestInit).method).toBe(
        "PUT",
      )
    })

    it("ignores stale temp cleanup when the configured collection URL cannot resolve hrefs", async () => {
      mockedUserPreferences.getPreferences.mockResolvedValue(basePrefs)
      vi.setSystemTime(new Date("2026-05-31T04:15:00.000Z"))

      globalAny.fetch
        .mockResolvedValueOnce({ status: 201 })
        .mockResolvedValueOnce({
          status: 207,
          text: vi.fn()
            .mockResolvedValue(`<?xml version="1.0" encoding="utf-8"?>
        <d:multistatus xmlns:d="DAV:">
          <d:response>
            <d:href>/.custom.json.tmp.20260529T041400Z.invalidbase</d:href>
          </d:response>
        </d:multistatus>`),
        })
        .mockResolvedValueOnce({ status: 204 })
        .mockResolvedValueOnce({
          status: 200,
          text: vi.fn().mockResolvedValue('{"invalidBase":true}'),
        })
        .mockResolvedValueOnce({ status: 201 })

      await expect(
        uploadBackup('{"invalidBase":true}', {
          url: "relative/custom.json",
        }),
      ).resolves.toBe(true)

      expect(
        globalAny.fetch.mock.calls.some(
          ([url, init]: [unknown, RequestInit]) =>
            String(url).includes("invalidbase") && init?.method === "DELETE",
        ),
      ).toBe(false)
    })

    it("uploads to a temp file, verifies it, and moves it into place", async () => {
      mockedUserPreferences.getPreferences.mockResolvedValue(basePrefs)

      globalAny.fetch
        .mockResolvedValueOnce({ status: 201 })
        .mockResolvedValueOnce({ status: 405 })
        .mockResolvedValueOnce({ status: 204 })
        .mockResolvedValueOnce({
          status: 200,
          text: vi.fn().mockResolvedValue('{"foo":"bar"}'),
        })
        .mockResolvedValueOnce({ status: 201 })

      const result = await uploadBackup('{"foo":"bar"}')

      expect(result).toBe(true)
      expect(globalAny.fetch).toHaveBeenCalledTimes(5)

      const [putUrl, putInit] = globalAny.fetch.mock.calls[2]
      const [tempUrl, getInit] = globalAny.fetch.mock.calls[3]
      const [moveUrl, moveInit] = globalAny.fetch.mock.calls[4]

      expect((putInit as RequestInit).method).toBe("PUT")
      expect((putInit as RequestInit).body).toBe('{"foo":"bar"}')
      expect(String(tempUrl)).toMatch(
        /^https:\/\/example\.com\/webdav\/all-api-hub-backup\/all-api-hub-1-0\.json\.tmp\.\d{8}T\d{6}Z\.[a-z0-9]+$/,
      )
      expect(putUrl).toBe(tempUrl)
      expect((getInit as RequestInit).method).toBe("GET")
      expect(moveUrl).toBe(tempUrl)
      expect((moveInit as RequestInit).method).toBe("MOVE")
      expect((moveInit as RequestInit).headers).toMatchObject({
        Destination:
          "https://example.com/webdav/all-api-hub-backup/all-api-hub-1-0.json",
        Overwrite: "T",
      })
    })

    it("throws authFailed for 401 from temp readback", async () => {
      mockedUserPreferences.getPreferences.mockResolvedValue(basePrefs)
      globalAny.fetch
        .mockResolvedValueOnce({ status: 201 })
        .mockResolvedValueOnce({ status: 405 })
        .mockResolvedValueOnce({ status: 204 })
        .mockResolvedValueOnce({ status: 401 })
        .mockResolvedValueOnce({ status: 204 })

      const error = await uploadBackup('{"readbackAuth":true}').catch(
        (thrown) => thrown,
      )

      expect(error).toBeInstanceOf(Error)
      expect(error.message).toBe("messages:webdav.authFailed")
      expect(error.statusCode).toBe(401)
      expect(globalAny.fetch).toHaveBeenCalledTimes(5)
      expect((globalAny.fetch.mock.calls[3][1] as RequestInit).method).toBe(
        "GET",
      )
      expect((globalAny.fetch.mock.calls[4][1] as RequestInit).method).toBe(
        "DELETE",
      )
      expect(
        globalAny.fetch.mock.calls.some(
          ([, init]: [unknown, RequestInit]) => init?.method === "MOVE",
        ),
      ).toBe(false)
    })

    it("throws authFailed for 403 from MOVE", async () => {
      mockedUserPreferences.getPreferences.mockResolvedValue(basePrefs)
      globalAny.fetch
        .mockResolvedValueOnce({ status: 201 })
        .mockResolvedValueOnce({ status: 405 })
        .mockResolvedValueOnce({ status: 204 })
        .mockResolvedValueOnce({
          status: 200,
          text: vi.fn().mockResolvedValue('{"moveAuth":true}'),
        })
        .mockResolvedValueOnce({ status: 403 })
        .mockResolvedValueOnce({ status: 204 })

      const error = await uploadBackup('{"moveAuth":true}').catch(
        (thrown) => thrown,
      )

      expect(error).toBeInstanceOf(Error)
      expect(error.message).toBe("messages:webdav.authFailed")
      expect(error.statusCode).toBe(403)
      expect(globalAny.fetch).toHaveBeenCalledTimes(6)
      expect((globalAny.fetch.mock.calls[4][1] as RequestInit).method).toBe(
        "MOVE",
      )
      expect((globalAny.fetch.mock.calls[5][1] as RequestInit).method).toBe(
        "DELETE",
      )
    })

    it("falls back by deleting the existing destination when Nutstore rejects overwrite MOVE with 409", async () => {
      mockedUserPreferences.getPreferences.mockResolvedValue(basePrefs)
      globalAny.fetch
        .mockResolvedValueOnce({ status: 201 })
        .mockResolvedValueOnce({ status: 405 })
        .mockResolvedValueOnce({ status: 204 })
        .mockResolvedValueOnce({
          status: 200,
          text: vi.fn().mockResolvedValue('{"nutstore":true}'),
        })
        .mockResolvedValueOnce({ status: 409 })
        .mockResolvedValueOnce({ status: 204 })
        .mockResolvedValueOnce({ status: 201 })

      await expect(uploadBackup('{"nutstore":true}')).resolves.toBe(true)

      const officialUrl =
        "https://example.com/webdav/all-api-hub-backup/all-api-hub-1-0.json"
      expect(globalAny.fetch).toHaveBeenCalledTimes(7)
      expect((globalAny.fetch.mock.calls[4][1] as RequestInit).method).toBe(
        "MOVE",
      )
      expect(globalAny.fetch.mock.calls[5][0]).toBe(officialUrl)
      expect((globalAny.fetch.mock.calls[5][1] as RequestInit).method).toBe(
        "DELETE",
      )
      expect(globalAny.fetch.mock.calls[6][0]).toBe(
        globalAny.fetch.mock.calls[4][0],
      )
      expect((globalAny.fetch.mock.calls[6][1] as RequestInit).method).toBe(
        "MOVE",
      )
      expect(
        (globalAny.fetch.mock.calls[6][1] as RequestInit).headers,
      ).toMatchObject({
        Destination: officialUrl,
        Overwrite: "T",
      })
    })

    it("falls back by deleting the existing destination when cstcloud rejects overwrite MOVE with 500", async () => {
      mockedUserPreferences.getPreferences.mockResolvedValue(basePrefs)
      globalAny.fetch
        .mockResolvedValueOnce({ status: 201 })
        .mockResolvedValueOnce({ status: 405 })
        .mockResolvedValueOnce({ status: 204 })
        .mockResolvedValueOnce({
          status: 200,
          text: vi.fn().mockResolvedValue('{"cstcloud":true}'),
        })
        .mockResolvedValueOnce({ status: 500 })
        .mockResolvedValueOnce({ status: 204 })
        .mockResolvedValueOnce({ status: 201 })

      await expect(uploadBackup('{"cstcloud":true}')).resolves.toBe(true)

      const officialUrl =
        "https://example.com/webdav/all-api-hub-backup/all-api-hub-1-0.json"
      expect(globalAny.fetch).toHaveBeenCalledTimes(7)
      expect((globalAny.fetch.mock.calls[3][1] as RequestInit).method).toBe(
        "GET",
      )
      expect((globalAny.fetch.mock.calls[4][1] as RequestInit).method).toBe(
        "MOVE",
      )
      expect(globalAny.fetch.mock.calls[5][0]).toBe(officialUrl)
      expect((globalAny.fetch.mock.calls[5][1] as RequestInit).method).toBe(
        "DELETE",
      )
      expect(globalAny.fetch.mock.calls[6][0]).toBe(
        globalAny.fetch.mock.calls[4][0],
      )
      expect((globalAny.fetch.mock.calls[6][1] as RequestInit).method).toBe(
        "MOVE",
      )
      expect(
        (globalAny.fetch.mock.calls[6][1] as RequestInit).headers,
      ).toMatchObject({
        Destination: officialUrl,
        Overwrite: "T",
      })
    })

    it("reports safe commit failure when the Nutstore overwrite fallback delete fails", async () => {
      mockedUserPreferences.getPreferences.mockResolvedValue(basePrefs)
      globalAny.fetch
        .mockResolvedValueOnce({ status: 201 })
        .mockResolvedValueOnce({ status: 405 })
        .mockResolvedValueOnce({ status: 204 })
        .mockResolvedValueOnce({
          status: 200,
          text: vi.fn().mockResolvedValue('{"nutstoreDelete":true}'),
        })
        .mockResolvedValueOnce({ status: 409 })
        .mockResolvedValueOnce({ status: 500 })
        .mockResolvedValueOnce({ status: 204 })

      const error = await uploadBackup('{"nutstoreDelete":true}').catch(
        (thrown) => thrown,
      )

      expect(error).toBeInstanceOf(Error)
      expect(error.message).toBe("messages:webdav.safeCommitFailed")
      expect(error.statusCode).toBe(500)
      expect(globalAny.fetch).toHaveBeenCalledTimes(7)
      expect((globalAny.fetch.mock.calls[4][1] as RequestInit).method).toBe(
        "MOVE",
      )
      expect((globalAny.fetch.mock.calls[5][1] as RequestInit).method).toBe(
        "DELETE",
      )
      expect((globalAny.fetch.mock.calls[6][1] as RequestInit).method).toBe(
        "DELETE",
      )
    })

    it("reports auth failure when the Nutstore overwrite fallback delete is unauthorized", async () => {
      mockedUserPreferences.getPreferences.mockResolvedValue(basePrefs)
      globalAny.fetch
        .mockResolvedValueOnce({ status: 201 })
        .mockResolvedValueOnce({ status: 405 })
        .mockResolvedValueOnce({ status: 204 })
        .mockResolvedValueOnce({
          status: 200,
          text: vi.fn().mockResolvedValue('{"nutstoreAuth":true}'),
        })
        .mockResolvedValueOnce({ status: 409 })
        .mockResolvedValueOnce({ status: 403 })
        .mockResolvedValueOnce({ status: 204 })

      const error = await uploadBackup('{"nutstoreAuth":true}').catch(
        (thrown) => thrown,
      )

      expect(error).toBeInstanceOf(Error)
      expect(error.message).toBe("messages:webdav.authFailed")
      expect(error.statusCode).toBe(403)
      expect(globalAny.fetch).toHaveBeenCalledTimes(7)
      expect((globalAny.fetch.mock.calls[4][1] as RequestInit).method).toBe(
        "MOVE",
      )
      expect((globalAny.fetch.mock.calls[5][1] as RequestInit).method).toBe(
        "DELETE",
      )
      expect((globalAny.fetch.mock.calls[6][1] as RequestInit).method).toBe(
        "DELETE",
      )
    })

    it("does not put directly to the official backup URL", async () => {
      mockedUserPreferences.getPreferences.mockResolvedValue(basePrefs)

      globalAny.fetch
        .mockResolvedValueOnce({ status: 201 })
        .mockResolvedValueOnce({ status: 405 })
        .mockResolvedValueOnce({ status: 204 })
        .mockResolvedValueOnce({
          status: 200,
          text: vi.fn().mockResolvedValue('{"safe":true}'),
        })
        .mockResolvedValueOnce({ status: 201 })

      await uploadBackup('{"safe":true}')

      const officialUrl =
        "https://example.com/webdav/all-api-hub-backup/all-api-hub-1-0.json"
      const officialPut = globalAny.fetch.mock.calls.find(
        ([url, init]: [unknown, RequestInit]) =>
          url === officialUrl && init?.method === "PUT",
      )

      expect(officialPut).toBeUndefined()
    })

    it("deletes plaintext temp readback mismatch and does not move", async () => {
      mockedUserPreferences.getPreferences.mockResolvedValue(basePrefs)
      globalAny.fetch
        .mockResolvedValueOnce({ status: 201 })
        .mockResolvedValueOnce({ status: 405 })
        .mockResolvedValueOnce({ status: 204 })
        .mockResolvedValueOnce({
          status: 200,
          text: vi.fn().mockResolvedValue('{"expected":false}'),
        })
        .mockResolvedValueOnce({ status: 204 })

      const error = await uploadBackup('{"expected":true}').catch(
        (thrown) => thrown,
      )

      expect(error).toBeInstanceOf(Error)
      expect(error.message).toBe("messages:webdav.uploadVerificationFailed")
      expect(globalAny.fetch).toHaveBeenCalledTimes(5)
      expect((globalAny.fetch.mock.calls[4][1] as RequestInit).method).toBe(
        "DELETE",
      )
      expect(
        globalAny.fetch.mock.calls.some(
          ([, init]: [unknown, RequestInit]) => init?.method === "MOVE",
        ),
      ).toBe(false)
    })

    it("deletes encrypted temp readback mismatch and does not move", async () => {
      mockedUserPreferences.getPreferences.mockResolvedValue({
        webdav: {
          ...basePrefs.webdav,
          backupEncryptionEnabled: true,
          backupEncryptionPassword: "secret",
        },
      })
      const uploadedEnvelope = {
        type: "all-api-hub-webdav-backup-encrypted",
        v: 1,
        kdf: "PBKDF2",
        cipher: "AES-GCM",
        iter: 250000,
        salt: "salt",
        iv: "iv",
        ct: "cipher",
      }
      const readbackEnvelope = {
        ...uploadedEnvelope,
        ct: "different-cipher",
      }
      const uploadedContent = JSON.stringify(uploadedEnvelope)
      const readbackContent = JSON.stringify(readbackEnvelope)
      mockEncryptWebdavBackupContent.mockResolvedValueOnce(uploadedEnvelope)
      mockTryParseEncryptedWebdavBackupEnvelope.mockImplementation((content) =>
        content === uploadedContent || content === readbackContent
          ? JSON.parse(content)
          : null,
      )
      globalAny.fetch
        .mockResolvedValueOnce({ status: 201 })
        .mockResolvedValueOnce({ status: 405 })
        .mockResolvedValueOnce({ status: 204 })
        .mockResolvedValueOnce({
          status: 200,
          text: vi.fn().mockResolvedValue(readbackContent),
        })
        .mockResolvedValueOnce({ status: 204 })

      const error = await uploadBackup('{"secure":true}').catch(
        (thrown) => thrown,
      )

      expect(error).toBeInstanceOf(Error)
      expect(error.message).toBe("messages:webdav.uploadVerificationFailed")
      expect((globalAny.fetch.mock.calls[2][1] as RequestInit).body).toBe(
        uploadedContent,
      )
      expect((globalAny.fetch.mock.calls[4][1] as RequestInit).method).toBe(
        "DELETE",
      )
      expect(
        globalAny.fetch.mock.calls.some(
          ([, init]: [unknown, RequestInit]) => init?.method === "MOVE",
        ),
      ).toBe(false)
    })

    it("maps non-auth temp readback HTTP failures to upload verification failure", async () => {
      mockedUserPreferences.getPreferences.mockResolvedValue(basePrefs)
      globalAny.fetch
        .mockResolvedValueOnce({ status: 201 })
        .mockResolvedValueOnce({ status: 405 })
        .mockResolvedValueOnce({ status: 204 })
        .mockResolvedValueOnce({ status: 500 })
        .mockResolvedValueOnce({ status: 204 })

      const error = await uploadBackup('{"readback":true}').catch(
        (thrown) => thrown,
      )

      expect(error).toBeInstanceOf(Error)
      expect(error.message).toBe("messages:webdav.uploadVerificationFailed")
      expect(error.statusCode).toBe(500)
      expect(globalAny.fetch).toHaveBeenCalledTimes(5)
      expect((globalAny.fetch.mock.calls[4][1] as RequestInit).method).toBe(
        "DELETE",
      )
      expect(
        globalAny.fetch.mock.calls.some(
          ([, init]: [unknown, RequestInit]) => init?.method === "MOVE",
        ),
      ).toBe(false)
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
        .mockResolvedValueOnce({ status: 201 })
        .mockResolvedValueOnce({ status: 405 })
        .mockResolvedValueOnce({ status: 401 })

      const error = await uploadBackup("{}").catch((thrown) => thrown)

      expect(error).toBeInstanceOf(Error)
      expect(error.message).toBe("messages:webdav.authFailed")
      expect(error.statusCode).toBe(401)
      expect(globalAny.fetch).toHaveBeenCalledTimes(3)
      expect((globalAny.fetch.mock.calls[2][1] as RequestInit).method).toBe(
        "PUT",
      )
    })

    it("throws uploadFailed for other error codes from PUT", async () => {
      mockedUserPreferences.getPreferences.mockResolvedValue(basePrefs)

      globalAny.fetch
        .mockResolvedValueOnce({ status: 201 })
        .mockResolvedValueOnce({ status: 405 })
        .mockResolvedValueOnce({ status: 500 })

      const error = await uploadBackup("{}").catch((thrown) => thrown)

      expect(error).toBeInstanceOf(Error)
      expect(error.message).toBe("messages:webdav.uploadFailed")
      expect(error.statusCode).toBe(500)
      expect(globalAny.fetch).toHaveBeenCalledTimes(3)
      expect((globalAny.fetch.mock.calls[2][1] as RequestInit).method).toBe(
        "PUT",
      )
    })

    it("encrypts backup content before uploading when backup encryption is enabled", async () => {
      mockedUserPreferences.getPreferences.mockResolvedValue({
        webdav: {
          ...basePrefs.webdav,
          backupEncryptionEnabled: true,
          backupEncryptionPassword: "secret",
        },
      })

      globalAny.fetch
        .mockResolvedValueOnce({ status: 201 })
        .mockResolvedValueOnce({ status: 405 })
        .mockResolvedValueOnce({ status: 204 })
        .mockResolvedValueOnce({
          status: 200,
          text: vi.fn().mockResolvedValue(
            JSON.stringify({
              type: "all-api-hub-webdav-backup-encrypted",
              v: 1,
              kdf: "PBKDF2",
              cipher: "AES-GCM",
              iter: 250000,
              salt: "salt",
              iv: "iv",
              ct: "cipher",
            }),
          ),
        })
        .mockResolvedValueOnce({ status: 201 })

      await expect(uploadBackup('{"secure":true}')).resolves.toBe(true)
      expect(mockEncryptWebdavBackupContent).toHaveBeenCalledWith({
        content: '{"secure":true}',
        password: "secret",
      })
      expect((globalAny.fetch.mock.calls[2][1] as RequestInit).body).toBe(
        JSON.stringify({
          type: "all-api-hub-webdav-backup-encrypted",
          v: 1,
          kdf: "PBKDF2",
          cipher: "AES-GCM",
          iter: 250000,
          salt: "salt",
          iv: "iv",
          ct: "cipher",
        }),
      )
      expect((globalAny.fetch.mock.calls[4][1] as RequestInit).method).toBe(
        "MOVE",
      )
    })

    it("accepts matching encrypted readback without parsing it as plaintext JSON", async () => {
      mockedUserPreferences.getPreferences.mockResolvedValue({
        webdav: {
          ...basePrefs.webdav,
          backupEncryptionEnabled: true,
          backupEncryptionPassword: "secret",
        },
      })
      const uploadedEnvelope = {
        type: "all-api-hub-webdav-backup-encrypted",
        v: 1,
        kdf: "PBKDF2",
        cipher: "AES-GCM",
        iter: 250000,
        salt: "salt",
        iv: "iv",
        ct: "cipher",
      }
      const uploadedContent = JSON.stringify(uploadedEnvelope)
      mockEncryptWebdavBackupContent.mockResolvedValueOnce(uploadedEnvelope)
      mockTryParseEncryptedWebdavBackupEnvelope.mockImplementation((content) =>
        content === uploadedContent ? uploadedEnvelope : null,
      )
      globalAny.fetch
        .mockResolvedValueOnce({ status: 201 })
        .mockResolvedValueOnce({ status: 405 })
        .mockResolvedValueOnce({ status: 204 })
        .mockResolvedValueOnce({
          status: 200,
          text: vi.fn().mockResolvedValue(uploadedContent),
        })
        .mockResolvedValueOnce({ status: 201 })

      await expect(uploadBackup('{"secure":true}')).resolves.toBe(true)

      expect((globalAny.fetch.mock.calls[4][1] as RequestInit).method).toBe(
        "MOVE",
      )
    })

    it("retries MKCOL with a trailing slash for custom file targets before uploading", async () => {
      mockedUserPreferences.getPreferences.mockResolvedValue(basePrefs)
      globalAny.fetch
        .mockResolvedValueOnce({ status: 409 })
        .mockResolvedValueOnce({ status: 201 })
        .mockResolvedValueOnce({ status: 405 })
        .mockResolvedValueOnce({ status: 204 })
        .mockResolvedValueOnce({
          status: 200,
          text: vi.fn().mockResolvedValue('{"custom":true}'),
        })
        .mockResolvedValueOnce({ status: 201 })

      await expect(
        uploadBackup('{"custom":true}', {
          url: "https://example.com/custom-backups/custom.json",
        }),
      ).resolves.toBe(true)

      expect(globalAny.fetch).toHaveBeenCalledTimes(6)
      expect(globalAny.fetch.mock.calls[0][0]).toBe(
        "https://example.com/custom-backups",
      )
      expect(globalAny.fetch.mock.calls[1][0]).toBe(
        "https://example.com/custom-backups/",
      )
      expect(globalAny.fetch.mock.calls[3][0]).toMatch(
        /^https:\/\/example\.com\/custom-backups\/custom\.json\.tmp\.\d{8}T\d{6}Z\.[a-z0-9]+$/,
      )
      expect(globalAny.fetch.mock.calls[5][0]).toBe(
        globalAny.fetch.mock.calls[3][0],
      )
      expect(
        (globalAny.fetch.mock.calls[5][1] as RequestInit).headers,
      ).toMatchObject({
        Destination: "https://example.com/custom-backups/custom.json",
        Overwrite: "T",
      })
    })

    it("keeps uploads permissive when MKCOL still fails for custom file targets", async () => {
      mockedUserPreferences.getPreferences.mockResolvedValue(basePrefs)
      globalAny.fetch
        .mockResolvedValueOnce({ status: 500 })
        .mockResolvedValueOnce({ status: 500 })
        .mockResolvedValueOnce({ status: 405 })
        .mockResolvedValueOnce({ status: 204 })
        .mockResolvedValueOnce({
          status: 200,
          text: vi.fn().mockResolvedValue('{"stillUploads":true}'),
        })
        .mockResolvedValueOnce({ status: 201 })

      await expect(
        uploadBackup('{"stillUploads":true}', {
          url: "https://example.com/custom-backups/custom.json",
        }),
      ).resolves.toBe(true)

      expect(globalAny.fetch).toHaveBeenCalledTimes(6)
      expect((globalAny.fetch.mock.calls[0][1] as RequestInit).method).toBe(
        "MKCOL",
      )
      expect((globalAny.fetch.mock.calls[1][1] as RequestInit).method).toBe(
        "MKCOL",
      )
      expect((globalAny.fetch.mock.calls[2][1] as RequestInit).method).toBe(
        "PROPFIND",
      )
      expect((globalAny.fetch.mock.calls[3][1] as RequestInit).method).toBe(
        "PUT",
      )
      expect((globalAny.fetch.mock.calls[4][1] as RequestInit).method).toBe(
        "GET",
      )
      expect((globalAny.fetch.mock.calls[5][1] as RequestInit).method).toBe(
        "MOVE",
      )
    })

    it("deletes malformed temp readback, reports verification failure, and does not move", async () => {
      mockedUserPreferences.getPreferences.mockResolvedValue(basePrefs)
      globalAny.fetch
        .mockResolvedValueOnce({ status: 201 })
        .mockResolvedValueOnce({ status: 405 })
        .mockResolvedValueOnce({ status: 204 })
        .mockResolvedValueOnce({
          status: 200,
          text: vi.fn().mockResolvedValue('{"broken":'),
        })
        .mockResolvedValueOnce({ status: 204 })

      const error = await uploadBackup('{"broken":true}').catch(
        (thrown) => thrown,
      )

      expect(error).toBeInstanceOf(Error)
      expect(error.message).toBe("messages:webdav.uploadVerificationFailed")
      expect(globalAny.fetch).toHaveBeenCalledTimes(5)
      expect((globalAny.fetch.mock.calls[4][1] as RequestInit).method).toBe(
        "DELETE",
      )
      expect(
        globalAny.fetch.mock.calls.some(
          ([, init]: [unknown, RequestInit]) => init?.method === "MOVE",
        ),
      ).toBe(false)
    })

    it("deletes matching malformed temp readback after JSON validation fails", async () => {
      mockedUserPreferences.getPreferences.mockResolvedValue(basePrefs)
      globalAny.fetch
        .mockResolvedValueOnce({ status: 201 })
        .mockResolvedValueOnce({ status: 405 })
        .mockResolvedValueOnce({ status: 204 })
        .mockResolvedValueOnce({
          status: 200,
          text: vi.fn().mockResolvedValue('{"broken":'),
        })
        .mockResolvedValueOnce({ status: 204 })

      const error = await uploadBackup('{"broken":').catch((thrown) => thrown)

      expect(error).toBeInstanceOf(Error)
      expect(error.message).toBe("messages:webdav.uploadVerificationFailed")
      expect((globalAny.fetch.mock.calls[4][1] as RequestInit).method).toBe(
        "DELETE",
      )
      expect(
        globalAny.fetch.mock.calls.some(
          ([, init]: [unknown, RequestInit]) => init?.method === "MOVE",
        ),
      ).toBe(false)
    })

    it("deletes temp and reports safe commit failure when MOVE is not supported", async () => {
      mockedUserPreferences.getPreferences.mockResolvedValue(basePrefs)
      globalAny.fetch
        .mockResolvedValueOnce({ status: 201 })
        .mockResolvedValueOnce({ status: 405 })
        .mockResolvedValueOnce({ status: 204 })
        .mockResolvedValueOnce({
          status: 200,
          text: vi.fn().mockResolvedValue('{"move":false}'),
        })
        .mockResolvedValueOnce({ status: 405 })
        .mockResolvedValueOnce({ status: 204 })

      const error = await uploadBackup('{"move":false}').catch(
        (thrown) => thrown,
      )

      expect(error).toBeInstanceOf(Error)
      expect(error.message).toBe("messages:webdav.safeCommitFailed")
      expect(error.statusCode).toBe(405)
      expect(globalAny.fetch).toHaveBeenCalledTimes(6)
      expect((globalAny.fetch.mock.calls[4][1] as RequestInit).method).toBe(
        "MOVE",
      )
      expect((globalAny.fetch.mock.calls[5][1] as RequestInit).method).toBe(
        "DELETE",
      )
    })

    it("preserves safe commit failure when cleanup DELETE rejects", async () => {
      mockedUserPreferences.getPreferences.mockResolvedValue(basePrefs)
      globalAny.fetch
        .mockResolvedValueOnce({ status: 201 })
        .mockResolvedValueOnce({ status: 405 })
        .mockResolvedValueOnce({ status: 204 })
        .mockResolvedValueOnce({
          status: 200,
          text: vi.fn().mockResolvedValue('{"move":false}'),
        })
        .mockResolvedValueOnce({ status: 405 })
        .mockRejectedValueOnce(new Error("cleanup failed"))

      const error = await uploadBackup('{"move":false}').catch(
        (thrown) => thrown,
      )

      expect(error).toBeInstanceOf(Error)
      expect(error.message).toBe("messages:webdav.safeCommitFailed")
      expect(error.statusCode).toBe(405)
      expect(globalAny.fetch).toHaveBeenCalledTimes(6)
      expect((globalAny.fetch.mock.calls[5][1] as RequestInit).method).toBe(
        "DELETE",
      )
    })

    it("throws when encryption is enabled but no upload password is configured", async () => {
      mockedUserPreferences.getPreferences.mockResolvedValue({
        webdav: {
          ...basePrefs.webdav,
          backupEncryptionEnabled: true,
          backupEncryptionPassword: "   ",
        },
      })

      await expect(uploadBackup("{}")).rejects.toThrow(
        "messages:webdav.encryptFailedNoPassword",
      )
      expect(globalAny.fetch).not.toHaveBeenCalled()
      expect(mockEncryptWebdavBackupContent).not.toHaveBeenCalled()
    })
  })
})
