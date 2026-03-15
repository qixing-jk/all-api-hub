import { render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { I18nextProvider } from "react-i18next"
import { beforeEach, describe, expect, it, vi } from "vitest"

import ManagedSiteTab from "~/features/BasicSettings/components/tabs/ManagedSite/ManagedSiteTab"
import { testI18n } from "~~/tests/test-utils/i18n"

const { mockedUseUserPreferencesContext } = vi.hoisted(() => ({
  mockedUseUserPreferencesContext: vi.fn(),
}))

vi.mock("~/contexts/UserPreferencesContext", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("~/contexts/UserPreferencesContext")
  >("~/contexts/UserPreferencesContext")

  return {
    ...actual,
    useUserPreferencesContext: () => mockedUseUserPreferencesContext(),
  }
})

vi.mock(
  "~/features/BasicSettings/components/tabs/ManagedSite/managedSiteModelSyncSettings",
  () => ({
    default: () => <div data-testid="managed-site-model-sync-settings" />,
  }),
)

vi.mock(
  "~/features/BasicSettings/components/tabs/ManagedSite/ModelRedirectSettings",
  () => ({
    default: () => <div data-testid="model-redirect-settings" />,
  }),
)

const createContextValue = (overrides: Record<string, unknown> = {}) => ({
  managedSiteType: "new-api",
  updateManagedSiteType: vi.fn().mockResolvedValue(true),
  newApiBaseUrl: "https://managed.example",
  newApiAdminToken: "managed-admin-token",
  newApiUserId: "1",
  newApiUsername: "admin",
  newApiPassword: "secret-password",
  newApiTotpSecret: "JBSWY3DPEHPK3PXP",
  updateNewApiBaseUrl: vi.fn().mockResolvedValue(true),
  updateNewApiAdminToken: vi.fn().mockResolvedValue(true),
  updateNewApiUserId: vi.fn().mockResolvedValue(true),
  updateNewApiUsername: vi.fn().mockResolvedValue(true),
  updateNewApiPassword: vi.fn().mockResolvedValue(true),
  updateNewApiTotpSecret: vi.fn().mockResolvedValue(true),
  resetNewApiConfig: vi.fn().mockResolvedValue(true),
  ...overrides,
})

const renderWithI18n = (ui: ReactNode) =>
  render(<I18nextProvider i18n={testI18n}>{ui}</I18nextProvider>)

describe("ManagedSiteTab", () => {
  beforeEach(() => {
    mockedUseUserPreferencesContext.mockReset()
    mockedUseUserPreferencesContext.mockReturnValue(createContextValue())
  })

  it("renders the New API login-assist fields when new-api is the active managed site", () => {
    renderWithI18n(<ManagedSiteTab />)

    expect(
      screen.getByPlaceholderText("settings:newApi.fields.usernamePlaceholder"),
    ).toBeInTheDocument()
    expect(
      screen.getByPlaceholderText("settings:newApi.fields.passwordPlaceholder"),
    ).toBeInTheDocument()
    expect(
      screen.getByPlaceholderText(
        "settings:newApi.fields.totpSecretPlaceholder",
      ),
    ).toBeInTheDocument()
  })
})
