import { afterEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import * as defaultTokenLifecycle from "~/services/accounts/defaultTokenLifecycle"
import {
  resolveDefaultTokenQuickCreateResolution,
  TOKEN_QUICK_CREATE_RESOLUTION_KINDS,
} from "~/services/accounts/tokenQuickCreateResolution"
import {
  DEFAULT_TOKEN_CREATION_DECISION_KINDS,
  TOKEN_PROVISIONING_BLOCK_REASONS,
} from "~/services/apiAdapters/contracts/tokenProvisioning"
import { buildDisplaySiteData } from "~~/tests/test-utils/factories"

describe("resolveDefaultTokenQuickCreateResolution", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("preserves fetched group metadata for the selection UI", async () => {
    const userGroups = {
      default: { desc: "Default", ratio: 1 },
      vip: { desc: "Premium", ratio: 2 },
    }
    vi.spyOn(
      defaultTokenLifecycle,
      "resolveDefaultTokenLifecycleDecisionDetails",
    ).mockResolvedValueOnce({
      decision: {
        kind: DEFAULT_TOKEN_CREATION_DECISION_KINDS.SelectionRequired,
        allowedGroups: ["default", "vip"],
        reason: TOKEN_PROVISIONING_BLOCK_REASONS.GroupSelectionRequired,
      },
      userGroups,
    })

    await expect(
      resolveDefaultTokenQuickCreateResolution(
        buildDisplaySiteData({ siteType: SITE_TYPES.MODELFLARE }),
      ),
    ).resolves.toEqual({
      kind: TOKEN_QUICK_CREATE_RESOLUTION_KINDS.SelectionRequired,
      allowedGroups: ["default", "vip"],
      suggestedGroup: "default",
      groups: userGroups,
    })
  })
})
