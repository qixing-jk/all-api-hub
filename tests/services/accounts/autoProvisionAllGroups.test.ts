import toast from "react-hot-toast"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { autoProvisionKeyOnAccountAdd } from "~/services/accounts/accountKeyAutoProvisioning/autoProvisionOnAccountAdd"
import { accountQueries } from "~/services/accounts/accountStorage/accountQueries"
import {
  ACCOUNT_KEY_RESOURCE_FAILURE_CODES,
  type AccountKeyProvisioningSnapshot,
  type AccountKeyResourceSession,
} from "~/services/apiAdapters/contracts/accountKeyResource"
import { getSiteTypeCapabilities } from "~/services/apiAdapters/registry"
import { AuthTypeEnum, SiteHealthStatus, type SiteAccount } from "~/types"
import { ACCOUNT_KEY_AUTO_PROVISION_MODES } from "~/types/accountKeyAutoProvisioning"
import { showWarningToast } from "~/utils/core/toastHelpers"
import { buildCheckInConfig } from "~~/tests/test-utils/checkIn"

vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
}))
vi.mock("~/utils/core/toastHelpers", () => ({ showWarningToast: vi.fn() }))
vi.mock("~/services/accounts/accountStorage/accountQueries", () => ({
  accountQueries: { getAccountById: vi.fn() },
}))
vi.mock("~/services/apiAdapters/registry", () => ({
  getSiteTypeCapabilities: vi.fn(),
}))

const account: SiteAccount = {
  id: "group-key-account",
  site_name: "Example account",
  site_url: "https://example.com",
  site_type: SITE_TYPES.NEW_API,
  health: { status: SiteHealthStatus.Healthy },
  exchange_rate: 7,
  account_info: {
    id: "1",
    username: "tester",
    access_token: "test-access-token",
    quota: 0,
    today_prompt_tokens: 0,
    today_completion_tokens: 0,
    today_quota_consumption: 0,
    today_requests_count: 0,
    today_income: 0,
  },
  last_sync_time: 0,
  updated_at: 0,
  user_updated_at: 0,
  created_at: 0,
  notes: "",
  tagIds: [],
  disabled: false,
  excludeFromTotalBalance: false,
  excludeFromTodayIncome: false,
  authType: AuthTypeEnum.AccessToken,
  checkIn: buildCheckInConfig(),
}

const refFor = (group: string) => ({
  accountId: account.id,
  siteType: SITE_TYPES.NEW_API,
  scopeKey: "account",
  resourceId: group,
})

/** A native adapter seam with observable remote inventory and write attempts. */
function installNativeInventory() {
  const snapshot: AccountKeyProvisioningSnapshot = {
    requirements: ["alpha", "beta", "gamma"].map((group) => ({
      requirementKey: `opaque:${group}`,
      displayName: group,
      provisioning: { kind: "automatic" },
    })),
    items: [
      {
        ref: refFor("alpha"),
        displayName: "My existing key",
        coverage: "usable",
        placement: { kind: "requirement", requirementKeys: ["opaque:alpha"] },
        renameSuggestion: { targetDisplayName: "Suggested rename" },
      },
    ],
  }
  const items = [...snapshot.items]
  const writes: string[] = []
  const rejected = new Set<string>()
  const uncertain = new Set<string>()
  const rename = vi.fn()
  const session: AccountKeyResourceSession = {
    resolveDefaultScope: vi.fn(),
    listScopes: vi.fn(),
    openCollection: vi.fn(),
    openCreateEditor: vi.fn(),
    provisioning: {
      inspect: vi.fn(async () => ({ ...snapshot, items })),
      provision: async (requirementKey) => {
        writes.push(requirementKey)
        if (rejected.has(requirementKey)) {
          return {
            certainty: "not-applied",
            failure: {
              code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.UpstreamRejected,
            },
          }
        }
        const ref = refFor(requirementKey)
        items.push({
          ref,
          coverage: "usable",
          placement: { kind: "requirement", requirementKeys: [requirementKey] },
        })
        if (uncertain.has(requirementKey)) {
          return {
            certainty: "possibly-applied",
            failure: {
              code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.MutationStateUncertain,
            },
          }
        }
        return { certainty: "applied", value: { ref } }
      },
      rename,
    },
  }
  const open = vi.fn(async () => session)
  vi.mocked(getSiteTypeCapabilities).mockReturnValue({
    siteType: SITE_TYPES.NEW_API,
    account: { keyResources: { open } },
  })
  return { snapshot, items, writes, rejected, uncertain, rename, session, open }
}

const run = () =>
  autoProvisionKeyOnAccountAdd(
    account.id,
    true,
    ACCOUNT_KEY_AUTO_PROVISION_MODES.AllGroups,
  )

