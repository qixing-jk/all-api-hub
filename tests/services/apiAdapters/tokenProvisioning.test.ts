import { beforeEach, describe, expect, it, vi } from "vitest"

import type { CreateTokenRequest } from "~/services/accountTokens/tokenProvisioningModel"
import { aihubmixTokenProvisioning } from "~/services/apiAdapters/aihubmix/tokenProvisioning"
import {
  CREATED_TOKEN_SECRET_DECISION_KINDS,
  DEFAULT_TOKEN_CREATION_DECISION_KINDS,
  TOKEN_CREATION_SECRET_RECOVERY,
  TOKEN_PROVISIONING_BLOCK_REASONS,
  TOKEN_PROVISIONING_REPAIR_POLICY_KINDS,
  TOKEN_PROVISIONING_WORKFLOWS,
} from "~/services/apiAdapters/contracts/tokenProvisioning"
import { createNewApiTokenProvisioning } from "~/services/apiAdapters/newApi/tokenProvisioning"
import {
  normalizeTokenProvisioningGroupNames,
  sub2ApiTokenProvisioning,
} from "~/services/apiAdapters/sub2api/tokenProvisioning"
import type { ApiToken } from "~/types"
import { ACCOUNT_KEY_REPAIR_SKIP_REASONS } from "~/types/accountKeyAutoProvisioning"

const { tokenProvisioningMock } = vi.hoisted(() => ({
  tokenProvisioningMock: {
    isInventoryTokenUsable: vi.fn(),
    resolveDefaultTokenCreation: vi.fn(),
    classifyCreatedToken: vi.fn(),
    getRepairPolicy: vi.fn(),
  },
}))

vi.mock("~/services/apiService/newApiFamily/default/tokenProvisioning", () => ({
  defaultTokenProvisioning: tokenProvisioningMock,
}))

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

