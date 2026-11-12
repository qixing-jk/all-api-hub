import { http, HttpResponse } from "msw"
import { StrictMode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ChangelogOnUpdateUiOpenHandler } from "~/components/ChangelogOnUpdateUiOpenHandler"
import {
  UpdateLogDialogContainer,
  UpdateLogDialogProvider,
} from "~/features/UpdateLog"
import { userPreferences } from "~/services/preferences/userPreferences"
import { changelogOnUpdateState } from "~/services/updates/changelogOnUpdateState"
import * as browserEnvironment from "~/utils/browser"
import {
  getDocsChangelogIndexUrl,
  getGitHubPagesRawChangelogIndexUrl,
  getGitHubRawChangelogMarkdownUrl,
} from "~/utils/navigation/docsLinks"
import { server } from "~~/tests/msw/server"
import { createDeferred } from "~~/tests/test-utils/deferred"
import { testI18n } from "~~/tests/test-utils/i18n"
import { act, render, screen, waitFor } from "~~/tests/test-utils/render"

const view = () => (
  <StrictMode>
    <UpdateLogDialogProvider>
      <ChangelogOnUpdateUiOpenHandler />
      <UpdateLogDialogContainer />
    </UpdateLogDialogProvider>
  </StrictMode>
)
const openOptions = () => render(view())

function publishNotes(versions: string[]) {
  server.use(
    http.get(getDocsChangelogIndexUrl(), () =>
      HttpResponse.json({ schemaVersion: 1, versions }),
    ),
  )
}

