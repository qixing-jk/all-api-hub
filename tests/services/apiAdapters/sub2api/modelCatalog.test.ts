import { describe, expect, it, vi } from "vitest"

import { sub2ApiModelCatalog } from "~/services/apiAdapters/sub2api/modelCatalog"
import { AuthTypeEnum } from "~/types"

const { fetchSub2ApiRuntimeModelsMock } = vi.hoisted(() => ({
  fetchSub2ApiRuntimeModelsMock: vi.fn(),
}))

vi.mock("~/services/apiService/sub2api", () => ({
  fetchSub2ApiRuntimeModels: fetchSub2ApiRuntimeModelsMock,
}))

describe("sub2ApiModelCatalog", () => {
  it("delegates runtime model discovery to the existing Sub2API helper", async () => {
    fetchSub2ApiRuntimeModelsMock.mockResolvedValueOnce([
      "example-model-a",
      "example-model-b",
    ])

    const request = {
      baseUrl: "https://sub2.example.com",
      accountId: "account-1",
      auth: {
        authType: AuthTypeEnum.AccessToken,
        apiKey: "runtime-key",
      },
    }

    await expect(sub2ApiModelCatalog.fetchModels(request)).resolves.toEqual([
      { id: "example-model-a" },
      { id: "example-model-b" },
    ])
    expect(fetchSub2ApiRuntimeModelsMock).toHaveBeenCalledWith(request)
  })
})
