import userEvent from "@testing-library/user-event"
import { http, HttpResponse } from "msw"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { BASIC_SETTINGS_ANCHOR_TO_TAB } from "~/constants/basicSettingsTabs"
import { SETTINGS_ANCHORS } from "~/constants/settingsAnchors"
import { SITE_TYPES } from "~/constants/siteType"
import MagpieSettings from "~/features/BasicSettings/components/tabs/ManagedSite/providers/MagpieSettings"
import { magpieSettingsSearch } from "~/features/BasicSettings/components/tabs/ManagedSite/search/ManagedSiteMagpie.search"
import toast from "~/lib/notify"
import { userPreferences } from "~/services/preferences/userPreferences"
import { server } from "~~/tests/msw/server"
import { atIndex } from "~~/tests/test-utils/indexedAccess"
import { render, screen, waitFor } from "~~/tests/test-utils/render"

vi.mock("~/lib/notify", () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}))
const BASE_URL = "http://magpie.example.invalid:3001"
const input = async (container: HTMLElement, anchor: string) => {
  await waitFor(() =>
    expect(container.querySelector(`#${anchor} input`)).not.toBeNull(),
  )
  return container.querySelector<HTMLInputElement>(`#${anchor} input`)!
}

describe("magpie managed-site settings", () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await userPreferences.savePreferences({
      magpie: { baseUrl: "", webKey: "" },
    })
  })

  it("requires connection fields before validation", async () => {
    render(<MagpieSettings />)
    await userEvent.click(
      await screen.findByRole("button", {
        name: "settings:magpie.validation.validate",
      }),
    )
    expect(toast.error).toHaveBeenCalledWith(
      "settings:magpie.validation.missingFields",
    )
  })

  it.each([
    [200, "success"],
    [401, "invalidCredential"],
    [500, "failed"],
  ])(
    "saves and validates the entered Web connection (%s)",
    async (status, expected) => {
      server.use(
        http.get(`${BASE_URL}/`, ({ request }) => {
          expect(new URL(request.url).searchParams.get("k")).toBe("fake-key")
          return new HttpResponse("", { status })
        }),
        http.get(`${BASE_URL}/api/providers`, () =>
          HttpResponse.json({ providers: [] }),
        ),
      )
      const user = userEvent.setup()
      const { container } = render(<MagpieSettings />)
      await user.type(
        await input(container, SETTINGS_ANCHORS.MAGPIE_BASE_URL),
        BASE_URL,
      )
      await user.type(
        await input(container, SETTINGS_ANCHORS.MAGPIE_WEB_KEY),
        "fake-key",
      )
      await user.click(
        await screen.findByRole("button", {
          name: "settings:magpie.validation.validate",
        }),
      )
      await waitFor(() =>
        expect(
          expected === "success" ? toast.success : toast.error,
        ).toHaveBeenCalledWith(
          expect.stringContaining(`settings:magpie.validation.${expected}`),
        ),
      )
      expect(await userPreferences.getPreferences()).toMatchObject({
        magpie: { baseUrl: BASE_URL, webKey: "fake-key" },
      })
      vi.mocked(toast.success).mockClear()
      vi.mocked(toast.error).mockClear()
      await user.click(
        await screen.findByRole("button", {
          name: "settings:magpie.validation.validate",
        }),
      )
      await waitFor(() =>
        expect(
          expected === "success" ? toast.success : toast.error,
        ).toHaveBeenCalledWith(
          expect.stringContaining(`settings:magpie.validation.${expected}`),
        ),
      )
    },
  )
  it("maps every rendered setting to its shared target ID", () => {
    // Nothing here opens the gateway's own console: magpie credentials come
    // from the deployment's environment, so a settings-side bookmark to the
    // panel adds a row without onboarding value. The channel workspace toolbar
    // owns that jump (openChannelConsole).
    expect(
      magpieSettingsSearch.controls.map((definition) => definition.targetId),
    ).toEqual([
      SETTINGS_ANCHORS.MAGPIE_BASE_URL,
      SETTINGS_ANCHORS.MAGPIE_WEB_KEY,
      SETTINGS_ANCHORS.MAGPIE_VALIDATE,
    ])
    for (const targetId of [
      SETTINGS_ANCHORS.MAGPIE_BASE_URL,
      SETTINGS_ANCHORS.MAGPIE_WEB_KEY,
      SETTINGS_ANCHORS.MAGPIE_VALIDATE,
    ]) {
      expect(BASIC_SETTINGS_ANCHOR_TO_TAB[targetId]).toBe("managedSite")
    }
  })

  it("shows the entries only for the magpie managed-site selection", () => {
    const visibility = atIndex(magpieSettingsSearch.controls, 0).isVisible!
    expect(visibility({ managedSiteType: SITE_TYPES.MAGPIE } as any)).toBe(true)
    expect(visibility({ managedSiteType: SITE_TYPES.NEW_API } as any)).toBe(
      false,
    )
  })
})
