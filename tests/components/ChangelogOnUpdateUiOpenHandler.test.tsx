import { afterEach, describe, expect, it, vi } from "vitest"

import ChangelogOnUpdateUiOpenHandler from "~/components/ChangelogOnUpdateUiOpenHandler"
import { changelogOnUpdateState } from "~/services/changelogOnUpdateState"
import {
  DEFAULT_PREFERENCES,
  userPreferences,
} from "~/services/userPreferences"
import { render, waitFor } from "~/tests/test-utils/render"

describe("ChangelogOnUpdateUiOpenHandler", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("opens once on first UI open and clears the pending marker", async () => {
    vi.spyOn(userPreferences, "getPreferences").mockResolvedValue({
      ...DEFAULT_PREFERENCES,
      openChangelogOnUpdate: true,
    })

    let pending: string | null = "2.39.0"
    const consumeSpy = vi
      .spyOn(changelogOnUpdateState, "consumePendingVersion")
      .mockImplementation(async () => {
        const next = pending
        pending = null
        return next
      })

    const docsLinks = await import("~/utils/docsLinks")
    const getDocsChangelogUrlSpy = vi
      .spyOn(docsLinks, "getDocsChangelogUrl")
      .mockReturnValue("https://docs.example.test/changelog.html#_2-39-0")

    const browserApi = await import("~/utils/browserApi")
    const createTabSpy = vi
      .spyOn(browserApi, "createTab")
      .mockResolvedValue(undefined)

    const first = render(<ChangelogOnUpdateUiOpenHandler />)

    await waitFor(() => {
      expect(getDocsChangelogUrlSpy).toHaveBeenCalledWith("2.39.0")
      expect(createTabSpy).toHaveBeenCalledWith(
        "https://docs.example.test/changelog.html#_2-39-0",
        true,
      )
    })

    first.unmount()

    render(<ChangelogOnUpdateUiOpenHandler />)

    await waitFor(() => {
      expect(consumeSpy).toHaveBeenCalledTimes(2)
    })

    expect(createTabSpy).toHaveBeenCalledTimes(1)
  })

  it("clears pending marker without opening when preference is disabled", async () => {
    let openChangelogOnUpdate = false
    vi.spyOn(userPreferences, "getPreferences").mockImplementation(
      async () => ({
        ...DEFAULT_PREFERENCES,
        openChangelogOnUpdate,
      }),
    )

    let pending: string | null = "2.39.0"
    const consumeSpy = vi
      .spyOn(changelogOnUpdateState, "consumePendingVersion")
      .mockImplementation(async () => {
        const next = pending
        pending = null
        return next
      })

    const docsLinks = await import("~/utils/docsLinks")
    const getDocsChangelogUrlSpy = vi.spyOn(docsLinks, "getDocsChangelogUrl")

    const browserApi = await import("~/utils/browserApi")
    const createTabSpy = vi
      .spyOn(browserApi, "createTab")
      .mockResolvedValue(undefined)

    const first = render(<ChangelogOnUpdateUiOpenHandler />)

    await waitFor(() => {
      expect(consumeSpy).toHaveBeenCalledTimes(1)
    })

    expect(getDocsChangelogUrlSpy).not.toHaveBeenCalled()
    expect(createTabSpy).not.toHaveBeenCalled()

    openChangelogOnUpdate = true
    first.unmount()

    render(<ChangelogOnUpdateUiOpenHandler />)

    await waitFor(() => {
      expect(consumeSpy).toHaveBeenCalledTimes(2)
    })

    expect(getDocsChangelogUrlSpy).not.toHaveBeenCalled()
    expect(createTabSpy).not.toHaveBeenCalled()
  })
})
