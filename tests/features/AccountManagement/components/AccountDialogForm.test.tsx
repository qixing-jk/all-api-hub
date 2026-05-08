import userEvent from "@testing-library/user-event"
import type { ComponentProps } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { SUB2API, UNKNOWN_SITE } from "~/constants/siteType"
import AccountForm from "~/features/AccountManagement/components/AccountDialog/AccountForm"
import { ACCOUNT_FORM_MOBILE_DEFAULT_OPEN } from "~/features/AccountManagement/components/AccountDialog/accountFormSections"
import { createEmptyAccountDialogDraft } from "~/features/AccountManagement/components/AccountDialog/models"
import { AuthTypeEnum, type CheckInConfig } from "~/types"
import { fireEvent, render, screen, within } from "~~/tests/test-utils/render"

const mediaQueryState = {
  isSmallScreen: false,
}

vi.mock("~/hooks/useMediaQuery", () => ({
  useIsSmallScreen: () => mediaQueryState.isSmallScreen,
}))

vi.mock("~/features/AccountManagement/components/TagPicker", () => ({
  TagPicker: ({
    selectedTagIds,
    onSelectedTagIdsChange,
    placeholder,
  }: {
    selectedTagIds: string[]
    onSelectedTagIdsChange: (value: string[]) => void
    placeholder: string
  }) => (
    <button
      type="button"
      onClick={() => onSelectedTagIdsChange([...selectedTagIds, "tag-1"])}
    >
      {placeholder}
    </button>
  ),
}))

vi.mock("~/utils/core/formatters", () => ({
  formatLocaleDateTime: vi.fn(() => "formatted-expiry"),
}))