describe("apiAdapter tokenProvisioning", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("delegates New API-family token provisioning through the New API-family implementation", () => {
    const provisioning = createNewApiTokenProvisioning()
    const createdToken = token()
    const maskedToken = token({ key: "sk-****abcd" })

    tokenProvisioningMock.resolveDefaultTokenCreation.mockReturnValueOnce({
      kind: DEFAULT_TOKEN_CREATION_DECISION_KINDS.Create,
      tokenData: defaultTokenData,
      oneTimeSecret: false,
      recoverCreatedToken: TOKEN_CREATION_SECRET_RECOVERY.InventoryRefetch,
    })
    tokenProvisioningMock.classifyCreatedToken
      .mockReturnValueOnce({
        kind: CREATED_TOKEN_SECRET_DECISION_KINDS.Failed,
        reason: TOKEN_PROVISIONING_BLOCK_REASONS.CreateFailed,
      })
      .mockReturnValueOnce({
        kind: CREATED_TOKEN_SECRET_DECISION_KINDS.NeedsInventoryRefetch,
      })
      .mockReturnValueOnce({
        kind: CREATED_TOKEN_SECRET_DECISION_KINDS.Usable,
        token: createdToken,
        oneTimeSecret: false,
      })
    tokenProvisioningMock.isInventoryTokenUsable.mockReturnValueOnce(true)
    tokenProvisioningMock.getRepairPolicy.mockReturnValueOnce({
      kind: TOKEN_PROVISIONING_REPAIR_POLICY_KINDS.Eligible,
    })

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
    expect(tokenProvisioningMock.resolveDefaultTokenCreation).toHaveBeenCalled()
    expect(tokenProvisioningMock.classifyCreatedToken).toHaveBeenCalled()
    expect(tokenProvisioningMock.isInventoryTokenUsable).toHaveBeenCalledWith({
      workflow: TOKEN_PROVISIONING_WORKFLOWS.SharedEnsure,
      token: maskedToken,
    })
    expect(tokenProvisioningMock.getRepairPolicy).toHaveBeenCalled()
  })

  it("normalizes token provisioning group names", () => {
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

  it("requires Sub2API groups before creating default tokens", () => {
    expect(
      sub2ApiTokenProvisioning.resolveDefaultTokenCreation({
        workflow: TOKEN_PROVISIONING_WORKFLOWS.SharedEnsure,
        defaultTokenData,
      }),
    ).toEqual({
      kind: DEFAULT_TOKEN_CREATION_DECISION_KINDS.Blocked,
      reason: TOKEN_PROVISIONING_BLOCK_REASONS.GroupRequired,
    })

    expect(
      sub2ApiTokenProvisioning.resolveDefaultTokenCreation({
        workflow: TOKEN_PROVISIONING_WORKFLOWS.QuickCreateSelection,
        defaultTokenData,
      }),
    ).toEqual({
      kind: DEFAULT_TOKEN_CREATION_DECISION_KINDS.NeedsUserGroups,
    })

    expect(
      sub2ApiTokenProvisioning.resolveDefaultTokenCreation({
        workflow: TOKEN_PROVISIONING_WORKFLOWS.PostSaveAutomation,
        defaultTokenData,
        userGroups: {
          " default ": { desc: "Default", ratio: 1 },
        },
      }),
    ).toEqual({
      kind: DEFAULT_TOKEN_CREATION_DECISION_KINDS.Create,
      tokenData: { ...defaultTokenData, group: "default" },
      oneTimeSecret: false,
      recoverCreatedToken: TOKEN_CREATION_SECRET_RECOVERY.InventoryRefetch,
    })

    expect(
      sub2ApiTokenProvisioning.resolveDefaultTokenCreation({
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

    expect(
      sub2ApiTokenProvisioning.resolveDefaultTokenCreation({
        workflow: TOKEN_PROVISIONING_WORKFLOWS.PostSaveAutomation,
        defaultTokenData,
        userGroups: {
          " ": { desc: "Blank", ratio: 1 },
        },
      }),
    ).toEqual({
      kind: DEFAULT_TOKEN_CREATION_DECISION_KINDS.Blocked,
      reason: TOKEN_PROVISIONING_BLOCK_REASONS.AvailableGroupRequired,
    })

    expect(sub2ApiTokenProvisioning.getRepairPolicy()).toEqual({
      kind: TOKEN_PROVISIONING_REPAIR_POLICY_KINDS.Skipped,
      skipReason: ACCOUNT_KEY_REPAIR_SKIP_REASONS.Sub2Api,
    })
  })

  it("uses explicit Sub2API groups and classifies created token responses", () => {
    const createdToken = token({ group: "vip" })

    expect(
      sub2ApiTokenProvisioning.isInventoryTokenUsable({
        workflow: TOKEN_PROVISIONING_WORKFLOWS.SharedEnsure,
        token: token({ key: "sk-****abcd" }),
      }),
    ).toBe(true)

    expect(
      sub2ApiTokenProvisioning.resolveDefaultTokenCreation({
        workflow: TOKEN_PROVISIONING_WORKFLOWS.SharedEnsure,
        defaultTokenData,
        explicitGroup: " vip ",
      }),
    ).toEqual({
      kind: DEFAULT_TOKEN_CREATION_DECISION_KINDS.Create,
      tokenData: { ...defaultTokenData, group: "vip" },
      oneTimeSecret: false,
      recoverCreatedToken: TOKEN_CREATION_SECRET_RECOVERY.InventoryRefetch,
    })

    expect(
      sub2ApiTokenProvisioning.classifyCreatedToken({
        workflow: TOKEN_PROVISIONING_WORKFLOWS.PostSaveAutomation,
        result: createdToken,
      }),
    ).toEqual({
      kind: CREATED_TOKEN_SECRET_DECISION_KINDS.Usable,
      token: createdToken,
      oneTimeSecret: false,
    })

    expect(
      sub2ApiTokenProvisioning.classifyCreatedToken({
        workflow: TOKEN_PROVISIONING_WORKFLOWS.SharedEnsure,
        result: true,
      }),
    ).toEqual({
      kind: CREATED_TOKEN_SECRET_DECISION_KINDS.NeedsInventoryRefetch,
    })

    expect(
      sub2ApiTokenProvisioning.classifyCreatedToken({
        workflow: TOKEN_PROVISIONING_WORKFLOWS.SharedEnsure,
        result: false,
      }),
    ).toEqual({
      kind: CREATED_TOKEN_SECRET_DECISION_KINDS.Failed,
      reason: TOKEN_PROVISIONING_BLOCK_REASONS.CreateFailed,
    })
  })

  it("requires AIHubMix one-time created secrets", () => {
    const fullToken = token({ key: "aihubmix-full-secret" })
    const maskedToken = token({ key: "aihubmix****cret" })

    expect(
      aihubmixTokenProvisioning.resolveDefaultTokenCreation({
        workflow: TOKEN_PROVISIONING_WORKFLOWS.BackgroundAutoProvision,
        defaultTokenData,
      }),
    ).toEqual({
      kind: DEFAULT_TOKEN_CREATION_DECISION_KINDS.Blocked,
      reason: TOKEN_PROVISIONING_BLOCK_REASONS.OneTimeSecretRequired,
    })

    expect(
      aihubmixTokenProvisioning.resolveDefaultTokenCreation({
        workflow: TOKEN_PROVISIONING_WORKFLOWS.PostSaveAutomation,
        defaultTokenData,
      }),
    ).toEqual({
      kind: DEFAULT_TOKEN_CREATION_DECISION_KINDS.Create,
      tokenData: defaultTokenData,
      oneTimeSecret: true,
      recoverCreatedToken: TOKEN_CREATION_SECRET_RECOVERY.CreatedResponseFirst,
    })

    expect(
      aihubmixTokenProvisioning.classifyCreatedToken({
        workflow: TOKEN_PROVISIONING_WORKFLOWS.PostSaveAutomation,
        result: false,
      }),
    ).toEqual({
      kind: CREATED_TOKEN_SECRET_DECISION_KINDS.Failed,
      reason: TOKEN_PROVISIONING_BLOCK_REASONS.CreateFailed,
    })

    expect(
      aihubmixTokenProvisioning.classifyCreatedToken({
        workflow: TOKEN_PROVISIONING_WORKFLOWS.PostSaveAutomation,
        result: fullToken,
      }),
    ).toEqual({
      kind: CREATED_TOKEN_SECRET_DECISION_KINDS.Usable,
      token: fullToken,
      oneTimeSecret: true,
    })

    expect(
      aihubmixTokenProvisioning.classifyCreatedToken({
        workflow: TOKEN_PROVISIONING_WORKFLOWS.PostSaveAutomation,
        result: maskedToken,
      }),
    ).toEqual({
      kind: CREATED_TOKEN_SECRET_DECISION_KINDS.Unavailable,
      reason: TOKEN_PROVISIONING_BLOCK_REASONS.CreatedTokenSecretUnavailable,
    })

    expect(
      aihubmixTokenProvisioning.isInventoryTokenUsable({
        workflow: TOKEN_PROVISIONING_WORKFLOWS.PostSaveAutomation,
        token: maskedToken,
      }),
    ).toBe(false)

    expect(aihubmixTokenProvisioning.getRepairPolicy()).toEqual({
      kind: TOKEN_PROVISIONING_REPAIR_POLICY_KINDS.Skipped,
      skipReason: ACCOUNT_KEY_REPAIR_SKIP_REASONS.AihubmixOneTimeKey,
    })
  })
})
