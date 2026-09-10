import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  createEncryptedGithubGistBackup,
  downloadGithubGistBackup,
  getGithubGistSyncConfig,
  GITHUB_GIST_BACKUP_FILE_NAME,
  readGithubGistRemote,
  testGithubGistConnection,
  updateGithubGistBackup,
  uploadGithubGistBackup,
} from "~/services/webdav/githubGistService"
import { CLOUD_SYNC_ERROR_CODES } from "~/types/cloudSync"
import { DEFAULT_WEBDAV_SETTINGS } from "~/types/webdav"

const {
  mockDecryptWebdavBackupEnvelope,
  mockEncryptWebdavBackupContent,
  mockTryParseEncryptedWebdavBackupEnvelope,
} = vi.hoisted(() => ({
  mockDecryptWebdavBackupEnvelope: vi.fn(),
  mockEncryptWebdavBackupContent: vi.fn(),
  mockTryParseEncryptedWebdavBackupEnvelope: vi.fn(),
}))

vi.mock("~/services/webdav/webdavBackupEncryption", () => ({
  decryptWebdavBackupEnvelope: mockDecryptWebdavBackupEnvelope,
  encryptWebdavBackupContent: mockEncryptWebdavBackupContent,
  tryParseEncryptedWebdavBackupEnvelope:
    mockTryParseEncryptedWebdavBackupEnvelope,
}))

function response(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get(name: string) {
        return headers[name.toLowerCase()] ?? null
      },
    },
    json: async () => body,
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
  }
}

function gistResponse(content = '{"version":4}', revision = "rev-1") {
  return {
    id: "gist-1",
    html_url: "https://gist.github.com/example/gist-1",
    public: false,
    updated_at: "2026-09-05T00:00:00Z",
    history: [{ version: revision }],
    files: {
      [GITHUB_GIST_BACKUP_FILE_NAME]: {
        content,
        truncated: false,
      },
    },
  }
}

function truncatedGistResponse(
  rawUrl: unknown = "https://gist.githubusercontent.com/example/raw",
) {
  return {
    ...gistResponse("", "rev-truncated"),
    files: {
      [GITHUB_GIST_BACKUP_FILE_NAME]: {
        truncated: true,
        raw_url: rawUrl,
      },
    },
  }
}

