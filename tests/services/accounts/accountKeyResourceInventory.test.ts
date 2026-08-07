import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { fetchDisplayAccountKeyResourceInventory } from "~/services/accounts/accountKeyResourceInventory"
import { AuthTypeEnum } from "~/types"

const { createDisplayAccountApiContextMock } = vi.hoisted(() => ({
  createDisplayAccountApiContextMock: vi.fn(),
}))

vi.mock("~/services/accounts/utils/apiServiceRequest", () => ({
  createDisplayAccountApiContext: (...args: unknown[]) =>
    createDisplayAccountApiContextMock(...args),
}))

describe("fetchDisplayAccountKeyResourceInventory", () => {
  beforeEach(() => {
    createDisplayAccountApiContextMock.mockReset()
  })

  it("rejects accounts without a native key-resource capability", async () => {
    createDisplayAccountApiContextMock.mockReturnValue({
      request: {},
      accountKeyResources: undefined,
    })

    await expect(
      fetchDisplayAccountKeyResourceInventory({
        id: "account-example",
        name: "Example account",
        siteType: SITE_TYPES.NEW_API,
        baseUrl: "https://example.invalid",
        authType: AuthTypeEnum.AccessToken,
        userId: "user-example",
        token: "token-example",
      }),
    ).rejects.toThrow("Account key resource inventory is not supported")
  })
})
