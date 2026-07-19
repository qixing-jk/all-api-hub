import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import AutoDetectErrorAlert from "~/features/AccountManagement/components/AccountDialog/AutoDetectErrorAlert"
import { DuplicateAccountWarningDialog } from "~/features/AccountManagement/components/AccountDialog/DuplicateAccountWarningDialog"
import { ManagedSiteConfigPromptDialog } from "~/features/AccountManagement/components/AccountDialog/ManagedSiteConfigPromptDialog"
import { AutoDetectErrorType } from "~/services/accounts/utils/autoDetectUtils"

const { openLoginTabMock, reloadCurrentTabMock } = vi.hoisted(() => ({
  openLoginTabMock: vi.fn(),
  reloadCurrentTabMock: vi.fn(),
}))

const { openApiCredentialProfilesPageMock, openSiteSupportRequestPageMock } =
  vi.hoisted(() => ({
    openApiCredentialProfilesPageMock: vi.fn(),
    openSiteSupportRequestPageMock: vi.fn(),
  }))

vi.mock("~/services/accounts/utils/autoDetectUtils", async () => {
  const actual = await vi.importActual<
    typeof import("~/services/accounts/utils/autoDetectUtils")
  >("~/services/accounts/utils/autoDetectUtils")

  return {
    ...actual,
    openLoginTab: openLoginTabMock,
    reloadCurrentTab: reloadCurrentTabMock,
  }
})

vi.mock("react-i18next", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-i18next")>()

  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string, options?: Record<string, unknown>) =>
        options ? JSON.stringify({ key, options }) : key,
    }),
  }
})

vi.mock("~/utils/navigation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/utils/navigation")>()

  return {
    ...actual,
    openApiCredentialProfilesPage: openApiCredentialProfilesPageMock,
    openSiteSupportRequestPage: openSiteSupportRequestPageMock,
  }
})