describe("githubGistService", () => {
  beforeEach(() => {
    mockDecryptWebdavBackupEnvelope.mockReset()
    mockEncryptWebdavBackupContent.mockReset()
    mockTryParseEncryptedWebdavBackupEnvelope.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it("reads an existing Secret Gist and sends a bearer token", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(gistResponse()))
    vi.stubGlobal("fetch", fetchMock)

    const remote = await testGithubGistConnection({
      token: "ghp-test-token",
      gistId: "https://gist.github.com/example/gist-1",
    })

    expect(remote).toMatchObject({
      gistId: "gist-1",
      public: false,
      revision: "rev-1",
      rawContent: '{"version":4}',
    })
    const [, init] = fetchMock.mock.calls[0]
    expect((init as RequestInit).headers).toEqual(
      expect.objectContaining({
        Authorization: "Bearer ghp-test-token",
        "X-GitHub-Api-Version": "2022-11-28",
      }),
    )
  })

  it("rejects public, uninitialized, and empty Gists without treating them as empty backups", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(response({ ...gistResponse(), public: true }))
        .mockResolvedValueOnce(
          response({
            ...gistResponse(),
            files: {},
          }),
        )
        .mockResolvedValueOnce(response(gistResponse("   "))),
    )

    await expect(
      readGithubGistRemote({ token: "token", gistId: "gist-1" }),
    ).rejects.toMatchObject({ code: CLOUD_SYNC_ERROR_CODES.PUBLIC_GIST })
    await expect(
      readGithubGistRemote({ token: "token", gistId: "gist-1" }),
    ).rejects.toMatchObject({ code: CLOUD_SYNC_ERROR_CODES.UNINITIALIZED })
    await expect(
      readGithubGistRemote({ token: "token", gistId: "gist-1" }),
    ).rejects.toMatchObject({ code: CLOUD_SYNC_ERROR_CODES.REMOTE_EMPTY })
  })

  it("maps invalid token, rate limit, not found, and network errors to safe codes", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({}, 401))
      .mockResolvedValueOnce(
        response({}, 429, {
          "retry-after": "30",
        }),
      )
      .mockResolvedValueOnce(
        response({}, 403, {
          "retry-after": "30",
        }),
      )
      .mockResolvedValueOnce(response({}, 404))
      .mockRejectedValueOnce(new Error("socket failed"))
    vi.stubGlobal("fetch", fetchMock)

    for (const code of [
      CLOUD_SYNC_ERROR_CODES.INVALID_TOKEN,
      CLOUD_SYNC_ERROR_CODES.RATE_LIMITED,
      CLOUD_SYNC_ERROR_CODES.RATE_LIMITED,
      CLOUD_SYNC_ERROR_CODES.NOT_FOUND,
    ]) {
      await expect(
        readGithubGistRemote({ token: "token", gistId: "gist-1" }),
      ).rejects.toMatchObject({ code })
    }
    await expect(
      readGithubGistRemote({ token: "token", gistId: "gist-1" }),
    ).rejects.toMatchObject({ code: CLOUD_SYNC_ERROR_CODES.NETWORK })

    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(response(truncatedGistResponse()))
        .mockResolvedValueOnce(response({}, 503)),
    )
    await expect(
      readGithubGistRemote({ token: "token", gistId: "gist-1" }),
    ).rejects.toMatchObject({ code: CLOUD_SYNC_ERROR_CODES.REMOTE_UNAVAILABLE })
  })

  it("validates token and accepts only safe Gist identifiers", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)

    for (const config of [
      { token: "", gistId: "gist-1" },
      { token: "token", gistId: "" },
      { token: "token", gistId: "not a gist id" },
      { token: "token", gistId: "https://example.com/gist-1" },
      { token: "token", gistId: "https://gist.github.com/" },
      { token: "token", gistId: "http://[invalid" },
    ]) {
      await expect(readGithubGistRemote(config)).rejects.toMatchObject({
        code: CLOUD_SYNC_ERROR_CODES.CONFIG_INCOMPLETE,
      })
    }

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("maps permission, reset-header, server, and generic HTTP failures", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({}, 403))
      .mockResolvedValueOnce(
        response({}, 403, {
          "x-ratelimit-remaining": "0",
          "x-ratelimit-reset": "123",
        }),
      )
      .mockResolvedValueOnce(response({}, 500))
      .mockResolvedValueOnce(response({}, 400))
    vi.stubGlobal("fetch", fetchMock)

    await expect(
      readGithubGistRemote({ token: "token", gistId: "gist-1" }),
    ).rejects.toMatchObject({ code: CLOUD_SYNC_ERROR_CODES.PERMISSION_DENIED })
    await expect(
      readGithubGistRemote({ token: "token", gistId: "gist-1" }),
    ).rejects.toMatchObject({
      code: CLOUD_SYNC_ERROR_CODES.RATE_LIMITED,
      retryAt: 123_000,
    })
    await expect(
      readGithubGistRemote({ token: "token", gistId: "gist-1" }),
    ).rejects.toMatchObject({ code: CLOUD_SYNC_ERROR_CODES.REMOTE_UNAVAILABLE })
    await expect(
      readGithubGistRemote({ token: "token", gistId: "gist-1" }),
    ).rejects.toMatchObject({ code: CLOUD_SYNC_ERROR_CODES.REMOTE_UNAVAILABLE })
  })

  it("rejects malformed successful API responses as remote corruption", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(response(null))
        .mockResolvedValueOnce(response([])),
    )

    await expect(
      readGithubGistRemote({ token: "token", gistId: "gist-1" }),
    ).rejects.toMatchObject({ code: CLOUD_SYNC_ERROR_CODES.REMOTE_CORRUPTED })
    await expect(
      readGithubGistRemote({ token: "token", gistId: "gist-1" }),
    ).rejects.toMatchObject({ code: CLOUD_SYNC_ERROR_CODES.REMOTE_CORRUPTED })
  })

  it("rejects incomplete files and falls back safely when optional metadata is absent", async () => {
    const validFile = {
      [GITHUB_GIST_BACKUP_FILE_NAME]: { content: "backup", truncated: false },
    }
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(response({ ...gistResponse(), files: null }))
        .mockResolvedValueOnce(
          response({
            ...gistResponse(),
            files: {
              [GITHUB_GIST_BACKUP_FILE_NAME]: { truncated: true },
            },
          }),
        )
        .mockResolvedValueOnce(
          response({
            ...gistResponse(),
            files: {
              [GITHUB_GIST_BACKUP_FILE_NAME]: { truncated: false },
            },
          }),
        )
        .mockResolvedValueOnce(
          response({
            ...gistResponse(),
            id: 123,
            html_url: 123,
            history: [{ version: 123 }],
            updated_at: "fallback-revision",
            files: validFile,
          }),
        )
        .mockResolvedValueOnce(
          response({
            ...gistResponse(),
            id: 123,
            html_url: null,
            history: [{ version: "" }],
            updated_at: 123,
            files: validFile,
          }),
        ),
    )

    for (const expectedCode of [
      CLOUD_SYNC_ERROR_CODES.REMOTE_CORRUPTED,
      CLOUD_SYNC_ERROR_CODES.REMOTE_CORRUPTED,
      CLOUD_SYNC_ERROR_CODES.REMOTE_CORRUPTED,
    ]) {
      await expect(
        readGithubGistRemote({ token: "token", gistId: "gist-1" }),
      ).rejects.toMatchObject({ code: expectedCode })
    }

    await expect(
      readGithubGistRemote({ token: "token", gistId: "gist-1" }),
    ).resolves.toMatchObject({
      gistId: "gist-1",
      htmlUrl: "",
      revision: "fallback-revision",
    })
    await expect(
      readGithubGistRemote({ token: "token", gistId: "gist-1" }),
    ).resolves.toMatchObject({ gistId: "gist-1", htmlUrl: "", revision: "" })
  })

  it("rejects invalid API JSON and unsafe or unreadable truncated files", async () => {
    const invalidJsonResponse = response({})
    invalidJsonResponse.json = async () => {
      throw new Error("invalid JSON")
    }
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(invalidJsonResponse)
        .mockResolvedValueOnce(response(truncatedGistResponse("not a URL")))
        .mockResolvedValueOnce(
          response(truncatedGistResponse("https://example.com/raw")),
        )
        .mockResolvedValueOnce(response(truncatedGistResponse()))
        .mockResolvedValueOnce(response("raw-content"))
        .mockResolvedValueOnce(response(truncatedGistResponse()))
        .mockResolvedValueOnce(response(""))
        .mockResolvedValueOnce(response(truncatedGistResponse()))
        .mockRejectedValueOnce(new Error("raw socket failed")),
    )

    await expect(
      readGithubGistRemote({ token: "token", gistId: "gist-1" }),
    ).rejects.toMatchObject({ code: CLOUD_SYNC_ERROR_CODES.REMOTE_UNAVAILABLE })
    await expect(
      readGithubGistRemote({ token: "token", gistId: "gist-1" }),
    ).rejects.toMatchObject({ code: CLOUD_SYNC_ERROR_CODES.REMOTE_CORRUPTED })
    await expect(
      readGithubGistRemote({ token: "token", gistId: "gist-1" }),
    ).rejects.toMatchObject({ code: CLOUD_SYNC_ERROR_CODES.REMOTE_CORRUPTED })
    await expect(
      readGithubGistRemote({ token: "token", gistId: "gist-1" }),
    ).resolves.toMatchObject({ rawContent: "raw-content" })
    await expect(
      readGithubGistRemote({ token: "token", gistId: "gist-1" }),
    ).rejects.toMatchObject({ code: CLOUD_SYNC_ERROR_CODES.REMOTE_EMPTY })
    await expect(
      readGithubGistRemote({ token: "token", gistId: "gist-1" }),
    ).rejects.toMatchObject({ code: CLOUD_SYNC_ERROR_CODES.NETWORK })
  })

  it("creates an unlisted Gist only after encrypting the payload", async () => {
    const encryptedEnvelope = { type: "encrypted", ct: "ciphertext" }
    mockEncryptWebdavBackupContent.mockResolvedValue(encryptedEnvelope)
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        response(
          {
            id: "gist-1",
            html_url: "https://gist.github.com/example/gist-1",
            public: false,
          },
          201,
        ),
      )
      .mockResolvedValueOnce(
        response(gistResponse(JSON.stringify(encryptedEnvelope))),
      )
    vi.stubGlobal("fetch", fetchMock)

    const remote = await createEncryptedGithubGistBackup('{"version":4}', {
      token: "token",
      gistId: "",
      encryptionPassword: "password",
    })

    expect(remote.public).toBe(false)
    expect(mockEncryptWebdavBackupContent).toHaveBeenCalledWith({
      content: '{"version":4}',
      password: "password",
    })
    const [, init] = fetchMock.mock.calls[0]
    const body = JSON.parse(String((init as RequestInit).body))
    expect(body.public).toBe(false)
    expect(body.files[GITHUB_GIST_BACKUP_FILE_NAME].content).toBe(
      JSON.stringify(encryptedEnvelope),
    )
  })

  it("rejects a blank token and an invalid Secret Gist creation response", async () => {
    mockEncryptWebdavBackupContent.mockResolvedValue({ type: "encrypted" })

    await expect(
      createEncryptedGithubGistBackup('{"version":4}', {
        token: " ",
        gistId: "",
        encryptionPassword: "password",
      }),
    ).rejects.toMatchObject({ code: CLOUD_SYNC_ERROR_CODES.CONFIG_INCOMPLETE })

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({ id: "gist-1", public: true }, 201))
      .mockResolvedValueOnce(response({ public: false }, 201))
    vi.stubGlobal("fetch", fetchMock)

    await expect(
      createEncryptedGithubGistBackup('{"version":4}', {
        token: "token",
        gistId: "",
        encryptionPassword: "password",
      }),
    ).rejects.toMatchObject({ code: CLOUD_SYNC_ERROR_CODES.REMOTE_UNAVAILABLE })
    await expect(
      createEncryptedGithubGistBackup('{"version":4}', {
        token: "token",
        gistId: "",
        encryptionPassword: "password",
      }),
    ).rejects.toMatchObject({ code: CLOUD_SYNC_ERROR_CODES.REMOTE_UNAVAILABLE })
  })

  it("rejects an empty first Gist backup before making an API request", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    mockEncryptWebdavBackupContent.mockResolvedValue("")
    vi.spyOn(JSON, "stringify").mockReturnValueOnce(" ")

    await expect(
      createEncryptedGithubGistBackup("  ", {
        token: "token",
        gistId: "",
        encryptionPassword: "password",
      }),
    ).rejects.toMatchObject({ code: CLOUD_SYNC_ERROR_CODES.REMOTE_EMPTY })

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("updates an existing Gist only when the revision is unchanged and verifies readback", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(gistResponse('{"version":4}', "rev-1")))
      .mockResolvedValueOnce(response({ ...gistResponse(), public: false }))
      .mockResolvedValueOnce(response(gistResponse("encrypted", "rev-2")))
    vi.stubGlobal("fetch", fetchMock)

    const remote = await updateGithubGistBackup({
      content: "encrypted",
      config: { token: "token", gistId: "gist-1" },
      expectedRevision: "rev-1",
    })

    expect(remote.revision).toBe("rev-2")
    const [, init] = fetchMock.mock.calls[1]
    expect((init as RequestInit).method).toBe("PATCH")

    const conflictFetch = vi
      .fn()
      .mockResolvedValue(response(gistResponse("encrypted", "rev-new")))
    vi.stubGlobal("fetch", conflictFetch)
    await expect(
      updateGithubGistBackup({
        content: "encrypted",
        config: { token: "token", gistId: "gist-1" },
        expectedRevision: "rev-old",
      }),
    ).rejects.toMatchObject({ code: CLOUD_SYNC_ERROR_CODES.CONFLICT })
    expect(conflictFetch).toHaveBeenCalledTimes(1)
  })

  it.each([
    ["uninitialized", { ...gistResponse(), files: {} }],
    ["empty", gistResponse("")],
  ])("initializes a %s Gist during an upload", async (_state, initial) => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(initial))
      .mockResolvedValueOnce(response({}))
      .mockResolvedValueOnce(response(gistResponse("encrypted", "rev-2")))
    vi.stubGlobal("fetch", fetchMock)

    await expect(
      updateGithubGistBackup({
        content: "encrypted",
        config: { token: "token", gistId: "gist-1" },
      }),
    ).resolves.toMatchObject({ revision: "rev-2" })

    expect(fetchMock).toHaveBeenCalledTimes(3)
    const [, init] = fetchMock.mock.calls[1]
    expect((init as RequestInit).method).toBe("PATCH")
  })

  it("treats a removed backup file as a conflict when a revision was expected", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(gistResponse("")))
    vi.stubGlobal("fetch", fetchMock)

    await expect(
      updateGithubGistBackup({
        content: "encrypted",
        config: { token: "token", gistId: "gist-1" },
        expectedRevision: "rev-1",
      }),
    ).rejects.toMatchObject({ code: CLOUD_SYNC_ERROR_CODES.CONFLICT })

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("rejects empty updates and detects a failed readback verification", async () => {
    const emptyFetch = vi.fn().mockResolvedValue(response(gistResponse()))
    vi.stubGlobal("fetch", emptyFetch)
    await expect(
      updateGithubGistBackup({
        content: "  ",
        config: { token: "token", gistId: "gist-1" },
      }),
    ).rejects.toMatchObject({ code: CLOUD_SYNC_ERROR_CODES.REMOTE_EMPTY })
    expect(emptyFetch).toHaveBeenCalledTimes(1)

    const mismatchFetch = vi
      .fn()
      .mockResolvedValueOnce(response(gistResponse("before")))
      .mockResolvedValueOnce(response({}))
      .mockResolvedValueOnce(response(gistResponse("after")))
    vi.stubGlobal("fetch", mismatchFetch)
    await expect(
      updateGithubGistBackup({
        content: "expected",
        config: { token: "token", gistId: "gist-1" },
      }),
    ).rejects.toMatchObject({ code: CLOUD_SYNC_ERROR_CODES.REMOTE_CORRUPTED })
  })

  it("encrypts existing Gist uploads before updating them", async () => {
    const envelope = { type: "encrypted", ct: "ciphertext" }
    mockEncryptWebdavBackupContent.mockResolvedValue(envelope)
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(gistResponse("before", "rev-1")))
      .mockResolvedValueOnce(response({}))
      .mockResolvedValueOnce(
        response(gistResponse(JSON.stringify(envelope), "rev-2")),
      )
    vi.stubGlobal("fetch", fetchMock)

    await expect(
      uploadGithubGistBackup(
        '{"version":4}',
        { token: "token", gistId: "gist-1", encryptionPassword: "password" },
        "rev-1",
      ),
    ).resolves.toMatchObject({ revision: "rev-2" })
    expect(mockEncryptWebdavBackupContent).toHaveBeenCalledWith({
      content: '{"version":4}',
      password: "password",
    })
  })

  it("requires an encryption password for Gist writes and decrypts encrypted downloads", async () => {
    await expect(
      uploadGithubGistBackup('{"version":4}', {
        token: "token",
        gistId: "gist-1",
        encryptionPassword: "",
      }),
    ).rejects.toMatchObject({
      code: CLOUD_SYNC_ERROR_CODES.ENCRYPTION_REQUIRED,
    })

    const envelope = { type: "encrypted", ct: "ciphertext" }
    mockTryParseEncryptedWebdavBackupEnvelope.mockReturnValue(envelope)
    mockDecryptWebdavBackupEnvelope.mockResolvedValue('{"version":4}')
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(response(gistResponse("ciphertext"))),
    )

    await expect(
      downloadGithubGistBackup({
        token: "token",
        gistId: "gist-1",
        encryptionPassword: "password",
      }),
    ).resolves.toMatchObject({ content: '{"version":4}' })
    expect(mockDecryptWebdavBackupEnvelope).toHaveBeenCalledWith({
      envelope,
      password: "password",
    })
  })

  it("returns plaintext downloads and maps decryption failures", async () => {
    mockTryParseEncryptedWebdavBackupEnvelope.mockReturnValue(undefined)
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(response(gistResponse('{"version":4}'))),
    )
    await expect(
      downloadGithubGistBackup({
        token: "token",
        gistId: "gist-1",
        encryptionPassword: "password",
      }),
    ).resolves.toMatchObject({ content: '{"version":4}' })

    const envelope = { type: "encrypted", ct: "ciphertext" }
    mockTryParseEncryptedWebdavBackupEnvelope.mockReturnValue(envelope)
    mockDecryptWebdavBackupEnvelope.mockRejectedValue(new Error("bad password"))
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(response(gistResponse("ciphertext"))),
    )
    await expect(
      downloadGithubGistBackup({
        token: "token",
        gistId: "gist-1",
        encryptionPassword: "password",
      }),
    ).rejects.toMatchObject({ code: CLOUD_SYNC_ERROR_CODES.REMOTE_CORRUPTED })

    await expect(
      downloadGithubGistBackup({
        token: "token",
        gistId: "gist-1",
        encryptionPassword: " ",
      }),
    ).rejects.toMatchObject({
      code: CLOUD_SYNC_ERROR_CODES.ENCRYPTION_REQUIRED,
    })
  })

  it("normalizes persisted Gist settings with a stable encryption password", () => {
    expect(
      getGithubGistSyncConfig({
        ...DEFAULT_WEBDAV_SETTINGS,
        backupEncryptionPassword: "password",
        githubGist: undefined,
      }),
    ).toEqual({ token: "", gistId: "", encryptionPassword: "password" })
    expect(
      getGithubGistSyncConfig({
        ...DEFAULT_WEBDAV_SETTINGS,
        backupEncryptionPassword: "",
        githubGist: {
          token: "token",
          gistId: "gist-1",
          gistUrl: "https://gist.github.com/example/gist-1",
        },
      }),
    ).toEqual({
      token: "token",
      gistId: "gist-1",
      gistUrl: "https://gist.github.com/example/gist-1",
      encryptionPassword: "",
    })
  })
})
