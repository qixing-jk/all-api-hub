import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import ManagedSiteTab from "~/features/BasicSettings/components/tabs/ManagedSite/ManagedSiteTab"
import { render, screen } from "~~/tests/test-utils/render"

const { mockedUseUserPreferencesContext } = vi.hoisted(() => ({
  mockedUseUserPreferencesContext: vi.fn(),
}))

vi.mock("~/contexts/UserPreferencesContext", async (importOriginal) => {
  const actual =
    (await importOriginal()) as typeof import("~/contexts/UserPreferencesContext")

  return {
    ...actual,
    UserPreferencesProvider: ({ children }: { children: ReactNode }) =>
      children,
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

describe("ManagedSiteTab", () => {
  beforeEach(() => {
    mockedUseUserPreferencesContext.mockReset()
    mockedUseUserPreferencesContext.mockReturnValue(createContextValue())
  })

  it("renders the New API login-assist fields when new-api is the active managed site", () => {
    render(<ManagedSiteTab />)

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

  it("does not render the New API login-assist fields when the managed site is not new-api", () => {
    mockedUseUserPreferencesContext.mockReturnValue(
      createContextValue({
        managedSiteType: "Veloera",
        veloeraBaseUrl: "",
        veloeraAdminToken: "",
        veloeraUserId: "",
        updateVeloeraBaseUrl: vi.fn().mockResolvedValue(true),
        updateVeloeraAdminToken: vi.fn().mockResolvedValue(true),
        updateVeloeraUserId: vi.fn().mockResolvedValue(true),
        resetVeloeraConfig: vi.fn().mockResolvedValue(true),
      }),
    )

    render(<ManagedSiteTab />)

    expect(
      screen.queryByPlaceholderText(
        "settings:newApi.fields.usernamePlaceholder",
      ),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByPlaceholderText(
        "settings:newApi.fields.passwordPlaceholder",
      ),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByPlaceholderText(
        "settings:newApi.fields.totpSecretPlaceholder",
      ),
    ).not.toBeInTheDocument()
  })
})
