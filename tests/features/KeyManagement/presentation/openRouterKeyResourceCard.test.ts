import type { TFunction } from "i18next"
import { describe, expect, it } from "vitest"

import { CURRENCIES } from "~/constants/money"
import { KEY_RESOURCE_CARD_STATUSES } from "~/features/KeyManagement/presentation/keyResourceCard"
import {
  buildOpenRouterKeyResourceCardPresentation,
  buildOpenRouterKeyResourceDetailFacts,
} from "~/features/KeyManagement/presentation/openRouterKeyResourceCard"
import type { NativeKeyManagementRow } from "~/features/KeyManagement/types"
import {
  ASSET_KINDS,
  BUDGET_AMOUNT_FIELDS,
  BUDGET_LIMIT_STATES,
  FINANCIAL_OBSERVATION_REASONS,
  OBSERVATION_STATUSES,
} from "~/services/amounts/financialConstants"
import { keyBudgetFact } from "~/services/apiAdapters/accountKeyResources/budgetFacts"
import { INVENTORY_SECRET_AVAILABILITIES } from "~/services/apiAdapters/contracts/inventorySecret"
import {
  OPENROUTER_KEY_FIELD_IDS,
  OPENROUTER_KEY_LIMIT_RESETS,
} from "~/services/apiAdapters/openrouter/keys/keyResourceFields"
import { formatAssetAmount } from "~/utils/core/money"

const t = ((key: string) => key) as TFunction
const formatUsd = (value: number) =>
  formatAssetAmount({
    asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
    value: String(value),
  })
const financialFact = (
  fieldId: string,
  metric: (typeof BUDGET_AMOUNT_FIELDS)[
    "Limit" | "Remaining" | "Used" | "ByokUsed"],
  value: unknown,
  limitState: (typeof BUDGET_LIMIT_STATES)["Finite" | "Unlimited"],
) =>
  keyBudgetFact(
    {
      accountId: "account-example",
      siteType: "openrouter",
      scopeKey: "workspace-example",
      resourceId: "hash-example",
    },
    { authority: "https://openrouter.ai", observedAt: 1 },
    {
      fieldId,
      operation: "fixture",
      asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
      limitState:
        metric === BUDGET_AMOUNT_FIELDS.Limit ||
        metric === BUDGET_AMOUNT_FIELDS.Remaining
          ? limitState
          : BUDGET_LIMIT_STATES.Unknown,
      [metric]: value,
      metric,
    },
  )

const row: NativeKeyManagementRow = {
  kind: "account-key-resource",
  rowKey: "native-row-example",
  accountId: "account-example",
  accountName: "Example account",
  scopeName: "Example workspace",
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
    displayFacts: [
      financialFact(
        "limit",
        BUDGET_AMOUNT_FIELDS.Limit,
        20,
        BUDGET_LIMIT_STATES.Finite,
      ),
      financialFact(
        "limit_remaining",
        BUDGET_AMOUNT_FIELDS.Remaining,
        -2,
        BUDGET_LIMIT_STATES.Finite,
      ),
      financialFact(
        "usage",
        BUDGET_AMOUNT_FIELDS.Used,
        22,
        BUDGET_LIMIT_STATES.Finite,
      ),
      financialFact(
        "byok_usage",
        BUDGET_AMOUNT_FIELDS.ByokUsed,
        7,
        BUDGET_LIMIT_STATES.Finite,
      ),
    ],
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
      { fieldId: "include_byok_in_limit", kind: "boolean", value: true },
      { fieldId: "unknown_provider_field", kind: "text", value: "private" },
    ],
    actions: { canUpdate: true, canDelete: false },
  },
}

