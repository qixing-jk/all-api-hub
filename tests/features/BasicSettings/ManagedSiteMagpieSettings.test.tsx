import userEvent from "@testing-library/user-event"
import { http, HttpResponse } from "msw"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { BASIC_SETTINGS_ANCHOR_TO_TAB } from "~/constants/basicSettingsTabs"
import { SETTINGS_ANCHORS } from "~/constants/settingsAnchors"
import { SITE_TYPES } from "~/constants/siteType"
import MagpieSettings from "~/features/BasicSettings/components/tabs/ManagedSite/providers/MagpieSettings"
import { magpieSettingsSearch } from "~/features/BasicSettings/components/tabs/ManagedSite/search/ManagedSiteMagpie.search"
import toast from "~/lib/notify"
import settings from "~/locales/en/settings.json"
import * as magpieApi from "~/services/apiService/magpie/providers"
import { userPreferences } from "~/services/preferences/userPreferences"
import { server } from "~~/tests/msw/server"
import { createDeferred } from "~~/tests/test-utils/deferred"
import { testI18n } from "~~/tests/test-utils/i18n"
import { atIndex } from "~~/tests/test-utils/indexedAccess"
import { act, render, screen, waitFor } from "~~/tests/test-utils/render"

testI18n.addResourceBundle(
  "en",
  "settings",
  {
    managedSiteConnection: {
      failed: settings.managedSiteConnection.failed,
    },
  },
  true,
  true,
)

