import userEvent from "@testing-library/user-event"
import type { ComponentProps } from "react"
import { describe, expect, it, vi } from "vitest"

import { ApiCredentialProfileKeyAssociations } from "~/features/ApiCredentialProfiles/components/ApiCredentialProfileKeyAssociations"
import { API_CREDENTIAL_PROFILE_ASSOCIATION_AVAILABILITY } from "~/features/ApiCredentialProfiles/contracts"
import { API_CREDENTIAL_PROFILE_LINK_STATES } from "~/types/apiCredentialProfiles"
import { render, screen } from "~~/tests/test-utils/render"

const tokenItem = {
  associationId: "association-token",
  accountName: "Example account",
  locator: {
    source: "account_token" as const,
    accountId: "account-example",
    siteType: "new-api" as const,
    tokenId: 42,
  },
  state: API_CREDENTIAL_PROFILE_LINK_STATES.Active,
}

const serviceItem = {
  associationId: "association-service",
  accountName: "Second account",
  locator: {
    source: "service_credential" as const,
    accountId: "account-example",
    siteType: "new-api" as const,
    service: "codex",
  },
  state: API_CREDENTIAL_PROFILE_LINK_STATES.Active,
}

const keyResourceItem = {
  associationId: "association-resource",
  locator: {
    source: "account_key_resource" as const,
    ref: {
      accountId: "account-example",
      siteType: "openrouter" as const,
      scopeKey: "workspace-example",
      resourceId: "resource-example",
    },
  },
  state: API_CREDENTIAL_PROFILE_LINK_STATES.Active,
}

function renderAssociations(
  props: Partial<
    ComponentProps<typeof ApiCredentialProfileKeyAssociations>
  > = {},
) {
  return render(
    <ApiCredentialProfileKeyAssociations
      availability={API_CREDENTIAL_PROFILE_ASSOCIATION_AVAILABILITY.Known}
      {...props}
    />,
    {
      withThemeProvider: false,
      withUserPreferencesProvider: false,
    },
  )
}

describe("ApiCredentialProfileKeyAssociations", () => {
  it("keeps an unlinked credential visually quiet", () => {
    renderAssociations()

    expect(
      screen.queryByText("apiCredentialProfiles:association.sectionTitle"),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText("apiCredentialProfiles:association.notLinked"),
    ).not.toBeInTheDocument()
  })

  it("does not render an association trigger without an available action", () => {
    renderAssociations({
      state: { status: "linked", items: [tokenItem] },
    })

    expect(
      screen.queryByRole("button", {
        name: "apiCredentialProfiles:association.linked",
      }),
    ).not.toBeInTheDocument()
  })

  it("keeps one linked key compact and groups navigation and unlinking in its menu", async () => {
    const user = userEvent.setup()
    const onOpenAssociatedKey = vi.fn()
    const onUnlinkAssociatedKey = vi.fn()
    renderAssociations({
      state: { status: "linked", items: [tokenItem] },
      onOpenAssociatedKey,
      onUnlinkAssociatedKey,
    })

    const trigger = screen.getByRole("button", {
      name: "apiCredentialProfiles:association.linked",
    })
    expect(trigger).not.toHaveTextContent(
      "apiCredentialProfiles:association.linked",
    )
    expect(trigger).not.toHaveAttribute("title")
    expect(trigger).toHaveAccessibleName(
      "apiCredentialProfiles:association.linked",
    )

    await user.click(trigger)
    await user.click(
      screen.getByRole("menuitem", {
        name: "apiCredentialProfiles:association.viewKey",
      }),
    )
    expect(onOpenAssociatedKey).toHaveBeenCalledWith("association-token")

    expect(
      screen.queryByRole("button", {
        name: "apiCredentialProfiles:association.removeLink",
      }),
    ).not.toBeInTheDocument()
    await user.click(trigger)
    await user.click(
      screen.getByRole("menuitem", {
        name: "apiCredentialProfiles:association.removeLink",
      }),
    )
    expect(onUnlinkAssociatedKey).toHaveBeenCalledWith("association-token")
  })

  it("lists multiple keys with local account context", async () => {
    const user = userEvent.setup()
    const onOpenAssociatedKey = vi.fn()
    renderAssociations({
      state: {
        status: "linked",
        items: [tokenItem, serviceItem, keyResourceItem],
      },
      onOpenAssociatedKey,
    })

    const trigger = screen.getByRole("button", {
      name: /apiCredentialProfiles:association.linkedWithCount/,
    })
    expect(trigger).toHaveTextContent("3")
    await user.click(trigger)

    expect(
      screen.getByText(
        "Example account · apiCredentialProfiles:association.accountToken",
      ),
    ).toBeVisible()
    expect(
      screen.getByText(
        "Second account · apiCredentialProfiles:association.serviceCredential",
      ),
    ).toBeVisible()
    expect(
      screen.getByText("apiCredentialProfiles:association.keyResource"),
    ).toBeVisible()
    expect(
      screen.queryByText("apiCredentialProfiles:association.viewKeyNumber"),
    ).not.toBeInTheDocument()
  })

  it("groups view, confirm, and remove actions under one pending candidate", async () => {
    const user = userEvent.setup()
    const onConfirmAssociatedKey = vi.fn()
    const onUnlinkAssociatedKey = vi.fn()
    renderAssociations({
      state: {
        status: "needs-confirmation",
        items: [
          {
            ...tokenItem,
            state: API_CREDENTIAL_PROFILE_LINK_STATES.NeedsConfirmation,
          },
        ],
      },
      onOpenAssociatedKey: vi.fn(),
      onConfirmAssociatedKey,
      onUnlinkAssociatedKey,
    })

    const trigger = screen.getByRole("button", {
      name: /apiCredentialProfiles:association.needsConfirmationWithCount/,
    })
    expect(trigger).toHaveTextContent("1")
    await user.click(trigger)
    await user.click(
      screen.getByRole("menuitem", {
        name: "apiCredentialProfiles:association.confirmLink",
      }),
    )
    expect(onConfirmAssociatedKey).toHaveBeenCalledWith("association-token")

    await user.click(trigger)
    await user.click(
      screen.getByRole("menuitem", {
        name: "apiCredentialProfiles:association.removeLink",
      }),
    )
    expect(onUnlinkAssociatedKey).toHaveBeenCalledWith("association-token")
  })
})
