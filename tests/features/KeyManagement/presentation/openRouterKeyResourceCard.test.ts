import type { TFunction } from "i18next"
import { describe, expect, it } from "vitest"

import {
  buildOpenRouterKeyResourceCardPresentation,
  buildOpenRouterKeyResourceDetailFacts,
} from "~/features/KeyManagement/presentation/openRouterKeyResourceCard"
import type { NativeKeyManagementRow } from "~/features/KeyManagement/types"
import { INVENTORY_SECRET_AVAILABILITIES } from "~/services/apiAdapters/contracts/keyManagement"
import {
  OPENROUTER_KEY_FIELD_IDS,
  OPENROUTER_KEY_LIMIT_RESETS,
} from "~/services/apiAdapters/openrouter/keyResourceFields"

const t = ((key: string) => key) as TFunction
const formatUsd = (value: number) =>
  new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    currencyDisplay: "code",
    minimumFractionDigits: 0,
    maximumFractionDigits: 8,
  }).format(value)

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
        value: formatUsd(20),
      },
      {
        id: "limit_remaining",
        label: "keyManagement:openRouter.list.details.remaining",
        value: formatUsd(-2),
      },
      {
        id: "usage",
        label: "keyManagement:openRouter.list.details.usage",
        value: formatUsd(22),
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

  it("formats every provider detail category without exposing raw secrets", () => {
    const facts = buildOpenRouterKeyResourceDetailFacts(
      {
        ...row.facts,
        fields: [
          {
            fieldId: OPENROUTER_KEY_FIELD_IDS.LimitReset,
            kind: "text",
            value: OPENROUTER_KEY_LIMIT_RESETS.Daily,
          },
          {
            fieldId: OPENROUTER_KEY_FIELD_IDS.LimitReset,
            kind: "text",
            value: OPENROUTER_KEY_LIMIT_RESETS.Weekly,
          },
          {
            fieldId: OPENROUTER_KEY_FIELD_IDS.LimitReset,
            kind: "text",
            value: OPENROUTER_KEY_LIMIT_RESETS.Monthly,
          },
          {
            fieldId: OPENROUTER_KEY_FIELD_IDS.LimitReset,
            kind: "text",
            value: OPENROUTER_KEY_LIMIT_RESETS.None,
          },
          {
            fieldId: OPENROUTER_KEY_FIELD_IDS.LimitReset,
            kind: "text",
            value: "provider-unknown",
          },
          {
            fieldId: OPENROUTER_KEY_FIELD_IDS.UsageDaily,
            kind: "number",
            value: 1,
          },
          {
            fieldId: OPENROUTER_KEY_FIELD_IDS.UsageWeekly,
            kind: "number",
            value: 2,
          },
          {
            fieldId: OPENROUTER_KEY_FIELD_IDS.UsageMonthly,
            kind: "number",
            value: 3,
          },
          {
            fieldId: OPENROUTER_KEY_FIELD_IDS.ByokUsageDaily,
            kind: "number",
            value: 4,
          },
          {
            fieldId: OPENROUTER_KEY_FIELD_IDS.ByokUsageWeekly,
            kind: "number",
            value: 5,
          },
          {
            fieldId: OPENROUTER_KEY_FIELD_IDS.ByokUsageMonthly,
            kind: "number",
            value: 6,
          },
          {
            fieldId: OPENROUTER_KEY_FIELD_IDS.Disabled,
            kind: "boolean",
            value: false,
          },
          {
            fieldId: OPENROUTER_KEY_FIELD_IDS.CreatedAt,
            kind: "text",
            value: "2026-08-05T00:00:00.000Z",
          },
          {
            fieldId: OPENROUTER_KEY_FIELD_IDS.UpdatedAt,
            kind: "list",
            value: ["first", "second"],
          },
          {
            fieldId: OPENROUTER_KEY_FIELD_IDS.ExpiresAt,
            kind: "secret",
            state: "unavailable",
          },
        ],
      },
      t,
    )

    expect(facts.map(({ label }) => label)).toEqual([
      "keyManagement:openRouter.list.details.reset",
      "keyManagement:openRouter.list.details.reset",
      "keyManagement:openRouter.list.details.reset",
      "keyManagement:openRouter.list.details.reset",
      "keyManagement:openRouter.list.details.reset",
      "keyManagement:openRouter.list.details.usageDaily",
      "keyManagement:openRouter.list.details.usageWeekly",
      "keyManagement:openRouter.list.details.usageMonthly",
      "keyManagement:openRouter.list.details.byokUsageDaily",
      "keyManagement:openRouter.list.details.byokUsageWeekly",
      "keyManagement:openRouter.list.details.byokUsageMonthly",
      "keyManagement:openRouter.list.details.disabled",
      "keyManagement:openRouter.list.details.createdAt",
      "keyManagement:openRouter.list.details.updatedAt",
      "keyManagement:openRouter.list.details.expiresAt",
    ])
    expect(facts.map(({ value }) => value)).toEqual([
      "keyManagement:openRouter.editor.options.limitReset.daily",
      "keyManagement:openRouter.editor.options.limitReset.weekly",
      "keyManagement:openRouter.editor.options.limitReset.monthly",
      "keyManagement:openRouter.editor.options.limitReset.none",
      "keyManagement:openRouter.list.values.missing",
      formatUsd(1),
      formatUsd(2),
      formatUsd(3),
      formatUsd(4),
      formatUsd(5),
      formatUsd(6),
      "keyManagement:openRouter.list.values.no",
      "2026-08-05T00:00:00.000Z",
      "first, second",
      "••••",
    ])
  })

  it("maps disabled and unknown provider statuses explicitly", () => {
    const disabled = buildOpenRouterKeyResourceCardPresentation(
      { ...row, facts: { ...row.facts, status: "disabled" } },
      t,
    )
    const unknown = buildOpenRouterKeyResourceCardPresentation(
      { ...row, facts: { ...row.facts, status: "unknown" } },
      t,
    )

    expect(disabled).toMatchObject({
      status: "inactive",
      statusLabel: "keyManagement:openRouter.list.status.disabled",
    })
    expect(unknown).toMatchObject({
      status: "unknown",
      statusLabel: "keyManagement:openRouter.list.status.unknown",
    })
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
      formatUsd(4),
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
      formatUsd(4),
    ])
  })
})
