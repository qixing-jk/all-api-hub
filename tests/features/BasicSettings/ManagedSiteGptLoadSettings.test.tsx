import userEvent from "@testing-library/user-event"
import { http, HttpResponse } from "msw"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { BASIC_SETTINGS_ANCHOR_TO_TAB } from "~/constants/basicSettingsTabs"
import { SETTINGS_ANCHORS } from "~/constants/settingsAnchors"
import { SITE_TYPES } from "~/constants/siteType"
import GptLoadSettings from "~/features/BasicSettings/components/tabs/ManagedSite/GptLoadSettings"
import { managedSiteGptLoadSearchControls } from "~/features/BasicSettings/components/tabs/ManagedSite/ManagedSiteGptLoad.search"
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
const BASE_URL = "http://gpt-load.example.invalid:3001"
const input = async (container: HTMLElement, anchor: string) => {
  await waitFor(() =>
    expect(container.querySelector(`#${anchor} input`)).not.toBeNull(),
  )
  return container.querySelector<HTMLInputElement>(`#${anchor} input`)!
}

describe("gpt-load managed-site settings", () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await userPreferences.savePreferences({
      gptLoad: { baseUrl: "", managementKey: "" },
    })
  })

  it("requires connection fields before validation", async () => {
    render(<GptLoadSettings />)
    await userEvent.click(
      await screen.findByRole("button", {
        name: "settings:gptLoad.validation.validate",
      }),
    )
    expect(toast.error).toHaveBeenCalledWith(
      "settings:gptLoad.validation.missingFields",
    )
  })

  it.each([
    [200, "admin", "success"],
    [200, "access_key", "insufficientPrivilege"],
    [401, "", "invalidCredential"],
    [500, "", "failed"],
  ])(
    "saves and validates the entered connection (%s, %s)",
    async (status, principal, expected) => {
      server.use(
        http.get(`${BASE_URL}/api/auth/session`, () =>
          HttpResponse.json(
            {
              code: status === 200 ? 0 : "FAILED",
              message: "rejected",
              data: { authenticated: true, principal_type: principal },
            },
            { status },
          ),
        ),
        http.get(`${BASE_URL}/api/groups`, () =>
          HttpResponse.json({ code: 0, data: { items: [] } }),
        ),
      )
      const user = userEvent.setup()
      const { container } = render(<GptLoadSettings />)
      await user.type(
        await input(container, SETTINGS_ANCHORS.GPT_LOAD_BASE_URL),
        BASE_URL,
      )
      await user.type(
        await input(container, SETTINGS_ANCHORS.GPT_LOAD_MANAGEMENT_KEY),
        "fake-key",
      )
      await user.click(
        await screen.findByRole("button", {
          name: "settings:gptLoad.validation.validate",
        }),
      )
      await waitFor(() =>
        expect(
          expected === "success" ? toast.success : toast.error,
        ).toHaveBeenCalledWith(
          expect.stringContaining(`settings:gptLoad.validation.${expected}`),
        ),
      )
      expect(await userPreferences.getPreferences()).toMatchObject({
        gptLoad: { baseUrl: BASE_URL, managementKey: "fake-key" },
      })
      vi.mocked(toast.success).mockClear()
      vi.mocked(toast.error).mockClear()
      await user.click(
        await screen.findByRole("button", {
          name: "settings:gptLoad.validation.validate",
        }),
      )
      await waitFor(() =>
        expect(
          expected === "success" ? toast.success : toast.error,
        ).toHaveBeenCalledWith(
          expect.stringContaining(`settings:gptLoad.validation.${expected}`),
        ),
      )
    },
  )
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