describe("AccountDialog AccountForm", () => {
  beforeEach(() => {
    mediaQueryState.isSmallScreen = false
  })

  const createCheckIn = (
    overrides: Partial<CheckInConfig> = {},
  ): CheckInConfig =>
    ({
      enableDetection: false,
      autoCheckInEnabled: undefined,
      customCheckIn: undefined,
      ...overrides,
    }) as CheckInConfig

  const createProps = (): ComponentProps<typeof AccountForm> => ({
    draft: {
      ...createEmptyAccountDialogDraft(),
      authType: AuthTypeEnum.AccessToken,
      siteName: "Example Site",
      username: "alice",
      userId: "12",
      accessToken: "secret-token",
      exchangeRate: "7.2",
      manualBalanceUsd: "",
      notes: "existing note",
      tagIds: [],
      excludeFromTotalBalance: false,
      cookieAuthSessionCookie: "",
      sub2apiUseRefreshToken: false,
      sub2apiRefreshToken: "",
      sub2apiTokenExpiresAt: null,
      siteType: UNKNOWN_SITE,
      checkIn: createCheckIn(),
    },
    isDetected: false,
    isManualBalanceUsdInvalid: false,
    showAccessToken: false,
    isImportingCookies: false,
    showCookiePermissionWarning: false,
    isImportingSub2apiSession: false,
    onSiteNameChange: vi.fn(),
    onUsernameChange: vi.fn(),
    onUserIdChange: vi.fn(),
    onAccessTokenChange: vi.fn(),
    onExchangeRateChange: vi.fn(),
    onManualBalanceUsdChange: vi.fn(),
    onShowAccessTokenChange: vi.fn(),
    onNotesChange: vi.fn(),
    onSelectedTagIdsChange: vi.fn(),
    onExcludeFromTotalBalanceChange: vi.fn(),
    onCookieAuthSessionCookieChange: vi.fn(),
    onImportCookieAuthSessionCookie: vi.fn(),
    onOpenCookiePermissionSettings: vi.fn(),
    onSub2apiUseRefreshTokenChange: vi.fn(),
    onSub2apiRefreshTokenChange: vi.fn(),
    onImportSub2apiSession: vi.fn(),
    tags: [],
    tagCountsById: {},
    createTag: vi.fn(),
    renameTag: vi.fn(),
    deleteTag: vi.fn(),
    onSiteTypeChange: vi.fn(),
    onAuthTypeChange: vi.fn(),
    onCheckInChange: vi.fn(),
  })

  it("renders the desktop sections in the expected order and groups auth fields together", async () => {
    const props = createProps()

    render(<AccountForm {...props} />)

    const sections = await screen.findAllByTestId(
      /^account-management-account-form-section-(site-info|auth|tags-notes|check-in|balance)$/,
    )
    expect(sections).toHaveLength(5)
    expect(sections.map((section) => section.dataset.testid)).toEqual([
      "account-management-account-form-section-site-info",
      "account-management-account-form-section-auth",
      "account-management-account-form-section-tags-notes",
      "account-management-account-form-section-check-in",
      "account-management-account-form-section-balance",
    ])

    expect(
      screen.getByText("accountDialog:sections.siteInfo.title"),
    ).toBeInTheDocument()
    expect(
      screen.getByText("accountDialog:sections.accountAuth.title"),
    ).toBeInTheDocument()
    expect(
      screen.getByText("accountDialog:sections.tagsAndNotes.title"),
    ).toBeInTheDocument()
    expect(
      screen.getByText("accountDialog:sections.checkInConfig.title"),
    ).toBeInTheDocument()
    expect(
      screen.getByText("accountDialog:sections.balanceAndStats.title"),
    ).toBeInTheDocument()

    const authSection = screen.getByTestId(
      "account-management-account-form-section-auth",
    )
    expect(
      within(authSection).getByRole("combobox", {
        name: "accountDialog:siteInfo.authMethod",
      }),
    ).toBeInTheDocument()
    expect(within(authSection).getByDisplayValue("alice")).toBeInTheDocument()
    expect(
      within(authSection).getByPlaceholderText(
        "accountDialog:form.userIdNumber",
      ),
    ).toBeInTheDocument()
    expect(
      within(authSection).getByDisplayValue("secret-token"),
    ).toBeInTheDocument()
  })

  it("propagates auth type changes from the grouped auth section", async () => {
    const user = userEvent.setup()
    const props = createProps()

    render(<AccountForm {...props} />)

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

  it("disables auth type changes when the account data is detected", async () => {
    const user = userEvent.setup()
    const props = createProps()
    props.isDetected = true

    render(<AccountForm {...props} />)

    const authTypeTrigger = await screen.findByTestId(
      "account-management-auth-type-trigger",
    )
    expect(authTypeTrigger).toBeDisabled()

    await user.click(authTypeTrigger)

    expect(
      screen.queryByRole("option", {
        name: "accountDialog:siteInfo.authType.cookieAuth",
      }),
    ).not.toBeInTheDocument()
    expect(props.onAuthTypeChange).not.toHaveBeenCalled()
  })

  it("uses a consistent section subtree on mobile and honors the default-open layout", async () => {
    mediaQueryState.isSmallScreen = true
    const user = userEvent.setup()
    const props = createProps()

    render(<AccountForm {...props} />)

    const siteInfoSection = await screen.findByTestId(
      "account-management-account-form-section-site-info",
    )
    const authSection = screen.getByTestId(
      "account-management-account-form-section-auth",
    )
    const balanceSection = screen.getByTestId(
      "account-management-account-form-section-balance",
    )

    expect(siteInfoSection).toHaveAttribute("data-layout", "mobile-collapsible")
    expect(siteInfoSection).toHaveAttribute(
      "data-default-open",
      String(ACCOUNT_FORM_MOBILE_DEFAULT_OPEN["site-info"]),
    )
    expect(authSection).toHaveAttribute(
      "data-default-open",
      String(ACCOUNT_FORM_MOBILE_DEFAULT_OPEN["account-auth"]),
    )
    expect(balanceSection).toHaveAttribute(
      "data-default-open",
      String(ACCOUNT_FORM_MOBILE_DEFAULT_OPEN.balance),
    )

    expect(
      within(siteInfoSection).getByText(
        "accountDialog:sections.siteInfo.title",
      ),
    ).toBeInTheDocument()
    expect(
      within(authSection).getByRole("combobox", {
        name: "accountDialog:siteInfo.authMethod",
      }),
    ).toBeInTheDocument()
    expect(
      within(balanceSection).queryByPlaceholderText(
        "accountDialog:form.exchangeRatePlaceholder",
      ),
    ).not.toBeInTheDocument()

    await user.click(
      within(balanceSection).getByRole("button", {
        name: /accountDialog:sections\.balanceAndStats\.title/i,
      }),
    )

    expect(
      within(balanceSection).getByPlaceholderText(
        "accountDialog:form.exchangeRatePlaceholder",
      ),
    ).toBeInTheDocument()
  })

  it("propagates core field edits, exposes access-token controls, and surfaces validation states", async () => {
    const user = userEvent.setup()
    const props = createProps()
    props.draft.exchangeRate = "0"
    props.draft.manualBalanceUsd = "-1"
    props.isManualBalanceUsdInvalid = true

    render(<AccountForm {...props} />)

    const accessTokenInput = await screen.findByDisplayValue("secret-token")
    expect(accessTokenInput).toHaveAttribute("type", "password")
    expect(
      screen.getByText("accountDialog:form.validRateError"),
    ).toBeInTheDocument()
    expect(
      screen.getByText("accountDialog:form.manualBalanceUsdError"),
    ).toBeInTheDocument()

    fireEvent.change(await screen.findByDisplayValue("Example Site"), {
      target: { value: "Example Site Updated" },
    })
    fireEvent.change(screen.getByDisplayValue("alice"), {
      target: { value: "alice cooper" },
    })
    fireEvent.change(
      screen.getByPlaceholderText("accountDialog:form.userIdNumber"),
      {
        target: { value: "77" },
      },
    )
    fireEvent.change(accessTokenInput, {
      target: { value: "secret-token next" },
    })
    await user.click(
      screen.getByRole("button", {
        name: "accountDialog:form.showAccessToken",
      }),
    )
    fireEvent.change(
      screen.getByPlaceholderText("accountDialog:form.exchangeRatePlaceholder"),
      { target: { value: "8.8" } },
    )
    fireEvent.change(
      screen.getByPlaceholderText(
        "accountDialog:form.manualBalanceUsdPlaceholder",
      ),
      { target: { value: "12.5" } },
    )
    await user.click(
      screen.getByRole("switch", {
        name: "accountDialog:form.excludeFromTotalBalance",
      }),
    )
    await user.click(
      screen.getByRole("button", {
        name: "accountDialog:form.tagsPlaceholder",
      }),
    )
    fireEvent.change(
      screen.getByPlaceholderText("accountDialog:form.notesPlaceholder"),
      {
        target: { value: "existing note updated" },
      },
    )

    expect(props.onSiteNameChange).toHaveBeenLastCalledWith(
      "Example Site Updated",
    )
    expect(props.onUsernameChange).toHaveBeenLastCalledWith("alice cooper")
    expect(props.onUserIdChange).toHaveBeenLastCalledWith("77")
    expect(props.onAccessTokenChange).toHaveBeenLastCalledWith(
      "secret-token next",
    )
    expect(props.onShowAccessTokenChange).toHaveBeenCalledWith(true)
    expect(props.onExchangeRateChange).toHaveBeenLastCalledWith("8.8")
    expect(props.onManualBalanceUsdChange).toHaveBeenLastCalledWith("12.5")
    expect(props.onExcludeFromTotalBalanceChange).toHaveBeenCalledWith(true)
    expect(props.onSelectedTagIdsChange).toHaveBeenCalledWith(["tag-1"])
    expect(props.onNotesChange).toHaveBeenLastCalledWith(
      "existing note updated",
    )
  })

  it("renders the access token as visible text when showAccessToken is enabled", async () => {
    const props = createProps()
    props.showAccessToken = true

    render(<AccountForm {...props} />)

    expect(await screen.findByDisplayValue("secret-token")).toHaveAttribute(
      "type",
      "text",
    )
  })

  it("shows cookie-auth import fallback UI and permission guidance when cookie auth is selected", async () => {
    const user = userEvent.setup()
    const props = createProps()
    props.draft.authType = AuthTypeEnum.Cookie
    props.draft.cookieAuthSessionCookie = "session=abc"
    props.isImportingCookies = true
    props.showCookiePermissionWarning = true

    render(<AccountForm {...props} />)

    expect(
      await screen.findByText(
        "accountDialog:messages.importCookiesPermissionDenied",
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", {
        name: "accountDialog:messages.importCookiesLoading",
      }),
    ).toBeDisabled()

    await user.click(
      screen.getByRole("button", {
        name: "accountDialog:form.cookiePermissionHelpAction",
      }),
    )
    fireEvent.change(screen.getByDisplayValue("session=abc"), {
      target: { value: "session=abc; Path=/" },
    })

    expect(props.onOpenCookiePermissionSettings).toHaveBeenCalledTimes(1)
    expect(props.onCookieAuthSessionCookieChange).toHaveBeenLastCalledWith(
      "session=abc; Path=/",
    )
  })

  it("marks the cookie-auth textarea as required and shows the idle import CTA", async () => {
    const props = createProps()
    props.draft.authType = AuthTypeEnum.Cookie

    render(<AccountForm {...props} />)

    expect(
      await screen.findByRole("button", {
        name: "accountDialog:form.importCookieAuthSessionCookie",
      }),
    ).toBeEnabled()
    expect(
      await screen.findByPlaceholderText(
        "accountDialog:form.cookieAuthSessionCookiePlaceholder",
      ),
    ).toBeRequired()
  })

  it("renders Sub2API refresh-token controls, visibility toggles, and expiry metadata", async () => {
    const user = userEvent.setup()
    const props = createProps()
    props.draft.siteType = SUB2API
    props.draft.sub2apiUseRefreshToken = true
    props.draft.sub2apiRefreshToken = "refresh-secret"
    props.draft.sub2apiTokenExpiresAt = 1700000000000
    props.isImportingSub2apiSession = true

    render(<AccountForm {...props} />)

    expect(
      await screen.findByText(
        "accountDialog:form.sub2apiRefreshTokenWarningTitle",
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByText("accountDialog:form.sub2apiCheckInUnsupported"),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("switch", {
        name: "accountDialog:form.checkInStatus",
      }),
    ).toBeDisabled()
    expect(screen.getByDisplayValue("formatted-expiry")).toBeDisabled()

    const refreshTokenInput = screen.getByDisplayValue("refresh-secret")
    expect(refreshTokenInput).toHaveAttribute("type", "password")

    await user.click(
      screen.getByRole("button", {
        name: "accountDialog:form.showRefreshToken",
      }),
    )
    expect(screen.getByDisplayValue("refresh-secret")).toHaveAttribute(
      "type",
      "text",
    )

    fireEvent.change(screen.getByDisplayValue("refresh-secret"), {
      target: { value: "refresh-secret-next" },
    })
    await user.click(
      screen.getByRole("switch", {
        name: "accountDialog:form.sub2apiRefreshTokenMode",
      }),
    )

    expect(props.onSub2apiRefreshTokenChange).toHaveBeenLastCalledWith(
      "refresh-secret-next",
    )
    expect(props.onSub2apiUseRefreshTokenChange).toHaveBeenCalledWith(false)
    expect(props.onImportSub2apiSession).not.toHaveBeenCalled()
    expect(
      screen.getByRole("button", {
        name: /accountDialog:form\.sub2apiImportRefreshToken/i,
      }),
    ).toBeDisabled()
  })

  it("updates check-in toggles and custom check-in config with the expected fallback defaults", async () => {
    const user = userEvent.setup()
    const props = createProps()
    const onCheckInChange = vi.mocked(props.onCheckInChange)

    const { rerender } = render(<AccountForm {...props} />)

    await user.click(
      await screen.findByRole("switch", {
        name: "accountDialog:form.checkInStatus",
      }),
    )
    expect(onCheckInChange).toHaveBeenCalledWith({
      ...props.draft.checkIn,
      enableDetection: true,
      autoCheckInEnabled: true,
    })

    onCheckInChange.mockClear()
    const explicitFalseCheckIn = createCheckIn({
      enableDetection: false,
      autoCheckInEnabled: false,
    })
    props.draft.checkIn = explicitFalseCheckIn

    rerender(<AccountForm {...props} />)

    await user.click(
      screen.getByRole("switch", {
        name: "accountDialog:form.checkInStatus",
      }),
    )
    expect(onCheckInChange).toHaveBeenCalledWith({
      ...explicitFalseCheckIn,
      enableDetection: true,
      autoCheckInEnabled: false,
    })

    onCheckInChange.mockClear()
    fireEvent.change(screen.getByPlaceholderText("https://cdk.example.com/"), {
      target: { value: "https://check.example.com/" },
    })
    expect(onCheckInChange).toHaveBeenLastCalledWith({
      ...props.draft.checkIn,
      customCheckIn: {
        openRedeemWithCheckIn: true,
        url: "https://check.example.com/",
      },
    })

    const nextCheckIn = createCheckIn({
      enableDetection: true,
      autoCheckInEnabled: false,
      customCheckIn: {
        url: "https://check.example.com/",
        openRedeemWithCheckIn: false,
        redeemUrl: "",
      },
    })
    props.draft.checkIn = nextCheckIn

    rerender(<AccountForm {...props} />)

    await user.click(
      screen.getByRole("switch", {
        name: "accountDialog:form.autoCheckInEnabled",
      }),
    )
    expect(onCheckInChange).toHaveBeenCalledWith({
      ...nextCheckIn,
      autoCheckInEnabled: true,
    })

    await user.click(
      screen.getByRole("switch", {
        name: "accountDialog:form.openRedeemWithCheckIn",
      }),
    )
    expect(onCheckInChange).toHaveBeenCalledWith({
      ...nextCheckIn,
      customCheckIn: {
        ...nextCheckIn.customCheckIn,
        openRedeemWithCheckIn: true,
      },
    })

    fireEvent.change(
      screen.getByPlaceholderText("https://example.com/console/topup"),
      { target: { value: "https://redeem.example.com/" } },
    )
    expect(onCheckInChange).toHaveBeenLastCalledWith({
      ...nextCheckIn,
      customCheckIn: {
        ...nextCheckIn.customCheckIn,
        redeemUrl: "https://redeem.example.com/",
      },
    })

    onCheckInChange.mockClear()
    const missingRedeemToggleCheckIn = createCheckIn({
      enableDetection: true,
      customCheckIn: {
        url: "https://check.example.com/",
      },
    })
    props.draft.checkIn = missingRedeemToggleCheckIn

    rerender(<AccountForm {...props} />)

    await user.click(
      screen.getByRole("switch", {
        name: "accountDialog:form.openRedeemWithCheckIn",
      }),
    )
    expect(onCheckInChange).toHaveBeenCalledWith({
      ...missingRedeemToggleCheckIn,
      customCheckIn: {
        ...missingRedeemToggleCheckIn.customCheckIn,
        openRedeemWithCheckIn: false,
      },
    })
  })
})
