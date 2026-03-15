import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import ManagedSiteSelector from "~/features/BasicSettings/components/tabs/ManagedSite/ManagedSiteSelector"
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

describe("ManagedSiteSelector", () => {
  beforeEach(() => {
    mockedUseUserPreferencesContext.mockReset()
    mockedUseUserPreferencesContext.mockReturnValue(createContextValue())
  })

  it("includes Done Hub as a selectable managed site type", async () => {
    const user = userEvent.setup()
    render(<ManagedSiteSelector />)

    const trigger = await screen.findByRole("combobox", {
      name: "settings:managedSite.siteTypeLabel",
    })

    await user.click(trigger)

    expect(
      await screen.findByText("settings:managedSite.doneHub"),
    ).toBeInTheDocument()
  })
})
