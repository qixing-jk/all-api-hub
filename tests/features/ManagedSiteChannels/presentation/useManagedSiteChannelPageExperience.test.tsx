import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { useManagedSiteChannelPageExperience } from "~/features/ManagedSiteChannels/presentation/useManagedSiteChannelPageExperience"

const mocks = vi.hoisted(() => ({
  getAllAccounts: vi.fn(async () => []),
  convertToDisplayData: vi.fn(() => []),
  listProfiles: vi.fn(async () => [{ id: "profile-example" }]),
  pushWithinOptionsPage: vi.fn(),
  createTab: vi.fn(async () => undefined),
}))

vi.mock("~/services/accounts/accountStorage/accountQueries", () => ({
  accountQueries: { getAllAccounts: mocks.getAllAccounts },
}))
vi.mock("~/services/accounts/accountStorage/accountPresentation", () => ({
  accountPresentation: { convertToDisplayData: mocks.convertToDisplayData },
}))
vi.mock(
  "~/services/apiCredentialProfiles/apiCredentialProfilesStorage",
  () => ({
    apiCredentialProfilesStorage: { listProfiles: mocks.listProfiles },
  }),
)
vi.mock("~/utils/navigation", async (importActual) => ({
  ...(await importActual()),
  pushWithinOptionsPage: mocks.pushWithinOptionsPage,
}))
vi.mock("~/utils/browser/browserApi", async (importActual) => ({
  ...(await importActual()),
  createTab: mocks.createTab,
}))

function Fixture({ isLoadedEmpty = true }: { isLoadedEmpty?: boolean }) {
  const experience = useManagedSiteChannelPageExperience({
    siteType: SITE_TYPES.NEW_API,
    baseUrl: "https://gateway.example.invalid",
    isConfigurationMissing: false,
    isLoadedEmpty,
    canImportChannel: true,
  })
  return (
    <>
      {experience.titleActions}
      {experience.description}
      {experience.configurationMissingNotice}
      {experience.emptyContent}
    </>
  )
}

describe("managed-site channel page experience", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("combines console links and prioritized import recovery actions", async () => {
    const user = userEvent.setup()
    render(<Fixture />)

    expect(
      screen.getByRole("link", {
        name: "managedSiteChannels:gatewayGuidance.openTokenConsole",
      }),
    ).toHaveAttribute("href", "https://gateway.example.invalid/keys")
    await user.click(
      screen.getByRole("button", {
        name: "managedSiteChannels:gatewayGuidance.openChannelConsole",
      }),
    )
    expect(mocks.createTab).toHaveBeenCalledWith(
      "https://gateway.example.invalid/channels",
      true,
    )
    const profileImport = await screen.findByRole("button", {
      name: "managedSiteChannels:gatewayGuidance.empty.importFromApiKeyLibrary",
    })
    const accountImport = screen.getByRole("button", {
      name: "managedSiteChannels:gatewayGuidance.empty.importFromAccountKey",
    })
    expect(screen.getAllByRole("button").indexOf(profileImport)).toBeLessThan(
      screen.getAllByRole("button").indexOf(accountImport),
    )

    await user.click(profileImport)
    expect(mocks.pushWithinOptionsPage).toHaveBeenCalledWith(
      "#apiCredentialProfiles",
      expect.any(Object),
    )
  })

  it("does not show import guidance for a filtered empty state", async () => {
    render(<Fixture isLoadedEmpty={false} />)

    expect(
      screen.queryByText("managedSiteChannels:gatewayGuidance.empty.title"),
    ).toBeNull()
    await waitFor(() => expect(mocks.getAllAccounts).toHaveBeenCalled())
  })
})
