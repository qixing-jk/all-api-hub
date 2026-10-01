import userEvent from "@testing-library/user-event"
import { http, HttpResponse } from "msw"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { OMNIROUTE_ACCESS_TOKEN_PREFIX } from "~/constants/omniroute"
import OmniRouteSettings from "~/features/BasicSettings/components/tabs/ManagedSite/OmniRouteSettings"
import toast from "~/lib/notify"
import { userPreferences } from "~/services/preferences/userPreferences"
import * as browserApi from "~/utils/browser/browserApi"
import { server } from "~~/tests/msw/server"
import { render, screen, waitFor } from "~~/tests/test-utils/render"

vi.mock("~/lib/notify", () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}))

const BASE_URL = "http://omniroute.example.invalid:20128"
const PASSWORD = "panel-password-value"
const MINTED_TOKEN = `${OMNIROUTE_ACCESS_TOKEN_PREFIX}live_minted`

const acceptToken = () =>
  server.use(
    http.get(`${BASE_URL}/api/cli/whoami`, () =>
      HttpResponse.json({
        authenticated: true,
        viaAccessToken: true,
        scope: "admin",
      }),
    ),
    http.get(`${BASE_URL}/api/providers`, () =>
      HttpResponse.json({ connections: [], total: 0 }),
    ),
  )

/** The form renders once preferences load, so each field is awaited. */
const fieldInput = async (
  container: HTMLElement,
  anchor: string,
): Promise<HTMLInputElement> => {
  await waitFor(() =>
    expect(container.querySelector(`#${anchor} input`)).not.toBeNull(),
  )
  const input = container.querySelector(`#${anchor} input`)
  if (!(input instanceof HTMLInputElement)) {
    throw new Error(`missing input for ${anchor}`)
  }
  return input
}

const validateButton = () =>
  screen.findByRole("button", {
    name: "settings:omniroute.validation.validate",
  })

