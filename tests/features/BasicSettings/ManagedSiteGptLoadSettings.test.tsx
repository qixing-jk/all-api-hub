import { describe, expect, it } from "vitest"

import { BASIC_SETTINGS_ANCHOR_TO_TAB } from "~/constants/basicSettingsTabs"
import { SETTINGS_ANCHORS } from "~/constants/settingsAnchors"
import { SITE_TYPES } from "~/constants/siteType"
import GptLoadSettings from "~/features/BasicSettings/components/tabs/ManagedSite/GptLoadSettings"
import { managedSiteGptLoadSearchControls } from "~/features/BasicSettings/components/tabs/ManagedSite/ManagedSiteGptLoad.search"
import { atIndex } from "~~/tests/test-utils/indexedAccess"
import { render, waitFor } from "~~/tests/test-utils/render"

describe("gpt-load managed-site settings", () => {
  it("maps every rendered setting to its shared target ID", () => {
    // Nothing here opens the gateway's own console: gpt-load credentials come
    // from the deployment's environment, so a settings-side bookmark to the
    // panel adds a row without onboarding value. The channel workspace toolbar
    // owns that jump (openChannelConsole).
    expect(
      managedSiteGptLoadSearchControls.map((definition) => definition.targetId),
    ).toEqual([
      SETTINGS_ANCHORS.GPT_LOAD_BASE_URL,
      SETTINGS_ANCHORS.GPT_LOAD_MANAGEMENT_KEY,
      SETTINGS_ANCHORS.GPT_LOAD_VALIDATE,
    ])
    for (const targetId of [
      SETTINGS_ANCHORS.GPT_LOAD_BASE_URL,
      SETTINGS_ANCHORS.GPT_LOAD_MANAGEMENT_KEY,
      SETTINGS_ANCHORS.GPT_LOAD_VALIDATE,
    ]) {
      expect(BASIC_SETTINGS_ANCHOR_TO_TAB[targetId]).toBe("managedSite")
    }
  })

  it("shows the entries only for the gpt-load managed-site selection", () => {
    const visibility = atIndex(managedSiteGptLoadSearchControls, 0).isVisible!
    expect(visibility({ managedSiteType: SITE_TYPES.GPT_LOAD } as any)).toBe(
      true,
    )
    expect(visibility({ managedSiteType: SITE_TYPES.NEW_API } as any)).toBe(
      false,
    )
  })

  it("renders no console-link row beside the connection fields", async () => {
    const { container } = render(<GptLoadSettings />)
    // The form renders once preferences load; only field rows may remain.
    await waitFor(() =>
      expect(
        container.querySelector(`#${SETTINGS_ANCHORS.GPT_LOAD_BASE_URL}`),
      ).not.toBeNull(),
    )
    expect(
      container.querySelector(`#${SETTINGS_ANCHORS.GPT_LOAD_MANAGEMENT_KEY}`),
    ).not.toBeNull()
    expect(
      container.querySelector(`#${SETTINGS_ANCHORS.GPT_LOAD_VALIDATE}`),
    ).not.toBeNull()
    expect(container.querySelector("#gpt-load-groups-link")).toBeNull()
  })
})
