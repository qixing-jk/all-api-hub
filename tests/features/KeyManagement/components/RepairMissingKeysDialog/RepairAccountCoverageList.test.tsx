import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { RepairAccountCoverageList } from "~/features/KeyManagement/components/RepairMissingKeysDialog/RepairAccountCoverageList"
import enKeyManagement from "~/locales/en/keyManagement.json"
import { ACCOUNT_KEY_RECONCILIATION_OUTCOMES } from "~/services/accounts/accountKeyInventoryReconciliation"
import {
  ACCOUNT_KEY_REQUIREMENT_PROVISIONING_KINDS,
  ACCOUNT_KEY_RESOURCE_FAILURE_CODES,
  type AccountKeyProvisioningRequirement,
} from "~/services/apiAdapters/contracts/accountKeyResource"
import type { AccountKeyRepairAccountResult } from "~/types/accountKeyAutoProvisioning"
import {
  ACCOUNT_KEY_REPAIR_MUTATION_OUTCOMES,
  ACCOUNT_KEY_REPAIR_OUTCOMES,
  ACCOUNT_KEY_REPAIR_SKIP_REASONS,
} from "~/types/accountKeyAutoProvisioning"
import { createResourceTestI18n } from "~~/tests/test-utils/i18n"

const i18n = await createResourceTestI18n({
  en: { keyManagement: enKeyManagement },
})
const t = i18n.t

const requirement = (
  displayName: string,
  provisioning: AccountKeyProvisioningRequirement["provisioning"]["kind"] = ACCOUNT_KEY_REQUIREMENT_PROVISIONING_KINDS.Automatic,
): AccountKeyProvisioningRequirement => ({
  requirementKey: `opaque:${displayName}`,
  displayName,
  provisioning:
    provisioning === ACCOUNT_KEY_REQUIREMENT_PROVISIONING_KINDS.InputRequired
      ? { kind: provisioning, reasonCode: "example-input-required" }
      : { kind: provisioning },
})

function buildResult(
  overrides: Partial<AccountKeyRepairAccountResult> = {},
): AccountKeyRepairAccountResult {
  return {
    accountId: "account-1",
    accountName: "Example Account",
    siteType: SITE_TYPES.NEW_API,
    siteUrlOrigin: "https://account.example.invalid",
    outcome: ACCOUNT_KEY_REPAIR_OUTCOMES.Covered,
    requirementResults: [],
    createdRefs: [],
    invalidResources: [],
    renameResults: [],
    finishedAt: 1,
    ...overrides,
  }
}

function renderList(
  props: Partial<Parameters<typeof RepairAccountCoverageList>[0]> = {},
) {
  return render(
    <RepairAccountCoverageList
      filteredResults={[buildResult()]}
      searchTerm=""
      t={t}
      {...props}
    />,
  )
}

