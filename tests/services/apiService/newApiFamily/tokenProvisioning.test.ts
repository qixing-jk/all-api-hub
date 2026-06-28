import { describe, expect, it } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  CREATED_TOKEN_SECRET_DECISION_KINDS,
  DEFAULT_TOKEN_CREATION_DECISION_KINDS,
  TOKEN_CREATION_SECRET_RECOVERY,
  TOKEN_PROVISIONING_BLOCK_REASONS,
  TOKEN_PROVISIONING_REPAIR_POLICY_KINDS,
  TOKEN_PROVISIONING_WORKFLOWS,
} from "~/services/apiAdapters/contracts/tokenProvisioning"
import { createTokenProvisioningImplementation } from "~/services/apiService/newApiFamily/tokenProvisioning"
import type { CreateTokenRequest } from "~/services/tokenProvisioning/model"
import type { ApiToken } from "~/types"

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

const token = (overrides: Partial<ApiToken> = {}): ApiToken =>
  ({
    id: 123,
    user_id: 456,
    key: "sk-example-secret",
    status: 1,
    name: "Example token",
    created_time: 1700000000,
    accessed_time: 0,
    expired_time: -1,
    remain_quota: 500000,
    unlimited_quota: false,
    model_limits_enabled: false,
    model_limits: "",
    allow_ips: "",
    used_quota: 0,
    group: "",
    ...overrides,
  }) as ApiToken

describe("newApiFamily tokenProvisioning", () => {
  it("allows default creation and inventory recovery for New API-family sites", () => {
    const provisioning = createTokenProvisioningImplementation(
      SITE_TYPES.NEW_API,
    )
    const createdToken = token()
    const maskedToken = token({ key: "sk-****abcd" })

    expect(
      provisioning.resolveDefaultTokenCreation({
        workflow: TOKEN_PROVISIONING_WORKFLOWS.BackgroundAutoProvision,
        defaultTokenData,
      }),
    ).toEqual({
      kind: DEFAULT_TOKEN_CREATION_DECISION_KINDS.Create,
      tokenData: defaultTokenData,
      oneTimeSecret: false,
      recoverCreatedToken: TOKEN_CREATION_SECRET_RECOVERY.InventoryRefetch,
    })

    expect(
      provisioning.classifyCreatedToken({
        workflow: TOKEN_PROVISIONING_WORKFLOWS.SharedEnsure,
        result: false,
      }),
    ).toEqual({
      kind: CREATED_TOKEN_SECRET_DECISION_KINDS.Failed,
      reason: TOKEN_PROVISIONING_BLOCK_REASONS.CreateFailed,
    })

    expect(
      provisioning.classifyCreatedToken({
        workflow: TOKEN_PROVISIONING_WORKFLOWS.SharedEnsure,
        result: true,
      }),
    ).toEqual({
      kind: CREATED_TOKEN_SECRET_DECISION_KINDS.NeedsInventoryRefetch,
    })

    expect(
      provisioning.classifyCreatedToken({
        workflow: TOKEN_PROVISIONING_WORKFLOWS.PostSaveAutomation,
        result: createdToken,
      }),
    ).toEqual({
      kind: CREATED_TOKEN_SECRET_DECISION_KINDS.Usable,
      token: createdToken,
      oneTimeSecret: false,
    })

    expect(
      provisioning.isInventoryTokenUsable({
        workflow: TOKEN_PROVISIONING_WORKFLOWS.SharedEnsure,
        token: maskedToken,
      }),
    ).toBe(true)
    expect(provisioning.getRepairPolicy()).toEqual({
      kind: TOKEN_PROVISIONING_REPAIR_POLICY_KINDS.Eligible,
    })
  })
})
