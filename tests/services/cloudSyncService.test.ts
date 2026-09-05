import { describe, expect, it, vi } from "vitest"

import {
  createCloudSyncBackup,
  downloadCloudSyncBackup,
  getCloudSyncProvider,
  testCloudSyncConnection,
  uploadCloudSyncBackup,
} from "~/services/webdav/cloudSyncService"
import { CLOUD_SYNC_PROVIDERS } from "~/types/cloudSync"

const {
  mockCreateEncryptedGithubGistBackup,
  mockDownloadGithubGistBackup,
  mockGetGithubGistSyncConfig,
  mockTestGithubGistConnection,
  mockUploadGithubGistBackup,
  mockDownloadBackup,
  mockTestWebdavConnection,
  mockUploadBackup,
} = vi.hoisted(() => ({
  mockCreateEncryptedGithubGistBackup: vi.fn(),
  mockDownloadGithubGistBackup: vi.fn(),
  mockGetGithubGistSyncConfig: vi.fn((settings) => ({
    ...(settings.githubGist ?? {}),
    encryptionPassword: settings.backupEncryptionPassword ?? "",
  })),
  mockTestGithubGistConnection: vi.fn(),
  mockUploadGithubGistBackup: vi.fn(),
  mockDownloadBackup: vi.fn(),
  mockTestWebdavConnection: vi.fn(),
  mockUploadBackup: vi.fn(),
}))

vi.mock("~/services/webdav/githubGistService", () => ({
  createEncryptedGithubGistBackup: mockCreateEncryptedGithubGistBackup,
  downloadGithubGistBackup: mockDownloadGithubGistBackup,
  getGithubGistSyncConfig: mockGetGithubGistSyncConfig,
  isGithubGistError: () => false,
  testGithubGistConnection: mockTestGithubGistConnection,
  uploadGithubGistBackup: mockUploadGithubGistBackup,
}))

vi.mock("~/services/webdav/webdavService", () => ({
  downloadBackup: mockDownloadBackup,
  testWebdavConnection: mockTestWebdavConnection,
  uploadBackup: mockUploadBackup,
}))

const webdavSettings = {
  provider: CLOUD_SYNC_PROVIDERS.WEBDAV,
  url: "https://dav.example/backup.json",
  username: "user",
  password: "password",
  autoSync: false,
  syncInterval: 3600,
  syncStrategy: "merge" as const,
}

const gistSettings = {
  ...webdavSettings,
  provider: CLOUD_SYNC_PROVIDERS.GITHUB_GIST,
  githubGist: { token: "token", gistId: "gist-1" },
  backupEncryptionPassword: "encryption-password",
}

describe("cloudSyncService", () => {
  it("defaults old settings to WebDAV and routes WebDAV operations", async () => {
    expect(
      getCloudSyncProvider({ ...webdavSettings, provider: undefined }),
    ).toBe(CLOUD_SYNC_PROVIDERS.WEBDAV)
    mockTestWebdavConnection.mockResolvedValue(true)
    mockDownloadBackup.mockResolvedValue('{"version":4}')
    mockUploadBackup.mockResolvedValue(true)

    await expect(testCloudSyncConnection(webdavSettings)).resolves.toBe(true)
    await expect(
      downloadCloudSyncBackup(webdavSettings),
    ).resolves.toMatchObject({
      content: '{"version":4}',
      remote: { provider: CLOUD_SYNC_PROVIDERS.WEBDAV },
    })
    await expect(
      uploadCloudSyncBackup('{"version":4}', webdavSettings),
    ).resolves.toEqual({
      provider: CLOUD_SYNC_PROVIDERS.WEBDAV,
    })
    expect(mockTestWebdavConnection).toHaveBeenCalled()
    expect(mockDownloadBackup).toHaveBeenCalled()
    expect(mockUploadBackup).toHaveBeenCalled()
  })

  it("routes GitHub Gist operations and carries revision metadata", async () => {
    const remote = {
      gistId: "gist-1",
      htmlUrl: "https://gist.github.com/example/gist-1",
      public: false,
      revision: "rev-1",
      rawContent: "encrypted",
    }
    mockTestGithubGistConnection.mockResolvedValue(remote)
    mockDownloadGithubGistBackup.mockResolvedValue({
      content: '{"version":4}',
      remote,
    })
    mockUploadGithubGistBackup.mockResolvedValue(remote)
    mockCreateEncryptedGithubGistBackup.mockResolvedValue(remote)

    await expect(testCloudSyncConnection(gistSettings)).resolves.toEqual(remote)
    await expect(downloadCloudSyncBackup(gistSettings)).resolves.toMatchObject({
      content: '{"version":4}',
      remote: {
        provider: CLOUD_SYNC_PROVIDERS.GITHUB_GIST,
        gistId: "gist-1",
        revision: "rev-1",
      },
    })
    await expect(
      uploadCloudSyncBackup('{"version":4}', gistSettings, "rev-1"),
    ).resolves.toMatchObject({
      provider: CLOUD_SYNC_PROVIDERS.GITHUB_GIST,
      gistId: "gist-1",
      revision: "rev-1",
    })
    expect(mockUploadGithubGistBackup).toHaveBeenCalledWith(
      '{"version":4}',
      expect.objectContaining({
        token: "token",
        gistId: "gist-1",
        encryptionPassword: "encryption-password",
      }),
      "rev-1",
    )

    await expect(
      createCloudSyncBackup('{"version":4}', gistSettings),
    ).resolves.toMatchObject({
      provider: CLOUD_SYNC_PROVIDERS.GITHUB_GIST,
      gistId: "gist-1",
      htmlUrl: remote.htmlUrl,
    })
  })
})
