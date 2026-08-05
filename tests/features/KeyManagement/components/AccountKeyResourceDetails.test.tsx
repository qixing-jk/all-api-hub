import { describe, expect, it } from "vitest"

import { AccountKeyResourceDetails } from "~/features/KeyManagement/components/AccountKeyResource/AccountKeyResourceDetails"
import type { AccountKeyResourceFacts } from "~/services/apiAdapters/contracts/accountKeyResource"
import { render, screen } from "~~/tests/test-utils/render"

const facts: AccountKeyResourceFacts = {
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
    { fieldId: "limit_mode", kind: "text", value: "unlimited" },
    { fieldId: "usage", kind: "number", value: 4 },
    { fieldId: "disabled", kind: "boolean", value: false },
  ],
  actions: { canUpdate: true, canDelete: true },
}

describe("AccountKeyResourceDetails", () => {
  it("distinguishes unlimited limits from missing fields without exposing provider identifiers", () => {
    render(<AccountKeyResourceDetails facts={facts} />, {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })

    expect(screen.getByText("Example key")).toBeVisible()
    expect(
      screen.getByText(
        "keyManagement:openRouter.editor.options.limitMode.unlimited",
      ),
    ).toBeVisible()
    expect(screen.getByText("4")).toBeVisible()
    expect(screen.queryByText("hash-example")).toBeNull()
    expect(screen.queryByText("workspace-example")).toBeNull()
  })

  it("renders safe creator display while rejecting a raw creator member ID", () => {
    render(
      <AccountKeyResourceDetails
        facts={{
          ...facts,
          fields: [
            { fieldId: "workspace_id", kind: "text", value: "Team workspace" },
            {
              fieldId: "creator_user_id",
              kind: "text",
              value: "Workspace member",
            },
            { fieldId: "limit_mode", kind: "text", value: "limited" },
            { fieldId: "limit_remaining", kind: "number", value: -1 },
            { fieldId: "include_byok_in_limit", kind: "boolean", value: true },
            { fieldId: "usage_daily", kind: "number", value: 1 },
            { fieldId: "usage_weekly", kind: "number", value: 2 },
            { fieldId: "usage_monthly", kind: "number", value: 3 },
            { fieldId: "byok_usage_daily", kind: "number", value: 4 },
            { fieldId: "byok_usage_weekly", kind: "number", value: 5 },
            { fieldId: "byok_usage_monthly", kind: "number", value: 6 },
            { fieldId: "disabled", kind: "boolean", value: false },
          ],
        }}
      />,
      { withUserPreferencesProvider: false, withThemeProvider: false },
    )

    expect(screen.getByText("Team workspace")).toBeVisible()
    expect(screen.getByText("Workspace member")).toBeVisible()
    expect(
      screen.getByText("keyManagement:openRouter.list.details.creator"),
    ).toBeVisible()
    expect(screen.queryByText("user_raw-member-id-example")).toBeNull()
    expect(screen.getByText("-1")).toBeVisible()
    expect(
      screen.getByText("keyManagement:openRouter.list.values.yes"),
    ).toBeVisible()
    expect(
      screen.getByText("keyManagement:openRouter.list.values.no"),
    ).toBeVisible()
    expect(screen.getByText("6")).toBeVisible()
  })
})
