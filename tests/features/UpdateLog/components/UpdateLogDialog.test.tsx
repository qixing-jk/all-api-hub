import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import { UpdateLogDialog } from "~/features/UpdateLog"
import { UPDATE_LOG_DIALOG_TEST_IDS } from "~/features/UpdateLog/testIds"
import { userPreferences } from "~/services/preferences/userPreferences"
import { starPromotionState } from "~/services/starPromotion/state"
import * as browserApi from "~/utils/browser/tabs"
import * as docsLinks from "~/utils/navigation/docsLinks"
import { buildUserPreferences } from "~~/tests/test-utils/factories"
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "~~/tests/test-utils/render"

const { promptImpressionMock, trackStarPromotionActionMock } = vi.hoisted(
  () => ({
    promptImpressionMock: vi.fn(),
    trackStarPromotionActionMock: vi.fn(),
  }),
)

vi.mock("~/features/StarPromotion/useStarPromotionActive", () => ({
  useStarPromotionActive: () => true,
  useStarPromotionPromptImpression: promptImpressionMock,
}))

vi.mock("~/services/productAnalytics/facts/starPromotion", () => ({
  trackStarPromotionAction: trackStarPromotionActionMock,
}))

describe("UpdateLogDialog", () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it("keeps automatic update display settings outside the reading dialog", async () => {
    render(<UpdateLogDialog isOpen onClose={() => {}} version="4.8.0" />)
    await screen.findByRole("heading")
    expect(
      screen.queryByTestId(UPDATE_LOG_DIALOG_TEST_IDS.autoOpenToggle),
    ).not.toBeInTheDocument()
  })

  it("opens the full changelog in a new active tab", async () => {
    vi.spyOn(userPreferences, "getPreferences").mockResolvedValue(
      buildUserPreferences({ openChangelogOnUpdate: true }),
    )

    const createTabSpy = vi
      .spyOn(browserApi, "createTab")
      .mockResolvedValue(undefined)
    const getDocsChangelogUrlSpy = vi.spyOn(docsLinks, "getDocsChangelogUrl")

    render(<UpdateLogDialog isOpen onClose={() => {}} version="2.39.0" />)

    fireEvent.click(
      await screen.findByTestId(
        UPDATE_LOG_DIALOG_TEST_IDS.openFullChangelogButton,
      ),
    )

    await waitFor(() => {
      expect(createTabSpy).toHaveBeenCalledWith(
        getDocsChangelogUrlSpy.mock.results.at(-1)?.value,
        true,
      )
    })
  })

  it("records and defers the promotion after opening GitHub", async () => {
    const user = userEvent.setup()
    vi.spyOn(userPreferences, "getPreferences").mockResolvedValue(
      buildUserPreferences({ openChangelogOnUpdate: true }),
    )
    const deferSpy = vi
      .spyOn(starPromotionState, "deferThresholdPrompt")
      .mockResolvedValue(undefined)
    const markCompletedSpy = vi
      .spyOn(starPromotionState, "markCompleted")
      .mockResolvedValue(undefined)
    const createTabSpy = vi
      .spyOn(browserApi, "createTab")
      .mockResolvedValue(undefined)

    render(<UpdateLogDialog isOpen onClose={() => {}} version="2.39.0" />)

    await user.click(
      await screen.findByRole("button", {
        name: "ui:dialog.updateLog.starPrompt",
      }),
    )

    expect(promptImpressionMock).toHaveBeenCalledWith(true, expect.any(Object))
    expect(trackStarPromotionActionMock).toHaveBeenCalledTimes(1)
    expect(markCompletedSpy).not.toHaveBeenCalled()
    expect(deferSpy).toHaveBeenCalledTimes(1)
    expect(createTabSpy).toHaveBeenCalledTimes(1)
    expect(
      screen.queryByRole("button", {
        name: "ui:dialog.updateLog.starPrompt",
      }),
    ).not.toBeInTheDocument()
  })

  it("shows the fallback message when the iframe does not finish loading in time", async () => {
    vi.useFakeTimers()
    vi.spyOn(userPreferences, "getPreferences").mockResolvedValue(
      buildUserPreferences({ openChangelogOnUpdate: true }),
    )

    render(<UpdateLogDialog isOpen onClose={() => {}} version="2.39.0" />)

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(screen.getByText("ui:dialog.updateLog.loading")).toBeVisible()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4_000)
    })

    expect(
      screen.getByText("ui:dialog.updateLog.missingSection", {
        exact: false,
      }),
    ).toBeVisible()
  })

  it("keeps the fallback hidden after the iframe loads before the timeout elapses", async () => {
    vi.useFakeTimers()
    vi.spyOn(userPreferences, "getPreferences").mockResolvedValue(
      buildUserPreferences({ openChangelogOnUpdate: true }),
    )

    render(<UpdateLogDialog isOpen onClose={() => {}} version="2.39.0" />)

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    const iframe = screen.getByTitle("ui:dialog.updateLog.title")
    fireEvent.load(iframe)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4_000)
    })

    expect(
      screen.queryByText("ui:dialog.updateLog.missingSection", {
        exact: false,
      }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText("ui:dialog.updateLog.loading"),
    ).not.toBeInTheDocument()
  })
})
