import { describe, expect, it } from "vitest"

import { ChannelType } from "~/constants/newApi"
import { VeloeraChannelType } from "~/constants/veloera"
import {
  mapChannelTypeToVeloeraChannelTypeStrict,
  mapVeloeraChannelTypeToChannelTypeStrict,
} from "~/services/apiAdapters/managedResources/veloeraChannelType"

describe("Veloera channel migration type mapping", () => {
  it("maps shared channel types without treating Veloera 49 as New API Coze", () => {
    expect(
      mapVeloeraChannelTypeToChannelTypeStrict(VeloeraChannelType.OpenAI),
    ).toEqual({ status: "mapped", value: ChannelType.OpenAI })
    expect(
      mapVeloeraChannelTypeToChannelTypeStrict(VeloeraChannelType.GitHubModels),
    ).toEqual({ status: "unsupported" })
    expect(mapChannelTypeToVeloeraChannelTypeStrict(ChannelType.Coze)).toEqual({
      status: "unsupported",
    })
  })
})
