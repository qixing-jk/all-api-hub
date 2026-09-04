import { describe, expect, it } from "vitest"

import { CLAUDE_CODE_HUB_PROVIDER_TYPE } from "~/constants/claudeCodeHub"
import { ChannelType } from "~/constants/managedSite"
import {
  mapChannelTypeToClaudeCodeHubProviderType,
  mapClaudeCodeHubProviderTypeToChannelTypeStrict,
} from "~/services/apiAdapters/managedResources/claudeCodeHubChannelType"

describe("Claude Code Hub channel type mapping", () => {
  it("preserves Codex semantics in both migration directions", () => {
    expect(
      mapClaudeCodeHubProviderTypeToChannelTypeStrict(
        CLAUDE_CODE_HUB_PROVIDER_TYPE.CODEX,
      ),
    ).toEqual({ status: "mapped", value: ChannelType.Codex })
    expect(mapChannelTypeToClaudeCodeHubProviderType(ChannelType.Codex)).toBe(
      CLAUDE_CODE_HUB_PROVIDER_TYPE.CODEX,
    )
  })
})
