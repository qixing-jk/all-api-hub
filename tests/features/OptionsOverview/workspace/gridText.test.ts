import type { TFunction } from "i18next"
import { describe, expect, it } from "vitest"

import { OPTIONS_OVERVIEW_WIDGET_IDS } from "~/features/OptionsOverview/ids"
import { getOverviewSectionTitle } from "~/features/OptionsOverview/workspace/gridText"

const t = ((key: string) => key) as TFunction

describe("overview grid text helpers", () => {
  it("resolves section titles from widget ids", () => {
    expect(
      getOverviewSectionTitle(OPTIONS_OVERVIEW_WIDGET_IDS.needsAttention, t),
    ).toBe("optionsOverview:sections.needsAttention")
    expect(
      getOverviewSectionTitle(
        OPTIONS_OVERVIEW_WIDGET_IDS.automationOverview,
        t,
      ),
    ).toBe("optionsOverview:sections.automationOverview")
    expect(
      getOverviewSectionTitle(OPTIONS_OVERVIEW_WIDGET_IDS.recentUsage, t),
    ).toBe("optionsOverview:sections.recentUsage")
    expect(
      getOverviewSectionTitle(OPTIONS_OVERVIEW_WIDGET_IDS.actionCenter, t),
    ).toBe("optionsOverview:sections.configurationOverview")
  })
})
