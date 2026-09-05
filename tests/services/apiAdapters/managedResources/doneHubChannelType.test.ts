import { describe, expect, it } from "vitest"

import { DoneHubChannelType } from "~/constants/doneHub"
import { ChannelType } from "~/constants/newApi"
import {
  mapChannelTypeToDoneHubChannelTypeStrict,
  mapDoneHubChannelTypeToChannelTypeStrict,
} from "~/services/apiAdapters/managedResources/doneHubChannelType"

describe("DoneHub native channel type mapping", () => {
  it.each([
    [DoneHubChannelType.OpenAI, ChannelType.OpenAI],
    [DoneHubChannelType.Gemini, ChannelType.Gemini],
    [DoneHubChannelType.Moonshot, ChannelType.Moonshot],
    [DoneHubChannelType.DeepSeek, ChannelType.DeepSeek],
    [DoneHubChannelType.Coze, ChannelType.Coze],
    [DoneHubChannelType.Codex, ChannelType.Codex],
  ])("maps DoneHub type %s to canonical type %s", (doneHub, canonical) => {
    expect(mapDoneHubChannelTypeToChannelTypeStrict(doneHub)).toEqual({
      status: "mapped",
      value: canonical,
    })
    expect(mapChannelTypeToDoneHubChannelTypeStrict(canonical)).toEqual({
      status: "mapped",
      value: doneHub,
    })
  })

  it.each([
    DoneHubChannelType.AzureSpeech,
    DoneHubChannelType.GitHubModels,
    DoneHubChannelType.GeminiCli,
    DoneHubChannelType.ClaudeCode,
    DoneHubChannelType.Antigravity,
  ])("blocks DoneHub-only type %s", (type) => {
    expect(mapDoneHubChannelTypeToChannelTypeStrict(type)).toEqual({
      status: "unsupported",
    })
  })

  it("does not reinterpret DoneHub GitHub Models as canonical Coze", () => {
    expect(DoneHubChannelType.GitHubModels).toBe(ChannelType.Coze)
    expect(
      mapDoneHubChannelTypeToChannelTypeStrict(DoneHubChannelType.GitHubModels),
    ).toEqual({ status: "unsupported" })
    expect(mapChannelTypeToDoneHubChannelTypeStrict(ChannelType.Coze)).toEqual({
      status: "mapped",
      value: DoneHubChannelType.Coze,
    })
  })

  it.each([undefined, null, "", "future", 999])(
    "blocks unknown type %s",
    (type) => {
      expect(mapDoneHubChannelTypeToChannelTypeStrict(type)).toEqual({
        status: "unsupported",
      })
    },
  )
})
