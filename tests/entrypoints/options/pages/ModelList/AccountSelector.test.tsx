import { beforeEach, describe, expect, it, vi } from "vitest"

import { AccountSelector } from "~/features/ModelList/components/AccountSelector"
import { testI18n } from "~~/tests/test-utils/i18n"
import { fireEvent, render, screen } from "~~/tests/test-utils/render"

describe("AccountSelector", () => {
  beforeEach(() => {
    testI18n.addResourceBundle(
      "en",
      "modelList",
      {
        selectSource: "Select Source",
        allAccounts: "All accounts",
        pleaseSelectSource: "Please select a source",
        accountGroupFilterTrigger: "Filter Account Groups",
        accountGroupFilterTriggerTooltip: "Filter tooltip",
        accountGroupFilterHint: "Use the filter",
        accountGroupFilterTitle: "Account Group Filter",
        accountGroupFilterDescription: "Filter groups per account",
        accountGroupFilterResetAll: "Reset all",
        accountGroupFilterSelectedSummary: "{{selected}} / {{total}}",
        accountGroupFilterSelectAll: "Select all",
        accountGroupFilterClearAll: "Clear all",
        accountGroupFilterAllIncluded: "Include all groups",
        accountGroupFilterInlineDescription: "Account groups stay independent",
        sourceLabels: {
          profileOption: "API Credential: {{name}} · {{host}}",
        },
      },
      true,
      true,
    )
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
    expect(combobox).toHaveTextContent(
      "API Credential: Reusable Key · profile.example.com",
    )
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
    expect(combobox).toHaveTextContent("Please select a source")

    fireEvent.click(combobox)

    expect(await screen.findByText("All accounts")).toBeInTheDocument()
    expect(screen.getByText("Primary Account")).toBeInTheDocument()
    expect(
      screen.getByText("API Credential: Broken Endpoint · not-a-valid-url"),
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

    expect(screen.queryByText("All accounts")).toBeNull()
    expect(
      screen.getByText("API Credential: Reusable Key · profile.example.com"),
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
      await screen.findByRole("button", { name: "Filter Account Groups" }),
    )
    const comboboxes = await screen.findAllByRole("combobox")
    fireEvent.click(comboboxes[1])

    expect(await screen.findByText("vip (2x)")).toBeInTheDocument()
    expect(screen.getByText("default (1x)")).toBeInTheDocument()
  })
})
