import { expect, it, vi } from "vitest"

import { autoDetectAccount } from "~/services/accounts/accountAutoDetection"
import { autoDetectSmart } from "~/services/siteDetection/autoDetectService"
import { AuthTypeEnum } from "~/types"

vi.mock("~/services/siteDetection/autoDetectService", () => ({
  autoDetectSmart: vi.fn(),
}))

it("keeps an empty explicit Novita API-key setup independent of browser discovery", async () => {
  const calls = vi.mocked(autoDetectSmart).mock.calls.length
  const result = await autoDetectAccount(
    "https://novita.ai",
    AuthTypeEnum.AccessToken,
    undefined,
    undefined,
    {
      existingAccount: {
        url: "https://novita.ai",
        siteType: "novita",
        userId: "123",
        accessToken: "",
        novitaCredentialMode: "api-key",
      },
    },
  )
  expect(result).toMatchObject({
    success: false,
    message: "messages:novita.apiKeyRequired",
  })
  expect(vi.mocked(autoDetectSmart).mock.calls).toHaveLength(calls)
})

it("retains Novita manual guidance when browser discovery fails", async () => {
  vi.mocked(autoDetectSmart).mockRejectedValueOnce(
    new Error("browser unavailable"),
  )
  const result = await autoDetectAccount(
    "https://novita.ai",
    AuthTypeEnum.AccessToken,
  )
  expect(result).toMatchObject({
    success: false,
    message: "messages:novita.apiKeyRequired",
    recoveryData: { siteType: "novita" },
  })
})

it.each([
  undefined,
  {
    success: true,
    data: { siteType: "novita", userId: "", user: { username: "" } },
  },
])(
  "retains manual setup when no verified console identity is available %#",
  async (discovered) => {
    vi.mocked(autoDetectSmart).mockResolvedValueOnce(discovered as never)
    const result = await autoDetectAccount(
      "https://novita.ai",
      AuthTypeEnum.AccessToken,
    )
    expect(result).toMatchObject({
      success: false,
      message: "messages:novita.apiKeyRequired",
    })
  },
)