describe("automatic provisioning for all groups", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(accountQueries.getAccountById).mockResolvedValue(account)
  })

  it("fills only missing groups and keeps existing names on repeated runs", async () => {
    const remote = installNativeInventory()

    await run()
    await run()

    expect(remote.writes).toEqual(["opaque:beta", "opaque:gamma"])
    expect(remote.items).toHaveLength(3)
    expect(remote.items[0]?.displayName).toBe("My existing key")
    expect(remote.rename).not.toHaveBeenCalled()
    expect(toast.success).toHaveBeenLastCalledWith(
      "messages:accountOperations.autoProvisionGroupsCovered",
    )
  })

  it("does not create from incomplete inventory or claim that every group is covered", async () => {
    const remote = installNativeInventory()
    vi.mocked(remote.session.provisioning!.inspect).mockResolvedValue({
      ...remote.snapshot,
      partialFailure: {
        code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.UpstreamRejected,
      },
    })

    await run()

    expect(remote.writes).toEqual([])
    expect(showWarningToast).toHaveBeenCalledWith(
      "messages:accountOperations.autoProvisionGroupsIncomplete",
    )
    expect(toast.success).not.toHaveBeenCalled()
  })

  it("reports incomplete group discovery instead of claiming no groups are available", async () => {
    const remote = installNativeInventory()
    vi.mocked(remote.session.provisioning!.inspect).mockResolvedValue({
      requirements: [],
      items: [],
      partialFailure: {
        code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.UpstreamRejected,
      },
    })

    await run()

    expect(remote.writes).toEqual([])
    expect(showWarningToast).toHaveBeenCalledWith(
      "messages:accountOperations.autoProvisionGroupsIncomplete",
    )
    expect(toast.success).not.toHaveBeenCalled()
  })

  it("continues after a rejected group and reports incomplete coverage", async () => {
    const remote = installNativeInventory()
    remote.rejected.add("opaque:beta")

    await run()

    expect(
      remote.items.some((item) => item.ref.resourceId === "opaque:gamma"),
    ).toBe(true)
    expect(
      remote.items.some((item) => item.ref.resourceId === "opaque:beta"),
    ).toBe(false)
    expect(showWarningToast).toHaveBeenCalledWith(
      "messages:accountOperations.autoProvisionGroupsIncomplete",
    )
    expect(toast.success).not.toHaveBeenCalled()
  })

  it("rechecks inventory without replaying a create whose response was lost", async () => {
    const remote = installNativeInventory()
    remote.uncertain.add("opaque:beta")

    await run()

    expect(remote.writes).toEqual(["opaque:beta", "opaque:gamma"])
    expect(remote.items).toHaveLength(3)
    expect(toast.success).toHaveBeenCalledWith(
      "messages:accountOperations.autoProvisionGroupsCreated",
    )
  })

  it("explains an empty group inventory without inventing a default group", async () => {
    const remote = installNativeInventory()
    vi.mocked(remote.session.provisioning!.inspect).mockResolvedValue({
      requirements: [],
      items: [],
    })

    await run()

    expect(remote.writes).toEqual([])
    expect(showWarningToast).toHaveBeenCalledWith(
      "messages:accountOperations.autoProvisionGroupsUnavailable",
    )
    expect(toast.success).not.toHaveBeenCalled()
  })

  it.each(["missing-registration", "missing-provisioning"])(
    "explains %s instead of falling back to default-key creation",
    async (missing) => {
      const remote = installNativeInventory()
      if (missing === "missing-registration") {
        vi.mocked(getSiteTypeCapabilities).mockReturnValue({
          siteType: SITE_TYPES.NEW_API,
        })
      } else {
        remote.open.mockResolvedValue({
          ...remote.session,
          provisioning: undefined,
        })
      }

      await run()

      expect(remote.writes).toEqual([])
      expect(showWarningToast).toHaveBeenCalledWith(
        "messages:accountOperations.autoProvisionGroupsUnsupported",
      )
    },
  )

  it.each([{ disabled: true }, { authType: AuthTypeEnum.None }])(
    "skips accounts excluded from automatic actions: %j",
    async (overrides) => {
      const remote = installNativeInventory()
      vi.mocked(accountQueries.getAccountById).mockResolvedValue({
        ...account,
        ...overrides,
      })

      await run()

      expect(remote.open).not.toHaveBeenCalled()
      expect(showWarningToast).not.toHaveBeenCalled()
    },
  )

  it("keeps provisioning best-effort when group discovery fails", async () => {
    const remote = installNativeInventory()
    remote.open.mockRejectedValue(new Error("group discovery failed"))

    await expect(run()).resolves.toBeUndefined()

    expect(remote.writes).toEqual([])
    expect(toast.error).toHaveBeenCalledWith(
      "messages:accountOperations.autoProvisionFailed",
    )
  })
})
