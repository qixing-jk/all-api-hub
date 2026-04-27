import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import ManagedSiteTypeSwitcher from "~/components/ManagedSiteTypeSwitcher"
import { AXON_HUB, DONE_HUB, NEW_API, VELOERA } from "~/constants/siteType"
import { render, screen } from "~~/tests/test-utils/render"

const { mockedUseUserPreferencesContext, showUpdateToastMock } = vi.hoisted(
  () => ({
    mockedUseUserPreferencesContext: vi.fn(),
    showUpdateToastMock: vi.fn(),
  }),
)

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

vi.mock("~/utils/core/toastHelpers", () => ({
  showUpdateToast: (...args: unknown[]) => showUpdateToastMock(...args),
}))

const createPreferences = (managedSiteType = NEW_API) => ({
  managedSiteType,
  newApi: {
    baseUrl: "https://new-api.example",
    adminToken: "new-api-token",
    userId: "1",
    username: "admin",
    password: "secret",
    totpSecret: "JBSWY3DPEHPK3PXP",
  },
  doneHub: {
    baseUrl: "https://donehub.example",
    adminToken: "donehub-token",
    userId: "2",
  },
  veloera: {
    baseUrl: "",
    adminToken: "",
    userId: "",
  },
  octopus: {
    baseUrl: "",
    username: "",
    password: "",
  },
  axonHub: {
    baseUrl: "",
    email: "",
    password: "",
  },
})

const createContextValue = (overrides: Record<string, unknown> = {}) => ({
  managedSiteType: NEW_API,
  preferences: createPreferences(),
  updateManagedSiteType: vi.fn().mockResolvedValue(true),
  ...overrides,
})

describe("ManagedSiteTypeSwitcher", () => {
  beforeEach(() => {
    mockedUseUserPreferencesContext.mockReset()
    showUpdateToastMock.mockReset()
    mockedUseUserPreferencesContext.mockReturnValue(createContextValue())
  })

  it("shows configured targets plus the current unconfigured site in quick-switch mode", async () => {
    const user = userEvent.setup()
    mockedUseUserPreferencesContext.mockReturnValue(
      createContextValue({
        managedSiteType: VELOERA,
        preferences: {
          ...createPreferences(VELOERA),
          managedSiteType: VELOERA,
        },
      }),
    )

    render(<ManagedSiteTypeSwitcher configuredOnly />)

    await user.click(
      await screen.findByRole("combobox", {
        name: "settings:managedSite.siteTypeLabel",
      }),
    )

    expect(
      await screen.findByRole("option", {
        name: "settings:managedSite.veloera",
      }),
    ).toBeInTheDocument()
    expect(
      await screen.findByRole("option", {
        name: "settings:managedSite.doneHub",
      }),
    ).toBeInTheDocument()
    expect(
      await screen.findByRole("option", {
        name: "settings:managedSite.newApi",
      }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole("option", { name: "settings:managedSite.octopus" }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("option", { name: "settings:managedSite.axonHub" }),
    ).not.toBeInTheDocument()
  })

  it("shows AxonHub as a selectable managed-site type in settings mode", async () => {
    const user = userEvent.setup()

    render(<ManagedSiteTypeSwitcher />)

    await user.click(
      await screen.findByRole("combobox", {
        name: "settings:managedSite.siteTypeLabel",
      }),
    )

    expect(
      await screen.findByRole("option", {
        name: "settings:managedSite.axonHub",
      }),
    ).toBeInTheDocument()
  })

  it("updates the managed site type and shows the shared update toast", async () => {
    const user = userEvent.setup()
    const updateManagedSiteType = vi.fn().mockResolvedValue(true)
    mockedUseUserPreferencesContext.mockReturnValue(
      createContextValue({ updateManagedSiteType }),
    )

    render(<ManagedSiteTypeSwitcher />)

    await user.click(
      await screen.findByRole("combobox", {
        name: "settings:managedSite.siteTypeLabel",
      }),
    )
    await user.click(await screen.findByText("settings:managedSite.doneHub"))

    expect(updateManagedSiteType).toHaveBeenCalledWith(DONE_HUB)
    expect(showUpdateToastMock).toHaveBeenCalledWith(
      true,
      "settings:managedSite.siteTypeLabel",
    )

    await user.click(
      await screen.findByRole("combobox", {
        name: "settings:managedSite.siteTypeLabel",
      }),
    )
    await user.click(await screen.findByText("settings:managedSite.axonHub"))

    expect(updateManagedSiteType).toHaveBeenLastCalledWith(AXON_HUB)
  })
})
