import { beforeEach, describe, expect, it, vi } from "vitest"

import { prepareAccountKeyProvisioning } from "~/services/accounts/accountKeyProvisioning"
import { canCreateAccountKeyResources } from "~/services/accounts/keyProductCapabilities"
import { AuthTypeEnum } from "~/types"
import { buildDisplaySiteData } from "~~/tests/test-utils/factories"

const { fetchKeys, createKey } = vi.hoisted(() => ({
  fetchKeys: vi.fn(),
  createKey: vi.fn(),
}))
vi.mock("~/services/apiService/freemodel", async (original) => ({
  ...(await original<typeof import("~/services/apiService/freemodel")>()),
  fetchKeys,
  createKey,
}))

describe("FreeModel foreground provisioning", () => {
  it("enables key creation for browser-cookie accounts without saved credentials", () => {
    expect(canCreateAccountKeyResources(account("freemodel-ready"))).toBe(true)
  })
  beforeEach(() => vi.clearAllMocks())
  const key = { id: 12, name: "Example", suffix: "abcd" }
  const account = (id: string) =>
    buildDisplaySiteData({
      id,
      siteType: "freemodel",
      baseUrl: "https://freemodel.dev",
      authType: AuthTypeEnum.Cookie,
      token: "",
      userId: "7",
    })

  it.each(["default", "all-groups"] as const)(
    "creates one key with a one-time secret in %s mode",
    async (mode) => {
      fetchKeys.mockResolvedValue([])
      createKey.mockResolvedValue({ key, secret: "fe_oa_preview_only_secret" })
      const plan = await prepareAccountKeyProvisioning(
        account(`freemodel-${mode}`),
        mode,
      )
      expect(plan.entries).toHaveLength(1)
      expect(plan.entries[0]?.editor).toBeUndefined()
      expect(createKey).not.toHaveBeenCalled()
      const result = await plan.entries[0]!.create()
      expect(createKey).toHaveBeenCalledWith(
        expect.objectContaining({
          auth: expect.objectContaining({ authType: AuthTypeEnum.Cookie }),
        }),
        "default key (auto)",
      )
      expect(result.createdSecret).toMatchObject({
        secret: "fe_oa_preview_only_secret",
      })
      expect(result.ref?.siteType).toBe("freemodel")
      await plan.entries[0]!.create()
      expect(createKey).toHaveBeenCalledOnce()
    },
  )

  it.each(["default", "all-groups"] as const)(
    "skips existing masked keys in %s mode",
    async (mode) => {
      fetchKeys.mockResolvedValue([key])
      const plan = await prepareAccountKeyProvisioning(
        account(`freemodel-covered-${mode}`),
        mode,
      )
      expect(plan).toEqual({ coveredCount: 1, entries: [] })
      expect(createKey).not.toHaveBeenCalled()
    },
  )
})
