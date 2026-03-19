import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { createInstance } from "i18next"
import type { ReactNode } from "react"
import { I18nextProvider, initReactI18next } from "react-i18next"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { SupportedUiLanguage } from "~/constants/i18n"
import { PermissionOnboardingDialog } from "~/features/BasicSettings/components/dialogs/PermissionOnboardingDialog"
import GeneralTab from "~/features/BasicSettings/components/tabs/General/GeneralTab"
import enSettings from "~/locales/en/settings.json"
import zhCnSettings from "~/locales/zh-CN/settings.json"

const permissionMocks = vi.hoisted(() => ({
  ensurePermissions: vi.fn(),
  hasPermission: vi.fn(),
  onOptionalPermissionsChanged: vi.fn(),
}))

const preferenceMocks = vi.hoisted(() => ({
  setLanguage: vi.fn(),
}))

vi.mock("~/services/permissions/permissionManager", () => {
  const OPTIONAL_PERMISSIONS = [
    "cookies",
    "declarativeNetRequestWithHostAccess",
  ] as const

  return {
    OPTIONAL_PERMISSIONS,
    OPTIONAL_PERMISSION_DEFINITIONS: OPTIONAL_PERMISSIONS.map((id) => ({
      id,
      titleKey: `permissions.items.${id}.title`,
      descriptionKey: `permissions.items.${id}.description`,
    })),
    ensurePermissions: permissionMocks.ensurePermissions,
    hasPermission: permissionMocks.hasPermission,
    onOptionalPermissionsChanged: permissionMocks.onOptionalPermissionsChanged,
  }
})

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

vi.mock("~/entrypoints/options/components/ThemeToggle", () => ({
  default: () => <div data-testid="theme-toggle" />,
}))

vi.mock("~/utils/core/toastHelpers", () => ({
  showResultToast: vi.fn(),
}))

const SETTINGS_RESOURCES = {
  en: { settings: enSettings },
  "zh-CN": { settings: zhCnSettings },
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
  return render(<I18nextProvider i18n={i18n}>{ui}</I18nextProvider>)
}

describe("PermissionOnboardingDialog language selection", () => {
  let persistedLanguage: SupportedUiLanguage

  beforeEach(() => {
    persistedLanguage = "en"
    permissionMocks.ensurePermissions.mockResolvedValue(true)
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
    permissionMocks.ensurePermissions.mockReset()
    permissionMocks.hasPermission.mockReset()
    permissionMocks.onOptionalPermissionsChanged.mockReset()
    preferenceMocks.setLanguage.mockReset()
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
        name: "Chinese",
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
        name: "Chinese",
      }),
    )

    expect(persistedLanguage).toBe("zh-CN")

    unmount()

    const persistedI18n = await createSettingsI18n(persistedLanguage)
    renderWithI18n(<GeneralTab />, persistedI18n)

    expect(await screen.findByText("外观")).toBeInTheDocument()

    const selectorGroup = screen.getByRole("group", {
      name: "界面语言选择",
    })

    expect(
      within(selectorGroup).getByRole("button", {
        name: "当前界面语言：中文",
      }),
    ).toHaveAttribute("aria-pressed", "true")
    expect(
      within(selectorGroup).getByRole("button", {
        name: "切换界面语言为英文",
      }),
    ).toBeInTheDocument()
  })
})
