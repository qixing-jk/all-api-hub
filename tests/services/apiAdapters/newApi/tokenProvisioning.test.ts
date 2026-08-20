import { describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  generateDefaultTokenRequest,
  resolveDefaultTokenLifecycleDecisionWithContext,
} from "~/services/accounts/defaultTokenLifecycle"
import type { DisplayAccountApiCapabilityContext } from "~/services/accounts/utils/apiServiceRequest"
import type { KeyManagementCapability } from "~/services/apiAdapters/contracts/keyManagement"
import {
  DEFAULT_TOKEN_CREATION_DECISION_KINDS,
  TOKEN_PROVISIONING_BLOCK_REASONS,
  TOKEN_PROVISIONING_WORKFLOWS,
} from "~/services/apiAdapters/contracts/tokenProvisioning"
import { createNewApiTokenProvisioning } from "~/services/apiAdapters/newApi/tokenProvisioning"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { AuthTypeEnum } from "~/types"

const buildContext = (
  siteType: typeof SITE_TYPES.NEW_API | typeof SITE_TYPES.MODELFLARE,
  baseUrl: string,
) => {
  const request: ApiServiceRequest = {
    baseUrl,
    auth: {
      authType: AuthTypeEnum.Cookie,
      userId: "8",
    },
  }
  const fetchUserGroups = vi.fn().mockResolvedValue({
    "group-alpha": { desc: "Alpha", ratio: 1 },
    "group-beta": { desc: "Beta", ratio: 1 },
  })
  const keyManagement = {
    fetchTokens: vi.fn(),
    createToken: vi.fn(),
    updateToken: vi.fn(),
    resolveTokenKey: vi.fn(),
    deleteToken: vi.fn(),
    fetchAvailableModels: vi.fn(),
    userGroups: { fetch: fetchUserGroups },
  } satisfies KeyManagementCapability
  const tokenProvisioning = createNewApiTokenProvisioning(siteType)
  const capabilities = {
    siteType,
    account: { keyManagement, tokenProvisioning },
  }
  const context: DisplayAccountApiCapabilityContext = {
    accountId: "account-id",
    siteType,
    request,
    capabilities,
    keyManagement,
    tokenProvisioning,
    serviceCredential: undefined,
  }

  return { context, fetchUserGroups }
}

describe("New API token provisioning", () => {
  it("loads ModelFlare groups before quick-create when multiple groups are available", async () => {
    const { context, fetchUserGroups } = buildContext(
      SITE_TYPES.MODELFLARE,
      "https://gateway.example.invalid/dashboard/overview",
    )

    await expect(
      resolveDefaultTokenLifecycleDecisionWithContext({
        workflow: TOKEN_PROVISIONING_WORKFLOWS.QuickCreateSelection,
        context,
      }),
    ).resolves.toEqual({
      kind: DEFAULT_TOKEN_CREATION_DECISION_KINDS.SelectionRequired,
      allowedGroups: ["group-alpha", "group-beta"],
      reason: TOKEN_PROVISIONING_BLOCK_REASONS.GroupSelectionRequired,
    })
    expect(fetchUserGroups).toHaveBeenCalledWith(context.request)
  })

  it("normalizes ModelFlare unlimited quota after the user selects a group", async () => {
    const { context, fetchUserGroups } = buildContext(
      SITE_TYPES.MODELFLARE,
      "https://gateway.example.invalid/dashboard/overview",
    )

    await expect(
      resolveDefaultTokenLifecycleDecisionWithContext({
        workflow: TOKEN_PROVISIONING_WORKFLOWS.SharedEnsure,
        context,
        explicitGroup: "group-alpha",
      }),
    ).resolves.toMatchObject({
      kind: DEFAULT_TOKEN_CREATION_DECISION_KINDS.Create,
      tokenData: {
        group: "group-alpha",
        unlimited_quota: true,
        remain_quota: -1,
      },
    })
    expect(fetchUserGroups).not.toHaveBeenCalled()
  })

  it("preserves a finite ModelFlare quota after the user selects a group", () => {
    const defaultTokenData = {
      ...generateDefaultTokenRequest(),
      unlimited_quota: false,
      remain_quota: 250000,
    }

    expect(
      createNewApiTokenProvisioning(
        SITE_TYPES.MODELFLARE,
      ).resolveDefaultTokenCreation({
        workflow: TOKEN_PROVISIONING_WORKFLOWS.SharedEnsure,
        explicitGroup: "group-alpha",
        defaultTokenData,
      }),
    ).toMatchObject({
      kind: DEFAULT_TOKEN_CREATION_DECISION_KINDS.Create,
      tokenData: {
        group: "group-alpha",
        unlimited_quota: false,
        remain_quota: 250000,
      },
    })
  })

  it("uses the site type rather than the hostname for provisioning policy", async () => {
    const { context, fetchUserGroups } = buildContext(
      SITE_TYPES.NEW_API,
      "https://modelflare.dev/dashboard/overview",
    )

    await expect(
      resolveDefaultTokenLifecycleDecisionWithContext({
        workflow: TOKEN_PROVISIONING_WORKFLOWS.QuickCreateSelection,
        context,
      }),
    ).resolves.toMatchObject({
      kind: DEFAULT_TOKEN_CREATION_DECISION_KINDS.Create,
      tokenData: {
        group: "",
        remain_quota: 0,
      },
    })
    expect(fetchUserGroups).not.toHaveBeenCalled()
  })
})
