import { describe, expect, it } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  applyVerificationResultView,
  MODEL_LIST_VERIFICATION_RESULT_FILTERS,
} from "~/features/ModelList/verificationResultFilters"
import {
  createAccountModelVerificationHistoryTarget,
  serializeVerificationHistoryTarget,
  type ApiVerificationHistorySummary,
} from "~/services/verification/verificationResultHistory"

const account = {
  id: "account-1",
  name: "Account One",
  baseUrl: "https://api.example.invalid",
  siteType: SITE_TYPES.NEW_API,
} as any

function createModelItem(modelName: string) {
  return {
    model: {
      model_name: modelName,
      quota_type: 0,
      model_ratio: 1,
      completion_ratio: 1,
      enable_groups: ["default"],
    },
    calculatedPrice: {},
    source: {
      kind: "account",
      account,
      capabilities: {},
    },
    groupRatios: {},
  } as any
}

function createSummary(
  modelName: string,
  params: { status: "pass" | "fail"; latencies: number[] },
) {
  const target = createAccountModelVerificationHistoryTarget(
    account.id,
    modelName,
  )
  if (!target) {
    throw new Error("Expected account model verification target")
  }

  return {
    target,
    targetKey: serializeVerificationHistoryTarget(target),
    status: params.status,
    verifiedAt: 1,
    apiType: "openai-compatible",
    probes: params.latencies.map((latencyMs, index) => ({
      id: index === 0 ? "text-generation" : "models",
      status: params.status,
      latencyMs,
      summary: "",
    })),
  } as ApiVerificationHistorySummary
}

describe("model list verification result view", () => {
  it("filters rows by selected verification result statuses", () => {
    const passSummary = createSummary("gpt-pass", {
      status: "pass",
      latencies: [120],
    })
    const failSummary = createSummary("gpt-fail", {
      status: "fail",
      latencies: [80],
    })

    const result = applyVerificationResultView(
      [
        createModelItem("gpt-pass"),
        createModelItem("gpt-fail"),
        createModelItem("gpt-unverified"),
      ],
      {
        selectedResults: [
          MODEL_LIST_VERIFICATION_RESULT_FILTERS.PASS,
          MODEL_LIST_VERIFICATION_RESULT_FILTERS.UNVERIFIED,
        ],
        shouldSortByLatency: false,
        verificationSummariesByKey: {
          [passSummary.targetKey]: passSummary,
          [failSummary.targetKey]: failSummary,
        },
      },
    )

    expect(result.map((item) => item.model.model_name)).toEqual([
      "gpt-pass",
      "gpt-unverified",
    ])
  })

  it("sorts verified rows by total latest verification latency", () => {
    const slowSummary = createSummary("gpt-slow", {
      status: "pass",
      latencies: [120, 30],
    })
    const fastSummary = createSummary("gpt-fast", {
      status: "pass",
      latencies: [40],
    })
    const failedSummary = createSummary("gpt-failed", {
      status: "fail",
      latencies: [70],
    })

    const result = applyVerificationResultView(
      [
        createModelItem("gpt-slow"),
        createModelItem("gpt-unverified"),
        createModelItem("gpt-fast"),
        createModelItem("gpt-failed"),
      ],
      {
        selectedResults: [
          MODEL_LIST_VERIFICATION_RESULT_FILTERS.PASS,
          MODEL_LIST_VERIFICATION_RESULT_FILTERS.FAIL,
          MODEL_LIST_VERIFICATION_RESULT_FILTERS.UNVERIFIED,
        ],
        shouldSortByLatency: true,
        verificationSummariesByKey: {
          [slowSummary.targetKey]: slowSummary,
          [fastSummary.targetKey]: fastSummary,
          [failedSummary.targetKey]: failedSummary,
        },
      },
    )

    expect(result.map((item) => item.model.model_name)).toEqual([
      "gpt-fast",
      "gpt-failed",
      "gpt-slow",
      "gpt-unverified",
    ])
  })
})