describe("ChangelogOnUpdateUiOpenHandler", () => {
  beforeEach(async () => {
    await browser.storage.local.clear()
    vi.spyOn(browserEnvironment, "isExtensionOptions").mockReturnValue(true)
    vi.spyOn(browser.runtime, "getManifest").mockReturnValue({
      ...browser.runtime.getManifest(),
      version: "4.10.1",
    })
    await userPreferences.savePreferencesWithResult({
      openChangelogOnUpdate: true,
    })
    testI18n.addResourceBundle(
      "en",
      "ui",
      {
        dialog: {
          updateLog: {
            title: "Update log",
            updatedTo: "Updated to v{{version}}",
          },
        },
      },
      true,
      true,
    )
  })
  afterEach(() => {
    testI18n.removeResourceBundle("en", "ui")
    vi.restoreAllMocks()
  })

  it("uses the default reminder preference when the stored preference is absent", async () => {
    await changelogOnUpdateState.setPendingVersion("4.10.1")
    const prefs = await userPreferences.getPreferencesStrict()
    vi.spyOn(userPreferences, "getPreferencesStrict").mockResolvedValue({
      ...prefs,
      openChangelogOnUpdate: undefined,
    })
    publishNotes(["4.10.1"])
    openOptions()
    expect(await screen.findByRole("dialog")).toBeInTheDocument()
    expect(await changelogOnUpdateState.getPendingVersion()).toBeNull()
  })

  it("preserves the reminder when options closes during the pending-version read", async () => {
    await changelogOnUpdateState.setPendingVersion("4.10.1")
    const pending = createDeferred<string | null>()
    const read = vi
      .spyOn(changelogOnUpdateState, "getPendingVersion")
      .mockReturnValue(pending.promise)
    const consume = vi.spyOn(changelogOnUpdateState, "consumePendingVersion")
    const prefs = vi.spyOn(userPreferences, "getPreferencesStrict")
    const page = render(view(), {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })
    page.unmount()
    await act(async () => pending.resolve("4.10.1"))
    expect(prefs).not.toHaveBeenCalled()
    expect(consume).not.toHaveBeenCalled()
    read.mockRestore()
    expect(await changelogOnUpdateState.getPendingVersion()).toBe("4.10.1")
  })

  it.each([1, 2])(
    "preserves the reminder when options closes during preference read %i",
    async (readNumber) => {
      await changelogOnUpdateState.setPendingVersion("4.10.1")
      const prefs = await userPreferences.getPreferencesStrict()
      const pending = createDeferred<typeof prefs>()
      let reads = 0
      vi.spyOn(userPreferences, "getPreferencesStrict").mockImplementation(
        async () => {
          reads++
          return reads === readNumber ? pending.promise : prefs
        },
      )
      const consume = vi.spyOn(changelogOnUpdateState, "consumePendingVersion")
      publishNotes(["4.10.1"])
      const page = render(view(), {
        withUserPreferencesProvider: false,
        withThemeProvider: false,
      })
      await waitFor(() => expect(reads).toBe(readNumber))
      page.unmount()
      await act(async () => pending.resolve(prefs))
      expect(consume).not.toHaveBeenCalled()
      expect(await changelogOnUpdateState.getPendingVersion()).toBe("4.10.1")
    },
  )

  it("preserves a newer reminder when an older notes request completes", async () => {
    await changelogOnUpdateState.setPendingVersion("4.10.1")
    const requested = createDeferred<void>()
    const response = createDeferred<void>()
    server.use(
      http.get(getDocsChangelogIndexUrl(), async () => {
        requested.resolve()
        await response.promise
        return HttpResponse.json({ schemaVersion: 1, versions: ["4.10.1"] })
      }),
    )
    const consume = vi.spyOn(changelogOnUpdateState, "consumePendingVersion")
    openOptions()
    await requested.promise
    await changelogOnUpdateState.setPendingVersion("4.11.0")
    await act(async () => response.resolve())
    await waitFor(() => expect(consume).toHaveResolvedWith(null))
    expect(await changelogOnUpdateState.getPendingVersion()).toBe("4.11.0")
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it("rechecks unpublished notes on the next options visit and opens the installed version", async () => {
    await changelogOnUpdateState.setPendingVersion("4.10.1")
    let published = false
    let requests = 0
    server.use(
      http.get(getDocsChangelogIndexUrl(), () => {
        requests++
        return HttpResponse.json({
          schemaVersion: 1,
          versions: published ? ["4.10.1"] : ["4.10.0"],
        })
      }),
    )
    const first = openOptions()
    await waitFor(() => expect(requests).toBe(1))
    expect(await changelogOnUpdateState.getPendingVersion()).toBe("4.10.1")
    expect(screen.queryByRole("dialog")).toBeNull()
    first.unmount()
    published = true
    const second = openOptions()
    const dialog = await screen.findByRole("dialog")
    expect(
      screen.getByRole("heading", { name: "Updated to v4.10.1" }),
    ).toBeInTheDocument()
    expect(dialog.querySelector("iframe")).toHaveAttribute(
      "src",
      expect.stringContaining("#_4-10-1"),
    )
    expect(await changelogOnUpdateState.getPendingVersion()).toBeNull()
    second.unmount()
    openOptions()
    await waitFor(async () =>
      expect(await changelogOnUpdateState.getPendingVersion()).toBeNull(),
    )
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it("keeps notes retryable after all sources fail", async () => {
    await changelogOnUpdateState.setPendingVersion("4.10.1")
    let completedRequests = 0
    for (const url of [
      getDocsChangelogIndexUrl(),
      getGitHubPagesRawChangelogIndexUrl(),
      getGitHubRawChangelogMarkdownUrl(),
    ]) {
      server.use(
        http.get(url, () => {
          completedRequests++
          return new HttpResponse(null, { status: 503 })
        }),
      )
    }
    const first = openOptions()
    await waitFor(() => expect(completedRequests).toBe(3))
    expect(await changelogOnUpdateState.getPendingVersion()).toBe("4.10.1")
    first.unmount()
    publishNotes(["4.10.1"])
    openOptions()
    expect(await screen.findByRole("dialog")).toBeInTheDocument()
  })

  it("uses the installed version when a legacy pending marker belongs to an older build", async () => {
    await changelogOnUpdateState.setPendingVersion("4.9.0")
    publishNotes(["4.9.0", "4.10.1"])
    openOptions()
    const dialog = await screen.findByRole("dialog")
    expect(
      screen.getByRole("heading", { name: "Updated to v4.10.1" }),
    ).toBeInTheDocument()
    expect(dialog.querySelector("iframe")).toHaveAttribute(
      "src",
      expect.stringContaining("#_4-10-1"),
    )
  })

  it("preserves pending updates in compact surfaces until options opens", async () => {
    await changelogOnUpdateState.setPendingVersion("4.10.1")
    vi.mocked(browserEnvironment.isExtensionOptions).mockReturnValue(false)
    let requests = 0
    server.use(
      http.get(getDocsChangelogIndexUrl(), () => {
        requests++
        return HttpResponse.json({ schemaVersion: 1, versions: ["4.10.1"] })
      }),
    )
    const compact = openOptions()
    expect(await changelogOnUpdateState.getPendingVersion()).toBe("4.10.1")
    expect(requests).toBe(0)
    compact.unmount()
    vi.mocked(browserEnvironment.isExtensionOptions).mockReturnValue(true)
    openOptions()
    expect(await screen.findByRole("dialog")).toBeInTheDocument()
  })

  it("discards disabled reminders without fetching and does not replay them when enabled", async () => {
    await userPreferences.savePreferencesWithResult({
      openChangelogOnUpdate: false,
    })
    await changelogOnUpdateState.setPendingVersion("4.10.1")
    const first = openOptions()
    await waitFor(async () =>
      expect(await changelogOnUpdateState.getPendingVersion()).toBeNull(),
    )
    expect(screen.queryByRole("dialog")).toBeNull()
    first.unmount()
    await userPreferences.savePreferencesWithResult({
      openChangelogOnUpdate: true,
    })
    openOptions()
    expect(await changelogOnUpdateState.getPendingVersion()).toBeNull()
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it("does not claim notes if the options page closes during the source request", async () => {
    await changelogOnUpdateState.setPendingVersion("4.10.1")
    let release!: () => void
    const waiting = new Promise<void>((resolve) => {
      release = resolve
    })
    let requested = false
    server.use(
      http.get(getDocsChangelogIndexUrl(), async () => {
        requested = true
        await waiting
        return HttpResponse.json({ schemaVersion: 1, versions: ["4.10.1"] })
      }),
    )
    const first = openOptions()
    await waitFor(() => expect(requested).toBe(true))
    first.unmount()
    release()
    publishNotes(["4.10.1"])
    openOptions()
    expect(await screen.findByRole("dialog")).toBeInTheDocument()
  })

  it("honors a disabled preference changed while notes are loading", async () => {
    await changelogOnUpdateState.setPendingVersion("4.10.1")
    let release!: () => void
    const waiting = new Promise<void>((resolve) => {
      release = resolve
    })
    let requested = false
    server.use(
      http.get(getDocsChangelogIndexUrl(), async () => {
        requested = true
        await waiting
        return HttpResponse.json({ schemaVersion: 1, versions: ["4.10.1"] })
      }),
    )
    openOptions()
    await waitFor(() => expect(requested).toBe(true))
    await act(async () => {
      await userPreferences.savePreferencesWithResult({
        openChangelogOnUpdate: false,
      })
      release()
    })
    await waitFor(async () =>
      expect(await changelogOnUpdateState.getPendingVersion()).toBeNull(),
    )
    expect(screen.queryByRole("dialog")).toBeNull()
  })
})