describe("buildOpenRouterKeyResourceCardPresentation", () => {
  it.each([OBSERVATION_STATUSES.Stale, OBSERVATION_STATUSES.Unknown] as const)(
    "qualifies %s unlimited state in summaries and details",
    (status) => {
      const fact = financialFact(
        "limit",
        BUDGET_AMOUNT_FIELDS.Limit,
        undefined,
        BUDGET_LIMIT_STATES.Unlimited,
      )
      fact.budget.stateObservation =
        status === OBSERVATION_STATUSES.Stale
          ? {
              status,
              source: fact.budget.limit.source,
              observedAt: 1,
              reason: FINANCIAL_OBSERVATION_REASONS.RefreshUnavailable,
            }
          : { status, source: fact.budget.limit.source, reason: "not-reported" }
      const presentation = buildOpenRouterKeyResourceCardPresentation(
        { ...row, facts: { ...row.facts, displayFacts: [fact] } },
        t,
      )
      const expected =
        status === OBSERVATION_STATUSES.Stale
          ? "keyManagement:dialog.unlimitedQuota (keyManagement:financial.stale)"
          : "common:labels.notAvailable"
      expect(
        presentation.summaryFacts.find(({ id }) => id === "limit")?.value,
      ).toBe(expected)
      expect(
        presentation.detailFacts.find(({ id }) => id === "limit")?.value,
      ).toBe(expected)
    },
  )
  it("projects native keys into the shared card without secret-dependent actions", () => {
    const presentation = buildOpenRouterKeyResourceCardPresentation(row, t)

    expect(presentation).toMatchObject({
      id: row.rowKey,
      title: "Example key",
      accountLabel: "Example account",
      status: "active",
      statusLabel: "keyManagement:native.status.enabled",
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
    expect(presentation.contextFact).toEqual(presentation.summaryFacts[0])
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
        displayFacts: [
          financialFact(
            OPENROUTER_KEY_FIELD_IDS.UsageDaily,
            BUDGET_AMOUNT_FIELDS.Used,
            1,
            BUDGET_LIMIT_STATES.Finite,
          ),
          financialFact(
            OPENROUTER_KEY_FIELD_IDS.UsageWeekly,
            BUDGET_AMOUNT_FIELDS.Used,
            2,
            BUDGET_LIMIT_STATES.Finite,
          ),
          financialFact(
            OPENROUTER_KEY_FIELD_IDS.UsageMonthly,
            BUDGET_AMOUNT_FIELDS.Used,
            3,
            BUDGET_LIMIT_STATES.Finite,
          ),
          financialFact(
            OPENROUTER_KEY_FIELD_IDS.ByokUsageDaily,
            BUDGET_AMOUNT_FIELDS.ByokUsed,
            4,
            BUDGET_LIMIT_STATES.Finite,
          ),
          financialFact(
            OPENROUTER_KEY_FIELD_IDS.ByokUsageWeekly,
            BUDGET_AMOUNT_FIELDS.ByokUsed,
            5,
            BUDGET_LIMIT_STATES.Finite,
          ),
          financialFact(
            OPENROUTER_KEY_FIELD_IDS.ByokUsageMonthly,
            BUDGET_AMOUNT_FIELDS.ByokUsed,
            6,
            BUDGET_LIMIT_STATES.Finite,
          ),
        ],
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
      "••••••",
    ])
  })

  it("maps disabled and unknown provider statuses explicitly", () => {
    const disabled = buildOpenRouterKeyResourceCardPresentation(
      { ...row, facts: { ...row.facts, status: "disabled" } },
      t,
    )
    const unknown = buildOpenRouterKeyResourceCardPresentation(
      {
        ...row,
        facts: { ...row.facts, status: KEY_RESOURCE_CARD_STATUSES.Unknown },
      },
      t,
    )

    expect(disabled).toMatchObject({
      status: "inactive",
      statusLabel: "keyManagement:native.status.disabled",
    })
    expect(unknown).toMatchObject({
      status: "unknown",
      statusLabel: "keyManagement:native.status.unknown",
    })
  })

  it("distinguishes unlimited, missing finite values, and expired status", () => {
    const unlimited = buildOpenRouterKeyResourceCardPresentation(
      {
        ...row,
        facts: {
          ...row.facts,
          status: "expired",
          displayFacts: [
            financialFact(
              "limit_remaining",
              BUDGET_AMOUNT_FIELDS.Remaining,
              undefined,
              BUDGET_LIMIT_STATES.Unlimited,
            ),
            financialFact(
              "limit",
              BUDGET_AMOUNT_FIELDS.Limit,
              undefined,
              BUDGET_LIMIT_STATES.Unlimited,
            ),
            financialFact(
              "usage",
              BUDGET_AMOUNT_FIELDS.Used,
              4,
              BUDGET_LIMIT_STATES.Unlimited,
            ),
          ],
          fields: [{ fieldId: "limit_mode", kind: "text", value: "unlimited" }],
        },
      },
      t,
    )

    expect(unlimited.status).toBe("inactive")
    expect(unlimited.statusLabel).toBe("keyManagement:native.status.expired")
    expect(unlimited.summaryFacts.map(({ value }) => value)).toEqual([
      "Example workspace",
      "keyManagement:dialog.unlimitedQuota",
      "keyManagement:dialog.unlimitedQuota",
      formatUsd(4),
    ])

    const limited = buildOpenRouterKeyResourceCardPresentation(
      {
        ...row,
        facts: {
          ...row.facts,
          displayFacts: [
            financialFact(
              "limit_remaining",
              BUDGET_AMOUNT_FIELDS.Remaining,
              undefined,
              BUDGET_LIMIT_STATES.Finite,
            ),
            financialFact(
              "limit",
              BUDGET_AMOUNT_FIELDS.Limit,
              undefined,
              BUDGET_LIMIT_STATES.Finite,
            ),
            financialFact(
              "usage",
              BUDGET_AMOUNT_FIELDS.Used,
              4,
              BUDGET_LIMIT_STATES.Finite,
            ),
          ],
          fields: [{ fieldId: "limit_mode", kind: "text", value: "limited" }],
        },
      },
      t,
    )

    expect(limited.summaryFacts.map(({ value }) => value)).toEqual([
      "Example workspace",
      "common:labels.notAvailable",
      "common:labels.notAvailable",
      formatUsd(4),
    ])
  })
})
