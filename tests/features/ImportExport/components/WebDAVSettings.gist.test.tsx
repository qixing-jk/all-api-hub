import { fireEvent, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import CloudSyncSettings from "~/features/ImportExport/components/CloudSyncSettings"
import WebDAVAutoSyncSettings from "~/features/ImportExport/components/WebDAVAutoSyncSettings"
import WebDAVSettings from "~/features/ImportExport/components/WebDAVSettings"
import {
  WEBDAV_AUTO_SYNC_TARGET_IDS,
  WEBDAV_TARGET_IDS,
} from "~/features/ImportExport/searchTargets"
import toast from "~/lib/notify"
import { WebdavAutoSyncMessageTypes } from "~/services/runtimeMessaging/messageTypes"
import { CLOUD_SYNC_ERROR_CODES } from "~/types/cloudSync"
import { createPersistedPreferencesFixture } from "~~/tests/test-utils/mockPreferencePersistence"

import {
  clickWebdavAction,
  loggerMocks,
  mockCreateCloudSyncBackup,
  mockDownloadCloudSyncBackup,
  mockMergeWebdavBackupPayloadBySelection,
  mockSendWebdavAutoSyncMessage,
  mockTestCloudSyncConnection,
  mockUploadBackup,
  mockUploadCloudSyncBackup,
  mockUserPreferences,
  render,
  setupWebdavSettingsTestHarness,
} from "./webdavSettingsHarness"

// Register shared module mocks before loading the components under test.
await vi.hoisted(() => import("./webdavSettingsHarness"))

describe("WebDAVSettings Gist", () => {
  setupWebdavSettingsTestHarness()
  it("automatically saves the password when leaving its field to switch providers", async () => {
    const user = userEvent.setup()
    render(<CloudSyncSettings />)
    const password = await screen.findByTitle(
      "importExport:webdav.encryption.password",
    )
    await user.clear(password)
    await user.type(password, "unfinished-password")
    await user.click(
      screen.getByRole("button", {
        name: "importExport:webdav.provider.githubGist",
      }),
    )
    await waitFor(async () => {
      const saved = await mockUserPreferences.getPreferences()
      expect(saved.webdav.provider).toBe("github_gist")
      expect(saved.webdav.backupEncryptionPassword).toBe("unfinished-password")
    })
    expect(password).toHaveValue("unfinished-password")
    await user.click(
      screen.getByRole("button", {
        name: "importExport:webdav.provider.webdav",
      }),
    )
    await waitFor(async () =>
      expect((await mockUserPreferences.getPreferences()).webdav.provider).toBe(
        "webdav",
      ),
    )
  })

  it("keeps one encryption password field across providers and explains the shared password", async () => {
    const user = userEvent.setup()
    render(<WebDAVSettings />)
    const password = await screen.findByTitle(
      "importExport:webdav.encryption.password",
    )
    expect(password).toHaveValue("stored-secret")
    expect(password).toHaveAccessibleDescription(
      "importExport:webdav.encryption.sharedPasswordDescription",
    )
    await user.clear(password)
    await user.type(password, "shared-backup-secret")
    await user.click(
      screen.getByRole("button", {
        name: "importExport:webdav.provider.githubGist",
      }),
    )
    expect(
      screen.getByTitle("importExport:webdav.encryption.password"),
    ).toHaveValue("shared-backup-secret")
    expect(
      screen.getByText("importExport:webdav.encryption.alwaysEncrypted"),
    ).toBeVisible()
    expect(
      screen.queryByRole("switch", {
        name: "importExport:webdav.encryption.title",
      }),
    ).not.toBeInTheDocument()
    await user.click(
      screen.getByRole("button", {
        name: "importExport:webdav.provider.webdav",
      }),
    )
    expect(
      screen.getByTitle("importExport:webdav.encryption.password"),
    ).toHaveValue("shared-backup-secret")
    expect(
      screen.getByRole("switch", {
        name: "importExport:webdav.encryption.title",
      }),
    ).toBeVisible()
  })
  it("automatically saves the data selection and restores it on remount", async () => {
    const user = userEvent.setup()
    const view = render(<CloudSyncSettings />)
    const configuration = within(
      await screen.findByRole("region", {
        name: "importExport:webdav.connection.title",
      }),
    )
    const checkbox = configuration.getByRole("checkbox", {
      name: "importExport:webdav.syncData.accounts",
    })
    expect(checkbox).toBeChecked()
    await user.click(checkbox)
    await waitFor(async () =>
      expect(
        (await mockUserPreferences.getPreferences()).webdav.syncData.accounts,
      ).toBe(false),
    )
    expect(
      configuration.queryByText("importExport:webdav.actionState.unsaved"),
    ).not.toBeInTheDocument()
    expect(
      (await mockUserPreferences.getPreferences()).webdav.syncData.accounts,
    ).toBe(false)
    view.unmount()
    render(<CloudSyncSettings />)
    expect(
      await screen.findByRole("checkbox", {
        name: "importExport:webdav.syncData.accounts",
      }),
    ).not.toBeChecked()
  })
  it("creates a Gist on the first upload, saves its id, and updates it on the next upload", async () => {
    const onProviderDraftChange = vi.fn()
    render(<WebDAVSettings onProviderDraftChange={onProviderDraftChange} />)

    fireEvent.click(
      await screen.findByRole("button", {
        name: "importExport:webdav.provider.githubGist",
      }),
    )

    await waitFor(() => {
      expect(onProviderDraftChange).toHaveBeenLastCalledWith("github_gist")
      expect(document.getElementById(WEBDAV_TARGET_IDS.gistToken)).toBeTruthy()
    })
    fireEvent.change(
      document.getElementById(WEBDAV_TARGET_IDS.gistToken) as HTMLInputElement,
      { target: { value: "github-token" } },
    )

    await userEvent.setup().click(
      await screen.findByRole("button", {
        name: /importExport:webdav.gist.upload/,
      }),
    )

    await waitFor(() => {
      expect(mockCreateCloudSyncBackup).toHaveBeenCalledTimes(1)
    })
    expect(
      (await mockUserPreferences.getPreferences()).webdav.githubGist.gistId,
    ).toBe("new-gist")
    expect(await screen.findByDisplayValue("new-gist")).toBeInTheDocument()
    await clickWebdavAction(WEBDAV_TARGET_IDS.uploadBackup)
    await waitFor(() =>
      expect(mockUploadCloudSyncBackup).toHaveBeenCalledTimes(1),
    )
    expect(mockCreateCloudSyncBackup).toHaveBeenCalledTimes(1)
    expect(mockUploadCloudSyncBackup).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        githubGist: expect.objectContaining({ gistId: "new-gist" }),
      }),
      expect.anything(),
    )
  })

  it("keeps field help usable across hover, focus, click, and dismissal", async () => {
    render(<WebDAVSettings />)

    const help = await screen.findByRole("button", {
      name: "importExport:webdav.encryption.password",
    })
    const description = "importExport:webdav.encryption.passwordDesc"

    fireEvent.pointerEnter(help)
    expect(await screen.findByText(description)).toBeInTheDocument()

    // Re-entering before the delayed close expires keeps the popover open.
    fireEvent.pointerLeave(help)
    fireEvent.pointerEnter(help)
    expect(screen.getByText(description)).toBeInTheDocument()

    fireEvent.pointerLeave(help)
    await waitFor(() => {
      expect(screen.queryByText(description)).not.toBeInTheDocument()
    })

    fireEvent.focus(help)
    expect(await screen.findByText(description)).toBeInTheDocument()
    fireEvent.blur(help, { relatedTarget: document.body })
    await waitFor(() => {
      expect(screen.queryByText(description)).not.toBeInTheDocument()
    })

    fireEvent.click(help)
    expect(await screen.findByText(description)).toBeInTheDocument()
    const popoverContent = screen.getByRole("dialog")
    fireEvent.pointerEnter(popoverContent)
    fireEvent.pointerLeave(popoverContent)
    expect(screen.getByText(description)).toBeInTheDocument()

    fireEvent.keyDown(document, { key: "Escape" })
    await waitFor(() => {
      expect(screen.queryByText(description)).not.toBeInTheDocument()
    })
  })

  it.each(["basic", "import-export"])(
    "reveals provider controls on initial search and same-page navigation on %s",
    async (page) => {
      window.history.replaceState(
        {},
        "",
        `/?anchor=${WEBDAV_TARGET_IDS.gistToken}&highlight=${WEBDAV_TARGET_IDS.gistToken}#${page}`,
      )
      render(<WebDAVSettings />)
      const tokenInput = await screen.findByPlaceholderText(
        "importExport:webdav.gist.tokenPlaceholder",
      )
      fireEvent.change(tokenInput, { target: { value: "unsaved-token" } })
      expect(tokenInput).toHaveAttribute("id", WEBDAV_TARGET_IDS.gistToken)

      window.history.replaceState(
        {},
        "",
        `/?anchor=${WEBDAV_TARGET_IDS.username}&highlight=${WEBDAV_TARGET_IDS.username}#${page}`,
      )
      fireEvent.popState(window)
      expect(await screen.findByDisplayValue("alice")).toHaveAttribute(
        "id",
        WEBDAV_TARGET_IDS.username,
      )

      window.history.replaceState(
        {},
        "",
        `/?anchor=${WEBDAV_TARGET_IDS.gistToken}#${page}`,
      )
      fireEvent(window, new Event("hashchange"))
      expect(
        await screen.findByDisplayValue("unsaved-token"),
      ).toBeInTheDocument()
      expect(
        mockUserPreferences.savePreferencesWithResult,
      ).not.toHaveBeenCalled()
    },
  )

  it("switches the provider draft in both directions", async () => {
    const user = userEvent.setup()
    render(<WebDAVSettings />)

    expect(await screen.findByDisplayValue("alice")).toBeInTheDocument()
    await user.click(
      screen.getByRole("button", {
        name: "importExport:webdav.provider.githubGist",
      }),
    )
    expect(
      await screen.findByPlaceholderText(
        "importExport:webdav.gist.tokenPlaceholder",
      ),
    ).toBeInTheDocument()

    await user.click(
      screen.getByRole("button", {
        name: "importExport:webdav.provider.webdav",
      }),
    )
    expect(screen.getByDisplayValue("alice")).toBeInTheDocument()
    expect(
      screen.queryByPlaceholderText(
        "importExport:webdav.gist.tokenPlaceholder",
      ),
    ).not.toBeInTheDocument()
    await waitFor(async () =>
      expect((await mockUserPreferences.getPreferences()).webdav.provider).toBe(
        "webdav",
      ),
    )
  })

  it("hides a persisted Gist link while WebDAV is selected", async () => {
    mockUserPreferences.getPreferences.mockResolvedValue(
      createPersistedPreferencesFixture({
        webdav: {
          provider: "webdav",
          url: "https://dav.example.com/backup.json",
          username: "alice",
          password: "pw",
          githubGist: {
            token: "saved-token",
            gistId: "saved-gist",
            gistUrl: "https://gist.github.com/saved-gist",
          },
        },
      }),
    )

    render(<WebDAVSettings />)

    expect(await screen.findByDisplayValue("alice")).toBeInTheDocument()
    expect(document.getElementById(WEBDAV_TARGET_IDS.gistUrl)).toBeNull()
  })

  it("exercises GitHub Gist settings, connection, upload, and failure states", async () => {
    const gistPreferences = createPersistedPreferencesFixture({
      webdav: {
        provider: "github_gist",
        url: "",
        username: "",
        password: "",
        backupEncryptionEnabled: true,
        backupEncryptionPassword: "stored-secret",
        githubGist: {
          token: "saved-token",
          gistId: "existing-gist",
          gistUrl: "",
        },
        syncData: {
          accounts: true,
          bookmarks: true,
          apiCredentialProfiles: true,
          preferences: true,
        },
        autoSync: false,
        syncInterval: 3600,
        syncStrategy: "merge",
      },
    })
    mockUserPreferences.getPreferences.mockResolvedValue(gistPreferences)
    mockUserPreferences.savePreferencesWithResult.mockResolvedValue({
      ok: true,
      preferences: gistPreferences,
    })

    render(<WebDAVSettings />)

    const gistIdInput = (await screen.findByDisplayValue(
      "existing-gist",
    )) as HTMLInputElement
    fireEvent.change(gistIdInput, { target: { value: "existing-gist-2" } })
    fireEvent.change(screen.getByDisplayValue("stored-secret"), {
      target: { value: "new-secret" },
    })

    await clickWebdavAction(WEBDAV_TARGET_IDS.testConnection)
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        "importExport:webdav.gist.testSuccess",
      )
    })

    mockSendWebdavAutoSyncMessage.mockResolvedValueOnce({ success: false })
    await clickWebdavAction(WEBDAV_TARGET_IDS.testConnection)
    await waitFor(() => {
      expect(loggerMocks.warn).toHaveBeenCalledWith(
        "Failed to refresh cloud sync schedule after settings save",
      )
    })

    mockSendWebdavAutoSyncMessage.mockRejectedValueOnce(
      new Error("setup failed"),
    )
    await clickWebdavAction(WEBDAV_TARGET_IDS.testConnection)
    await waitFor(() => {
      expect(loggerMocks.warn).toHaveBeenCalledWith(
        "Failed to refresh cloud sync schedule after settings save",
        expect.any(Error),
      )
    })

    await clickWebdavAction(WEBDAV_TARGET_IDS.testConnection)
    await waitFor(() => {
      expect(mockTestCloudSyncConnection).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: "github_gist",
          githubGist: expect.objectContaining({ gistId: "existing-gist-2" }),
        }),
      )
    })
    expect(toast.success).toHaveBeenCalledWith(
      "importExport:webdav.gist.testSuccess",
    )
    expect(document.getElementById(WEBDAV_TARGET_IDS.gistUrl)).toHaveAttribute(
      "href",
      "https://gist.github.com/existing-gist",
    )

    await clickWebdavAction(WEBDAV_TARGET_IDS.uploadBackup)
    await waitFor(() => {
      expect(mockDownloadCloudSyncBackup).toHaveBeenCalled()
      expect(mockUploadCloudSyncBackup).toHaveBeenCalled()
    })
    expect(toast.success).toHaveBeenCalledWith(
      "importExport:webdav.gist.uploadSuccess",
    )

    for (const code of [
      CLOUD_SYNC_ERROR_CODES.UNINITIALIZED,
      CLOUD_SYNC_ERROR_CODES.REMOTE_EMPTY,
    ]) {
      mockUploadCloudSyncBackup.mockClear()
      mockMergeWebdavBackupPayloadBySelection.mockClear()
      mockDownloadCloudSyncBackup.mockRejectedValueOnce({ code })
      await clickWebdavAction(WEBDAV_TARGET_IDS.uploadBackup)
      await waitFor(() => {
        expect(
          mockMergeWebdavBackupPayloadBySelection,
        ).toHaveBeenLastCalledWith(
          expect.objectContaining({ remoteBackup: null }),
        )
        expect(mockUploadCloudSyncBackup).toHaveBeenCalled()
      })
    }

    mockUploadCloudSyncBackup.mockRejectedValueOnce(
      new Error("gist upload failed"),
    )
    await clickWebdavAction(WEBDAV_TARGET_IDS.uploadBackup)
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("gist upload failed")
    })

    mockUploadCloudSyncBackup.mockRejectedValueOnce({})
    await clickWebdavAction(WEBDAV_TARGET_IDS.uploadBackup)
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "importExport:webdav.gist.uploadFailed",
      )
    })

    mockTestCloudSyncConnection.mockRejectedValueOnce({})
    await clickWebdavAction(WEBDAV_TARGET_IDS.testConnection)
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "importExport:webdav.gist.testFailed",
      )
    })

    mockUserPreferences.savePreferencesWithResult.mockRejectedValueOnce(
      new Error(""),
    )
    await clickWebdavAction(WEBDAV_TARGET_IDS.testConnection)
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "settings:messages.saveSettingsFailed",
      )
    })
  })

  it("requires a Gist encryption password only when using manual actions", async () => {
    const gistPreferences = createPersistedPreferencesFixture({
      webdav: {
        provider: "github_gist",
        backupEncryptionEnabled: true,
        backupEncryptionPassword: "",
        githubGist: { token: "saved-token", gistId: "existing-gist" },
        syncData: {
          accounts: true,
          bookmarks: true,
          apiCredentialProfiles: true,
          preferences: true,
        },
      },
    })
    mockUserPreferences.getPreferences.mockResolvedValue(gistPreferences)

    render(<WebDAVSettings />)

    expect(await screen.findByDisplayValue("existing-gist")).toBeInTheDocument()
    const requiredMessage =
      "importExport:webdav.gist.encryptionPasswordRequired"

    fireEvent.click(
      screen.getByRole("button", {
        name: "importExport:webdav.testConnection",
      }),
    )
    expect(await screen.findByText(requiredMessage)).toBeInTheDocument()

    await clickWebdavAction(WEBDAV_TARGET_IDS.uploadBackup)
    expect(screen.getByText(requiredMessage)).toBeInTheDocument()
    expect(toast.error).toHaveBeenLastCalledWith(requiredMessage)
    expect(mockUploadCloudSyncBackup).not.toHaveBeenCalled()

    await clickWebdavAction(WEBDAV_TARGET_IDS.downloadImport)
    expect(screen.getByText(requiredMessage)).toBeInTheDocument()
    expect(mockDownloadCloudSyncBackup).not.toHaveBeenCalled()
  })

  it("keeps the current Gist id when creation returns no id", async () => {
    const gistPreferences = createPersistedPreferencesFixture({
      webdav: {
        provider: "github_gist",
        backupEncryptionEnabled: true,
        backupEncryptionPassword: "stored-secret",
        githubGist: { token: "saved-token", gistId: "" },
        syncData: {
          accounts: true,
          bookmarks: true,
          apiCredentialProfiles: true,
          preferences: true,
        },
      },
    })
    mockUserPreferences.getPreferences.mockResolvedValue(gistPreferences)
    mockCreateCloudSyncBackup.mockResolvedValueOnce({
      htmlUrl: "https://gist.github.com/created-without-id",
    })

    render(<WebDAVSettings />)

    expect(await screen.findByDisplayValue("saved-token")).toBeInTheDocument()
    await userEvent.setup().click(
      await screen.findByRole("button", {
        name: /importExport:webdav.gist.upload/,
      }),
    )

    await waitFor(() => {
      expect(mockCreateCloudSyncBackup).toHaveBeenCalledTimes(1)
      expect(
        mockUserPreferences.savePreferencesWithResult,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          webdav: expect.objectContaining({
            githubGist: expect.objectContaining({
              gistId: "",
              gistUrl: "https://gist.github.com/created-without-id",
            }),
          }),
        }),
        { expectedLastUpdated: 0 },
      )
    })
    expect(screen.getByDisplayValue("saved-token")).toBeInTheDocument()
  })

  it("allows cancelling a directional action before it reaches the provider", async () => {
    render(<WebDAVSettings />)

    expect(await screen.findByDisplayValue("alice")).toBeInTheDocument()
    fireEvent.click(
      screen.getByRole("button", { name: "importExport:webdav.uploadBackup" }),
    )
    expect(
      await screen.findByText("importExport:webdav.manual.confirmUploadTitle"),
    ).toBeInTheDocument()

    fireEvent.click(
      screen.getByRole("button", {
        name: "importExport:webdav.manual.confirmCancel",
      }),
    )
    await waitFor(() => {
      expect(
        screen.queryByText("importExport:webdav.manual.confirmUploadTitle"),
      ).not.toBeInTheDocument()
    })
    expect(mockUploadBackup).not.toHaveBeenCalled()

    fireEvent.click(
      screen.getByRole("button", { name: "importExport:webdav.uploadBackup" }),
    )
    expect(
      await screen.findByText("importExport:webdav.manual.confirmUploadTitle"),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText("common:actions.close"))
    await waitFor(() => {
      expect(
        screen.queryByText("importExport:webdav.manual.confirmUploadTitle"),
      ).not.toBeInTheDocument()
    })
  })

  it("uses the GitHub Gist auto-sync copy and minimum interval", async () => {
    const gistPreferences = createPersistedPreferencesFixture({
      webdav: {
        provider: "github_gist",
        autoSync: true,
        syncInterval: 3600,
        syncStrategy: "merge",
        backupEncryptionPassword: "stored-secret",
        githubGist: { token: "saved-token", gistId: "gist-1" },
      },
    })
    mockUserPreferences.getPreferences.mockResolvedValue(gistPreferences)

    render(<WebDAVAutoSyncSettings />)

    expect(
      await screen.findByText("importExport:webdav.autoSync.title"),
    ).toBeInTheDocument()
    expect(
      screen.queryByText("importExport:webdav.gist.autoSyncActionStateSaved"),
    ).not.toBeInTheDocument()

    const intervalInput = document.getElementById(
      WEBDAV_AUTO_SYNC_TARGET_IDS.interval,
    ) as HTMLInputElement
    expect(intervalInput).toHaveAttribute("min", "300")
    fireEvent.change(intervalInput, { target: { value: "60" } })
    expect(
      await screen.findByText(
        "importExport:webdav.autoSync.autosaveDescription",
      ),
    ).toBeInTheDocument()

    fireEvent.blur(intervalInput)

    await waitFor(() => {
      expect(mockSendWebdavAutoSyncMessage).toHaveBeenCalledWith(
        WebdavAutoSyncMessageTypes.UpdateSettings,
        expect.objectContaining({
          settings: expect.objectContaining({ syncInterval: 300 }),
        }),
      )
    })
  })
})
