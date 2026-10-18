import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ACCOUNT_PASSWORD_IDENTITIES } from "~/constants/accountLogin"
import { AccountLoginSection } from "~/features/AccountManagement/components/AccountDialog/login/AccountLoginSection"
import { IncognitoAccessNotice } from "~/features/Permissions/components/IncognitoAccessNotice"
import {
  detectBrowserFamily,
  isDesktopDevice,
  isFirefox,
} from "~/utils/browser/index"
import { isAllowedIncognitoAccess } from "~/utils/browser/runtime"
import { createTab } from "~/utils/browser/tabs"
import { fireEvent, render, screen, waitFor } from "~~/tests/test-utils/render"

vi.mock("~/utils/browser/runtime", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/utils/browser/runtime")>()),
  isAllowedIncognitoAccess: vi.fn(),
  getRuntimeId: () => "test-extension",
}))
vi.mock("~/utils/browser/tabs", () => ({ createTab: vi.fn() }))
vi.mock("~/utils/browser/index", () => ({
  detectBrowserFamily: vi.fn(() => "chromium"),
  isFirefox: vi.fn(() => false),
  isDesktopDevice: vi.fn(() => true),
}))

const props = {
  siteUrl: "https://agentrouter.org",
  login: {
    methodId: "password" as const,
    credentials: { username: "", password: "" },
  },
  onChange: vi.fn(),
}

