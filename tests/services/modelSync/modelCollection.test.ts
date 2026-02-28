import { describe, expect, it } from "vitest"

import { collectModelsFromExecution } from "~/services/models/modelSync/modelCollection"
import type { ExecutionResult } from "~/types/managedSiteModelSync"

describe("collectModelsFromExecution", () => {
  const baseResult = (items: ExecutionResult["items"]): ExecutionResult => ({
    items,
    statistics: {
      total: items.length,
      successCount: items.filter((item) => item.ok).length,
      failureCount: items.filter((item) => !item.ok).length,
      durationMs: 0,
      startedAt: 0,
      endedAt: 0,
    },
  })

  it("collects sorted unique models from successful runs", () => {
    const result = baseResult([
      {
        channelId: 1,
        channelName: "Channel A",
        ok: true,
        attempts: 1,
        finishedAt: 0,
        newModels: ["gpt-4o", "claude-3"],
        oldModels: [],
      },
      {
        channelId: 2,
        channelName: "Channel B",
        ok: true,
        attempts: 1,
        finishedAt: 0,
        newModels: ["claude-3", "gpt-4o"],
        oldModels: [],
      },
    ])

    expect(collectModelsFromExecution(result)).toEqual(["claude-3", "gpt-4o"])
  })

  it("falls back to old models when newModels missing", () => {
    const result = baseResult([
      {
        channelId: 3,
        channelName: "Channel C",
        ok: false,
        attempts: 2,
        finishedAt: 0,
        message: "Failed",
        oldModels: ["gpt-4o-mini", "   claude-3   "],
      },
    ])

    expect(collectModelsFromExecution(result)).toEqual([
      "claude-3",
      "gpt-4o-mini",
    ])
  })

  it("returns empty array when no items", () => {
    expect(collectModelsFromExecution(null)).toEqual([])
    expect(collectModelsFromExecution(baseResult([]))).toEqual([])
  })
})
