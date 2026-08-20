import { describe, expect, it } from "vitest"

import type { CreateTokenRequest } from "~/services/accountTokens/tokenProvisioningModel"
import {
  DEFAULT_TOKEN_CREATION_DECISION_KINDS,
  TOKEN_CREATION_SECRET_RECOVERY,
  TOKEN_PROVISIONING_BLOCK_REASONS,
  TOKEN_PROVISIONING_WORKFLOWS,
} from "~/services/apiAdapters/contracts/tokenProvisioning"
import {
  normalizeTokenProvisioningGroupNames,
  resolveRequiredGroupDefaultTokenCreation,
} from "~/services/apiAdapters/tokenProvisioning/requiredGroup"

const defaultTokenData: CreateTokenRequest = {
  name: "Example default token",
  remain_quota: 500000,
  expired_time: -1,
  unlimited_quota: false,
  model_limits_enabled: false,
  model_limits: "",
  allow_ips: "",
  group: "",
}

describe("required-group token provisioning", () => {
  it("normalizes group names without changing their first-seen order", () => {
    expect(
      normalizeTokenProvisioningGroupNames({
        " default ": { desc: "Default", ratio: 1 },
        default: { desc: "Duplicate", ratio: 1 },
        "": { desc: "Blank", ratio: 1 },
        " vip ": { desc: "VIP", ratio: 2 },
        "   ": { desc: "Whitespace", ratio: 1 },
      }),
    ).toEqual(["default", "vip"])
  })

  it.each([
    [TOKEN_PROVISIONING_WORKFLOWS.SharedEnsure],
    [TOKEN_PROVISIONING_WORKFLOWS.BackgroundAutoProvision],
  ])("blocks implicit group creation for the %s workflow", (workflow) => {
    expect(
      resolveRequiredGroupDefaultTokenCreation({ workflow, defaultTokenData }),
    ).toEqual({
      kind: DEFAULT_TOKEN_CREATION_DECISION_KINDS.Blocked,
      reason: TOKEN_PROVISIONING_BLOCK_REASONS.GroupRequired,
    })
  })

  it("requests group inventory for quick creation", () => {
    expect(
      resolveRequiredGroupDefaultTokenCreation({
        workflow: TOKEN_PROVISIONING_WORKFLOWS.QuickCreateSelection,
        defaultTokenData,
      }),
    ).toEqual({
      kind: DEFAULT_TOKEN_CREATION_DECISION_KINDS.NeedsUserGroups,
    })
  })

  it("creates with the only available normalized group", () => {
    expect(
      resolveRequiredGroupDefaultTokenCreation({
        workflow: TOKEN_PROVISIONING_WORKFLOWS.PostSaveAutomation,
        defaultTokenData,
        userGroups: { " default ": { desc: "Default", ratio: 1 } },
      }),
    ).toEqual({
      kind: DEFAULT_TOKEN_CREATION_DECISION_KINDS.Create,
      tokenData: { ...defaultTokenData, group: "default" },
      oneTimeSecret: false,
      recoverCreatedToken: TOKEN_CREATION_SECRET_RECOVERY.InventoryRefetch,
    })
  })

  it("returns stable choices when multiple normalized groups remain", () => {
    expect(
      resolveRequiredGroupDefaultTokenCreation({
        workflow: TOKEN_PROVISIONING_WORKFLOWS.QuickCreateSelection,
        defaultTokenData,
        userGroups: {
          " vip ": { desc: "VIP", ratio: 2 },
          default: { desc: "Default", ratio: 1 },
          " vip": { desc: "Duplicate", ratio: 2 },
        },
      }),
    ).toEqual({
      kind: DEFAULT_TOKEN_CREATION_DECISION_KINDS.SelectionRequired,
      allowedGroups: ["vip", "default"],
      reason: TOKEN_PROVISIONING_BLOCK_REASONS.GroupSelectionRequired,
    })
  })

  it("blocks creation when the inventory contains no usable group", () => {
    expect(
      resolveRequiredGroupDefaultTokenCreation({
        workflow: TOKEN_PROVISIONING_WORKFLOWS.PostSaveAutomation,
        defaultTokenData,
        userGroups: { " ": { desc: "Blank", ratio: 1 } },
      }),
    ).toEqual({
      kind: DEFAULT_TOKEN_CREATION_DECISION_KINDS.Blocked,
      reason: TOKEN_PROVISIONING_BLOCK_REASONS.AvailableGroupRequired,
    })
  })
})
