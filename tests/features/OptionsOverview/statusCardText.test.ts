import type { TFunction } from "i18next"
import { describe, expect, it } from "vitest"

import {
  getStatusCardDescription,
  getStatusCardLabel,
} from "~/features/OptionsOverview/components/statusCardText"
import { OPTIONS_OVERVIEW_STATUS_CARD_IDS } from "~/features/OptionsOverview/ids"

const t = ((key: string) => key) as TFunction

describe("status card text helpers", () => {
  it("resolves labels from semantic status card ids", () => {
    expect(
      getStatusCardLabel(OPTIONS_OVERVIEW_STATUS_CARD_IDS.accounts, t),
    ).toBe("optionsOverview:status.accounts.label")
    expect(
      getStatusCardLabel(OPTIONS_OVERVIEW_STATUS_CARD_IDS.profiles, t),
    ).toBe("optionsOverview:status.profiles.label")
    expect(
      getStatusCardLabel(OPTIONS_OVERVIEW_STATUS_CARD_IDS.todayUsage, t),
    ).toBe("optionsOverview:status.todayUsage.label")
    expect(
      getStatusCardLabel(OPTIONS_OVERVIEW_STATUS_CARD_IDS.attention, t),
    ).toBe("optionsOverview:status.attention.label")
  })

  it("resolves descriptions from semantic status card ids", () => {
    expect(
      getStatusCardDescription(OPTIONS_OVERVIEW_STATUS_CARD_IDS.accounts, t),
    ).toBe("optionsOverview:status.accounts.description")
    expect(
      getStatusCardDescription(OPTIONS_OVERVIEW_STATUS_CARD_IDS.profiles, t),
    ).toBe("optionsOverview:status.profiles.description")
    expect(
      getStatusCardDescription(OPTIONS_OVERVIEW_STATUS_CARD_IDS.todayUsage, t),
    ).toBe("optionsOverview:status.todayUsage.description")
    expect(
      getStatusCardDescription(OPTIONS_OVERVIEW_STATUS_CARD_IDS.attention, t),
    ).toBe("optionsOverview:status.attention.description")
  })
})
