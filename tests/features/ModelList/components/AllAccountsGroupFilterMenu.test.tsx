import userEvent from "@testing-library/user-event"
import type { ComponentProps } from "react"
import { describe, expect, it, vi } from "vitest"

import { AccountSelector } from "~/features/ModelList/components/AccountSelector"
import { render, screen, within } from "~~/tests/test-utils/render"

const primaryAccount = {
  id: "account-1",
  name: "Primary Account",
} as any

const secondaryAccount = {
  id: "account-2",
  name: "Secondary Account",
} as any

function renderMenu(
  overrides: Partial<ComponentProps<typeof AccountSelector>> = {},
) {
  const onExcludedGroupsChange = vi.fn()

  render(
    <AccountSelector
      selectedSourceValue="all"
      setSelectedSourceValue={vi.fn()}
      accounts={[primaryAccount]}
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
      setAllAccountsExcludedGroupsByAccountId={onExcludedGroupsChange}
      {...overrides}
    />,
  )

  return { onExcludedGroupsChange }
}

function getAccountSection(accountName: string) {
  const section = screen.getByText(accountName).closest("section")
  if (!section) {
    throw new Error(`Expected section for ${accountName}`)
  }

  return within(section)
}

async function openAccountGroupFilterMenu(
  user: ReturnType<typeof userEvent.setup>,
) {
  await user.click(
    await screen.findByRole("button", {
      name: "modelList:accountGroupFilterTrigger",
    }),
  )
}

describe("AllAccountsGroupFilterMenu", () => {
  it("renders an empty state and keeps reset disabled when no account has groups", async () => {
    const user = userEvent.setup()
    const { onExcludedGroupsChange } = renderMenu({
      accounts: [primaryAccount],
      availableAccountGroupsByAccountId: {},
      availableAccountGroupOptionsByAccountId: {},
    })

    await openAccountGroupFilterMenu(user)

    expect(
      screen.getByText("modelList:accountGroupFilterNoGroups"),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", {
        name: "modelList:accountGroupFilterResetAll",
      }),
    ).toBeDisabled()
    expect(onExcludedGroupsChange).not.toHaveBeenCalled()
  })

  it("renders unpriced groups without inventing a 1x ratio", async () => {
    const user = userEvent.setup()
    renderMenu({
      availableAccountGroupOptionsByAccountId: {
        "account-1": [{ name: "vip" }, { name: "default", ratio: 1 }],
      },
    })

    await openAccountGroupFilterMenu(user)
    await user.click(getAccountSection("Primary Account").getByRole("combobox"))

    expect(await screen.findByRole("option", { name: "vip" })).toBeVisible()
    expect(screen.getByRole("option", { name: "default (1x)" })).toBeVisible()
    expect(
      screen.queryByRole("option", { name: "vip (1x)" }),
    ).not.toBeInTheDocument()
  })

  it("sets excluded groups when a selected group is removed from an account", async () => {
    const user = userEvent.setup()
    const { onExcludedGroupsChange } = renderMenu()

    await openAccountGroupFilterMenu(user)
    await user.click(getAccountSection("Primary Account").getByRole("combobox"))
    await user.click(await screen.findByRole("option", { name: "vip (2x)" }))

    expect(onExcludedGroupsChange).toHaveBeenCalledWith({
      "account-1": ["vip"],
    })
  })

  it("removes the account key when all groups are selected again", async () => {
    const user = userEvent.setup()
    const { onExcludedGroupsChange } = renderMenu({
      accounts: [primaryAccount, secondaryAccount],
      availableAccountGroupsByAccountId: {
        "account-1": ["vip", "default"],
        "account-2": ["beta"],
      },
      availableAccountGroupOptionsByAccountId: {
        "account-1": [
          { name: "vip", ratio: 2 },
          { name: "default", ratio: 1 },
        ],
        "account-2": [{ name: "beta", ratio: 1 }],
      },
      allAccountsExcludedGroupsByAccountId: {
        "account-1": ["vip"],
        "account-2": ["beta"],
      },
    })

    await openAccountGroupFilterMenu(user)
    const primarySection = getAccountSection("Primary Account")
    await user.click(primarySection.getByRole("combobox"))
    await user.click(await screen.findByRole("option", { name: "vip (2x)" }))

    expect(onExcludedGroupsChange).toHaveBeenCalledWith({
      "account-2": ["beta"],
    })
  })

  it("select-all removes an existing account exclusion and ignores accounts without exclusions", async () => {
    const user = userEvent.setup()
    const { onExcludedGroupsChange } = renderMenu({
      accounts: [primaryAccount, secondaryAccount],
      availableAccountGroupsByAccountId: {
        "account-1": ["vip", "default"],
        "account-2": ["beta"],
      },
      availableAccountGroupOptionsByAccountId: {
        "account-1": [
          { name: "vip", ratio: 2 },
          { name: "default", ratio: 1 },
        ],
        "account-2": [{ name: "beta", ratio: 1 }],
      },
      allAccountsExcludedGroupsByAccountId: {
        "account-1": ["vip"],
      },
    })

    await openAccountGroupFilterMenu(user)
    await user.click(
      getAccountSection("Secondary Account").getByRole("button", {
        name: "modelList:accountGroupFilterSelectAll",
      }),
    )
    expect(onExcludedGroupsChange).not.toHaveBeenCalled()

    await user.click(
      getAccountSection("Primary Account").getByRole("button", {
        name: "modelList:accountGroupFilterSelectAll",
      }),
    )
    expect(onExcludedGroupsChange).toHaveBeenCalledWith({})
  })

  it("clear-all excludes every available group for the account", async () => {
    const user = userEvent.setup()
    const { onExcludedGroupsChange } = renderMenu({
      allAccountsExcludedGroupsByAccountId: {
        "account-1": ["vip"],
      },
    })

    await openAccountGroupFilterMenu(user)
    await user.click(
      screen.getByRole("button", {
        name: "modelList:accountGroupFilterClearAll",
      }),
    )

    expect(onExcludedGroupsChange).toHaveBeenCalledWith({
      "account-1": ["vip", "default"],
    })
  })

  it("resets all account exclusions", async () => {
    const user = userEvent.setup()
    const { onExcludedGroupsChange } = renderMenu({
      allAccountsExcludedGroupsByAccountId: {
        "account-1": ["vip"],
      },
    })

    await openAccountGroupFilterMenu(user)
    await user.click(
      screen.getByRole("button", {
        name: "modelList:accountGroupFilterResetAll",
      }),
    )

    expect(onExcludedGroupsChange).toHaveBeenCalledWith({})
  })

  it("shows zero-selected copy when every account group is excluded", async () => {
    const user = userEvent.setup()
    renderMenu({
      allAccountsExcludedGroupsByAccountId: {
        "account-1": ["vip", "default"],
      },
    })

    await openAccountGroupFilterMenu(user)

    expect(
      getAccountSection("Primary Account").getByRole("combobox"),
    ).toHaveTextContent("modelList:accountGroupFilterNoGroupsIncluded")
    expect(
      screen.getByText("modelList:accountGroupFilterSelectedSummary"),
    ).toBeInTheDocument()
  })
})
