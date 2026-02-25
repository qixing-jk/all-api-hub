import { afterEach, describe, expect, it, vi } from "vitest"

import ChangelogOnUpdateUiOpenHandler from "~/components/ChangelogOnUpdateUiOpenHandler"
import {
  UpdateLogDialogContainer,
  UpdateLogDialogProvider,
} from "~/components/UpdateLogDialog"
import { changelogOnUpdateState } from "~/services/changelogOnUpdateState"
import {
  DEFAULT_PREFERENCES,
  userPreferences,
} from "~/services/userPreferences"
import { render, screen, waitFor } from "~/tests/test-utils/render"

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

    const first = render(
      <UpdateLogDialogProvider>
        <ChangelogOnUpdateUiOpenHandler />
        <UpdateLogDialogContainer />
      </UpdateLogDialogProvider>,
    )

    await waitFor(() => {
      expect(screen.getByTestId("update-log-dialog")).toBeInTheDocument()
    })

    first.unmount()

    render(
      <UpdateLogDialogProvider>
        <ChangelogOnUpdateUiOpenHandler />
        <UpdateLogDialogContainer />
      </UpdateLogDialogProvider>,
    )

    await waitFor(() => {
      expect(consumeSpy).toHaveBeenCalledTimes(2)
    })

    expect(screen.queryByTestId("update-log-dialog")).toBeNull()
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

    const first = render(
      <UpdateLogDialogProvider>
        <ChangelogOnUpdateUiOpenHandler />
        <UpdateLogDialogContainer />
      </UpdateLogDialogProvider>,
    )

    await waitFor(() => {
      expect(consumeSpy).toHaveBeenCalledTimes(1)
    })

    expect(screen.queryByTestId("update-log-dialog")).toBeNull()

    openChangelogOnUpdate = true
    first.unmount()

    render(
      <UpdateLogDialogProvider>
        <ChangelogOnUpdateUiOpenHandler />
        <UpdateLogDialogContainer />
      </UpdateLogDialogProvider>,
    )

    await waitFor(() => {
      expect(consumeSpy).toHaveBeenCalledTimes(2)
    })

    expect(screen.queryByTestId("update-log-dialog")).toBeNull()
  })
})
