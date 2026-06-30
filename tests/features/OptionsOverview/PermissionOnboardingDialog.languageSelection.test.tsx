import userEvent from "@testing-library/user-event"
import { createInstance } from "i18next"
import type { ReactNode } from "react"
import { I18nextProvider, initReactI18next } from "react-i18next"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { SupportedUiLanguage } from "~/constants/i18n"
import GeneralTab from "~/features/BasicSettings/components/tabs/General/GeneralTab"
import { PermissionOnboardingDialog } from "~/features/OptionsOverview/components/dialogs/PermissionOnboardingDialog"
import enSettings from "~/locales/en/settings.json"
import jaSettings from "~/locales/ja/settings.json"
import zhCnSettings from "~/locales/zh-CN/settings.json"
import zhTwSettings from "~/locales/zh-TW/settings.json"
import {
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_EVENTS,
  PRODUCT_ANALYTICS_PERMISSION_FAILURE_REASONS,
  PRODUCT_ANALYTICS_PERMISSION_IDS,
  PRODUCT_ANALYTICS_PERMISSION_OPERATIONS,
  PRODUCT_ANALYTICS_PERMISSION_OUTCOMES,
  PRODUCT_ANALYTICS_RESULTS,
} from "~/services/productAnalytics/contracts"
import { act, render, screen, waitFor } from "~~/tests/test-utils/render"

const permissionMocks = vi.hoisted(() => ({
  ensurePermissionsDetailed: vi.fn(),
  hasPermission: vi.fn(),
  onOptionalPermissionsChanged: vi.fn(),
}))

const preferenceMocks = vi.hoisted(() => ({
  setLanguage: vi.fn(),
}))

const toastHelperMocks = vi.hoisted(() => ({
  showResultToast: vi.fn(),
}))

const analyticsMocks = vi.hoisted(() => ({
  trackProductAnalyticsEvent: vi.fn(),
}))

const navigationMocks = vi.hoisted(() => ({
  openLanguageRequestPage: vi.fn(),
}))

vi.mock("~/services/permissions/permissionManager", () => {
  const OPTIONAL_PERMISSIONS = [
    "cookies",
    "declarativeNetRequestWithHostAccess",
    "webRequest",
    "webRequestBlocking",
    "clipboardRead",
    "notifications",
  ] as const

  return {
    OPTIONAL_PERMISSION_IDS: {
      Cookies: "cookies",
      declarativeNetRequestWithHostAccess:
        "declarativeNetRequestWithHostAccess",
      WebRequest: "webRequest",
      WebRequestBlocking: "webRequestBlocking",
      ClipboardRead: "clipboardRead",
      Notifications: "notifications",
    },
    OPTIONAL_PERMISSIONS,
    OPTIONAL_PERMISSION_DEFINITIONS: OPTIONAL_PERMISSIONS.map((id) => ({
      id,
      titleKey: `permissions.items.${id}.title`,
      descriptionKey: `permissions.items.${id}.description`,
    })),
    ensurePermissionsDetailed: permissionMocks.ensurePermissionsDetailed,
    hasPermission: permissionMocks.hasPermission,
    onOptionalPermissionsChanged: permissionMocks.onOptionalPermissionsChanged,
  }
})

vi.mock("~/services/productAnalytics/dispatch", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("~/services/productAnalytics/dispatch")
    >()
  return {
    ...actual,
    trackProductAnalyticsEvent: analyticsMocks.trackProductAnalyticsEvent,
  }
})

vi.mock("~/utils/navigation", () => ({
  openLanguageRequestPage: navigationMocks.openLanguageRequestPage,
}))

vi.mock("~/services/preferences/userPreferences", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("~/services/preferences/userPreferences")
    >()

  return {
    ...actual,
    userPreferences: {
      ...actual.userPreferences,
      setLanguage: preferenceMocks.setLanguage,
    },
  }
})

