import { describe, expect, it } from "vitest"

import { AXON_HUB_CHANNEL_TYPE } from "~/constants/axonHub"
import { ChannelType } from "~/constants/managedSite"
import {
  mapAxonHubChannelTypeToChannelType,
  mapChannelTypeToAxonHubChannelType,
} from "~/services/apiAdapters/managedResources/axonHubChannelType"

describe("axonHubChannelType", () => {
  it.each([
    [AXON_HUB_CHANNEL_TYPE.OPENAI, ChannelType.OpenAI],
    [AXON_HUB_CHANNEL_TYPE.OPENAI_RESPONSES, ChannelType.OpenAI],
    [AXON_HUB_CHANNEL_TYPE.ANTHROPIC, ChannelType.Anthropic],
    [AXON_HUB_CHANNEL_TYPE.ANTHROPIC_AWS, ChannelType.Anthropic],
    [AXON_HUB_CHANNEL_TYPE.ANTHROPIC_GCP, ChannelType.Anthropic],
    [AXON_HUB_CHANNEL_TYPE.CLAUDECODE, ChannelType.Anthropic],
    [AXON_HUB_CHANNEL_TYPE.GEMINI_OPENAI, ChannelType.Gemini],
    [AXON_HUB_CHANNEL_TYPE.GEMINI, ChannelType.Gemini],
    [AXON_HUB_CHANNEL_TYPE.GEMINI_VERTEX, ChannelType.Gemini],
    [AXON_HUB_CHANNEL_TYPE.DEEPSEEK, ChannelType.DeepSeek],
    [AXON_HUB_CHANNEL_TYPE.DEEPSEEK_ANTHROPIC, ChannelType.DeepSeek],
    [AXON_HUB_CHANNEL_TYPE.OPENROUTER, ChannelType.OpenRouter],
    [AXON_HUB_CHANNEL_TYPE.XAI, ChannelType.Xai],
    [AXON_HUB_CHANNEL_TYPE.SILICONFLOW, ChannelType.SiliconFlow],
    [AXON_HUB_CHANNEL_TYPE.VOLCENGINE, ChannelType.VolcEngine],
    [AXON_HUB_CHANNEL_TYPE.OLLAMA, ChannelType.Ollama],
    [AXON_HUB_CHANNEL_TYPE.GITHUB_COPILOT, ChannelType.OpenAI],
    [AXON_HUB_CHANNEL_TYPE.NANOGPT, ChannelType.OpenAI],
  ] as const)("maps AxonHub %s to shared type %s", (source, expected) => {
    expect(mapAxonHubChannelTypeToChannelType(source)).toBe(expected)
  })

  it.each([
    [ChannelType.OpenAI, AXON_HUB_CHANNEL_TYPE.OPENAI],
    [ChannelType.Anthropic, AXON_HUB_CHANNEL_TYPE.ANTHROPIC],
    [ChannelType.OpenRouter, AXON_HUB_CHANNEL_TYPE.OPENROUTER],
    [ChannelType.Gemini, AXON_HUB_CHANNEL_TYPE.GEMINI],
    [ChannelType.VertexAi, AXON_HUB_CHANNEL_TYPE.GEMINI],
    [ChannelType.SiliconFlow, AXON_HUB_CHANNEL_TYPE.SILICONFLOW],
    [ChannelType.DeepSeek, AXON_HUB_CHANNEL_TYPE.DEEPSEEK],
    [ChannelType.VolcEngine, AXON_HUB_CHANNEL_TYPE.VOLCENGINE],
    [ChannelType.Xai, AXON_HUB_CHANNEL_TYPE.XAI],
    [ChannelType.Ollama, AXON_HUB_CHANNEL_TYPE.OLLAMA],
  ] as const)("maps shared type %s to AxonHub %s", (source, expected) => {
    expect(mapChannelTypeToAxonHubChannelType(source)).toBe(expected)
  })

  it("uses OpenAI compatibility for unknown or unsupported types", () => {
    expect(mapAxonHubChannelTypeToChannelType("future-provider")).toBe(
      ChannelType.OpenAI,
    )
    expect(mapChannelTypeToAxonHubChannelType(ChannelType.Midjourney)).toBe(
      AXON_HUB_CHANNEL_TYPE.OPENAI,
    )
  })
})
