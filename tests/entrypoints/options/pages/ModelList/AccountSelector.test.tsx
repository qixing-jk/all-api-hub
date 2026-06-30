import { beforeEach, describe, expect, it, vi } from "vitest"

import { AccountSelector } from "~/features/ModelList/components/AccountSelector"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_MODE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SOURCE_KINDS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
  PRODUCT_ANALYTICS_TARGET_KINDS,
} from "~/services/productAnalytics/contracts"
import { fireEvent, render, screen } from "~~/tests/test-utils/render"

const { trackProductAnalyticsActionCompletedMock } = vi.hoisted(() => ({
  trackProductAnalyticsActionCompletedMock: vi.fn(),
}))

vi.mock("~/services/productAnalytics/actions", () => ({
  trackProductAnalyticsActionCompleted: (...args: any[]) =>
    trackProductAnalyticsActionCompletedMock(...args),
}))

describe("AccountSelector", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("includes the profile hostname in the selector label", async () => {
    render(
      <AccountSelector
        selectedSourceValue="profile:profile-1"
        setSelectedSourceValue={vi.fn()}
        accounts={[]}
        profiles={[
          {
            id: "profile-1",
            name: "Reusable Key",
            apiType: "openai-compatible",
            baseUrl: "https://profile.example.com/v1",
            apiKey: "sk-secret",
            tagIds: [],
            notes: "",
            createdAt: 1,
            updatedAt: 1,
          },
        ]}
      />,
    )

    const combobox = await screen.findByRole("combobox")
    expect(combobox).toBeInTheDocument()
    expect(combobox).toHaveTextContent("modelList:sourceLabels.profileOption")
  })

  it("falls back to the raw profile URL and empty selection state when parsing fails or no source is selected", async () => {
    render(
      <AccountSelector
        selectedSourceValue={undefined as any}
        setSelectedSourceValue={vi.fn()}
        accounts={[
          {
            id: "account-1",
            name: "Primary Account",
          } as any,
        ]}
        profiles={[
          {
            id: "profile-bad-url",
            name: "Broken Endpoint",
            apiType: "openai-compatible",
            baseUrl: "not-a-valid-url",
            apiKey: "sk-secret",
            tagIds: [],
            notes: "",
            createdAt: 1,
            updatedAt: 1,
          },
        ]}
      />,
    )

    const combobox = await screen.findByRole("combobox")
    expect(combobox).toHaveTextContent("modelList:pleaseSelectSource")

    fireEvent.click(combobox)

    expect(await screen.findByText("modelList:allAccounts")).toBeInTheDocument()
    expect(screen.getByText("Primary Account")).toBeInTheDocument()
    expect(
      screen.getByText("modelList:sourceLabels.profileOption"),
    ).toBeInTheDocument()
  })

  it("hides the all-accounts option when there are no accounts", async () => {
    render(
      <AccountSelector
        selectedSourceValue=""
        setSelectedSourceValue={vi.fn()}
        accounts={[]}
        profiles={[
          {
            id: "profile-1",
            name: "Reusable Key",
            apiType: "openai-compatible",
            baseUrl: "https://profile.example.com/v1",
            apiKey: "sk-secret",
            tagIds: [],
            notes: "",
            createdAt: 1,
            updatedAt: 1,
          },
        ]}
      />,
    )

    const combobox = await screen.findByRole("combobox")
    fireEvent.click(combobox)

    expect(screen.queryByText("modelList:allAccounts")).toBeNull()
    expect(
      screen.getByText("modelList:sourceLabels.profileOption"),
    ).toBeInTheDocument()
  })

  it("shows account-specific group ratios in the all-accounts filter menu", async () => {
    render(
      <AccountSelector
        selectedSourceValue="all"
        setSelectedSourceValue={vi.fn()}
        accounts={[
          {
            id: "account-1",
            name: "Primary Account",
          } as any,
        ]}
        profiles={[]}
        showAllAccountsGroupFilter={true}
        availableAccountGroupsByAccountId={{
          "account-1": ["vip", "default"],
        }}
        availableAccountGroupOptionsByAccountId={{
          "account-1": [
            { name: "vip", ratio: 2 },
            { name: "default", ratio: 1 },
          ],
        }}
        allAccountsExcludedGroupsByAccountId={{}}
        setAllAccountsExcludedGroupsByAccountId={vi.fn()}
      />,
    )

    fireEvent.click(
      await screen.findByRole("button", {
        name: "modelList:accountGroupFilterTrigger",
      }),
    )
    const comboboxes = await screen.findAllByRole("combobox")
    fireEvent.click(comboboxes[1])

    expect(await screen.findByText("vip (2x)")).toBeInTheDocument()
    expect(screen.getByText("default (1x)")).toBeInTheDocument()
  })

  it("does not count stale excluded groups in the all-accounts filter badge", async () => {
    render(
      <AccountSelector
        selectedSourceValue="all"
        setSelectedSourceValue={vi.fn()}
        accounts={[
          {
            id: "account-1",
            name: "Primary Account",
          } as any,
        ]}
        profiles={[]}
        showAllAccountsGroupFilter={true}
        availableAccountGroupsByAccountId={{
          "account-1": ["default"],
        }}
        availableAccountGroupOptionsByAccountId={{
          "account-1": [{ name: "default", ratio: 1 }],
        }}
        allAccountsExcludedGroupsByAccountId={{
          "account-1": ["stale-group"],
        }}
        setAllAccountsExcludedGroupsByAccountId={vi.fn()}
      />,
    )

    expect(
      screen.queryByText("modelList:accountGroupFilterTriggerCount"),
    ).not.toBeInTheDocument()
  })

  it("shows an empty-selection placeholder when an account excludes all groups", async () => {
    render(
      <AccountSelector
        selectedSourceValue="all"
        setSelectedSourceValue={vi.fn()}
        accounts={[
          {
            id: "account-1",
            name: "Primary Account",
          } as any,
        ]}
        profiles={[]}
        showAllAccountsGroupFilter={true}
        availableAccountGroupsByAccountId={{
          "account-1": ["vip", "default"],
        }}
        availableAccountGroupOptionsByAccountId={{
          "account-1": [
            { name: "vip", ratio: 2 },
            { name: "default", ratio: 1 },
          ],
        }}
        allAccountsExcludedGroupsByAccountId={{
          "account-1": ["vip", "default"],
        }}
        setAllAccountsExcludedGroupsByAccountId={vi.fn()}
      />,
    )

    fireEvent.click(
      await screen.findByRole("button", {
        name: "modelList:accountGroupFilterTrigger",
      }),
    )

    const comboboxes = await screen.findAllByRole("combobox")
    expect(comboboxes[1]).toHaveTextContent(
      "modelList:accountGroupFilterNoGroupsIncluded",
    )
  })

  it("tracks source selection intent and completion without raw source labels", async () => {
    const setSelectedSourceValue = vi.fn()

    render(
      <AccountSelector
        selectedSourceValue=""
        setSelectedSourceValue={setSelectedSourceValue}
        accounts={[
          {
            id: "account-1",
            name: "Private Account Name",
            url: "https://private.example.com",
          } as any,
        ]}
        profiles={[
          {
            id: "profile-1",
            name: "Private Profile",
            apiType: "openai-compatible",
            baseUrl: "https://profile.example.com/v1",
            apiKey: "sk-secret",
            tagIds: [],
            notes: "",
            createdAt: 1,
            updatedAt: 1,
          },
        ]}
      />,
    )

    const combobox = await screen.findByRole("combobox")
    fireEvent.click(combobox)
    fireEvent.click(await screen.findByText("Private Account Name"))

    expect(setSelectedSourceValue).toHaveBeenCalledWith("account:account-1")
    expect(trackProductAnalyticsActionCompletedMock).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ModelList,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.SelectModelSource,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsModelListPage,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      result: PRODUCT_ANALYTICS_RESULTS.Success,
      insights: {
        targetKind: PRODUCT_ANALYTICS_TARGET_KINDS.ModelSource,
        mode: PRODUCT_ANALYTICS_MODE_IDS.AccountFilter,
        sourceKind: PRODUCT_ANALYTICS_SOURCE_KINDS.ModelAccount,
      },
    })

    const serializedCalls = JSON.stringify(
      trackProductAnalyticsActionCompletedMock.mock.calls,
    )
    expect(serializedCalls).not.toContain("Private Account Name")
    expect(serializedCalls).not.toContain("Private Profile")
    expect(serializedCalls).not.toContain("private.example.com")
    expect(serializedCalls).not.toContain("profile.example.com")
    expect(serializedCalls).not.toContain("account-1")
    expect(serializedCalls).not.toContain("profile-1")
  })
})
