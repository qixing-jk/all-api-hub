import { describe, expect, it } from "vitest"

import { WEB_AI_API_CHECK_TARGET_IDS } from "~/features/BasicSettings/components/tabs/WebAiApiCheck/searchTargets"
import {
  webAiApiCheckSearchControls,
  webAiApiCheckSearchSections,
} from "~/features/BasicSettings/components/tabs/WebAiApiCheck/WebAiApiCheck.search"

describe("web AI API check settings search definitions", () => {
  it("registers the Web AI API Check section on the Web AI API Check tab", () => {
    expect(
      webAiApiCheckSearchSections.map((section) => [
        section.id,
        section.tabId,
        section.targetId,
      ]),
    ).toEqual([
      ["section:web-ai-api-check", "webAiApiCheck", "web-ai-api-check"],
    ])
  })

  it("registers all rendered Web AI API Check controls as searchable settings", () => {
    expect(
      webAiApiCheckSearchControls.map((control) => control.targetId),
    ).toEqual([
      WEB_AI_API_CHECK_TARGET_IDS.contextMenu,
      WEB_AI_API_CHECK_TARGET_IDS.autoDetect,
      WEB_AI_API_CHECK_TARGET_IDS.enhancedAutoDetect,
      WEB_AI_API_CHECK_TARGET_IDS.whitelistPatterns,
      WEB_AI_API_CHECK_TARGET_IDS.savePatterns,
      WEB_AI_API_CHECK_TARGET_IDS.keyCleanupPatterns,
      WEB_AI_API_CHECK_TARGET_IDS.saveKeyCleanupPatterns,
    ])
  })
})
