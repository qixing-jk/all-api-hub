import type { TFunction } from "i18next"

import {
  PRICING_IMAGE_SIZES,
  PRICING_RANGE_AXES,
  PRICING_RESPONSE_FORMATS,
  PRICING_SERVICE_TIERS,
  PRICING_VIDEO_INPUTS,
} from "~/services/modelPricing/pricingConstants"
import type {
  PriceMeter,
  PricingPlan,
} from "~/services/modelPricing/pricingPlan"

import { UNSPECIFIED_PRICING_OPTION } from "./pricingScenarioFields"

/** Names the token basis consistently in compact and expanded pricing rules. */
export function pricingRangeLabel(
  t: TFunction<"modelList">,
  condition: Extract<
    PricingPlan["rules"][number]["conditions"][number],
    { kind: "range" }
  >,
): string {
  if (condition.outputTokenDeductions) return t("scenario.netOutput")
  if (condition.inputTokenDeductions) return t("scenario.netInput")
  if (condition.axis === PRICING_RANGE_AXES.OUTPUT_TOKENS)
    return t("scenario.output")
  if (condition.axis === PRICING_RANGE_AXES.TOTAL_TOKENS)
    return t("scenario.totalTokens")
  return t("scenario.input")
}

/** Shared labels for scenario selectors and the matching price schedule. */
export function pricingScenarioOptions(t: TFunction<"modelList">) {
  return {
    labels: {
      serviceTier: t("scenario.serviceTier"),
      responseFormat: t("scenario.responseFormat"),
      imageSize: t("scenario.imageSize"),
      videoInput: t("scenario.videoInput"),
      imageQuality: t("scenario.imageQuality"),
      pages: t("scenario.pages"),
      outputMegapixels: t("scenario.outputMegapixels"),
      videoQuality: t("scenario.videoQuality"),
      image: t("scenario.outputImages"),
      videoSeconds: t("scenario.videoSeconds"),
      referenceImage: t("scenario.referenceImages"),
      characters: t("scenario.characters"),
      searchUnits: t("scenario.searchUnits"),
      imageMegapixels: t("scenario.imageMegapixels"),
    },
    calendarLabels: {
      hour: t("scenario.hour"),
      minute: t("scenario.minute"),
      weekday: t("scenario.weekday"),
      month: t("scenario.month"),
      day: t("scenario.day"),
    },
    serviceTier: [
      { value: PRICING_SERVICE_TIERS.STANDARD, label: t("scenario.standard") },
      { value: PRICING_SERVICE_TIERS.FLEX, label: "Flex" },
      { value: PRICING_SERVICE_TIERS.PRIORITY, label: t("scenario.priority") },
      { value: PRICING_SERVICE_TIERS.FAST, label: "Fast" },
      { value: PRICING_SERVICE_TIERS.ULTRAFAST, label: "Ultrafast" },
      { value: PRICING_SERVICE_TIERS.BATCH, label: t("scenario.batch") },
    ],
    responseFormat: [
      { value: UNSPECIFIED_PRICING_OPTION, label: t("scenario.unspecified") },
      { value: PRICING_RESPONSE_FORMATS.OPENAI, label: "OpenAI" },
      { value: PRICING_RESPONSE_FORMATS.ANTHROPIC, label: "Anthropic" },
    ],
    imageSize: [
      { value: UNSPECIFIED_PRICING_OPTION, label: t("scenario.unspecified") },
      { value: PRICING_IMAGE_SIZES.K1, label: "1K" },
      { value: PRICING_IMAGE_SIZES.K2, label: "2K" },
      { value: PRICING_IMAGE_SIZES.K3, label: "3K" },
      { value: PRICING_IMAGE_SIZES.K4, label: "4K" },
    ],
    videoInput: [
      { value: UNSPECIFIED_PRICING_OPTION, label: t("scenario.unspecified") },
      {
        value: PRICING_VIDEO_INPUTS.WITHOUT_VIDEO,
        label: t("scenario.withoutVideo"),
      },
      {
        value: PRICING_VIDEO_INPUTS.WITH_VIDEO,
        label: t("scenario.withVideo"),
      },
    ],
    imageQuality: [
      { value: UNSPECIFIED_PRICING_OPTION, label: t("scenario.unspecified") },
    ],
    videoQuality: [
      { value: UNSPECIFIED_PRICING_OPTION, label: t("scenario.unspecified") },
    ],
  }
}

/** Shared labels for priced meters in quote summaries and recovery details. */
export function pricingMeterLabels(
  t: TFunction<"modelList">,
): Record<PriceMeter, string> {
  return {
    pages: t("scenario.pages"),
    outputMegapixels: t("scenario.outputMegapixels"),
    characters: t("scenario.characters"),
    videoSeconds: t("scenario.videoSeconds"),
    referenceImage: t("scenario.referenceImages"),
    searchUnits: t("scenario.searchUnits"),
    videoOutput: t("scenario.videoOutput"),
    input: t("scenario.meters.input"),
    output: t("scenario.meters.output"),
    cacheRead: t("scenario.meters.cacheRead"),
    cacheWrite: t("scenario.meters.cacheWrite"),
    cacheWrite1h: t("scenario.cacheWrite1h"),
    request: t("perCall"),
    image: t("scenario.image"),
    audio: t("scenario.audio"),
    search: t("scenario.search"),
    imageInput: t("scenario.imageInput"),
    imageOutput: t("scenario.imageOutput"),
    audioInput: t("scenario.audioInput"),
    audioOutput: t("scenario.audioOutput"),
    audioCache: t("scenario.audioCache"),
    outputImage: t("scenario.outputImage"),
  }
}
