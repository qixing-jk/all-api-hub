import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { ApiCredentialProfilesList } from "~/features/ApiCredentialProfiles/components/ApiCredentialProfilesList"
import { API_CREDENTIAL_PROFILES_TEST_IDS } from "~/features/ApiCredentialProfiles/testIds"
import { render, screen, within } from "~~/tests/test-utils/render"

const { useIsDesktopMock } = vi.hoisted(() => ({
  useIsDesktopMock: vi.fn(() => true),
}))

vi.mock("~/hooks/useMediaQuery", () => ({
  useIsDesktop: () => useIsDesktopMock(),
}))

vi.mock(
  "~/features/ApiCredentialProfiles/components/ApiCredentialProfileListItem",
  () => ({
    ApiCredentialProfileListItem: ({ profile, onEdit }: any) => (
      <article aria-label={profile.name}>
        <span>{profile.name}</span>
        <button type="button" onClick={() => onEdit(profile)}>
          Edit {profile.name}
        </button>
      </article>
    ),
  }),
)

function createProfile(id: string, name: string, baseUrl: string) {
  return {
    id,
    name,
    apiType: "openai",
    baseUrl,
    apiKey: `sk-${id}`,
    tagIds: [],
    notes: "",
    createdAt: 1,
    updatedAt: 1,
  } as any
}

function createController() {
  return {
    getProfileVerificationSummary: vi.fn(() => null),
    tagNameById: new Map<string, string>(),
    visibleKeys: new Set<string>(),
    toggleKeyVisibility: vi.fn(),
    handleCopyBaseUrl: vi.fn(),
    openAddDialog: vi.fn(),
    handleCopyApiKey: vi.fn(),
    handleCopyBundle: vi.fn(),
    handleOpenModelManagement: vi.fn(),
    handleRefreshTelemetry: vi.fn(),
    handleExport: vi.fn(),
    refreshingTelemetryProfileIds: [],
    managedSiteType: "new-api",
    managedSiteLabel: "New API",
    setVerifyingProfile: vi.fn(),
    setCliVerifyingProfile: vi.fn(),
    openEditDialog: vi.fn(),
    handleRequestDelete: vi.fn(),
  } as any
}