vi.mock(
  "~/features/BasicSettings/components/tabs/General/ActionClickBehaviorSettings",
  () => ({
    default: () => <div data-testid="action-click-settings" />,
  }),
)

vi.mock(
  "~/features/BasicSettings/components/tabs/General/ChangelogOnUpdateSettings",
  () => ({
    default: () => <div data-testid="changelog-settings" />,
  }),
)

vi.mock(
  "~/features/BasicSettings/components/tabs/General/DisplaySettings",
  () => ({
    default: () => <div data-testid="display-settings" />,
  }),
)

vi.mock(
  "~/features/BasicSettings/components/tabs/General/LoggingSettings",
  () => ({
    default: () => <div data-testid="logging-settings" />,
  }),
)

vi.mock(
  "~/features/BasicSettings/components/tabs/General/ResetSettingsSection",
  () => ({
    default: () => <div data-testid="reset-settings" />,
  }),
)

vi.mock(
  "~/features/BasicSettings/components/tabs/Notifications/TaskNotificationSettings",
  () => ({
    default: () => <div data-testid="task-notification-settings" />,
  }),
)

vi.mock(
  "~/features/BasicSettings/components/tabs/General/SiteAnnouncementNotificationSettings",
  () => ({
    default: () => <div data-testid="site-announcement-settings" />,
  }),
)

vi.mock("~/entrypoints/options/components/ThemeToggle", () => ({
  default: () => <div data-testid="theme-toggle" />,
}))

vi.mock("~/utils/core/toastHelpers", () => ({
  showResultToast: toastHelperMocks.showResultToast,
}))

vi.mock("~/contexts/ReleaseUpdateStatusContext", () => ({
  useReleaseUpdateStatus: () => ({
    status: null,
    isLoading: false,
    isChecking: false,
    error: null,
    refresh: vi.fn(),
    checkNow: vi.fn(),
  }),
}))

const SETTINGS_RESOURCES = {
  en: { settings: enSettings },
  ja: { settings: jaSettings },
  "zh-CN": { settings: zhCnSettings },
  "zh-TW": { settings: zhTwSettings },
} as const

/**
 * Create an isolated settings-only i18n instance for language-selection tests.
 */
async function createSettingsI18n(language: SupportedUiLanguage = "en") {
  const i18n = createInstance()

  await i18n.use(initReactI18next).init({
    lng: language,
    fallbackLng: "en",
    defaultNS: "settings",
    ns: ["settings"],
    resources: SETTINGS_RESOURCES,
    interpolation: {
      escapeValue: false,
    },
    react: {
      useSuspense: false,
    },
  })

  return i18n
}

/**
 * Render a test tree with the provided isolated i18n instance.
 */
function renderWithI18n(
  ui: ReactNode,
  i18n: Awaited<ReturnType<typeof createSettingsI18n>>,
) {
  return render(<I18nextProvider i18n={i18n}>{ui}</I18nextProvider>, {
    withReleaseUpdateStatusProvider: false,
    withUserPreferencesProvider: false,
    withThemeProvider: false,
  })
}

