import type { TFunction } from "i18next"
import { describe, expect, it } from "vitest"

import {
  getAutoCheckinActionLabel,
  getAutoCheckinEmptyDescription,
  getAutoCheckinStatusLabel,
} from "~/features/OptionsOverview/components/autoCheckinPanelText"
import {
  OPTIONS_OVERVIEW_AUTO_CHECKIN_ACTION_IDS,
  OPTIONS_OVERVIEW_AUTO_CHECKIN_PANEL_STATUSES,
} from "~/features/OptionsOverview/ids"

const t = ((key: string) => key) as TFunction

describe("auto check-in panel text helpers", () => {
  it("resolves status labels from normalized panel statuses", () => {
    expect(
      getAutoCheckinStatusLabel(
        OPTIONS_OVERVIEW_AUTO_CHECKIN_PANEL_STATUSES.ready,
        t,
      ),
    ).toBe("optionsOverview:autoCheckin.status.ready")
    expect(
      getAutoCheckinStatusLabel(
        OPTIONS_OVERVIEW_AUTO_CHECKIN_PANEL_STATUSES.success,
        t,
      ),
    ).toBe("optionsOverview:autoCheckin.status.success")
    expect(
      getAutoCheckinStatusLabel(
        OPTIONS_OVERVIEW_AUTO_CHECKIN_PANEL_STATUSES.partial,
        t,
      ),
    ).toBe("optionsOverview:autoCheckin.status.partial")
    expect(
      getAutoCheckinStatusLabel(
        OPTIONS_OVERVIEW_AUTO_CHECKIN_PANEL_STATUSES.failed,
        t,
      ),
    ).toBe("optionsOverview:autoCheckin.status.failed")
    expect(
      getAutoCheckinStatusLabel(
        OPTIONS_OVERVIEW_AUTO_CHECKIN_PANEL_STATUSES.disabled,
        t,
      ),
    ).toBe("optionsOverview:autoCheckin.status.disabled")
    expect(
      getAutoCheckinStatusLabel(
        OPTIONS_OVERVIEW_AUTO_CHECKIN_PANEL_STATUSES.notRun,
        t,
      ),
    ).toBe("optionsOverview:autoCheckin.status.not_run")
  })

  it("resolves empty descriptions only for empty auto check-in states", () => {
    expect(
      getAutoCheckinEmptyDescription(
        OPTIONS_OVERVIEW_AUTO_CHECKIN_PANEL_STATUSES.disabled,
        t,
      ),
    ).toBe("optionsOverview:autoCheckin.empty.disabled.description")
    expect(
      getAutoCheckinEmptyDescription(
        OPTIONS_OVERVIEW_AUTO_CHECKIN_PANEL_STATUSES.notRun,
        t,
      ),
    ).toBe("optionsOverview:autoCheckin.empty.notRun.description")

    expect(
      getAutoCheckinEmptyDescription(
        OPTIONS_OVERVIEW_AUTO_CHECKIN_PANEL_STATUSES.ready,
        t,
      ),
    ).toBe("")
    expect(
      getAutoCheckinEmptyDescription(
        OPTIONS_OVERVIEW_AUTO_CHECKIN_PANEL_STATUSES.success,
        t,
      ),
    ).toBe("")
    expect(
      getAutoCheckinEmptyDescription(
        OPTIONS_OVERVIEW_AUTO_CHECKIN_PANEL_STATUSES.partial,
        t,
      ),
    ).toBe("")
    expect(
      getAutoCheckinEmptyDescription(
        OPTIONS_OVERVIEW_AUTO_CHECKIN_PANEL_STATUSES.failed,
        t,
      ),
    ).toBe("")
  })

  it("resolves action labels from semantic action ids", () => {
    expect(
      getAutoCheckinActionLabel(
        OPTIONS_OVERVIEW_AUTO_CHECKIN_ACTION_IDS.openAutoCheckin,
        t,
      ),
    ).toBe("optionsOverview:autoCheckin.actions.open")
    expect(
      getAutoCheckinActionLabel(
        OPTIONS_OVERVIEW_AUTO_CHECKIN_ACTION_IDS.retryFailed,
        t,
      ),
    ).toBe("optionsOverview:autoCheckin.actions.retryFailed")
  })
})