describe("account password login guidance", () => {
  afterEach(() => vi.restoreAllMocks())
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(detectBrowserFamily).mockReturnValue("chromium")
    vi.mocked(isFirefox).mockReturnValue(false)
    vi.mocked(isDesktopDevice).mockReturnValue(true)
  })

  it("warns in a confirmation before opening browser settings and preserves edits when cancelled", async () => {
    vi.mocked(isAllowedIncognitoAccess).mockResolvedValue(false)
    render(<AccountLoginSection {...props} />)
    await screen.findByText("settings:permissions.incognito.recommended")
    expect(
      screen.queryByText("settings:permissions.incognito.explanation"),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", {
        name: "settings:permissions.incognito.openChromeSettings",
      }),
    ).not.toBeInTheDocument()
    await userEvent.click(
      screen.getByRole("button", {
        name: /settings:permissions.incognito.(details|manualSteps)/,
      }),
    )
    expect(
      screen.getByText("settings:permissions.incognito.reloadWarning"),
    ).toBeVisible()
    expect(screen.getByRole("dialog")).toBeVisible()
    expect(createTab).not.toHaveBeenCalled()
    await userEvent.click(
      screen.getByRole("button", { name: "common:actions.cancel" }),
    )
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    expect(createTab).not.toHaveBeenCalled()
    expect(
      screen.getByLabelText(/accountDialog:login.usernameOrEmail/),
    ).toHaveValue("")
    await userEvent.click(
      screen.getByRole("button", {
        name: /settings:permissions.incognito.(details|manualSteps)/,
      }),
    )
    expect(
      screen.getByRole("button", {
        name: "settings:permissions.incognito.openChromeSettings",
      }),
    ).toBeVisible()
  })

  it("accepts an email as the New API login identifier without changing the password", async () => {
    vi.mocked(isAllowedIncognitoAccess).mockResolvedValue(true)
    render(<AccountLoginSection {...props} />)
    fireEvent.change(
      await screen.findByLabelText(/accountDialog:login.usernameOrEmail/),
      { target: { value: "a@example.com" } },
    )
    expect(props.onChange).toHaveBeenLastCalledWith({
      methodId: "password",
      credentials: { username: "a@example.com", password: "" },
    })
  })

  it("recommends private access, opens this extension's settings and rechecks on return", async () => {
    vi.mocked(isAllowedIncognitoAccess).mockResolvedValue(false)
    render(<AccountLoginSection {...props} />)
    await userEvent.click(
      await screen.findByRole("button", {
        name: /settings:permissions.incognito.(details|manualSteps)/,
      }),
    )
    expect(
      await screen.findByText("settings:permissions.incognito.recommended"),
    ).toBeInTheDocument()
    expect(
      screen.queryByText("settings:permissions.incognito.explanation"),
    ).not.toBeInTheDocument()
    await userEvent.click(
      screen.getByRole("button", {
        name: "settings:permissions.incognito.openChromeSettings",
      }),
    )
    expect(createTab).toHaveBeenCalledWith(
      "chrome://extensions/?id=test-extension",
    )
    vi.mocked(isAllowedIncognitoAccess).mockResolvedValue(true)
    fireEvent.focus(window)
    await waitFor(() => {
      expect(
        screen.queryByText("settings:permissions.incognito.recommended"),
      ).not.toBeInTheDocument()
      expect(
        screen.queryByText("settings:permissions.incognito.enabled"),
      ).not.toBeInTheDocument()
      expect(
        screen.queryByText("settings:permissions.incognito.summary"),
      ).not.toBeInTheDocument()
    })
    expect(
      screen.queryByRole("button", {
        name: "settings:permissions.incognito.openChromeSettings",
      }),
    ).not.toBeInTheDocument()
  })
  it.each(Object.values(ACCOUNT_PASSWORD_IDENTITIES))(
    "labels the configured %s identity capability",
    async (passwordIdentity) => {
      vi.mocked(isAllowedIncognitoAccess).mockResolvedValue(true)
      render(
        <AccountLoginSection {...props} passwordIdentity={passwordIdentity} />,
      )
      expect(
        await screen.findByLabelText(
          new RegExp(`accountDialog:login.${passwordIdentity}`),
        ),
      ).toBeInTheDocument()
    },
  )

  it("gives Firefox manual instructions without an unsupported settings link", async () => {
    vi.mocked(isFirefox).mockReturnValue(true)
    vi.mocked(isAllowedIncognitoAccess).mockResolvedValue(false)
    render(<AccountLoginSection {...props} />)
    await userEvent.click(
      await screen.findByRole("button", {
        name: /settings:permissions.incognito.(details|manualSteps)/,
      }),
    )
    expect(
      await screen.findByText(
        "settings:permissions.incognito.firefoxInstructions",
      ),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole("button", {
        name: "settings:permissions.incognito.openChromeSettings",
      }),
    ).not.toBeInTheDocument()
  })

  it("opens the Edge settings page and explains how to recover if opening fails", async () => {
    vi.mocked(detectBrowserFamily).mockReturnValue("edge")
    vi.mocked(isAllowedIncognitoAccess).mockResolvedValue(null)
    vi.mocked(createTab).mockRejectedValueOnce(new Error("Blocked"))
    render(<AccountLoginSection {...props} />)
    await userEvent.click(
      await screen.findByRole("button", {
        name: /settings:permissions.incognito.(details|manualSteps)/,
      }),
    )
    expect(
      await screen.findByText("settings:permissions.incognito.unknown"),
    ).toBeInTheDocument()
    await userEvent.click(
      screen.getByRole("button", {
        name: "settings:permissions.incognito.openEdgeSettings",
      }),
    )
    expect(createTab).toHaveBeenCalledWith(
      "edge://extensions/?id=test-extension",
    )
    expect(
      await screen.findByText("settings:permissions.incognito.settingsFailed"),
    ).toBeInTheDocument()
  })

  it("does not check private access or recommend it for OAuth", async () => {
    render(<AccountLoginSection {...props} login={{ methodId: "github" }} />)
    await screen.findByRole("combobox", { name: "accountDialog:login.method" })
    expect(isAllowedIncognitoAccess).not.toHaveBeenCalled()
    expect(
      screen.queryByText("settings:permissions.incognito.explanation"),
    ).not.toBeInTheDocument()
  })
  it("provides Safari instructions without offering a Chromium settings action", async () => {
    vi.mocked(detectBrowserFamily).mockReturnValue("safari")
    vi.mocked(isAllowedIncognitoAccess).mockResolvedValue(false)
    render(<AccountLoginSection {...props} />)
    await userEvent.click(
      await screen.findByRole("button", {
        name: /settings:permissions.incognito.(details|manualSteps)/,
      }),
    )
    expect(
      await screen.findByText(
        "settings:permissions.incognito.safariInstructions",
      ),
    ).toBeInTheDocument()
    expect(createTab).not.toHaveBeenCalled()
    expect(
      screen.queryByRole("button", { name: /open.*Settings/ }),
    ).not.toBeInTheDocument()
  })
  it.each(["chromium", "firefox", "edge"] as const)(
    "uses manual guidance for mobile %s without desktop settings links",
    async (family) => {
      vi.mocked(detectBrowserFamily).mockReturnValue(family)
      vi.mocked(isDesktopDevice).mockReturnValue(false)
      vi.mocked(isAllowedIncognitoAccess).mockResolvedValue(false)
      render(<AccountLoginSection {...props} />)
      await userEvent.click(
        await screen.findByRole("button", {
          name: /settings:permissions.incognito.(details|manualSteps)/,
        }),
      )
      expect(
        await screen.findByText(
          family === "firefox"
            ? "settings:permissions.incognito.firefoxMobileInstructions"
            : "settings:permissions.incognito.mobileInstructions",
        ),
      ).toBeInTheDocument()
      expect(
        screen.queryByRole("button", { name: /open.*Settings/ }),
      ).not.toBeInTheDocument()
    },
  )

  it.each([false, true])(
    "hides setup actions after private access is granted (management=%s) and restores them if revoked",
    async (management) => {
      vi.mocked(isAllowedIncognitoAccess).mockResolvedValue(true)
      render(<IncognitoAccessNotice management={management} />)
      if (management) {
        expect(
          await screen.findByText("settings:permissions.status.granted"),
        ).toBeInTheDocument()
        expect(
          screen.getByText("settings:permissions.incognito.summary"),
        ).toBeVisible()
      } else {
        await waitFor(() => {
          expect(isAllowedIncognitoAccess).toHaveBeenCalled()
          expect(
            screen.queryByText("settings:permissions.incognito.enabled"),
          ).not.toBeInTheDocument()
          expect(
            screen.queryByText("settings:permissions.incognito.summary"),
          ).not.toBeInTheDocument()
          expect(screen.queryByRole("button")).not.toBeInTheDocument()
        })
      }
      expect(screen.queryByRole("button")).not.toBeInTheDocument()

      vi.mocked(isAllowedIncognitoAccess).mockResolvedValue(false)
      fireEvent.focus(window)
      expect(
        await screen.findByRole("button", {
          name: /settings:permissions.incognito.(details|manualSteps)/,
        }),
      ).toBeVisible()
    },
  )

  it("uses manual instructions for unknown browsers", async () => {
    vi.mocked(detectBrowserFamily).mockReturnValue("unknown")
    vi.mocked(isAllowedIncognitoAccess).mockResolvedValue(null)
    render(<AccountLoginSection {...props} />)
    await userEvent.click(
      await screen.findByRole("button", {
        name: /settings:permissions.incognito.(details|manualSteps)/,
      }),
    )
    expect(
      await screen.findByText(
        "settings:permissions.incognito.genericInstructions",
      ),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: /open.*Settings/ }),
    ).not.toBeInTheDocument()
  })
  it("refreshes unknown management status when the page becomes visible", async () => {
    vi.mocked(isAllowedIncognitoAccess).mockResolvedValue(null)
    render(<IncognitoAccessNotice management />)
    expect(
      await screen.findByText("settings:permissions.status.unavailable"),
    ).toBeVisible()
    vi.mocked(isAllowedIncognitoAccess).mockResolvedValue(true)
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible")
    fireEvent(document, new Event("visibilitychange"))
    expect(
      await screen.findByText("settings:permissions.status.granted"),
    ).toBeVisible()
  })
  it.each(["button", "escape"])(
    "closes manual browser guidance using %s",
    async (action) => {
      vi.mocked(detectBrowserFamily).mockReturnValue("unknown")
      vi.mocked(isAllowedIncognitoAccess).mockResolvedValue(false)
      render(<IncognitoAccessNotice management />)
      await userEvent.click(
        await screen.findByRole("button", {
          name: /settings:permissions.incognito.(details|manualSteps)/,
        }),
      )
      expect(screen.getByRole("dialog")).toBeVisible()
      if (action === "button")
        await userEvent.click(
          screen
            .getAllByRole("button", { name: "common:actions.close" })
            .at(-1)!,
        )
      else await userEvent.keyboard("{Escape}")
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
      expect(createTab).not.toHaveBeenCalled()
    },
  )
})
