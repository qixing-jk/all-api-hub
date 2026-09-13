import { act, fireEvent, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import CloudSyncSettings from "~/features/ImportExport/components/CloudSyncSettings"
import WebDAVSettings from "~/features/ImportExport/components/WebDAVSettings"
import { WEBDAV_TARGET_IDS } from "~/features/ImportExport/searchTargets"
import toast from "~/lib/notify"
import { WebdavAutoSyncMessageTypes } from "~/services/runtimeMessaging/messageTypes"

import {
  mockSendWebdavAutoSyncMessage,
  mockTestCloudSyncConnection,
  mockUserPreferences,
  render,
  setupWebdavSettingsTestHarness,
} from "./webdavSettingsHarness"

await vi.hoisted(() => import("./webdavSettingsHarness"))

describe("Cloud settings autosave", () => {
  setupWebdavSettingsTestHarness()

  it.each([
    ["url", WEBDAV_TARGET_IDS.url, false],
    ["username", WEBDAV_TARGET_IDS.username, false],
    ["password", WEBDAV_TARGET_IDS.password, false],
    ["backupEncryptionPassword", WEBDAV_TARGET_IDS.encryptionPassword, false],
    ["backupEncryptionPassword", WEBDAV_TARGET_IDS.encryptionPassword, true],
    ["token", WEBDAV_TARGET_IDS.gistToken, true],
    ["gistId", WEBDAV_TARGET_IDS.gistId, true],
  ] as const)(
    "saves and clears %s on blur (%s, Gist: %s)",
    async (field, id, gist) => {
      const user = userEvent.setup()
      render(<WebDAVSettings />)
      await screen.findByDisplayValue("alice")
      if (gist) {
        await user.click(
          screen.getByRole("button", {
            name: "importExport:webdav.provider.githubGist",
          }),
        )
        await waitFor(async () =>
          expect(
            (await mockUserPreferences.getPreferences()).webdav.provider,
          ).toBe("github_gist"),
        )
      }
      const input = document.getElementById(id) as HTMLInputElement
      mockUserPreferences.savePreferencesWithResult.mockClear()
      await user.clear(input)
      await user.type(input, "new-value")
      expect(
        mockUserPreferences.savePreferencesWithResult,
      ).not.toHaveBeenCalled()
      const readValue = async () => {
        const saved = (await mockUserPreferences.getPreferences()).webdav
        return field === "token" || field === "gistId"
          ? saved.githubGist[field]
          : saved[field]
      }
      await user.tab()
      await waitFor(async () => expect(await readValue()).toBe("new-value"))
      await user.clear(input)
      await user.tab()
      await waitFor(async () => expect(await readValue()).toBe(""))
      expect(toast.error).not.toHaveBeenCalled()
      expect(
        screen.queryByRole("button", {
          name: "importExport:webdav.saveConfig",
        }),
      ).not.toBeInTheDocument()
    },
  )

  it("saves only the Gist field that lost focus", async () => {
    render(<WebDAVSettings />)
    await userEvent.setup().click(
      await screen.findByRole("button", {
        name: "importExport:webdav.provider.githubGist",
      }),
    )
    const token = document.getElementById(
      WEBDAV_TARGET_IDS.gistToken,
    ) as HTMLInputElement
    const id = document.getElementById(
      WEBDAV_TARGET_IDS.gistId,
    ) as HTMLInputElement
    fireEvent.change(token, { target: { value: "new-token" } })
    fireEvent.change(id, { target: { value: "still-editing" } })
    fireEvent.blur(token)
    await waitFor(async () => {
      const saved = (await mockUserPreferences.getPreferences()).webdav
        .githubGist
      expect(saved.token).toBe("new-token")
      expect(saved.gistId).toBe("")
    })
    expect(id).toHaveValue("still-editing")
  })

  it("waits for a newly entered Gist password before validating and syncing", async () => {
    await mockUserPreferences.savePreferencesWithResult({
      webdav: { backupEncryptionPassword: "" },
    })
    const user = userEvent.setup()
    render(<CloudSyncSettings />)
    await user.click(
      await screen.findByRole("button", {
        name: "importExport:webdav.provider.githubGist",
      }),
    )
    await waitFor(async () =>
      expect((await mockUserPreferences.getPreferences()).webdav.provider).toBe(
        "github_gist",
      ),
    )
    const original =
      mockUserPreferences.savePreferencesWithResult.getMockImplementation()!
    let finishSave!: () => void
    mockUserPreferences.savePreferencesWithResult.mockImplementation(
      async (...args: unknown[]) => {
        await new Promise<void>((resolve) => {
          finishSave = resolve
        })
        return original(...args)
      },
    )
    await user.type(
      screen.getByTitle("importExport:webdav.encryption.password"),
      "new-secret",
    )
    await user.click(
      screen.getByRole("button", {
        name: "importExport:webdav.autoSync.syncNow",
      }),
    )
    await waitFor(() => expect(finishSave).toBeTypeOf("function"))
    expect(mockSendWebdavAutoSyncMessage).not.toHaveBeenCalledWith(
      WebdavAutoSyncMessageTypes.SyncNow,
    )
    await act(async () => finishSave())
    await waitFor(() =>
      expect(mockSendWebdavAutoSyncMessage).toHaveBeenCalledWith(
        WebdavAutoSyncMessageTypes.SyncNow,
      ),
    )
    expect(toast.error).not.toHaveBeenCalled()
  })

  it("saves an empty Gist password but blocks sync until it is filled", async () => {
    const user = userEvent.setup()
    render(<CloudSyncSettings />)
    await user.click(
      await screen.findByRole("button", {
        name: "importExport:webdav.provider.githubGist",
      }),
    )
    await user.clear(
      screen.getByTitle("importExport:webdav.encryption.password"),
    )
    await user.click(
      screen.getByRole("button", {
        name: "importExport:webdav.autoSync.syncNow",
      }),
    )
    await waitFor(async () =>
      expect(
        (await mockUserPreferences.getPreferences()).webdav
          .backupEncryptionPassword,
      ).toBe(""),
    )
    expect(
      await screen.findByText(
        "importExport:webdav.gist.encryptionPasswordRequired",
      ),
    ).toBeVisible()
    expect(mockSendWebdavAutoSyncMessage).not.toHaveBeenCalledWith(
      WebdavAutoSyncMessageTypes.SyncNow,
    )
  })

  it("keeps a failed field visible and retries without a permanent save button", async () => {
    const user = userEvent.setup()
    render(<WebDAVSettings />)
    const username = await screen.findByDisplayValue("alice")
    mockUserPreferences.savePreferencesWithResult
      .mockRejectedValueOnce(new Error("storage unavailable"))
      .mockRejectedValueOnce(new Error("storage still unavailable"))
    await user.clear(username)
    await user.type(username, "bob")
    await user.tab()
    const retry = await screen.findByRole("button", {
      name: "importExport:webdav.retrySave",
    })
    expect(username).toHaveValue("bob")
    vi.mocked(toast.error).mockClear()
    await user.click(retry)
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledExactlyOnceWith(
        "settings:messages.saveSettingsFailed",
      ),
    )
    expect(username).toHaveValue("bob")
    await user.click(retry)
    await waitFor(async () =>
      expect((await mockUserPreferences.getPreferences()).webdav.username).toBe(
        "bob",
      ),
    )
    expect(
      screen.queryByRole("button", { name: "importExport:webdav.retrySave" }),
    ).not.toBeInTheDocument()
  })

  it("retains retry feedback when schedule refresh fails after a saved field", async () => {
    const user = userEvent.setup()
    render(<WebDAVSettings />)
    const username = await screen.findByDisplayValue("alice")
    mockSendWebdavAutoSyncMessage.mockRejectedValue(
      new Error("schedule offline"),
    )
    await user.clear(username)
    await user.type(username, "bob")
    await user.tab()
    const retry = await screen.findByRole("button", {
      name: "importExport:webdav.retrySave",
    })
    vi.mocked(toast.error).mockClear()
    await user.click(retry)
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledExactlyOnceWith(
        "settings:messages.saveSettingsFailed",
      ),
    )
    expect((await mockUserPreferences.getPreferences()).webdav.username).toBe(
      "bob",
    )
    expect(retry).toBeVisible()
  })

  it("shows connection failure guidance when WebDAV returns no error message", async () => {
    const user = userEvent.setup()
    render(<WebDAVSettings />)
    await screen.findByDisplayValue("alice")
    mockTestCloudSyncConnection.mockRejectedValueOnce(undefined)
    await user.click(
      screen.getByRole("button", {
        name: "importExport:webdav.testConnection",
      }),
    )
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "importExport:webdav.testFailed",
      ),
    )
  })
})
