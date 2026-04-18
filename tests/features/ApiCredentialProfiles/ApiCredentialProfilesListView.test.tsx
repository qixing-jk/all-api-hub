import { describe, expect, it, vi } from "vitest"

import { ApiCredentialProfilesListView } from "~/features/ApiCredentialProfiles/components/ApiCredentialProfilesListView"
import { fireEvent, render, screen } from "~~/tests/test-utils/render"

vi.mock("~/hooks/useMediaQuery", () => ({
  useIsDesktop: () => true,
  useIsSmallScreen: () => false,
}))

vi.mock("~/components/ui", () => ({
  Input: ({
    clearButtonLabel,
    leftIcon: _leftIcon,
    onClear,
    rightIcon: _rightIcon,
    value,
    ...props
  }: any) => (
    <div>
      <input value={value} {...props} />
      {value && onClear ? (
        <button type="button" aria-label={clearButtonLabel} onClick={onClear} />
      ) : null}
    </div>
  ),
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

  it("clears the profile search from the shared input clear button", async () => {
    const controller = {
      profiles: [
        {
          id: "profile-1",
          name: "OpenAI Profile",
          apiType: "openai",
          baseUrl: "https://openai.example.com",
          apiKey: "sk-test",
          tagIds: [],
          notes: "",
        },
        {
          id: "profile-2",
          name: "Anthropic Profile",
          apiType: "anthropic",
          baseUrl: "https://anthropic.example.com",
          apiKey: "sk-test",
          tagIds: [],
          notes: "",
        },
      ],
      isLoading: false,
      tags: [],
      tagNameById: new Map<string, string>(),
      openAddDialog: vi.fn(),
    } as any

    render(<ApiCredentialProfilesListView controller={controller} />)

    fireEvent.change(
      await screen.findByPlaceholderText(
        "apiCredentialProfiles:controls.searchPlaceholder",
      ),
      { target: { value: "openai" } },
    )

    expect(screen.getByText("OpenAI Profile")).toBeInTheDocument()
    expect(screen.queryByText("Anthropic Profile")).not.toBeInTheDocument()

    fireEvent.click(
      screen.getByRole("button", { name: "common:actions.clear" }),
    )

    expect(screen.getByText("OpenAI Profile")).toBeInTheDocument()
    expect(screen.getByText("Anthropic Profile")).toBeInTheDocument()
  })
})
