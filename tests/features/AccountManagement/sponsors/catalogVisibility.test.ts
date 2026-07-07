import { describe, expect, it } from "vitest"

import {
  getCampaignVisibilityState,
  SPONSOR_CAMPAIGN_VISIBILITY_STATES,
  validateVisibilityShape,
} from "~/features/AccountManagement/sponsors/catalogVisibility"

describe("sponsor catalog visibility helpers", () => {
  it("reports strict shape errors for malformed visibility payloads", () => {
    expect(validateVisibilityShape("example", "en", null)).toEqual([
      "item example locale en has invalid visibility",
    ])

    expect(
      validateVisibilityShape("example", "en", {
        unsupported: true,
      }),
    ).toEqual([
      "item example locale en has unsupported visibility fields: unsupported",
    ])

    expect(
      validateVisibilityShape("example", "en", {
        extensionVersions: 1,
      }),
    ).toEqual(["item example locale en has invalid visibility"])

    expect(
      validateVisibilityShape("example", "en", {
        excludedBrowserFamilies: ["firefox", 1],
      }),
    ).toEqual(["item example locale en has invalid visibility"])

    expect(
      validateVisibilityShape("example", "en", {
        extensionVersions: ">=3.52.0",
        excludedBrowserFamilies: ["firefox"],
      }),
    ).toEqual([])
  })

  it("classifies malformed catalog visibility constraints as invalid", () => {
    expect(
      getCampaignVisibilityState(null, {
        currentVersion: "3.52.1",
        browserFamily: "firefox",
      }),
    ).toBe(SPONSOR_CAMPAIGN_VISIBILITY_STATES.Invalid)

    expect(
      getCampaignVisibilityState(
        {
          extensionVersions: 1,
        },
        {
          currentVersion: "3.52.1",
          browserFamily: "firefox",
        },
      ),
    ).toBe(SPONSOR_CAMPAIGN_VISIBILITY_STATES.Invalid)

    expect(
      getCampaignVisibilityState(
        {
          excludedBrowserFamilies: ["firefox", 1],
        },
        {
          currentVersion: "3.52.1",
          browserFamily: "firefox",
        },
      ),
    ).toBe(SPONSOR_CAMPAIGN_VISIBILITY_STATES.Invalid)

    expect(
      getCampaignVisibilityState(
        {
          excludedBrowserFamilies: ["brave"],
        },
        {
          currentVersion: "3.52.1",
          browserFamily: "firefox",
        },
      ),
    ).toBe(SPONSOR_CAMPAIGN_VISIBILITY_STATES.Invalid)

    expect(
      getCampaignVisibilityState(
        {
          excludedBrowserFamilies: ["firefox"],
        },
        {
          currentVersion: "3.52.1",
          browserFamily: "brave",
        },
      ),
    ).toBe(SPONSOR_CAMPAIGN_VISIBILITY_STATES.Hidden)
  })

  it("evaluates version and browser constraints against normalized runtime context", () => {
    expect(
      getCampaignVisibilityState(undefined, {
        currentVersion: "3.52.1",
        browserFamily: "firefox",
      }),
    ).toBe(SPONSOR_CAMPAIGN_VISIBILITY_STATES.Visible)

    expect(
      getCampaignVisibilityState(
        {
          extensionVersions: ">=3.52.0 <3.53.0",
        },
        {
          currentVersion: "3.52.1",
          browserFamily: "firefox",
        },
      ),
    ).toBe(SPONSOR_CAMPAIGN_VISIBILITY_STATES.Visible)

    expect(
      getCampaignVisibilityState(
        {
          extensionVersions: ">=3.52.0 <3.53.0",
        },
        {
          currentVersion: "3.51.0",
          browserFamily: "firefox",
        },
      ),
    ).toBe(SPONSOR_CAMPAIGN_VISIBILITY_STATES.Hidden)

    expect(
      getCampaignVisibilityState(
        {
          extensionVersions: ">=3.52.0",
        },
        {
          browserFamily: "firefox",
        },
      ),
    ).toBe(SPONSOR_CAMPAIGN_VISIBILITY_STATES.Hidden)

    expect(
      getCampaignVisibilityState(
        {
          excludedBrowserFamilies: ["firefox"],
        },
        {
          currentVersion: "3.52.1",
          browserFamily: " Firefox ",
        },
      ),
    ).toBe(SPONSOR_CAMPAIGN_VISIBILITY_STATES.Hidden)

    expect(
      getCampaignVisibilityState(
        {
          excludedBrowserFamilies: ["firefox"],
        },
        {
          currentVersion: "3.52.1",
        },
      ),
    ).toBe(SPONSOR_CAMPAIGN_VISIBILITY_STATES.Hidden)

    expect(
      getCampaignVisibilityState(
        {
          excludedBrowserFamilies: ["firefox"],
        },
        {
          currentVersion: "3.52.1",
          browserFamily: "chromium",
        },
      ),
    ).toBe(SPONSOR_CAMPAIGN_VISIBILITY_STATES.Visible)
  })
})
