import { describe, expect, it, vi } from "vitest"

import { sharedChatModelCatalog } from "~/services/apiAdapters/sharedchat/modelCatalog"
import { AuthTypeEnum } from "~/types"

const { fetchCodexServiceModelsMock } = vi.hoisted(() => ({
  fetchCodexServiceModelsMock: vi.fn(),
}))

vi.mock("~/services/apiService/sharedchat", () => ({
  fetchCodexServiceModels: fetchCodexServiceModelsMock,
}))

describe("sharedChatModelCatalog", () => {
  it("normalizes discovered model ids into descriptors", async () => {
    fetchCodexServiceModelsMock.mockResolvedValueOnce([
      " example-model-a ",
      "example-model-a",
    ])

    const request = {
      baseUrl: "https://sharedchat.example.invalid",
      accountId: "account-1",
      auth: {
        authType: AuthTypeEnum.AccessToken,
        apiKey: "runtime-key",
      },
    }

    await expect(sharedChatModelCatalog.fetchModels(request)).resolves.toEqual([
      { id: "example-model-a" },
    ])
    expect(fetchCodexServiceModelsMock).toHaveBeenCalledWith(request)
  })
})
