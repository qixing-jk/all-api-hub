import type { TFunction } from "i18next"

import { UNSPECIFIED_PRICING_OPTION } from "~/features/ModelList/pricing/pricingScenarioFields"
import {
  PRICING_DOCUMENT_ANNOTATIONS,
  PRICING_IMAGE_SIZES,
  PRICING_RANGE_AXES,
  PRICING_RESPONSE_FORMATS,
  PRICING_SEARCH_CONTEXTS,
  PRICING_SERVICE_TIERS,
  PRICING_VIDEO_AUDIO_MODES,
  PRICING_VIDEO_DYNAMIC_RANGES,
  PRICING_VIDEO_INPUTS,
} from "~/services/modelPricing/pricingConstants"
import type {
  PriceMeter,
  PricingPlan,
} from "~/services/modelPricing/pricingPlan"

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
      documentAnnotation: t("scenario.documentAnnotation"),
      generationMode: t("scenario.generationMode"),
      videoDynamicRange: t("scenario.videoDynamicRange"),
      searchContext: t("scenario.searchContext"),
      pages: t("scenario.pages"),
      outputMegapixels: t("scenario.outputMegapixels"),
      videoQuality: t("scenario.videoQuality"),
      videoAudio: t("scenario.videoAudio"),
      videoMode: t("scenario.videoMode"),
      image: t("scenario.outputImages"),
      videoSeconds: t("scenario.videoSeconds"),
      referenceImage: t("scenario.referenceImages"),
      outputImage: t("scenario.outputImage"),
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
      { value: PRICING_IMAGE_SIZES.K1_5, label: "1.5K" },
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
    documentAnnotation: [
      { value: UNSPECIFIED_PRICING_OPTION, label: t("scenario.unspecified") },
      {
        value: PRICING_DOCUMENT_ANNOTATIONS.PLAIN,
        label: t("scenario.plainDocument"),
      },
      {
        value: PRICING_DOCUMENT_ANNOTATIONS.ANNOTATED,
        label: t("scenario.annotatedDocument"),
      },
    ],
    generationMode: [
      { value: UNSPECIFIED_PRICING_OPTION, label: t("scenario.unspecified") },
    ],
    videoDynamicRange: [
      { value: UNSPECIFIED_PRICING_OPTION, label: t("scenario.unspecified") },
      { value: PRICING_VIDEO_DYNAMIC_RANGES.HDR, label: "HDR" },
      { value: PRICING_VIDEO_DYNAMIC_RANGES.SDR, label: "SDR" },
    ],
    searchContext: [
      { value: UNSPECIFIED_PRICING_OPTION, label: t("scenario.unspecified") },
      {
        value: PRICING_SEARCH_CONTEXTS.LOW,
        label: t("scenario.searchContextLow"),
      },
      {
        value: PRICING_SEARCH_CONTEXTS.MEDIUM,
        label: t("scenario.searchContextMedium"),
      },
      {
        value: PRICING_SEARCH_CONTEXTS.HIGH,
        label: t("scenario.searchContextHigh"),
      },
    ],
    videoQuality: [
      { value: UNSPECIFIED_PRICING_OPTION, label: t("scenario.unspecified") },
    ],
    videoMode: [
      { value: UNSPECIFIED_PRICING_OPTION, label: t("scenario.unspecified") },
    ],
    videoAudio: [
      { value: UNSPECIFIED_PRICING_OPTION, label: t("scenario.unspecified") },
      {
        value: PRICING_VIDEO_AUDIO_MODES.WITHOUT_AUDIO,
        label: t("scenario.withoutAudio"),
      },
      {
        value: PRICING_VIDEO_AUDIO_MODES.WITH_AUDIO,
        label: t("scenario.withAudio"),
      },
    ],
  }
}

/** Shared labels for priced meters in quote summaries and recovery details. */
export function pricingMeterLabels(
  t: TFunction<"modelList">,
): Record<PriceMeter, string> {
  return {
    pages: t("scenario.pages"),
    codeExecution: t("scenario.codeExecution"),
    videoInputTokens: t("scenario.videoInputTokens"),
    imageCache: t("scenario.imageCache"),
    outputMegapixels: t("scenario.outputMegapixels"),
    characters: t("scenario.characters"),
    videoSeconds: t("scenario.videoOutput"),
    referenceImage: t("scenario.referenceImages"),
    searchUnits: t("scenario.searchUnits"),
    videoOutput: t("scenario.videoOutput"),
    input: t("scenario.meters.input"),
    output: t("scenario.meters.output"),
    cacheRead: t("scenario.meters.cacheRead"),
    cacheWrite: t("scenario.meters.cacheWrite"),
    cacheWrite1h: t("scenario.cacheWrite1h"),
    request: t("scenario.meters.request"),
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

/** Labels rate units consistently in published schedules and quote calculations. */
export function pricingRateUnitLabels(t: TFunction<"modelList">) {
  return {
    page: t("scenario.page"),
    megapixel: t("scenario.megapixel"),
    token: t("scenario.perMillionTokens"),
    request: t("scenario.requestUnit"),
    image: t("scenario.image"),
    second: t("scenario.second"),
    character: t("scenario.character"),
    search: t("scenario.search"),
    "search-unit": t("scenario.searchUnit"),
  }
}
