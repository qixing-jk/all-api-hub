import { describe, expect, it, vi } from "vitest"

import { ApiCredentialProfilesListView } from "~/features/ApiCredentialProfiles/components/ApiCredentialProfilesListView"
import { render, screen } from "~~/tests/test-utils/render"

vi.mock("~/hooks/useMediaQuery", () => ({
  useIsDesktop: () => true,
  useIsSmallScreen: () => false,
}))

vi.mock("~/components/ui", () => ({
  Input: ({ leftIcon, rightIcon, ...props }: any) => <input {...props} />,
  SearchableSelect: ({ value, onChange }: any) => (
    <select
      aria-label="api-type-filter"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
  TagFilter: () => <div data-testid="tag-filter" />,
  EmptyState: ({ title, description }: any) => (
    <div>
      <div>{title}</div>
      <div>{description}</div>
    </div>
  ),
  Spinner: () => <div data-testid="spinner" />,
}))

vi.mock(
  "~/features/ApiCredentialProfiles/components/ApiCredentialProfilesDialogs",
  () => ({
    ApiCredentialProfilesDialogs: () => <div data-testid="dialogs" />,
  }),
)

vi.mock(
  "~/features/ApiCredentialProfiles/components/ApiCredentialProfilesList",
  () => ({
    ApiCredentialProfilesList: ({ profiles }: any) => (
      <div data-testid="profiles-list">
        {profiles.map((profile: any) => (
          <div key={profile.id}>{profile.name}</div>
        ))}
      </div>
    ),
  }),
)

describe("ApiCredentialProfilesListView", () => {
  it("keeps the current profile list visible while reloading", async () => {
    const controller = {
      profiles: [
        {
          id: "profile-1",
          name: "Existing Profile",
          apiType: "openai",
          baseUrl: "https://example.com",
          apiKey: "sk-test",
          tagIds: [],
          notes: "",
        },
      ],
      isLoading: true,
      tags: [],
      tagNameById: new Map<string, string>(),
      openAddDialog: vi.fn(),
    } as any

    render(<ApiCredentialProfilesListView controller={controller} />)

    expect(await screen.findByText("Existing Profile")).toBeInTheDocument()
    expect(screen.getByText("common:status.refreshing")).toBeInTheDocument()
    expect(screen.queryByText("common:status.loading")).not.toBeInTheDocument()
  })
})
