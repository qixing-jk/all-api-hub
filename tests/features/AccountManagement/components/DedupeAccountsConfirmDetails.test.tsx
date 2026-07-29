import { render as renderComponent, screen } from "@testing-library/react"
import type { TFunction } from "i18next"
import { describe, expect, it } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { DedupeAccountsConfirmDetails } from "~/features/AccountManagement/components/DedupeAccountsDialog/DedupeAccountsConfirmDetails"
import { DedupeAccountsGroupsList } from "~/features/AccountManagement/components/DedupeAccountsDialog/DedupeAccountsGroupsList"
import type { DedupeAccountsDialogGroup } from "~/features/AccountManagement/components/DedupeAccountsDialog/types"
import { buildSiteAccount } from "~~/tests/test-utils/factories"

const t = ((key: string) => key) as TFunction

describe("DedupeAccountsConfirmDetails", () => {
  it("omits order-dependent site type metadata for an ordinary mixed-type group", () => {
    const historical = buildSiteAccount({
      id: "historical",
      site_type: SITE_TYPES.UNKNOWN,
      account_info: {
        ...buildSiteAccount().account_info,
        id: "same-user",
      },
    })
    const detected = buildSiteAccount({
      id: "detected",
      site_type: SITE_TYPES.NEW_API,
      account_info: {
        ...buildSiteAccount().account_info,
        id: "same-user",
      },
    })
    const group: DedupeAccountsDialogGroup = {
      key: {
        id: '["detected","historical"]',
        origin: "https://api.example.invalid",
        reason: "same_origin_user",
        userId: "same-user",
      },
      keepAccountId: detected.id,
      deleteAccountIds: [historical.id],
      accounts: [historical, detected],
      groupId: '["detected","historical"]',
      recommendedKeepAccountId: detected.id,
      hasManualOverride: false,
    }

    renderComponent(
      <DedupeAccountsConfirmDetails
        groups={[group]}
        accountLabelById={
          new Map([
            [historical.id, "Historical account"],
            [detected.id, "Detected account"],
          ])
        }
        pinnedToDeleteCount={0}
        orderedToDeleteCount={0}
        t={t}
      />,
    )

    expect(
      screen.getByText(
        "https://api.example.invalid · ui:dialog.dedupeAccounts.userId",
      ),
    ).toBeInTheDocument()
    expect(screen.queryByText(/unknown|new-api/)).not.toBeInTheDocument()
  })

  it("uses controlled same-credential copy without exposing upstream identity", () => {
    const keep = buildSiteAccount({
      id: "local-openrouter-keep",
      site_type: SITE_TYPES.OPENROUTER,
      account_info: {
        ...buildSiteAccount().account_info,
        id: "upstream-openrouter-keep",
      },
    })
    const duplicate = buildSiteAccount({
      id: "local-openrouter-delete",
      site_type: SITE_TYPES.OPENROUTER,
      account_info: {
        ...buildSiteAccount().account_info,
        id: "upstream-openrouter-delete",
      },
    })
    const group: DedupeAccountsDialogGroup = {
      key: {
        id: '["local-openrouter-delete","local-openrouter-keep"]',
        origin: "https://openrouter.ai",
        siteType: SITE_TYPES.OPENROUTER,
        reason: "same_credential",
      },
      keepAccountId: keep.id,
      deleteAccountIds: [duplicate.id],
      accounts: [keep, duplicate],
      groupId: '["local-openrouter-delete","local-openrouter-keep"]',
      recommendedKeepAccountId: keep.id,
      hasManualOverride: false,
    }

    renderComponent(
      <DedupeAccountsConfirmDetails
        groups={[group]}
        accountLabelById={
          new Map([
            [keep.id, "OpenRouter keep"],
            [duplicate.id, "OpenRouter duplicate"],
          ])
        }
        pinnedToDeleteCount={0}
        orderedToDeleteCount={0}
        t={t}
      />,
    )

    expect(
      screen.getByText(/ui:dialog\.dedupeAccounts\.sameCredential/),
    ).toBeInTheDocument()
    expect(
      screen.queryByText(/ui:dialog\.dedupeAccounts\.userId/),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText(/ui:dialog\.dedupeAccounts\.confirm\./),
    ).not.toBeInTheDocument()
    expect(screen.queryByText(/upstream-openrouter/)).not.toBeInTheDocument()
  })

  it("uses same-credential copy in the expanded group preview", () => {
    const account = buildSiteAccount({
      id: "local-openrouter-id",
      site_type: SITE_TYPES.OPENROUTER,
      account_info: {
        ...buildSiteAccount().account_info,
        id: "upstream-openrouter-user-id",
      },
    })
    const group: DedupeAccountsDialogGroup = {
      key: {
        id: '["local-openrouter-id"]',
        origin: "https://openrouter.ai",
        siteType: SITE_TYPES.OPENROUTER,
        reason: "same_credential",
      },
      keepAccountId: account.id,
      deleteAccountIds: [],
      accounts: [account],
      groupId: '["local-openrouter-id"]',
      recommendedKeepAccountId: account.id,
      hasManualOverride: false,
    }

    renderComponent(
      <DedupeAccountsGroupsList
        groups={[group]}
        accountLabelById={new Map([[account.id, "OpenRouter account"]])}
        orderedIndexByAccountId={new Map()}
        pinnedAccountIds={[]}
        detailsOpenByAccountId={{}}
        isWorking={false}
        t={t}
        onKeepChange={() => {}}
        onToggleDetails={() => {}}
      />,
    )

    expect(
      screen.getAllByText(/ui:dialog\.dedupeAccounts\.sameCredential/),
    ).toHaveLength(2)
    expect(screen.queryByText(/upstream-openrouter/)).not.toBeInTheDocument()
  })
})
