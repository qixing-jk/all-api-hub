import userEvent from "@testing-library/user-event"
import { useState, type ComponentProps } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES, type AccountSiteType } from "~/constants/siteType"
import SiteInfoInput from "~/features/AccountManagement/components/AccountDialog/SiteInfoInput"
import { getAccountDialogSitePolicy } from "~/features/AccountManagement/components/AccountDialog/sitePolicy"
import { ACCOUNT_MANAGEMENT_TEST_IDS } from "~/features/AccountManagement/testIds"
import enAccountDialog from "~/locales/en/accountDialog.json"
import { AuthTypeEnum } from "~/types"
import { testI18n } from "~~/tests/test-utils/i18n"
import { fireEvent, render, screen, waitFor } from "~~/tests/test-utils/render"

const { mockGetAllTabs } = vi.hoisted(() => ({ mockGetAllTabs: vi.fn() }))

vi.mock("~/utils/browser/browserApi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/utils/browser/browserApi")>()),
  getAllTabs: mockGetAllTabs,
}))

describe("AccountDialog SiteInfoInput", () => {
  beforeEach(() => {
    mockGetAllTabs.mockReset().mockResolvedValue([])
  })

  it("offers recent tab sites in activity order and fills only the chosen URL", async () => {
    const user = userEvent.setup()
    const props = createAddModeProps()
    props.url = ""
    props.currentTabUrl = null
    mockGetAllTabs.mockResolvedValue([
      {
        url: "https://older.example/dashboard",
        title: "Older",
        lastAccessed: 10,
      },
      { url: "chrome-extension://extension/options.html", lastAccessed: 100 },
      {
        url: "https://recent.example/account?token=secret",
        title: "Recent",
        lastAccessed: 50,
      },
      {
        url: "https://recent.example/other",
        title: "Duplicate",
        lastAccessed: 20,
      },
      { url: "http://localhost:3000/home", title: "Local", lastAccessed: 30 },
      { url: "about:blank", lastAccessed: 80 },
      { url: "broken url", lastAccessed: 70 },
      { title: "Unavailable", lastAccessed: 90 },
      { url: "https://untitled.example/home" },
    ])

    const { rerender } = render(<SiteInfoInput {...withSitePolicy(props)} />)

    const selector = await screen.findByRole("combobox", {
      name: "accountDialog:siteInfo.siteUrl",
    })
    expect(screen.getByLabelText("accountDialog:siteInfo.siteUrl")).toHaveValue(
      "",
    )
    expect(props.onUrlChange).not.toHaveBeenCalled()
    expect(selector).toBe(
      screen.getByLabelText("accountDialog:siteInfo.siteUrl"),
    )
    expect(screen.getAllByRole("combobox")).toHaveLength(2)
    await user.click(selector)
    expect(
      screen.getAllByRole("option").map((option) => option.textContent),
    ).toEqual([
      "Recent — https://recent.example",
      "Local — http://localhost:3000",
      "Older — https://older.example",
      "https://untitled.example",
    ])
    fireEvent.change(selector, { target: { value: "older" } })
    rerender(<SiteInfoInput {...withSitePolicy({ ...props, url: "older" })} />)
    expect(screen.getAllByRole("option")).toHaveLength(1)
    await user.click(
      screen.getByRole("option", { name: "Older — https://older.example" }),
    )
    expect(props.onUrlChange).toHaveBeenLastCalledWith("https://older.example")
  })

  it("keeps manual URL entry usable when querying recent tabs fails", async () => {
    const props = createAddModeProps()
    props.currentTabUrl = null
    mockGetAllTabs.mockRejectedValue(new Error("Tabs unavailable"))
    render(<SiteInfoInput {...withSitePolicy(props)} />)
    await waitFor(() => expect(mockGetAllTabs).toHaveBeenCalledTimes(1))
    expect(
      screen.queryByRole("button", {
        name: "accountDialog:siteInfo.recentTabSites",
      }),
    ).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText("accountDialog:siteInfo.siteUrl"), {
      target: { value: "https://manual.example" },
    })
    expect(props.onUrlChange).toHaveBeenCalledWith("https://manual.example")
  })

  it("does not query recent tabs when the current site is available, editing, or locked", async () => {
    const props = createAddModeProps()
    const { rerender } = render(<SiteInfoInput {...withSitePolicy(props)} />)
    rerender(
      <SiteInfoInput
        {...withSitePolicy({
          ...props,
          currentTabUrl: null,
          onUseCurrentTab: undefined,
        })}
      />,
    )
    rerender(
      <SiteInfoInput
        {...withSitePolicy({ ...props, currentTabUrl: null, isDetected: true })}
      />,
    )
    rerender(
      <SiteInfoInput
        {...withSitePolicy({
          ...props,
          currentTabUrl: null,
          testSiteType: SITE_TYPES.OPENROUTER,
        })}
      />,
    )
    await screen.findByLabelText("accountDialog:siteInfo.siteUrl")
    expect(mockGetAllTabs).not.toHaveBeenCalled()
  })

  it("supports searching by URL and choosing a site with the keyboard without overwriting manual input", async () => {
    const user = userEvent.setup()
    const props = createAddModeProps()
    props.currentTabUrl = null
    mockGetAllTabs.mockResolvedValue([
      { url: "https://first.example/home", title: "First", lastAccessed: 20 },
      { url: "https://second.example/home", title: "Second", lastAccessed: 10 },
    ])
    /** Keeps the URL controlled while exercising typing, selection, and clearing. */
    function EditableSiteInfo() {
      const [url, setUrl] = useState(props.url)
      return (
        <SiteInfoInput
          {...withSitePolicy({
            ...props,
            url,
            onUrlChange: (value) => {
              props.onUrlChange(value)
              setUrl(value)
            },
            onClearUrl: () => {
              props.onClearUrl()
              setUrl("")
            },
          })}
        />
      )
    }
    render(<EditableSiteInfo />)
    await user.click(
      await screen.findByRole("combobox", {
        name: "accountDialog:siteInfo.siteUrl",
      }),
    )
    expect(screen.getByLabelText("accountDialog:siteInfo.siteUrl")).toHaveValue(
      props.url,
    )
    expect(props.onUrlChange).not.toHaveBeenCalled()
    const input = screen.getByLabelText("accountDialog:siteInfo.siteUrl")
    await user.clear(input)
    await user.type(input, "second.example")
    await user.keyboard("{Enter}")
    expect(input).toHaveValue("https://second.example")
    expect(props.onUrlChange).toHaveBeenLastCalledWith("https://second.example")
    const clearButton = screen.getByRole("button", {
      name: "common:actions.clear",
    })
    const dropdownButton = screen.getByRole("button", {
      name: "accountDialog:siteInfo.recentTabSites",
    })
    expect(
      clearButton.compareDocumentPosition(dropdownButton) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(
      screen.getByRole("button", {
        name: "accountDialog:siteInfo.recentTabSites",
      }),
    ).toBeInTheDocument()
    await user.click(
      screen.getByRole("button", { name: "common:actions.clear" }),
    )
    expect(input).toHaveValue("")
    expect(props.onClearUrl).toHaveBeenCalledTimes(1)
    await user.type(input, "https://manual.example")
    await user.tab()
    expect(input).toHaveValue("https://manual.example")
    await user.click(
      screen.getByRole("button", {
        name: "accountDialog:siteInfo.recentTabSites",
      }),
    )
    expect(await screen.findAllByRole("option")).toHaveLength(2)
    expect(input).toHaveValue("https://manual.example")
  })

  it("discards pending recent sites when a current site becomes available", async () => {
    let resolveTabs!: (tabs: { url: string }[]) => void
    mockGetAllTabs.mockReturnValue(
      new Promise((resolve) => {
        resolveTabs = resolve
      }),
    )
    const props = createAddModeProps()
    props.currentTabUrl = null
    const { rerender } = render(<SiteInfoInput {...withSitePolicy(props)} />)
    await waitFor(() => expect(mockGetAllTabs).toHaveBeenCalledTimes(1))
    rerender(
      <SiteInfoInput
        {...withSitePolicy({
          ...props,
          currentTabUrl: "https://current.example",
        })}
      />,
    )
    resolveTabs([{ url: "https://stale.example" }])
    expect(
      await screen.findByRole("button", {
        name: "accountDialog:siteInfo.useCurrent",
      }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole("button", {
        name: "accountDialog:siteInfo.recentTabSites",
      }),
    ).not.toBeInTheDocument()
    expect(props.onUrlChange).not.toHaveBeenCalled()
  })

  it("clears recent site options when recent tabs are disabled and does not retain stale options on re-enable", async () => {
    let resolveSecondQuery!: (tabs: { url: string; title: string }[]) => void
    const props = createAddModeProps()
    props.currentTabUrl = null
    mockGetAllTabs.mockResolvedValueOnce([
      {
        url: "https://initial.example/home",
        title: "Initial",
        lastAccessed: 10,
      },
    ])

    const { rerender } = render(<SiteInfoInput {...withSitePolicy(props)} />)

    expect(
      await screen.findByRole("button", {
        name: "accountDialog:siteInfo.recentTabSites",
      }),
    ).toBeInTheDocument()

    // Disable recent tabs by providing a currentTabUrl
    rerender(
      <SiteInfoInput
        {...withSitePolicy({
          ...props,
          currentTabUrl: "https://current.example",
        })}
      />,
    )
    expect(
      screen.queryByRole("button", {
        name: "accountDialog:siteInfo.recentTabSites",
      }),
    ).not.toBeInTheDocument()

    // Configure the next query to stay pending
    mockGetAllTabs.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveSecondQuery = resolve
      }),
    )

    // Re-enable recent tabs
    rerender(
      <SiteInfoInput
        {...withSitePolicy({
          ...props,
          currentTabUrl: null,
        })}
      />,
    )

    // While pending, stale options must not be shown
    expect(
      screen.queryByRole("button", {
        name: "accountDialog:siteInfo.recentTabSites",
      }),
    ).not.toBeInTheDocument()

    // Once resolved, new options appear
    resolveSecondQuery([
      { url: "https://updated.example/home", title: "Updated" },
    ])
    expect(
      await screen.findByRole("button", {
        name: "accountDialog:siteInfo.recentTabSites",
      }),
    ).toBeInTheDocument()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  type AddModeSiteInfoInputProps = Extract<
    ComponentProps<typeof SiteInfoInput>,
    { showAuthTypeSelector: true }
  > & {
    testSiteType?: AccountSiteType
  }

  const createAddModeProps = (): AddModeSiteInfoInputProps => ({
    url: "https://api.example.com",
    onUrlChange: vi.fn(),
    isDetected: false,
    onClearUrl: vi.fn(),
    testSiteType: SITE_TYPES.NEW_API,
    sitePolicy: getAccountDialogSitePolicy(SITE_TYPES.NEW_API),
    authType: AuthTypeEnum.AccessToken,
    onAuthTypeChange: vi.fn(),
    onRequestCookieAuthPermissions: vi.fn(),
    showAuthTypeSelector: true,
    currentTabUrl: "https://current.example.com",
    isCurrentSiteAdded: false,
    detectedAccount: null,
    onUseCurrentTab: vi.fn(),
    onEditAccount: vi.fn(),
  })

  const withSitePolicy = (
    props: ComponentProps<typeof SiteInfoInput> & {
      testSiteType?: AccountSiteType
    },
  ): ComponentProps<typeof SiteInfoInput> => {
    const { testSiteType, ...componentProps } = props

    return {
      ...componentProps,
      sitePolicy: getAccountDialogSitePolicy(
        testSiteType ?? SITE_TYPES.UNKNOWN,
      ),
    }
  }

  it("shows the canonical OpenRouter URL as locked without a clear action", async () => {
    const props = createAddModeProps()
    props.url = "https://openrouter.ai"
    props.testSiteType = SITE_TYPES.OPENROUTER

    render(<SiteInfoInput {...withSitePolicy(props)} />)

    expect(
      await screen.findByLabelText("accountDialog:siteInfo.siteUrl"),
    ).toBeDisabled()
    expect(
      screen.queryByRole("button", { name: "common:actions.clear" }),
    ).not.toBeInTheDocument()
  })

  it("propagates URL edits, clears the field, and reuses the current tab URL", async () => {
    const user = userEvent.setup()
    const props = createAddModeProps()

    render(<SiteInfoInput {...withSitePolicy(props)} />)

    const urlInput = await screen.findByLabelText(
      "accountDialog:siteInfo.siteUrl",
    )
    expect(urlInput).toBeEnabled()
    expect(
      screen.getByRole("button", {
        name: "accountDialog:siteInfo.useCurrent",
      }),
    ).toBeEnabled()

    fireEvent.change(urlInput, {
      target: { value: "https://updated.example.com" },
    })
    expect(props.onUrlChange).toHaveBeenLastCalledWith(
      "https://updated.example.com",
    )

    await user.click(
      screen.getByRole("button", { name: "common:actions.clear" }),
    )
    expect(props.onClearUrl).toHaveBeenCalledTimes(1)

    const useCurrentButton = screen.getByRole("button", {
      name: "accountDialog:siteInfo.useCurrent",
    })
    expect(useCurrentButton).toBeEnabled()

    await user.click(useCurrentButton)
    expect(props.onUseCurrentTab).toHaveBeenCalledTimes(1)
  })

  it("lets users choose auth type before entering the form", async () => {
    const user = userEvent.setup()
    const props = createAddModeProps()

    render(<SiteInfoInput {...withSitePolicy(props)} />)

    expect(
      await screen.findByLabelText("accountDialog:siteInfo.authMethod"),
    ).toBeEnabled()
    expect(
      screen.getByRole("button", {
        name: "accountDialog:siteInfo.cookieWarning",
      }),
    ).toBeInTheDocument()

    await user.click(
      await screen.findByTestId("account-management-auth-type-trigger"),
    )
    await user.click(
      await screen.findByRole("option", {
        name: "accountDialog:siteInfo.authType.cookieAuth",
      }),
    )

    expect(props.onAuthTypeChange).toHaveBeenCalledWith(AuthTypeEnum.Cookie)
  })

  it("shows one pre-detection cookie permission action when cookie auth is selected", async () => {
    const user = userEvent.setup()
    const props = createAddModeProps()
    props.authType = AuthTypeEnum.Cookie
    props.cookieAuthPermissionsGranted = false

    render(<SiteInfoInput {...withSitePolicy(props)} />)

    expect(
      await screen.findByText(
        "accountDialog:form.cookiePermissionRecommendationDesc",
      ),
    ).toBeInTheDocument()

    await user.click(
      screen.getByTestId(
        ACCOUNT_MANAGEMENT_TEST_IDS.cookiePermissionGrantButton,
      ),
    )

    expect(props.onRequestCookieAuthPermissions).toHaveBeenCalledTimes(1)
  })

  it("hides the cookie permission action for Sub2API even when stale cookie auth is selected", async () => {
    const props = createAddModeProps()
    props.testSiteType = SITE_TYPES.SUB2API
    props.authType = AuthTypeEnum.Cookie
    props.cookieAuthPermissionsGranted = false

    render(<SiteInfoInput {...withSitePolicy(props)} />)

    expect(
      await screen.findByText("accountDialog:siteInfo.sub2apiHint"),
    ).toBeInTheDocument()
    expect(
      screen.queryByText(
        "accountDialog:form.cookiePermissionRecommendationDesc",
      ),
    ).not.toBeInTheDocument()
  })

  it("stacks auth above the URL before switching to a wide two-column layout", async () => {
    const props = createAddModeProps()

    render(<SiteInfoInput {...withSitePolicy(props)} />)

    const urlInput = await screen.findByLabelText(
      "accountDialog:siteInfo.siteUrl",
    )
    const authTypeTrigger = screen.getByTestId(
      "account-management-auth-type-trigger",
    )

    const container = authTypeTrigger.closest(
      "[data-layout='site-auth-url-container']",
    )
    const layout = authTypeTrigger.closest(
      "[data-layout='site-auth-url-layout']",
    )
    expect(container).toHaveClass("[container-type:inline-size]")
    expect(layout).toHaveClass(
      "grid",
      "[@container(min-width:28rem)]:grid-cols-[minmax(0,1fr)_auto]",
    )
    expect(
      authTypeTrigger.closest("[data-layout='auth-type-field']"),
    ).toHaveClass(
      "order-1",
      "max-w-full",
      "[@container(min-width:28rem)]:order-2",
    )
    expect(urlInput.closest("[data-layout='site-url-field']")).toHaveClass(
      "order-2",
      "w-full",
      "min-w-0",
      "[@container(min-width:28rem)]:order-1",
    )
    expect(authTypeTrigger).toHaveAttribute("data-size", "default")
    expect(authTypeTrigger).toHaveClass(
      "data-[size=default]:min-h-(--density-control)",
    )
  })

  it("keeps the reuse action inside the URL field instead of repeating the detected origin", async () => {
    const user = userEvent.setup()
    const props = createAddModeProps()

    render(<SiteInfoInput {...withSitePolicy(props)} />)

    const useCurrentButton = await screen.findByRole("button", {
      name: "accountDialog:siteInfo.useCurrent",
    })
    const urlInput = screen.getByLabelText("accountDialog:siteInfo.siteUrl")

    // The action shares the field it fills, so the detected origin is not
    // repeated as helper text below the input.
    expect(urlInput.closest('[data-slot="input-group"]')).toContainElement(
      useCurrentButton,
    )
    expect(
      screen.queryByText("https://current.example.com"),
    ).not.toBeInTheDocument()
    expect(useCurrentButton).toHaveAttribute(
      "title",
      "https://current.example.com",
    )
    // Narrow viewports keep the URL readable by dropping the action label.
    expect(useCurrentButton.querySelector("span")).toHaveClass(
      "hidden",
      "min-[360px]:inline",
    )

    await user.click(useCurrentButton)
    expect(props.onUseCurrentTab).toHaveBeenCalledTimes(1)
  })

  it("hides the reuse action while the field already holds that site", async () => {
    const props = createAddModeProps()
    props.url = "https://current.example.com"

    const { rerender } = render(<SiteInfoInput {...withSitePolicy(props)} />)

    expect(
      await screen.findByLabelText("accountDialog:siteInfo.siteUrl"),
    ).toHaveValue("https://current.example.com")
    expect(
      screen.queryByRole("button", {
        name: "accountDialog:siteInfo.useCurrent",
      }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", {
        name: "accountDialog:siteInfo.recentTabSites",
      }),
    ).not.toBeInTheDocument()

    // A trailing slash or a path is still the site the action would fill.
    rerender(
      <SiteInfoInput
        {...withSitePolicy({
          ...props,
          url: "https://current.example.com/dashboard",
        })}
      />,
    )
    expect(
      await screen.findByDisplayValue("https://current.example.com/dashboard"),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole("button", {
        name: "accountDialog:siteInfo.useCurrent",
      }),
    ).not.toBeInTheDocument()

    // A different site keeps the action available.
    rerender(
      <SiteInfoInput
        {...withSitePolicy({ ...props, url: "https://other.example.com" })}
      />,
    )
    expect(
      await screen.findByRole("button", {
        name: "accountDialog:siteInfo.useCurrent",
      }),
    ).toBeInTheDocument()
  })

  it("keeps the current-site warning while the reuse action stays in the field", async () => {
    const props = createAddModeProps()
    props.isCurrentSiteAdded = true

    render(<SiteInfoInput {...withSitePolicy(props)} />)

    expect(
      await screen.findByText("accountDialog:siteInfo.alreadyAdded"),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", {
        name: "accountDialog:siteInfo.useCurrent",
      }),
    ).toBeInTheDocument()
  })

  it("shows the generic already-added warning and keeps manual entry when no recent tabs are available", async () => {
    const props = createAddModeProps()
    props.currentTabUrl = null
    props.isCurrentSiteAdded = true

    render(<SiteInfoInput {...withSitePolicy(props)} />)

    expect(
      await screen.findByText("accountDialog:siteInfo.alreadyAdded"),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole("button", {
        name: "accountDialog:siteInfo.editNow",
      }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText("accountDialog:siteInfo.unknown"),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", {
        name: "accountDialog:siteInfo.useCurrent",
      }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByLabelText("accountDialog:siteInfo.siteUrl"),
    ).toBeEnabled()
  })

  it("locks the site fields for detected Sub2API sites and hides the add-mode current-tab helper", async () => {
    const props = createAddModeProps()
    props.isDetected = true
    props.testSiteType = SITE_TYPES.SUB2API

    render(<SiteInfoInput {...withSitePolicy(props)} />)

    expect(
      await screen.findByText("accountDialog:siteInfo.sub2apiHint"),
    ).toBeInTheDocument()
    expect(
      screen.getByLabelText("accountDialog:siteInfo.siteUrl"),
    ).toBeDisabled()
    expect(
      screen.queryByRole("button", { name: "common:actions.clear" }),
    ).toBeNull()
    expect(
      screen.queryByRole("button", {
        name: "accountDialog:siteInfo.useCurrent",
      }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByTestId("account-management-auth-type-trigger"),
    ).not.toBeInTheDocument()
  })

  it.each([
    [SITE_TYPES.OPENROUTER, "OpenRouter"],
    [SITE_TYPES.SUB2API, "Sub2API"],
    [SITE_TYPES.AIHUBMIX, "AIHubMix"],
  ])(
    "keeps the entry auth selector locked with %s-specific guidance",
    async (siteType, siteTypeLabel) => {
      const props = createAddModeProps()
      props.testSiteType = siteType
      testI18n.addResource(
        "en",
        "accountDialog",
        "siteInfo.authMethodSelectedForSite",
        enAccountDialog.siteInfo.authMethodSelectedForSite,
      )

      try {
        render(<SiteInfoInput {...withSitePolicy(props)} />)

        expect(
          await screen.findByLabelText("accountDialog:siteInfo.authMethod"),
        ).toBeDisabled()
        expect(
          screen.getByRole("button", {
            name: enAccountDialog.siteInfo.authMethodSelectedForSite.replace(
              "{{siteType}}",
              siteTypeLabel,
            ),
          }),
        ).toBeInTheDocument()
        if (siteType === SITE_TYPES.SUB2API) {
          expect(
            screen.getByText("accountDialog:siteInfo.sub2apiHint"),
          ).toBeInTheDocument()
        }
      } finally {
        testI18n.removeResourceBundle("en", "accountDialog")
      }
    },
  )

  it("shows the current-login warning and forwards edit requests for the detected account", async () => {
    const user = userEvent.setup()
    const props = createAddModeProps()
    const detectedAccount = {
      id: "account-1",
      name: "Existing Account",
      baseUrl: "https://api.example.com",
      username: "alice",
    } as any

    props.isCurrentSiteAdded = true
    props.detectedAccount = detectedAccount

    render(<SiteInfoInput {...withSitePolicy(props)} />)

    expect(
      await screen.findByText(
        "accountDialog:siteInfo.currentLoginAlreadyAdded",
      ),
    ).toBeInTheDocument()

    await user.click(
      screen.getByRole("button", {
        name: "accountDialog:siteInfo.editNow",
      }),
    )

    expect(props.onEditAccount).toHaveBeenCalledWith(detectedAccount)
  })

  it("renders the plain URL-only layout when the entry auth selector is disabled", async () => {
    const props: ComponentProps<typeof SiteInfoInput> = {
      url: "https://api.example.com",
      onUrlChange: vi.fn(),
      isDetected: false,
      onClearUrl: vi.fn(),
      sitePolicy: getAccountDialogSitePolicy(SITE_TYPES.NEW_API),
      currentTabUrl: "https://current.example.com",
      isCurrentSiteAdded: false,
      detectedAccount: null,
      onUseCurrentTab: vi.fn(),
      onEditAccount: vi.fn(),
    }

    render(<SiteInfoInput {...withSitePolicy(props)} />)

    const urlInput = await screen.findByLabelText(
      "accountDialog:siteInfo.siteUrl",
    )
    fireEvent.change(urlInput, {
      target: { value: "https://manual.example.com" },
    })

    expect(props.onUrlChange).toHaveBeenLastCalledWith(
      "https://manual.example.com",
    )
    expect(
      screen.queryByTestId("account-management-auth-type-trigger"),
    ).not.toBeInTheDocument()
    expect(urlInput.closest('[data-slot="input-group"]')).toContainElement(
      screen.getByRole("button", {
        name: "accountDialog:siteInfo.useCurrent",
      }),
    )
  })
})