describe("ApiCredentialProfilesList endpoint navigation", () => {
  it("switches between Base URLs while keeping every credential action independent", async () => {
    const user = userEvent.setup()
    const controller = createController()
    const firstBaseUrl = "https://gateway-a.example.invalid"
    const secondBaseUrl = "https://gateway-b.example.invalid"

    render(
      <ApiCredentialProfilesList
        profiles={[
          createProfile("a-1", "Team primary", firstBaseUrl),
          createProfile("a-2", "Team fallback", firstBaseUrl),
          createProfile("b-1", "Other endpoint", secondBaseUrl),
        ]}
        controller={controller}
      />,
    )

    const navigation = await screen.findByRole("navigation", {
      name: "apiCredentialProfiles:grouping.navigationLabel",
    })
    expect(
      within(navigation).getByRole("button", { name: firstBaseUrl }),
    ).toHaveAttribute("aria-current", "true")
    expect(screen.getByText("Team primary")).toBeVisible()
    expect(screen.getByText("Team fallback")).toBeVisible()
    expect(screen.queryByText("Other endpoint")).not.toBeInTheDocument()
    await user.click(
      within(navigation).getByRole("button", {
        name: `apiCredentialProfiles:grouping.addCredential: ${secondBaseUrl}`,
      }),
    )
    expect(controller.openAddDialog).toHaveBeenLastCalledWith({
      baseUrl: secondBaseUrl,
    })
    expect(screen.getByText("Team primary")).toBeVisible()
    expect(screen.queryByText("Other endpoint")).not.toBeInTheDocument()
    await user.click(
      screen.getByRole("button", {
        name: "apiCredentialProfiles:actions.copyBaseUrl",
      }),
    )
    expect(controller.handleCopyBaseUrl).toHaveBeenCalledWith(firstBaseUrl)
    await user.click(
      screen.getByTestId(
        API_CREDENTIAL_PROFILES_TEST_IDS.endpointAddCredentialButton,
      ),
    )
    expect(controller.openAddDialog).toHaveBeenLastCalledWith({
      baseUrl: firstBaseUrl,
    })

    await user.click(
      within(navigation).getByRole("button", { name: secondBaseUrl }),
    )

    expect(screen.getByText("Other endpoint")).toBeVisible()
    expect(screen.queryByText("Team primary")).not.toBeInTheDocument()
    await user.click(
      screen.getByRole("button", { name: "Edit Other endpoint" }),
    )
    expect(controller.openEditDialog).toHaveBeenCalledWith(
      expect.objectContaining({ id: "b-1" }),
    )
    await user.click(
      screen.getByTestId(
        API_CREDENTIAL_PROFILES_TEST_IDS.endpointAddCredentialButton,
      ),
    )
    expect(controller.openAddDialog).toHaveBeenLastCalledWith({
      baseUrl: secondBaseUrl,
    })
  })

  it("shows one shared Base URL header without endpoint navigation", async () => {
    const user = userEvent.setup()
    const baseUrl = "https://gateway.example.invalid"
    const controller = createController()

    render(
      <ApiCredentialProfilesList
        profiles={[
          createProfile("first", "First key", baseUrl),
          createProfile("second", "Second key", baseUrl),
        ]}
        controller={controller}
      />,
    )

    expect(await screen.findByText("First key")).toBeVisible()
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument()
    expect(screen.getByText("Second key")).toBeVisible()
    expect(screen.getByText(baseUrl)).toBeVisible()

    await user.click(
      screen.getByRole("button", {
        name: "apiCredentialProfiles:actions.copyBaseUrl",
      }),
    )
    expect(controller.handleCopyBaseUrl).toHaveBeenCalledWith(baseUrl)
  })

  it("uses a compact Base URL selector in the popup and switches endpoints", async () => {
    const user = userEvent.setup()
    const controller = createController()
    const first = createProfile(
      "first",
      "Popup first",
      "https://first.example.invalid",
    )
    const second = createProfile(
      "second",
      "Popup second",
      "https://second.example.invalid",
    )

    render(
      <ApiCredentialProfilesList
        profiles={[first, second]}
        controller={controller}
        variant="popup"
      />,
    )

    const selector = await screen.findByRole("combobox", {
      name: "apiCredentialProfiles:grouping.baseUrlSelector",
    })
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument()
    expect(screen.getByText("Popup first")).toBeVisible()
    expect(screen.queryByText("Popup second")).not.toBeInTheDocument()
    await user.click(
      screen.getByRole("button", {
        name: "apiCredentialProfiles:grouping.addCredential",
      }),
    )
    expect(controller.openAddDialog).toHaveBeenLastCalledWith({
      baseUrl: first.baseUrl,
    })

    await user.click(selector)
    await user.click(
      await screen.findByRole("option", { name: /second\.example/ }),
    )

    expect(screen.getByText("Popup second")).toBeVisible()
    expect(screen.queryByText("Popup first")).not.toBeInTheDocument()
  })

  it("falls back to an available Base URL after filtering removes the selection", async () => {
    const user = userEvent.setup()
    const controller = createController()
    const first = createProfile(
      "first",
      "First endpoint",
      "https://first.example.invalid",
    )
    const second = createProfile(
      "second",
      "Second endpoint",
      "https://second.example.invalid",
    )
    const { rerender } = render(
      <ApiCredentialProfilesList
        profiles={[first, second]}
        controller={controller}
      />,
    )

    await user.click(
      await screen.findByRole("button", { name: second.baseUrl }),
    )
    expect(screen.getByText("Second endpoint")).toBeVisible()

    rerender(
      <ApiCredentialProfilesList profiles={[first]} controller={controller} />,
    )

    expect(screen.getByText("First endpoint")).toBeVisible()
    expect(screen.queryByText("Second endpoint")).not.toBeInTheDocument()
  })

  it("applies each guided import request once without overriding later user selection", async () => {
    const user = userEvent.setup()
    const controller = createController()
    const first = createProfile(
      "first",
      "First endpoint",
      "https://first.example.invalid",
    )
    const second = createProfile(
      "second",
      "Second endpoint",
      "https://second.example.invalid",
    )
    const { rerender } = render(
      <ApiCredentialProfilesList
        profiles={[first, second]}
        controller={controller}
        guidedImportEntry={{ profileId: second.id, request: 1 }}
      />,
    )

    expect(await screen.findByText("Second endpoint")).toBeVisible()

    await user.click(screen.getByRole("button", { name: first.baseUrl }))
    expect(await screen.findByText("First endpoint")).toBeVisible()

    rerender(
      <ApiCredentialProfilesList
        profiles={[first, second]}
        controller={controller}
        guidedImportEntry={{ profileId: second.id, request: 1 }}
      />,
    )
    expect(screen.getByText("First endpoint")).toBeVisible()

    rerender(
      <ApiCredentialProfilesList
        profiles={[first, second]}
        controller={controller}
        guidedImportEntry={{ profileId: second.id, request: 2 }}
      />,
    )
    expect(await screen.findByText("Second endpoint")).toBeVisible()
  })

  it("keeps every matching endpoint visible while filters are active", async () => {
    render(
      <ApiCredentialProfilesList
        profiles={[
          createProfile(
            "first",
            "First matching key",
            "https://first.example.invalid",
          ),
          createProfile(
            "second",
            "Second matching key",
            "https://second.example.invalid",
          ),
        ]}
        controller={createController()}
        isFiltering
      />,
    )

    expect(await screen.findByText("First matching key")).toBeVisible()
    expect(screen.getByText("Second matching key")).toBeVisible()
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", {
        name: "apiCredentialProfiles:grouping.addCredential",
      }),
    ).not.toBeInTheDocument()
  })

  it("returns no endpoint content for an empty profile collection", () => {
    const { container } = render(
      <ApiCredentialProfilesList
        profiles={[]}
        controller={createController()}
      />,
    )

    expect(container).toBeEmptyDOMElement()
  })

  it("keeps an invalid Base URL selectable with its original label", async () => {
    const invalidBaseUrl = "not a valid URL"
    render(
      <ApiCredentialProfilesList
        profiles={[
          createProfile("invalid", "Invalid endpoint", invalidBaseUrl),
          createProfile(
            "valid",
            "Valid endpoint",
            "https://valid.example.invalid",
          ),
        ]}
        controller={createController()}
      />,
    )

    expect(
      await screen.findByRole("button", { name: invalidBaseUrl }),
    ).toBeVisible()
  })
})
