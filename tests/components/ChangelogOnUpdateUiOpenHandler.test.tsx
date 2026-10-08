import { afterEach, describe, expect, it, vi } from "vitest"

import { ChangelogOnUpdateUiOpenHandler } from "~/components/ChangelogOnUpdateUiOpenHandler"
import {
  UpdateLogDialogContainer,
  UpdateLogDialogProvider,
} from "~/components/dialogs/UpdateLogDialog"
import { UPDATE_LOG_DIALOG_TEST_IDS } from "~/components/dialogs/UpdateLogDialog/testIds"
import { DEFAULT_PREFERENCES } from "~/services/preferences/preferencesDefaults"
import { userPreferences } from "~/services/preferences/userPreferences"
import { changelogOnUpdateState } from "~/services/updates/changelogOnUpdateState"
import { render, screen, waitFor } from "~~/tests/test-utils/render"

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
      expect(
        screen.getByTestId(UPDATE_LOG_DIALOG_TEST_IDS.root),
      ).toBeInTheDocument()
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

    expect(screen.queryByTestId(UPDATE_LOG_DIALOG_TEST_IDS.root)).toBeNull()
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

    expect(screen.queryByTestId(UPDATE_LOG_DIALOG_TEST_IDS.root)).toBeNull()

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

    expect(screen.queryByTestId(UPDATE_LOG_DIALOG_TEST_IDS.root)).toBeNull()
  })
})