describe("OmniRoute settings", () => {
  beforeEach(async () => {
    server.resetHandlers()
    vi.mocked(toast.error).mockClear()
    vi.mocked(toast.success).mockClear()
    await userPreferences.savePreferences({
      omniroute: { baseUrl: "", token: "" },
    })
  })

  it("exchanges a panel password for a token and never stores the password", async () => {
    const user = userEvent.setup()
    server.use(
      http.post(`${BASE_URL}/api/cli/connect`, () =>
        HttpResponse.json({
          success: true,
          token: MINTED_TOKEN,
          id: "tok-1",
          name: "All API Hub",
          scope: "admin",
        }),
      ),
    )
    acceptToken()

    const { container } = render(<OmniRouteSettings />)
    await user.type(await fieldInput(container, "omniroute-base-url"), BASE_URL)
    await user.type(
      await fieldInput(container, "omniroute-credential"),
      PASSWORD,
    )
    await user.click(await validateButton())

    await waitFor(async () =>
      expect(await userPreferences.getPreferences()).toMatchObject({
        omniroute: { baseUrl: BASE_URL, token: MINTED_TOKEN },
      }),
    )
    expect(
      JSON.stringify(await userPreferences.getPreferences()),
    ).not.toContain(PASSWORD)
    expect(toast.success).toHaveBeenCalledWith(
      "settings:omniroute.validation.success",
    )
  })

  it("never persists a pasted password on blur", async () => {
    const user = userEvent.setup()
    const { container } = render(<OmniRouteSettings />)

    await user.type(
      await fieldInput(container, "omniroute-credential"),
      PASSWORD,
    )
    await user.tab()

    expect(await userPreferences.getPreferences()).toMatchObject({
      omniroute: { token: "" },
    })
  })

  it("reports missing fields before attempting validation", async () => {
    const user = userEvent.setup()
    render(<OmniRouteSettings />)
    await user.click(await validateButton())
    expect(toast.error).toHaveBeenCalledWith(
      "settings:omniroute.validation.missingFields",
    )
  })

  it.each([
    [401, "invalidCredential"],
    [503, "failed"],
  ])(
    "reports a gateway failure %s and permits retry",
    async (status, messageKey) => {
      const user = userEvent.setup()
      server.use(
        http.get(`${BASE_URL}/api/cli/whoami`, () =>
          HttpResponse.json({ error: "gateway failure" }, { status }),
        ),
      )
      const { container } = render(<OmniRouteSettings />)
      await user.type(
        await fieldInput(container, "omniroute-base-url"),
        BASE_URL,
      )
      await user.type(
        await fieldInput(container, "omniroute-credential"),
        MINTED_TOKEN,
      )
      await user.click(await validateButton())
      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith(
          expect.stringContaining(
            `settings:omniroute.validation.${messageKey}`,
          ),
        ),
      )
      expect(await validateButton()).toBeEnabled()
      expect(toast.success).not.toHaveBeenCalledWith(
        "settings:omniroute.validation.success",
      )
    },
  )

  it("reports a failed verified-token write instead of validation success", async () => {
    const user = userEvent.setup()
    acceptToken()
    await userPreferences.savePreferences({
      omniroute: { baseUrl: BASE_URL, token: MINTED_TOKEN },
    })
    const { container } = render(<OmniRouteSettings />)
    await fieldInput(container, "omniroute-credential")
    const save = vi
      .spyOn(userPreferences, "savePreferencesWithResult")
      .mockResolvedValue({
        ok: false,
        reason: {
          type: "storage-error",
          error: new Error("storage unavailable"),
        },
      })
    try {
      await user.click(await validateButton())
      await waitFor(() => expect(toast.error).toHaveBeenCalled())
      expect(toast.success).not.toHaveBeenCalledWith(
        "settings:omniroute.validation.success",
      )
    } finally {
      save.mockRestore()
    }
  })

  it.each([false, true])(
    "opens the gateway token console with browser fallback=%s",
    async (fallback) => {
      const user = userEvent.setup()
      await userPreferences.savePreferences({
        omniroute: { baseUrl: BASE_URL, token: MINTED_TOKEN },
      })
      const tab = vi.spyOn(browserApi, "createTab")
      if (fallback) tab.mockRejectedValue(new Error("tabs unavailable"))
      else tab.mockResolvedValue({} as never)
      const open = vi.spyOn(window, "open").mockReturnValue(null)
      try {
        render(<OmniRouteSettings />)
        await user.click(
          await screen.findByRole("button", {
            name: "settings:omniroute.accessTokens.open",
          }),
        )
        expect(tab).toHaveBeenCalledWith(
          `${BASE_URL}/dashboard/api-manager`,
          true,
        )
        if (fallback)
          expect(open).toHaveBeenCalledWith(
            `${BASE_URL}/dashboard/api-manager`,
            "_blank",
            "noopener,noreferrer",
          )
        else expect(open).not.toHaveBeenCalled()
      } finally {
        tab.mockRestore()
        open.mockRestore()
      }
    },
  )

  it("keeps a pasted access token, which needs no exchange", async () => {
    const user = userEvent.setup()
    const token = `${OMNIROUTE_ACCESS_TOKEN_PREFIX}live_pasted`
    const { container } = render(<OmniRouteSettings />)

    await user.type(await fieldInput(container, "omniroute-credential"), token)
    await user.tab()

    await waitFor(async () =>
      expect(await userPreferences.getPreferences()).toMatchObject({
        omniroute: { token },
      }),
    )
  })

  it("reports the deployment's default-password gate and stores nothing", async () => {
    const user = userEvent.setup()
    server.use(
      http.post(`${BASE_URL}/api/cli/connect`, () =>
        HttpResponse.json(
          {
            error:
              "The management password is still set to the well-known default.",
          },
          { status: 403 },
        ),
      ),
    )

    const { container } = render(<OmniRouteSettings />)
    await user.type(await fieldInput(container, "omniroute-base-url"), BASE_URL)
    await user.type(
      await fieldInput(container, "omniroute-credential"),
      PASSWORD,
    )
    await user.click(await validateButton())

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "settings:omniroute.validation.defaultPassword",
      ),
    )
    expect(await userPreferences.getPreferences()).toMatchObject({
      omniroute: { token: "" },
    })
  })

  it("reports an under-scoped token as a scope problem, not a credential one", async () => {
    const user = userEvent.setup()
    server.use(
      http.get(`${BASE_URL}/api/cli/whoami`, () =>
        HttpResponse.json({
          authenticated: true,
          viaAccessToken: true,
          scope: "write",
        }),
      ),
    )

    const { container } = render(<OmniRouteSettings />)
    await user.type(await fieldInput(container, "omniroute-base-url"), BASE_URL)
    await user.type(
      await fieldInput(container, "omniroute-credential"),
      `${OMNIROUTE_ACCESS_TOKEN_PREFIX}live_write`,
    )
    await user.click(await validateButton())

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        expect.stringContaining(
          "settings:omniroute.validation.insufficientScope",
        ),
      ),
    )
  })
})