describe("PermissionOnboardingDialog language selection", () => {
  let persistedLanguage: SupportedUiLanguage

  beforeEach(() => {
    persistedLanguage = "en"
    permissionMocks.ensurePermissionsDetailed.mockResolvedValue({
      success: true,
      results: [],
      requestedResults: [],
    })
    permissionMocks.hasPermission.mockResolvedValue(false)
    permissionMocks.onOptionalPermissionsChanged.mockReturnValue(() => {})
    preferenceMocks.setLanguage.mockImplementation(
      async (language: SupportedUiLanguage) => {
        persistedLanguage = language
        return true
      },
    )
  })

  afterEach(() => {
    permissionMocks.ensurePermissionsDetailed.mockReset()
    permissionMocks.hasPermission.mockReset()
    permissionMocks.onOptionalPermissionsChanged.mockReset()
    preferenceMocks.setLanguage.mockReset()
    toastHelperMocks.showResultToast.mockReset()
    analyticsMocks.trackProductAnalyticsEvent.mockReset()
    navigationMocks.openLanguageRequestPage.mockReset()
  })

  it("renders the onboarding selector and updates onboarding copy immediately when the language changes", async () => {
    const user = userEvent.setup()
    const i18n = await createSettingsI18n("en")

    renderWithI18n(<PermissionOnboardingDialog open onClose={vi.fn()} />, i18n)

    expect(
      await screen.findByRole("heading", { name: "Welcome to All API Hub" }),
    ).toBeInTheDocument()
    expect(screen.getByText("Choose your language")).toBeInTheDocument()

    const selector = screen.getByRole("combobox", {
      name: "Current interface language: English",
    })

    expect(selector).toBeInTheDocument()
    expect(selector).toHaveTextContent("English")

    await user.click(selector)
    await user.click(
      await screen.findByRole("option", {
        name: "Simplified Chinese",
      }),
    )

    expect(
      await screen.findByRole("heading", { name: "欢迎加入 All API Hub" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "授予推荐权限" }),
    ).toBeInTheDocument()
    expect(persistedLanguage).toBe("zh-CN")
    expect(preferenceMocks.setLanguage).toHaveBeenCalledWith("zh-CN")
  })

  it("persists an explicitly confirmed language even when that language is already active", async () => {
    const user = userEvent.setup()
    const i18n = await createSettingsI18n("en")

    renderWithI18n(<PermissionOnboardingDialog open onClose={vi.fn()} />, i18n)

    await user.click(
      await screen.findByRole("combobox", {
        name: "Current interface language: English",
      }),
    )
    await user.click(
      await screen.findByRole("option", {
        name: "English",
      }),
    )

    expect(persistedLanguage).toBe("en")
    expect(preferenceMocks.setLanguage).toHaveBeenCalledWith("en")
    expect(
      screen.getByRole("heading", { name: "Welcome to All API Hub" }),
    ).toBeInTheDocument()
  })

  it("opens the language request page from the onboarding language selector", async () => {
    const user = userEvent.setup()
    const i18n = await createSettingsI18n("en")

    navigationMocks.openLanguageRequestPage.mockResolvedValue(undefined)

    renderWithI18n(<PermissionOnboardingDialog open onClose={vi.fn()} />, i18n)

    await user.click(
      await screen.findByRole("button", {
        name: i18n.t("appearanceLanguage.onboardingLanguageRequest"),
      }),
    )

    expect(navigationMocks.openLanguageRequestPage).toHaveBeenCalledTimes(1)
  })

  it("uses the persisted onboarding language in later settings renders and localizes shared switcher accessibility labels", async () => {
    const user = userEvent.setup()
    const onboardingI18n = await createSettingsI18n("en")

    const { unmount } = renderWithI18n(
      <PermissionOnboardingDialog open onClose={vi.fn()} />,
      onboardingI18n,
    )

    await user.click(
      await screen.findByRole("combobox", {
        name: "Current interface language: English",
      }),
    )
    await user.click(
      await screen.findByRole("option", {
        name: "Simplified Chinese",
      }),
    )

    expect(persistedLanguage).toBe("zh-CN")

    unmount()

    const persistedI18n = await createSettingsI18n(persistedLanguage)
    renderWithI18n(<GeneralTab />, persistedI18n)

    expect(await screen.findByText("外观")).toBeInTheDocument()

    expect(
      screen.getByRole("combobox", {
        name: "当前界面语言：简体中文",
      }),
    ).toBeInTheDocument()

    await user.click(
      screen.getByRole("combobox", {
        name: "当前界面语言：简体中文",
      }),
    )

    expect(
      await screen.findByRole("option", {
        name: "英文",
      }),
    ).toBeInTheDocument()
  })

  it("offers traditional chinese in onboarding and persists the selected language", async () => {
    const user = userEvent.setup()
    const i18n = await createSettingsI18n("en")

    renderWithI18n(<PermissionOnboardingDialog open onClose={vi.fn()} />, i18n)

    await user.click(
      await screen.findByRole("combobox", {
        name: "Current interface language: English",
      }),
    )
    await user.click(
      await screen.findByRole("option", {
        name: "Traditional Chinese",
      }),
    )

    expect(
      await screen.findByRole("heading", { name: "歡迎加入 All API Hub" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "授予推薦權限" }),
    ).toBeInTheDocument()
    expect(persistedLanguage).toBe("zh-TW")
    expect(preferenceMocks.setLanguage).toHaveBeenCalledWith("zh-TW")
  })

  it("offers japanese in onboarding and persists the selected language", async () => {
    const user = userEvent.setup()
    const i18n = await createSettingsI18n("en")

    renderWithI18n(<PermissionOnboardingDialog open onClose={vi.fn()} />, i18n)

    await user.click(
      await screen.findByRole("combobox", {
        name: "Current interface language: English",
      }),
    )
    await user.click(
      await screen.findByRole("option", {
        name: "Japanese",
      }),
    )

    expect(
      await screen.findByRole("heading", { name: "All API Hub へようこそ" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "推奨権限を許可" }),
    ).toBeInTheDocument()
    expect(persistedLanguage).toBe("ja")
    expect(preferenceMocks.setLanguage).toHaveBeenCalledWith("ja")
  })

  it("skips loading permission statuses while the dialog is closed", async () => {
    const i18n = await createSettingsI18n("en")

    renderWithI18n(
      <PermissionOnboardingDialog open={false} onClose={vi.fn()} />,
      i18n,
    )

    expect(permissionMocks.hasPermission).not.toHaveBeenCalled()
  })

  it("loads permission statuses on open and refreshes them when optional permissions change", async () => {
    const i18n = await createSettingsI18n("en")
    let permissionChangeHandler: (() => void) | undefined
    const permissionStates: Record<string, boolean> = {
      cookies: true,
      declarativeNetRequestWithHostAccess: false,
      webRequest: false,
      webRequestBlocking: false,
      clipboardRead: false,
      notifications: false,
    }

    permissionMocks.hasPermission.mockImplementation(
      async (id: string) => permissionStates[id] ?? false,
    )
    permissionMocks.onOptionalPermissionsChanged.mockImplementation(
      (handler: () => void) => {
        permissionChangeHandler = handler
        return () => {}
      },
    )

    renderWithI18n(<PermissionOnboardingDialog open onClose={vi.fn()} />, i18n)

    await waitFor(() => {
      expect(
        screen.getAllByText(i18n.t("permissions.status.granted")),
      ).toHaveLength(1)
      expect(
        screen.getAllByText(i18n.t("permissions.status.denied")),
      ).toHaveLength(5)
    })

    permissionStates.cookies = false
    permissionStates.declarativeNetRequestWithHostAccess = true
    permissionStates.clipboardRead = true
    permissionStates.notifications = true

    await act(async () => {
      permissionChangeHandler?.()
    })

    await waitFor(() => {
      expect(permissionMocks.hasPermission).toHaveBeenCalledTimes(12)
      expect(
        screen.getAllByText(i18n.t("permissions.status.granted")),
      ).toHaveLength(3)
      expect(
        screen.getAllByText(i18n.t("permissions.status.denied")),
      ).toHaveLength(3)
    })
  })

  it("requests all optional permissions, reloads statuses, and closes after a successful grant", async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const i18n = await createSettingsI18n("en")

    renderWithI18n(<PermissionOnboardingDialog open onClose={onClose} />, i18n)

    await user.click(
      await screen.findByRole("button", {
        name: i18n.t("permissionsOnboarding.actions.allowAll"),
      }),
    )

    await waitFor(() => {
      expect(permissionMocks.ensurePermissionsDetailed).toHaveBeenCalledWith([
        "cookies",
        "declarativeNetRequestWithHostAccess",
        "webRequest",
        "webRequestBlocking",
        "clipboardRead",
        "notifications",
      ])
    })

    expect(toastHelperMocks.showResultToast).toHaveBeenCalledWith(
      true,
      i18n.t("permissionsOnboarding.toasts.success"),
      i18n.t("permissionsOnboarding.toasts.error"),
    )
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it("tracks grant-all permission outcomes for permissions that were actually requested", async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const i18n = await createSettingsI18n("en")

    permissionMocks.ensurePermissionsDetailed.mockResolvedValueOnce({
      success: false,
      results: [
        {
          id: "cookies",
          requested: false,
          success: true,
          wasGrantedBefore: true,
          wasGrantedAfter: true,
        },
        {
          id: "clipboardRead",
          requested: true,
          success: false,
          wasGrantedBefore: false,
          wasGrantedAfter: false,
        },
        {
          id: "notifications",
          requested: true,
          success: false,
          failureReason: "api_exception",
          wasGrantedBefore: false,
          wasGrantedAfter: false,
        },
      ],
      requestedResults: [
        {
          id: "clipboardRead",
          requested: true,
          success: false,
          wasGrantedBefore: false,
          wasGrantedAfter: false,
        },
        {
          id: "notifications",
          requested: true,
          success: false,
          failureReason: "api_exception",
          wasGrantedBefore: false,
          wasGrantedAfter: false,
        },
      ],
    })

    renderWithI18n(<PermissionOnboardingDialog open onClose={onClose} />, i18n)

    await user.click(
      await screen.findByRole("button", {
        name: i18n.t("permissionsOnboarding.actions.allowAll"),
      }),
    )

    await waitFor(() => {
      expect(analyticsMocks.trackProductAnalyticsEvent).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_EVENTS.PermissionResult,
        {
          permission_id: PRODUCT_ANALYTICS_PERMISSION_IDS.ClipboardRead,
          result: PRODUCT_ANALYTICS_RESULTS.Failure,
          operation: PRODUCT_ANALYTICS_PERMISSION_OPERATIONS.Request,
          outcome: PRODUCT_ANALYTICS_PERMISSION_OUTCOMES.Denied,
          failure_reason:
            PRODUCT_ANALYTICS_PERMISSION_FAILURE_REASONS.UserDenied,
          was_granted_before: false,
          was_granted_after: false,
          entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
        },
      )
    })
    expect(analyticsMocks.trackProductAnalyticsEvent).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_EVENTS.PermissionResult,
      {
        permission_id: PRODUCT_ANALYTICS_PERMISSION_IDS.Notifications,
        result: PRODUCT_ANALYTICS_RESULTS.Failure,
        operation: PRODUCT_ANALYTICS_PERMISSION_OPERATIONS.Request,
        outcome: PRODUCT_ANALYTICS_PERMISSION_OUTCOMES.ApiError,
        failure_reason:
          PRODUCT_ANALYTICS_PERMISSION_FAILURE_REASONS.ApiException,
        was_granted_before: false,
        was_granted_after: false,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      },
    )
    expect(analyticsMocks.trackProductAnalyticsEvent).not.toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_EVENTS.PermissionResult,
      expect.objectContaining({
        permission_id: PRODUCT_ANALYTICS_PERMISSION_IDS.Cookies,
      }),
    )
    expect(onClose).not.toHaveBeenCalled()
  })

  it("keeps the dialog open and shows the error toast when granting permissions fails", async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const i18n = await createSettingsI18n("en")

    permissionMocks.ensurePermissionsDetailed.mockRejectedValueOnce(
      new Error("permission boom"),
    )

    renderWithI18n(<PermissionOnboardingDialog open onClose={onClose} />, i18n)

    await user.click(
      await screen.findByRole("button", {
        name: i18n.t("permissionsOnboarding.actions.allowAll"),
      }),
    )

    await waitFor(() => {
      expect(toastHelperMocks.showResultToast).toHaveBeenCalledWith(
        false,
        i18n.t("permissionsOnboarding.toasts.error"),
      )
    })

    expect(onClose).not.toHaveBeenCalled()
    expect(
      screen.getByRole("button", {
        name: i18n.t("permissionsOnboarding.actions.maybeLater"),
      }),
    ).toBeEnabled()
  })

  it("tracks every target permission as an API error when grant-all unexpectedly rejects", async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const i18n = await createSettingsI18n("en")

    permissionMocks.ensurePermissionsDetailed.mockRejectedValueOnce(
      new Error("permission boom"),
    )

    renderWithI18n(<PermissionOnboardingDialog open onClose={onClose} />, i18n)

    await user.click(
      await screen.findByRole("button", {
        name: i18n.t("permissionsOnboarding.actions.allowAll"),
      }),
    )

    await waitFor(() => {
      expect(analyticsMocks.trackProductAnalyticsEvent).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_EVENTS.PermissionResult,
        {
          permission_id: PRODUCT_ANALYTICS_PERMISSION_IDS.Cookies,
          result: PRODUCT_ANALYTICS_RESULTS.Failure,
          operation: PRODUCT_ANALYTICS_PERMISSION_OPERATIONS.Request,
          outcome: PRODUCT_ANALYTICS_PERMISSION_OUTCOMES.ApiError,
          failure_reason:
            PRODUCT_ANALYTICS_PERMISSION_FAILURE_REASONS.ApiException,
          was_granted_before: false,
          was_granted_after: false,
          entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
        },
      )
    })
    expect(analyticsMocks.trackProductAnalyticsEvent).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_EVENTS.PermissionResult,
      {
        permission_id:
          PRODUCT_ANALYTICS_PERMISSION_IDS.DeclarativeNetRequestWithHostAccess,
        result: PRODUCT_ANALYTICS_RESULTS.Failure,
        operation: PRODUCT_ANALYTICS_PERMISSION_OPERATIONS.Request,
        outcome: PRODUCT_ANALYTICS_PERMISSION_OUTCOMES.ApiError,
        failure_reason:
          PRODUCT_ANALYTICS_PERMISSION_FAILURE_REASONS.ApiException,
        was_granted_before: false,
        was_granted_after: false,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      },
    )
    expect(analyticsMocks.trackProductAnalyticsEvent).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_EVENTS.PermissionResult,
      {
        permission_id: PRODUCT_ANALYTICS_PERMISSION_IDS.WebRequest,
        result: PRODUCT_ANALYTICS_RESULTS.Failure,
        operation: PRODUCT_ANALYTICS_PERMISSION_OPERATIONS.Request,
        outcome: PRODUCT_ANALYTICS_PERMISSION_OUTCOMES.ApiError,
        failure_reason:
          PRODUCT_ANALYTICS_PERMISSION_FAILURE_REASONS.ApiException,
        was_granted_before: false,
        was_granted_after: false,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      },
    )
    expect(analyticsMocks.trackProductAnalyticsEvent).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_EVENTS.PermissionResult,
      {
        permission_id: PRODUCT_ANALYTICS_PERMISSION_IDS.WebRequestBlocking,
        result: PRODUCT_ANALYTICS_RESULTS.Failure,
        operation: PRODUCT_ANALYTICS_PERMISSION_OPERATIONS.Request,
        outcome: PRODUCT_ANALYTICS_PERMISSION_OUTCOMES.ApiError,
        failure_reason:
          PRODUCT_ANALYTICS_PERMISSION_FAILURE_REASONS.ApiException,
        was_granted_before: false,
        was_granted_after: false,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      },
    )
    expect(analyticsMocks.trackProductAnalyticsEvent).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_EVENTS.PermissionResult,
      {
        permission_id: PRODUCT_ANALYTICS_PERMISSION_IDS.ClipboardRead,
        result: PRODUCT_ANALYTICS_RESULTS.Failure,
        operation: PRODUCT_ANALYTICS_PERMISSION_OPERATIONS.Request,
        outcome: PRODUCT_ANALYTICS_PERMISSION_OUTCOMES.ApiError,
        failure_reason:
          PRODUCT_ANALYTICS_PERMISSION_FAILURE_REASONS.ApiException,
        was_granted_before: false,
        was_granted_after: false,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      },
    )
    expect(analyticsMocks.trackProductAnalyticsEvent).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_EVENTS.PermissionResult,
      {
        permission_id: PRODUCT_ANALYTICS_PERMISSION_IDS.Notifications,
        result: PRODUCT_ANALYTICS_RESULTS.Failure,
        operation: PRODUCT_ANALYTICS_PERMISSION_OPERATIONS.Request,
        outcome: PRODUCT_ANALYTICS_PERMISSION_OUTCOMES.ApiError,
        failure_reason:
          PRODUCT_ANALYTICS_PERMISSION_FAILURE_REASONS.ApiException,
        was_granted_before: false,
        was_granted_after: false,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      },
    )
    expect(onClose).not.toHaveBeenCalled()
  })

  it("disables the secondary actions while a permission request is in progress", async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const i18n = await createSettingsI18n("en")
    let resolveRequest: (value: {
      success: boolean
      results: unknown[]
      requestedResults: unknown[]
    }) => void
    const ensurePromise = new Promise<{
      success: boolean
      results: unknown[]
      requestedResults: unknown[]
    }>((resolve) => {
      resolveRequest = resolve
    })

    permissionMocks.ensurePermissionsDetailed.mockReturnValueOnce(ensurePromise)

    renderWithI18n(<PermissionOnboardingDialog open onClose={onClose} />, i18n)

    const allowAllButton = await screen.findByRole("button", {
      name: i18n.t("permissionsOnboarding.actions.allowAll"),
    })
    const maybeLaterButton = screen.getByRole("button", {
      name: i18n.t("permissionsOnboarding.actions.maybeLater"),
    })
    const starButton = screen.getByRole("button", {
      name: i18n.t("permissionsOnboarding.project.starCta"),
    })

    await user.click(allowAllButton)

    await waitFor(() => {
      expect(maybeLaterButton).toBeDisabled()
      expect(starButton).toBeDisabled()
    })

    resolveRequest!({
      success: true,
      results: [],
      requestedResults: [],
    })

    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1)
    })
  })

  it("shows the new-permissions warning and opens the project page from the CTA", async () => {
    const user = userEvent.setup()
    const i18n = await createSettingsI18n("en")
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null)

    renderWithI18n(
      <PermissionOnboardingDialog
        open
        onClose={vi.fn()}
        reason="new-permissions"
      />,
      i18n,
    )

    expect(
      await screen.findByText(
        i18n.t("permissionsOnboarding.reason.newPermissions"),
      ),
    ).toBeInTheDocument()

    await user.click(
      screen.getByRole("button", {
        name: i18n.t("permissionsOnboarding.project.starCta"),
      }),
    )

    expect(openSpy).toHaveBeenCalledWith(
      expect.stringContaining("github.com"),
      "_blank",
      "noopener,noreferrer",
    )

    openSpy.mockRestore()
  })

  it("renders the notifications permission item in the onboarding list", async () => {
    const i18n = await createSettingsI18n("en")

    renderWithI18n(<PermissionOnboardingDialog open onClose={vi.fn()} />, i18n)

    expect(
      await screen.findByText(i18n.t("permissions.items.notifications.title")),
    ).toBeInTheDocument()
    expect(
      screen.getByText(i18n.t("permissions.items.notifications.description")),
    ).toBeInTheDocument()
  })

  it("mentions anonymous product analytics in onboarding without making it the primary message", async () => {
    const i18n = await createSettingsI18n("en")

    renderWithI18n(<PermissionOnboardingDialog open onClose={vi.fn()} />, i18n)

    expect(
      await screen.findByText(
        i18n.t("permissionsOnboarding.analyticsDisclosure"),
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByText(i18n.t("permissionsOnboarding.analyticsDisclosure")),
    ).toHaveClass("text-gray-500")
  })
})
