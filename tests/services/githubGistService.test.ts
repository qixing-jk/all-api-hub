import { afterEach, describe, expect, it, vi } from "vitest"

import {
  createEncryptedGithubGistBackup,
  downloadGithubGistBackup,
  GITHUB_GIST_BACKUP_FILE_NAME,
  isGithubGistError,
  readGithubGistRemote,
  testGithubGistConnection,
  updateGithubGistBackup,
  uploadGithubGistBackup,
} from "~/services/webdav/githubGistService"
import { CLOUD_SYNC_ERROR_CODES } from "~/types/cloudSync"

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

describe("githubGistService", () => {
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
  })

  it("rejects malformed successful API responses as remote corruption", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(null)))

    await expect(
      readGithubGistRemote({ token: "token", gistId: "gist-1" }),
    ).rejects.toMatchObject({ code: CLOUD_SYNC_ERROR_CODES.REMOTE_CORRUPTED })
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
    expect(isGithubGistError(new Error("x"))).toBe(false)
  })
})