vi.mock("~/lib/notify", () => ({
  default: {
    loading: vi.fn(),
    dismiss: vi.fn(),
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
  afterEach(() => vi.restoreAllMocks())
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
        name: "settings:managedSiteConnection.check",
      }),
    )
    expect(toast.error).toHaveBeenCalledWith(
      "settings:magpie.validation.missingFields",
    )
  })

  it("waits for the Web key to persist before reporting a usable connection", async () => {
    await userPreferences.savePreferences({
      magpie: { baseUrl: BASE_URL, webKey: "old-key" },
    })
    const saved = createDeferred<void>()
    const originalSave =
      userPreferences.savePreferencesWithResult.bind(userPreferences)
    const save = vi
      .spyOn(userPreferences, "savePreferencesWithResult")
      .mockImplementation(async (...args) => {
        if (args[0].magpie?.webKey === "new-key") await saved.promise
        return originalSave(...args)
      })
    const validate = vi
      .spyOn(magpieApi, "listMagpieProviders")
      .mockResolvedValue([])
    const user = userEvent.setup()
    const { container, unmount } = render(<MagpieSettings />)
    const key = await input(container, SETTINGS_ANCHORS.MAGPIE_WEB_KEY)
    await user.clear(key)
    await user.type(key, "new-key")
    await user.click(
      await screen.findByRole("button", {
        name: "settings:managedSiteConnection.check",
      }),
    )
    try {
      await waitFor(() => expect(save).toHaveBeenCalled())
      expect(validate).not.toHaveBeenCalled()
      expect(toast.success).not.toHaveBeenCalledWith(
        "settings:managedSiteConnection.success",
        expect.objectContaining({ id: expect.any(String) }),
      )
    } finally {
      await act(async () => saved.resolve())
      save.mockRestore()
    }
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        "settings:managedSiteConnection.success",
        expect.objectContaining({ id: expect.any(String) }),
      ),
    )
    // Leaving immediately after success must use the new persisted key.
    unmount()
    expect((await userPreferences.getPreferences()).magpie?.webKey).toBe(
      "new-key",
    )
    validate.mockRestore()
  })

  it("restores the current key when an earlier rejected key is still being saved", async () => {
    await userPreferences.savePreferences({
      magpie: { baseUrl: BASE_URL, webKey: "valid-key" },
    })
    const pending = createDeferred<void>()
    const originalSave =
      userPreferences.savePreferencesWithResult.bind(userPreferences)
    const save = vi
      .spyOn(userPreferences, "savePreferencesWithResult")
      .mockImplementation(async (...args) => {
        if (args[0].magpie?.webKey === "invalid-key") await pending.promise
        return originalSave(...args)
      })
    const validate = vi
      .spyOn(magpieApi, "listMagpieProviders")
      .mockResolvedValue([])
    const user = userEvent.setup()
    const { container } = render(<MagpieSettings />)
    const key = await input(container, SETTINGS_ANCHORS.MAGPIE_WEB_KEY)
    await user.clear(key)
    await user.type(key, "invalid-key")
    await user.tab()
    await waitFor(() => expect(save).toHaveBeenCalled())
    await user.clear(key)
    await user.type(key, "valid-key")
    await user.click(
      await screen.findByRole("button", {
        name: "settings:managedSiteConnection.check",
      }),
    )
    try {
      expect(validate).not.toHaveBeenCalled()
    } finally {
      await act(async () => pending.resolve())
    }
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        "settings:managedSiteConnection.success",
        expect.objectContaining({ id: expect.any(String) }),
      ),
    )
    expect((await userPreferences.getPreferences()).magpie?.webKey).toBe(
      "valid-key",
    )
  })

  it("does not validate an unsaved key after storage failure, and allows an explicit retry", async () => {
    await userPreferences.savePreferences({
      magpie: { baseUrl: BASE_URL, webKey: "old-key" },
    })
    const save = vi
      .spyOn(userPreferences, "savePreferencesWithResult")
      .mockResolvedValue({
        ok: false,
        reason: {
          type: "storage-error",
          error: new Error("Storage unavailable"),
        },
      })
    const validate = vi
      .spyOn(magpieApi, "listMagpieProviders")
      .mockResolvedValue([])
    try {
      const user = userEvent.setup()
      const { container } = render(<MagpieSettings />)
      const key = await input(container, SETTINGS_ANCHORS.MAGPIE_WEB_KEY)
      await user.clear(key)
      await user.type(key, "new-key")
      await user.click(
        await screen.findByRole("button", {
          name: "settings:managedSiteConnection.check",
        }),
      )
      await waitFor(() => expect(toast.error).toHaveBeenCalled())
      expect(validate).not.toHaveBeenCalled()
      expect(toast.success).not.toHaveBeenCalledWith(
        "settings:managedSiteConnection.success",
        expect.objectContaining({ id: expect.any(String) }),
      )
      expect((await userPreferences.getPreferences()).magpie?.webKey).toBe(
        "old-key",
      )
      expect(key).toHaveValue("new-key")
      save.mockRestore()
      await user.click(
        await screen.findByRole("button", {
          name: "settings:managedSiteConnection.check",
        }),
      )
      await waitFor(() =>
        expect(toast.success).toHaveBeenCalledWith(
          "settings:managedSiteConnection.success",
          expect.objectContaining({ id: expect.any(String) }),
        ),
      )
      expect((await userPreferences.getPreferences()).magpie?.webKey).toBe(
        "new-key",
      )
    } finally {
      save.mockRestore()
      validate.mockRestore()
    }
  })

  it("preserves a concurrent credential change and refuses to validate a stale draft", async () => {
    await userPreferences.savePreferences({
      magpie: { baseUrl: BASE_URL, webKey: "old-key" },
    })
    const pending = createDeferred<void>()
    const originalSave =
      userPreferences.savePreferencesWithResult.bind(userPreferences)
    vi.spyOn(userPreferences, "savePreferencesWithResult").mockImplementation(
      async (...args) => {
        if (args[0].magpie?.webKey === "draft-key") await pending.promise
        return originalSave(...args)
      },
    )
    const validate = vi
      .spyOn(magpieApi, "listMagpieProviders")
      .mockResolvedValue([])
    const user = userEvent.setup()
    const { container } = render(<MagpieSettings />)
    const key = await input(container, SETTINGS_ANCHORS.MAGPIE_WEB_KEY)
    await user.clear(key)
    await user.type(key, "draft-key")
    await user.click(
      await screen.findByRole("button", {
        name: "settings:managedSiteConnection.check",
      }),
    )
    try {
      await act(async () => {
        await userPreferences.savePreferences({
          magpie: { webKey: "external-key" },
        })
      })
    } finally {
      await act(async () => pending.resolve())
    }
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "settings:messages.preferencesChangedExternally",
      ),
    )
    expect(validate).not.toHaveBeenCalled()
    expect((await userPreferences.getPreferences()).magpie?.webKey).toBe(
      "external-key",
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
          name: "settings:managedSiteConnection.check",
        }),
      )
      await waitFor(() =>
        expect(
          expected === "success" ? toast.success : toast.error,
        ).toHaveBeenCalledWith(
          expected === "success"
            ? "settings:managedSiteConnection.success"
            : expect.stringContaining(`settings:magpie.validation.${expected}`),
          expect.objectContaining({ id: expect.any(String) }),
        ),
      )
      expect(await userPreferences.getPreferences()).toMatchObject({
        magpie: { baseUrl: BASE_URL, webKey: "fake-key" },
      })
      vi.mocked(toast.success).mockClear()
      vi.mocked(toast.error).mockClear()
      await user.click(
        await screen.findByRole("button", {
          name: "settings:managedSiteConnection.check",
        }),
      )
      await waitFor(() =>
        expect(
          expected === "success" ? toast.success : toast.error,
        ).toHaveBeenCalledWith(
          expected === "success"
            ? "settings:managedSiteConnection.success"
            : expect.stringContaining(`settings:magpie.validation.${expected}`),
          expect.objectContaining({ id: expect.any(String) }),
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