describe("RepairAccountCoverageList", () => {
  it("renders the empty state when no account results match", () => {
    renderList({ filteredResults: [] })

    expect(
      screen.getByText(t("keyManagement:repairMissingKeys.noMatchingResults")),
    ).toBeVisible()
  })

  it("uses the whole successful account summary to reveal its details", async () => {
    const user = userEvent.setup()
    renderList({
      filteredResults: [
        buildResult({
          requirementResults: [
            {
              requirement: requirement("Covered plan"),
              outcome: ACCOUNT_KEY_RECONCILIATION_OUTCOMES.Covered,
            },
          ],
        }),
      ],
    })

    const detailsButton = screen.getByRole("button", {
      name: t("keyManagement:actions.detailsFor", {
        name: "Example Account",
      }),
    })
    expect(detailsButton).toHaveAttribute("aria-expanded", "false")
    expect(within(detailsButton).getByText("Example Account")).toBeVisible()
    expect(
      within(detailsButton).getByText(
        t("keyManagement:repairMissingKeys.outcomes.covered"),
      ),
    ).toBeVisible()
    expect(screen.queryByText("Covered plan")).not.toBeInTheDocument()

    await user.click(detailsButton)

    expect(detailsButton).toHaveAttribute("aria-expanded", "true")
    expect(screen.getByText("Covered plan")).toBeVisible()
  })

  it("opens completed requirement details while results are being searched", () => {
    renderList({
      filteredResults: [
        buildResult({
          requirementResults: [
            {
              requirement: requirement("Matched plan"),
              outcome: ACCOUNT_KEY_RECONCILIATION_OUTCOMES.Covered,
            },
          ],
        }),
      ],
      searchTerm: "matched",
    })

    expect(
      screen.getByRole("button", {
        name: t("keyManagement:actions.detailsFor", {
          name: "Example Account",
        }),
      }),
    ).toHaveAttribute("aria-expanded", "true")
    expect(screen.getByText("Matched plan")).toBeVisible()
  })

  it("renders all requirement outcomes by display name without exposing opaque identity", () => {
    renderList({
      filteredResults: [
        buildResult({
          outcome: ACCOUNT_KEY_REPAIR_OUTCOMES.Partial,
          requirementResults: [
            {
              requirement: requirement("Covered plan"),
              outcome: ACCOUNT_KEY_RECONCILIATION_OUTCOMES.Covered,
            },
            {
              requirement: requirement("Created plan"),
              outcome: ACCOUNT_KEY_RECONCILIATION_OUTCOMES.Created,
              created: {
                ref: {
                  accountId: "account-1",
                  siteType: SITE_TYPES.NEW_API,
                  scopeKey: "account",
                  resourceId: "created-1",
                },
              },
            },
            {
              requirement: requirement("Recovered plan"),
              outcome:
                ACCOUNT_KEY_RECONCILIATION_OUTCOMES.CoveredAfterUncertain,
              failure: {
                code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.MutationStateUncertain,
                message: "Create response timed out",
              },
            },
            {
              requirement: requirement("Inventory blocked plan"),
              outcome:
                ACCOUNT_KEY_RECONCILIATION_OUTCOMES.BlockedIncompleteInventory,
            },
            {
              requirement: requirement(
                "Input blocked plan",
                ACCOUNT_KEY_REQUIREMENT_PROVISIONING_KINDS.InputRequired,
              ),
              outcome: ACCOUNT_KEY_RECONCILIATION_OUTCOMES.BlockedInputRequired,
            },
            {
              requirement: requirement("Rejected plan"),
              outcome: ACCOUNT_KEY_RECONCILIATION_OUTCOMES.Rejected,
              failure: { code: "unexpected", message: "Provider rejected" },
            },
            {
              requirement: requirement("Uncertain plan"),
              outcome: ACCOUNT_KEY_RECONCILIATION_OUTCOMES.Uncertain,
              failure: {
                code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.MutationStateUncertain,
                message: "Provider result could not be confirmed",
              },
            },
          ],
        }),
      ],
    })

    expect(
      screen.getByRole("button", {
        name: t("keyManagement:actions.detailsFor", {
          name: "Example Account",
        }),
      }),
    ).toHaveAttribute("aria-expanded", "true")

    for (const label of [
      "Covered plan",
      "Created plan",
      "Recovered plan",
      "Inventory blocked plan",
      "Input blocked plan",
      "Rejected plan",
      "Uncertain plan",
    ]) {
      expect(screen.getByText(label)).toBeVisible()
      expect(screen.queryByText(`opaque:${label}`)).not.toBeInTheDocument()
    }
    for (const outcomeKey of [
      "covered",
      "created",
      "coveredAfterUncertain",
      "blockedIncompleteInventory",
      "blockedInputRequired",
      "rejected",
      "uncertain",
    ]) {
      expect(
        screen.getByText(
          t(`keyManagement:repairMissingKeys.requirements.${outcomeKey}`),
        ),
      ).toBeVisible()
    }
    expect(screen.getByText("Create response timed out")).toBeVisible()
    expect(
      screen.getByText("Provider result could not be confirmed"),
    ).toBeVisible()
  })

  it("renders account failure and skip details without provider actions", () => {
    renderList({
      filteredResults: [
        buildResult({
          outcome: ACCOUNT_KEY_REPAIR_OUTCOMES.Failed,
          errorMessage: "Could not inspect keys",
        }),
        buildResult({
          accountId: "account-2",
          accountName: "Unsupported Account",
          outcome: ACCOUNT_KEY_REPAIR_OUTCOMES.Skipped,
          skipReason: ACCOUNT_KEY_REPAIR_SKIP_REASONS.ProvisioningUnavailable,
          finishedAt: 2,
        }),
      ],
    })

    expect(screen.getByText("Could not inspect keys")).toBeVisible()
    expect(
      screen.getByText(
        t(
          "keyManagement:repairMissingKeys.skipReasons.provisioningUnavailable",
        ),
      ),
    ).toBeVisible()
    expect(screen.queryByRole("button")).not.toBeInTheDocument()
  })

  it("shows localized guidance for a structured account failure instead of its raw code", () => {
    renderList({
      filteredResults: [
        buildResult({
          outcome: ACCOUNT_KEY_REPAIR_OUTCOMES.Failed,
          failure: {
            code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.Unexpected,
          },
        }),
      ],
    })

    expect(
      screen.getByText(
        t("keyManagement:repairMissingKeys.failureGuidance.unexpected"),
      ),
    ).toBeVisible()
    expect(screen.queryByText("unexpected")).not.toBeInTheDocument()
  })

  it("prefers useful provider details over fallback guidance", () => {
    renderList({
      filteredResults: [
        buildResult({
          outcome: ACCOUNT_KEY_REPAIR_OUTCOMES.Partial,
          partialFailure: {
            code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.UpstreamRejected,
            message: "Provider rejected the account key request",
            upstreamCode: "525",
          },
        }),
      ],
    })

    expect(
      screen.getByText("Provider rejected the account key request · 525"),
    ).toBeVisible()
    expect(
      screen.queryByText(
        t("keyManagement:repairMissingKeys.failureGuidance.upstreamRejected"),
      ),
    ).not.toBeInTheDocument()
  })

  it("shows localized guidance for a code-only requirement failure", () => {
    renderList({
      filteredResults: [
        buildResult({
          outcome: ACCOUNT_KEY_REPAIR_OUTCOMES.Partial,
          requirementResults: [
            {
              requirement: requirement("Authenticated plan"),
              outcome: ACCOUNT_KEY_RECONCILIATION_OUTCOMES.Rejected,
              failure: {
                code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.AuthenticationFailed,
              },
            },
          ],
        }),
      ],
    })

    expect(
      screen.getByText(
        t(
          "keyManagement:repairMissingKeys.failureGuidance.authenticationFailed",
        ),
      ),
    ).toBeVisible()
    expect(screen.queryByText("authentication_failed")).not.toBeInTheDocument()
  })

  it("localizes a controlled failure code stored by an older repair result", () => {
    renderList({
      filteredResults: [
        buildResult({
          outcome: ACCOUNT_KEY_REPAIR_OUTCOMES.Failed,
          errorMessage: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.Unexpected,
        }),
      ],
    })

    expect(
      screen.getByText(
        t("keyManagement:repairMissingKeys.failureGuidance.unexpected"),
      ),
    ).toBeVisible()
    expect(screen.queryByText("unexpected")).not.toBeInTheDocument()
  })

  it("renders per-account rename outcomes", () => {
    const ref = {
      accountId: "account-1",
      siteType: SITE_TYPES.NEW_API,
      scopeKey: "account",
      resourceId: "resource-1",
    } as const
    renderList({
      filteredResults: [
        buildResult({
          outcome: ACCOUNT_KEY_REPAIR_OUTCOMES.Partial,
          renameResults: [
            { ref, outcome: ACCOUNT_KEY_REPAIR_MUTATION_OUTCOMES.Applied },
            {
              ref: { ...ref, resourceId: "resource-2" },
              outcome: ACCOUNT_KEY_REPAIR_MUTATION_OUTCOMES.Rejected,
              failure: { code: "unexpected" },
            },
            {
              ref: { ...ref, resourceId: "resource-3" },
              outcome: ACCOUNT_KEY_REPAIR_MUTATION_OUTCOMES.Uncertain,
              failure: {
                code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.MutationStateUncertain,
              },
            },
          ],
        }),
      ],
    })

    expect(
      screen.getByText(
        t("keyManagement:repairMissingKeys.renameSummary.accountApplied", {
          count: 1,
        }),
      ),
    ).toBeVisible()
    expect(
      screen.getByText(
        t("keyManagement:repairMissingKeys.renameSummary.accountRejected", {
          count: 1,
        }),
      ),
    ).toBeVisible()
    expect(
      screen.getByText(
        t("keyManagement:repairMissingKeys.renameSummary.accountUncertain", {
          count: 1,
        }),
      ),
    ).toBeVisible()
  })

  it("explains why an otherwise covered account inventory is incomplete", () => {
    renderList({
      filteredResults: [
        buildResult({
          outcome: ACCOUNT_KEY_REPAIR_OUTCOMES.Partial,
          inventoryIssues: [
            {
              code: "inherited-account-group-unavailable",
              count: 1,
            },
          ],
        }),
      ],
    })

    expect(
      screen.getByText(
        t(
          "keyManagement:repairMissingKeys.inventoryIssues.inheritedAccountGroupUnavailable",
          { count: 1 },
        ),
      ),
    ).toBeVisible()
    expect(
      screen.queryByText("inherited-account-group-unavailable"),
    ).not.toBeInTheDocument()
  })
})
