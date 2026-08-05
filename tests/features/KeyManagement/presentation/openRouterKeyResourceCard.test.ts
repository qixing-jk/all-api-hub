import type { TFunction } from "i18next"
import { describe, expect, it } from "vitest"

import {
  buildOpenRouterKeyResourceCardPresentation,
  buildOpenRouterKeyResourceDetailFacts,
} from "~/features/KeyManagement/presentation/openRouterKeyResourceCard"
import type { NativeKeyManagementRow } from "~/features/KeyManagement/types"
import { INVENTORY_SECRET_AVAILABILITIES } from "~/services/apiAdapters/contracts/keyManagement"

const t = ((key: string) => key) as TFunction

const row: NativeKeyManagementRow = {
  kind: "account-key-resource",
  rowKey: "native-row-example",
  accountId: "account-example",
  accountName: "Example account",
  workspaceName: "Example workspace",
  facts: {
    ref: {
      accountId: "account-example",
      siteType: "openrouter",
      scopeKey: "workspace-example",
      resourceId: "hash-example",
    },
    displayName: "Example key",
    maskedLabel: "sk-or-v1-••••example",
    status: "enabled",
    fields: [
      { fieldId: "name", kind: "text", value: "Example key" },
      {
        fieldId: "workspace_id",
        kind: "text",
        value: "Example workspace",
      },
      {
        fieldId: "creator_user_id",
        kind: "text",
        value: "Example member",
      },
      { fieldId: "limit_mode", kind: "text", value: "limited" },
      { fieldId: "limit", kind: "number", value: 20 },
      { fieldId: "limit_remaining", kind: "number", value: -2 },
      { fieldId: "usage", kind: "number", value: 22 },
      { fieldId: "byok_usage", kind: "number", value: 7 },
      { fieldId: "include_byok_in_limit", kind: "boolean", value: true },
      { fieldId: "unknown_provider_field", kind: "text", value: "private" },
    ],
    actions: { canUpdate: true, canDelete: false },
  },
}

describe("buildOpenRouterKeyResourceCardPresentation", () => {
  it("projects native keys into the shared card without secret-dependent actions", () => {
    const presentation = buildOpenRouterKeyResourceCardPresentation(row, t)

    expect(presentation).toMatchObject({
      id: row.rowKey,
      title: "Example key",
      accountLabel: "Example account",
      status: "active",
      statusLabel: "keyManagement:openRouter.list.status.enabled",
      secretAvailability: INVENTORY_SECRET_AVAILABILITIES.CreateResponseOnly,
      maskedLabel: "sk-or-v1-••••example",
      secretAvailabilityMessage:
        "keyManagement:keyDetails.createResponseOnlySecret",
      actions: {
        copySecret: false,
        revealSecret: false,
        verifySecret: false,
        exportSecret: false,
        edit: true,
        delete: false,
        batchSelect: false,
      },
    })
    expect(presentation.summaryFacts).toEqual([
      {
        id: "workspace_id",
        label: "keyManagement:openRouter.list.details.workspace",
        value: "Example workspace",
      },
      {
        id: "limit",
        label: "keyManagement:openRouter.list.details.limit",
        value: "20",
      },
      {
        id: "limit_remaining",
        label: "keyManagement:openRouter.list.details.remaining",
        value: "-2",
      },
      {
        id: "usage",
        label: "keyManagement:openRouter.list.details.usage",
        value: "22",
      },
    ])
  })

  it("keeps every supported safe native fact in shared details", () => {
    const facts = buildOpenRouterKeyResourceDetailFacts(row.facts, t)

    expect(facts.map(({ id }) => id)).toEqual([
      "workspace_id",
      "creator_user_id",
      "limit_mode",
      "limit",
      "limit_remaining",
      "usage",
      "byok_usage",
      "include_byok_in_limit",
    ])
    expect(facts.find(({ id }) => id === "include_byok_in_limit")?.value).toBe(
      "keyManagement:openRouter.list.values.yes",
    )
    expect(facts.find(({ id }) => id === "limit_mode")?.value).toBe(
      "keyManagement:openRouter.editor.options.limitMode.limited",
    )
    expect(facts.map(({ value }) => value)).not.toContain("private")
    expect(facts.map(({ value }) => value)).not.toContain("hash-example")
    expect(facts.map(({ value }) => value)).not.toContain("workspace-example")
  })

  it("distinguishes unlimited, missing finite values, and expired status", () => {
    const unlimited = buildOpenRouterKeyResourceCardPresentation(
      {
        ...row,
        facts: {
          ...row.facts,
          status: "expired",
          fields: [
            { fieldId: "limit_mode", kind: "text", value: "unlimited" },
            { fieldId: "usage", kind: "number", value: 4 },
          ],
        },
      },
      t,
    )

    expect(unlimited.status).toBe("inactive")
    expect(unlimited.statusLabel).toBe(
      "keyManagement:openRouter.list.status.expired",
    )
    expect(unlimited.summaryFacts.map(({ value }) => value)).toEqual([
      "Example workspace",
      "keyManagement:openRouter.list.values.unlimited",
      "keyManagement:openRouter.list.values.unlimited",
      "4",
    ])

    const limited = buildOpenRouterKeyResourceCardPresentation(
      {
        ...row,
        facts: {
          ...row.facts,
          fields: [
            { fieldId: "limit_mode", kind: "text", value: "limited" },
            { fieldId: "usage", kind: "number", value: 4 },
          ],
        },
      },
      t,
    )

    expect(limited.summaryFacts.map(({ value }) => value)).toEqual([
      "Example workspace",
      "keyManagement:openRouter.list.values.missing",
      "keyManagement:openRouter.list.values.missing",
      "4",
    ])
  })
})
