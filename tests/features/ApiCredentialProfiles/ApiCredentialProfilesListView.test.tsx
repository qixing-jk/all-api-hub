import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ApiCredentialProfilesListView } from "~/features/ApiCredentialProfiles/components/ApiCredentialProfilesListView"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_MODE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/events"
import { act, fireEvent, render, screen } from "~~/tests/test-utils/render"

const { trackProductAnalyticsActionCompletedMock } = vi.hoisted(() => ({
  trackProductAnalyticsActionCompletedMock: vi.fn(),
}))

vi.mock("~/services/productAnalytics/actions", () => ({
  trackProductAnalyticsActionCompleted: (...args: any[]) =>
    trackProductAnalyticsActionCompletedMock(...args),
}))

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
  TagFilter: ({ options, onChange }: any) => (
    <div data-testid="tag-filter">
      {options.map((option: any) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange([option.value])}
        >
          {option.label}
        </button>
      ))}
    </div>
  ),
  EmptyState: ({ title, description, action }: any) => (
    <div>
      <div>{title}</div>
      <div>{description}</div>
      {action ? (
        <button
          type="button"
          onClick={action.onClick}
          data-analytics-action={
            action.analyticsAction
              ? `${action.analyticsAction.featureId}:${action.analyticsAction.actionId}:${action.analyticsAction.surfaceId}:${action.analyticsAction.entrypoint}`
              : undefined
          }
        >
          {action.label}
        </button>
      ) : null}
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
  afterEach(() => {
    vi.useRealTimers()
  })

  beforeEach(() => {
    trackProductAnalyticsActionCompletedMock.mockReset()
  })

  it("declares options empty-state add action analytics metadata", async () => {
    const controller = {
      profiles: [],
      isLoading: false,
      tags: [],
      tagNameById: new Map<string, string>(),
      openAddDialog: vi.fn(),
    } as any

    render(<ApiCredentialProfilesListView controller={controller} />)

    expect(
      await screen.findByRole("button", {
        name: "apiCredentialProfiles:actions.add",
      }),
    ).toHaveAttribute(
      "data-analytics-action",
      [
        PRODUCT_ANALYTICS_FEATURE_IDS.ApiCredentialProfiles,
        PRODUCT_ANALYTICS_ACTION_IDS.OpenCreateApiCredentialProfileDialog,
        PRODUCT_ANALYTICS_SURFACE_IDS.OptionsApiCredentialProfilesEmptyState,
        PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      ].join(":"),
    )
  })

  it("declares popup empty-state add action analytics metadata", async () => {
    const controller = {
      profiles: [],
      isLoading: false,
      tags: [],
      tagNameById: new Map<string, string>(),
      openAddDialog: vi.fn(),
    } as any

    render(
      <ApiCredentialProfilesListView controller={controller} variant="popup" />,
    )

    expect(
      await screen.findByRole("button", {
        name: "apiCredentialProfiles:actions.add",
      }),
    ).toHaveAttribute(
      "data-analytics-action",
      [
        PRODUCT_ANALYTICS_FEATURE_IDS.ApiCredentialProfiles,
        PRODUCT_ANALYTICS_ACTION_IDS.OpenCreateApiCredentialProfileDialog,
        PRODUCT_ANALYTICS_SURFACE_IDS.PopupApiCredentialProfilesEmptyState,
        PRODUCT_ANALYTICS_ENTRYPOINTS.Popup,
      ].join(":"),
    )
  })

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

  it("debounces search analytics with coarse filter and result counts only", async () => {
    const controller = {
      profiles: [
        {
          id: "profile-1",
          name: "Private Production Profile",
          apiType: "openai",
          baseUrl: "https://private.example.com",
          apiKey: "sk-test",
          tagIds: ["secret-tag"],
          notes: "sensitive notes",
        },
        {
          id: "profile-2",
          name: "Other Profile",
          apiType: "anthropic",
          baseUrl: "https://other.example.com",
          apiKey: "sk-test",
          tagIds: [],
          notes: "",
        },
      ],
      isLoading: false,
      tags: [{ id: "secret-tag", name: "Confidential Team" }],
      tagNameById: new Map<string, string>([
        ["secret-tag", "Confidential Team"],
      ]),
      openAddDialog: vi.fn(),
    } as any

    render(<ApiCredentialProfilesListView controller={controller} />)

    const searchInput = await screen.findByPlaceholderText(
      "apiCredentialProfiles:controls.searchPlaceholder",
    )

    vi.useFakeTimers()
    fireEvent.change(searchInput, { target: { value: "private.example.com" } })

    expect(trackProductAnalyticsActionCompletedMock).not.toHaveBeenCalled()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(600)
    })

    expect(trackProductAnalyticsActionCompletedMock).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ApiCredentialProfiles,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.FilterApiCredentialProfiles,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsApiCredentialProfilesPage,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      result: PRODUCT_ANALYTICS_RESULTS.Success,
      insights: {
        mode: PRODUCT_ANALYTICS_MODE_IDS.SearchFilter,
        itemCount: 1,
        selectedCount: 1,
        usageDataPresent: true,
      },
    })

    const payloadText = JSON.stringify(
      trackProductAnalyticsActionCompletedMock.mock.calls,
    )
    expect(payloadText).not.toContain("private.example.com")
    expect(payloadText).not.toContain("Confidential Team")
    expect(payloadText).not.toContain("Private Production Profile")
  })

  it("tracks filtered-empty impressions without raw filter values", async () => {
    const controller = {
      profiles: [
        {
          id: "profile-1",
          name: "Private Production Profile",
          apiType: "openai",
          baseUrl: "https://private.example.com",
          apiKey: "sk-test",
          tagIds: ["secret-tag"],
          notes: "",
        },
      ],
      isLoading: false,
      tags: [{ id: "secret-tag", name: "Confidential Team" }],
      tagNameById: new Map<string, string>([
        ["secret-tag", "Confidential Team"],
      ]),
      openAddDialog: vi.fn(),
    } as any

    render(<ApiCredentialProfilesListView controller={controller} />)

    const searchInput = await screen.findByPlaceholderText(
      "apiCredentialProfiles:controls.searchPlaceholder",
    )

    vi.useFakeTimers()
    fireEvent.change(searchInput, {
      target: { value: "missing-private-profile" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Confidential Team" }))

    await act(async () => {
      await vi.advanceTimersByTimeAsync(600)
    })

    expect(trackProductAnalyticsActionCompletedMock).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ApiCredentialProfiles,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.FilterApiCredentialProfiles,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsApiCredentialProfilesPage,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      result: PRODUCT_ANALYTICS_RESULTS.Success,
      insights: {
        mode: PRODUCT_ANALYTICS_MODE_IDS.GroupFilter,
        itemCount: 0,
        selectedCount: 2,
        usageDataPresent: false,
      },
    })

    const payloadText = JSON.stringify(
      trackProductAnalyticsActionCompletedMock.mock.calls,
    )
    expect(payloadText).not.toContain("missing-private-profile")
    expect(payloadText).not.toContain("secret-tag")
    expect(payloadText).not.toContain("Confidential Team")
    expect(payloadText).not.toContain("private.example.com")
  })
})