describe("AccountDialog warnings", () => {
  beforeEach(() => {
    openLoginTabMock.mockReset()
    reloadCurrentTabMock.mockReset()
    openApiCredentialProfilesPageMock.mockReset()
    openSiteSupportRequestPageMock.mockReset()
    ;(browser.tabs as any).create = vi.fn()
  })

  it("shows only the message when no action or help recovery is available", () => {
    render(
      <AutoDetectErrorAlert
        error={{
          type: AutoDetectErrorType.UNKNOWN,
          message: "Detection failed",
        }}
      />,
    )

    expect(screen.getByText("Detection failed")).toBeInTheDocument()
    expect(screen.queryByRole("button")).not.toBeInTheDocument()
  })

  it("prefers custom action and help handlers over default recovery behavior", () => {
    const onActionClick = vi.fn()
    const onHelpClick = vi.fn()

    render(
      <AutoDetectErrorAlert
        error={{
          type: AutoDetectErrorType.UNAUTHORIZED,
          message: "Please log in",
          actionText: "Retry login",
          helpDocUrl: "https://docs.example.com/autodetect",
        }}
        siteUrl="https://site.example.com"
        onActionClick={onActionClick}
        onHelpClick={onHelpClick}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "Retry login" }))
    fireEvent.click(
      screen.getByRole("button", {
        name: "actions.helpDocument",
      }),
    )

    expect(onActionClick).toHaveBeenCalledTimes(1)
    expect(onHelpClick).toHaveBeenCalledTimes(1)
    expect(openLoginTabMock).not.toHaveBeenCalled()
    expect(reloadCurrentTabMock).not.toHaveBeenCalled()
    expect(browser.tabs.create).not.toHaveBeenCalled()
  })

  it("uses the default login redirect for unauthorized errors when a site URL is available", () => {
    render(
      <AutoDetectErrorAlert
        error={{
          type: AutoDetectErrorType.UNAUTHORIZED,
          message: "Please log in",
          actionText: "Retry login",
        }}
        siteUrl="https://site.example.com"
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "Retry login" }))

    expect(openLoginTabMock).toHaveBeenCalledWith(
      "https://site.example.com",
      undefined,
    )
    expect(reloadCurrentTabMock).not.toHaveBeenCalled()
  })

  it("passes the current site type hint to the default login redirect", () => {
    render(
      <AutoDetectErrorAlert
        error={{
          type: AutoDetectErrorType.UNAUTHORIZED,
          message: "Please log in",
          actionText: "Retry login",
        }}
        siteUrl="https://site.example.com"
        siteType={SITE_TYPES.NEW_API}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "Retry login" }))

    expect(openLoginTabMock).toHaveBeenCalledWith(
      "https://site.example.com",
      SITE_TYPES.NEW_API,
    )
  })

  it("does nothing for unauthorized recovery when the site URL is missing", () => {
    render(
      <AutoDetectErrorAlert
        error={{
          type: AutoDetectErrorType.UNAUTHORIZED,
          message: "Please log in",
          actionText: "Retry login",
        }}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "Retry login" }))

    expect(openLoginTabMock).not.toHaveBeenCalled()
    expect(reloadCurrentTabMock).not.toHaveBeenCalled()
  })

  it("reloads the current tab for reload-required errors", () => {
    render(
      <AutoDetectErrorAlert
        error={{
          type: AutoDetectErrorType.CURRENT_TAB_RELOAD_REQUIRED,
          message: "Reload required",
          actionText: "Reload this page",
        }}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "Reload this page" }))

    expect(reloadCurrentTabMock).toHaveBeenCalledTimes(1)
    expect(openLoginTabMock).not.toHaveBeenCalled()
  })

  it("opens the help document in a new tab when no custom help handler is provided", () => {
    render(
      <AutoDetectErrorAlert
        error={{
          type: AutoDetectErrorType.UNKNOWN,
          message: "Need help",
          helpDocUrl: "https://docs.example.com/autodetect",
        }}
      />,
    )

    fireEvent.click(
      screen.getByRole("button", {
        name: "actions.helpDocument",
      }),
    )

    expect(browser.tabs.create).toHaveBeenCalledWith({
      url: "https://docs.example.com/autodetect",
      active: true,
    })
  })

  it("opens a prefilled site-support request from auto-detect failures", () => {
    render(
      <AutoDetectErrorAlert
        error={{
          type: AutoDetectErrorType.NOT_FOUND,
          message: "Site was not recognized",
        }}
        siteUrl="https://relay.example.com/console"
      />,
    )

    fireEvent.click(
      screen.getByRole("button", {
        name: "actions.reportUnsupportedSite",
      }),
    )

    expect(openSiteSupportRequestPageMock).toHaveBeenCalledWith({
      siteUrl: "https://relay.example.com/console",
      errorType: AutoDetectErrorType.NOT_FOUND,
      errorMessage: "Site was not recognized",
    })
  })

  it("guides users to API credential profiles after detection failures with a site URL", () => {
    render(
      <AutoDetectErrorAlert
        error={{
          type: AutoDetectErrorType.INVALID_RESPONSE,
          message: "Unexpected site response",
        }}
        siteUrl="https://relay.example.com/console"
      />,
    )

    expect(
      screen.getByText("apiCredentialFallback.siteSupport.description"),
    ).toBeInTheDocument()
    expect(
      screen.getByText("apiCredentialFallback.apiCredentials.description"),
    ).toBeInTheDocument()

    fireEvent.click(
      screen.getByRole("button", {
        name: "actions.openApiCredentialProfiles",
      }),
    )

    expect(openApiCredentialProfilesPageMock).toHaveBeenCalledTimes(1)
  })

  it("prefers a custom API credential profiles handler when provided", () => {
    const onApiCredentialProfilesClick = vi.fn()

    render(
      <AutoDetectErrorAlert
        error={{
          type: AutoDetectErrorType.INVALID_RESPONSE,
          message: "Unexpected site response",
        }}
        siteUrl="https://relay.example.com/console"
        onApiCredentialProfilesClick={onApiCredentialProfilesClick}
      />,
    )

    fireEvent.click(
      screen.getByRole("button", {
        name: "actions.openApiCredentialProfiles",
      }),
    )

    expect(onApiCredentialProfilesClick).toHaveBeenCalledTimes(1)
    expect(openApiCredentialProfilesPageMock).not.toHaveBeenCalled()
  })

  it("renders the exact-match duplicate warning for numeric user ids and stringifies missing usernames", () => {
    const onCancel = vi.fn()
    const onContinue = vi.fn()
    const onDisableWarningAndContinue = vi.fn()

    render(
      <DuplicateAccountWarningDialog
        isOpen
        siteUrl="https://site.example.com"
        existingAccountsCount={2}
        existingUserId={42}
        existingUsername={null}
        onCancel={onCancel}
        onContinue={onContinue}
        onDisableWarningAndContinue={onDisableWarningAndContinue}
      />,
    )

    expect(
      screen.getByText(
        JSON.stringify({
          key: "accountDialog:warnings.duplicateAccount.descriptionExact",
          options: {
            siteUrl: "https://site.example.com",
            userId: "42",
            username: "",
          },
        }),
      ),
    ).toBeInTheDocument()

    fireEvent.click(
      screen.getByRole("button", {
        name: "common:actions.cancel",
      }),
    )
    fireEvent.click(
      screen.getByRole("button", {
        name: "accountDialog:warnings.duplicateAccount.actions.continue",
      }),
    )

    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onContinue).toHaveBeenCalledTimes(1)
    expect(onDisableWarningAndContinue).not.toHaveBeenCalled()
  })

  it("offers a secondary action that disables future duplicate warnings and continues", () => {
    const onDisableWarningAndContinue = vi.fn()

    render(
      <DuplicateAccountWarningDialog
        isOpen
        siteUrl="https://site.example.com"
        existingAccountsCount={2}
        onCancel={vi.fn()}
        onContinue={vi.fn()}
        onDisableWarningAndContinue={onDisableWarningAndContinue}
      />,
    )

    fireEvent.click(
      screen.getByRole("button", {
        name: "accountDialog:warnings.duplicateAccount.actions.disableAndContinue",
      }),
    )

    expect(onDisableWarningAndContinue).toHaveBeenCalledTimes(1)
  })

  it("renders managed-site setup guidance and wires both actions", () => {
    const onClose = vi.fn()
    const onOpenSettings = vi.fn()

    render(
      <ManagedSiteConfigPromptDialog
        isOpen
        managedSiteLabel="New API"
        missingMessage="Please configure New API first"
        onClose={onClose}
        onOpenSettings={onOpenSettings}
      />,
    )

    expect(
      screen.getByText(
        JSON.stringify({
          key: "accountDialog:warnings.managedSiteConfig.warningTitle",
          options: {
            managedSite: "New API",
          },
        }),
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        JSON.stringify({
          key: "accountDialog:warnings.managedSiteConfig.description",
          options: {
            message: "Please configure New API first",
          },
        }),
      ),
    ).toBeInTheDocument()

    fireEvent.click(
      screen.getByRole("button", {
        name: "accountDialog:warnings.managedSiteConfig.actions.later",
      }),
    )
    fireEvent.click(
      screen.getByRole("button", {
        name: "accountDialog:warnings.managedSiteConfig.actions.openSettings",
      }),
    )

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onOpenSettings).toHaveBeenCalledTimes(1)
  })

  it("renders the exact-match duplicate warning for non-empty string user ids", () => {
    render(
      <DuplicateAccountWarningDialog
        isOpen
        siteUrl="https://site.example.com"
        existingAccountsCount={5}
        existingUserId="user-7"
        existingUsername="alice"
        onCancel={vi.fn()}
        onContinue={vi.fn()}
        onDisableWarningAndContinue={vi.fn()}
      />,
    )

    expect(
      screen.getByText(
        JSON.stringify({
          key: "accountDialog:warnings.duplicateAccount.descriptionExact",
          options: {
            siteUrl: "https://site.example.com",
            userId: "user-7",
            username: "alice",
          },
        }),
      ),
    ).toBeInTheDocument()
  })

  it("falls back to the generic duplicate warning when the existing user id is blank", () => {
    render(
      <DuplicateAccountWarningDialog
        isOpen
        siteUrl="https://site.example.com"
        existingAccountsCount={3}
        existingUserId="   "
        existingUsername="alice"
        onCancel={vi.fn()}
        onContinue={vi.fn()}
        onDisableWarningAndContinue={vi.fn()}
      />,
    )

    expect(
      screen.getByText(
        JSON.stringify({
          key: "accountDialog:warnings.duplicateAccount.description",
          options: {
            siteUrl: "https://site.example.com",
            count: 3,
          },
        }),
      ),
    ).toBeInTheDocument()
  })
})
