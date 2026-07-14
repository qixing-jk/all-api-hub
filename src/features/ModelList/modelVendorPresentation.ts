import { CpuChipIcon } from "@heroicons/react/24/outline"
import {
  Alibaba,
  Anthropic,
  Baichuan,
  Baidu,
  ByteDance,
  Cohere,
  DeepSeek,
  Google,
  Meta,
  Minimax,
  Mistral,
  Moonshot,
  Nvidia,
  OpenAI,
  Perplexity,
  Stepfun,
  Tencent,
  XAI,
  Yi,
  Zhipu,
} from "@lobehub/icons"
import type { ComponentType } from "react"

import { COLORS } from "~/constants/designTokens"
import type {
  ModelVendorCatalogEntry,
  ResolvedModelVendor,
} from "~/services/models/modelMetadata/types"
import type { KnownModelVendorId } from "~/services/models/modelVendor"

interface ModelVendorIconProps {
  className?: string
  "aria-hidden"?: boolean
}

interface ModelVendorPresentation {
  Icon: ComponentType<ModelVendorIconProps>
  iconClassName: string
  containerClassName: string
}

const GENERIC_VENDOR_PRESENTATION: ModelVendorPresentation = {
  Icon: CpuChipIcon,
  iconClassName: COLORS.text.secondary,
  containerClassName: COLORS.background.secondary,
}

const KNOWN_VENDOR_PRESENTATION = {
  openai: {
    Icon: OpenAI,
    iconClassName: "text-green-600 dark:text-green-400",
    containerClassName: "bg-green-50 dark:bg-green-900/20",
  },
  anthropic: {
    Icon: Anthropic,
    iconClassName: "text-orange-600 dark:text-orange-400",
    containerClassName: "bg-orange-50 dark:bg-orange-900/20",
  },
  google: {
    Icon: Google,
    iconClassName: "text-blue-600 dark:text-blue-300",
    containerClassName: "bg-blue-50 dark:bg-blue-900/20",
  },
  meta: {
    Icon: Meta,
    iconClassName: "text-blue-700 dark:text-blue-300",
    containerClassName: "bg-blue-50 dark:bg-blue-900/20",
  },
  alibaba: {
    Icon: Alibaba,
    iconClassName: "text-orange-600 dark:text-orange-400",
    containerClassName: "bg-orange-50 dark:bg-orange-900/20",
  },
  xai: {
    Icon: XAI,
    iconClassName: COLORS.text.primary,
    containerClassName: COLORS.background.secondary,
  },
  deepseek: {
    Icon: DeepSeek,
    iconClassName: "text-cyan-600 dark:text-cyan-300",
    containerClassName: "bg-cyan-50 dark:bg-cyan-900/20",
  },
  mistral: {
    Icon: Mistral,
    iconClassName: "text-orange-500 dark:text-orange-300",
    containerClassName: "bg-orange-50 dark:bg-orange-900/20",
  },
  moonshot: {
    Icon: Moonshot,
    iconClassName: "text-indigo-600 dark:text-indigo-300",
    containerClassName: "bg-indigo-50 dark:bg-indigo-900/20",
  },
  zhipu: {
    Icon: Zhipu,
    iconClassName: "text-blue-700 dark:text-blue-300",
    containerClassName: "bg-blue-50 dark:bg-blue-900/20",
  },
  minimax: {
    Icon: Minimax,
    iconClassName: "text-red-600 dark:text-red-400",
    containerClassName: "bg-red-50 dark:bg-red-900/20",
  },
  cohere: {
    Icon: Cohere,
    iconClassName: "text-purple-500 dark:text-purple-300",
    containerClassName: "bg-purple-50 dark:bg-purple-900/20",
  },
  tencent: {
    Icon: Tencent,
    iconClassName: "text-blue-700 dark:text-blue-300",
    containerClassName: "bg-blue-50 dark:bg-blue-900/20",
  },
  baidu: {
    Icon: Baidu,
    iconClassName: "text-yellow-600 dark:text-yellow-300",
    containerClassName: "bg-yellow-50 dark:bg-yellow-900/20",
  },
  baichuan: {
    Icon: Baichuan,
    iconClassName: "text-yellow-600 dark:text-yellow-300",
    containerClassName: "bg-yellow-50 dark:bg-yellow-900/20",
  },
  "01-ai": {
    Icon: Yi,
    iconClassName: "text-yellow-600 dark:text-yellow-300",
    containerClassName: "bg-yellow-50 dark:bg-yellow-900/20",
  },
  bytedance: {
    Icon: ByteDance,
    iconClassName: COLORS.text.primary,
    containerClassName: COLORS.background.secondary,
  },
  nvidia: {
    Icon: Nvidia,
    iconClassName: "text-green-600 dark:text-green-400",
    containerClassName: "bg-green-50 dark:bg-green-900/20",
  },
  xiaomi: GENERIC_VENDOR_PRESENTATION,
  stepfun: {
    Icon: Stepfun,
    iconClassName: "text-blue-600 dark:text-blue-300",
    containerClassName: "bg-blue-50 dark:bg-blue-900/20",
  },
  perplexity: {
    Icon: Perplexity,
    iconClassName: "text-teal-600 dark:text-teal-300",
    containerClassName: "bg-teal-50 dark:bg-teal-900/20",
  },
} satisfies Record<KnownModelVendorId, ModelVendorPresentation>

type ModelVendorPresentationInput =
  | ResolvedModelVendor
  | ModelVendorCatalogEntry

/** Checks whether an arbitrary resolved ID belongs to the canonical registry. */
function isKnownModelVendorId(knownId: string): knownId is KnownModelVendorId {
  return Object.prototype.hasOwnProperty.call(
    KNOWN_VENDOR_PRESENTATION,
    knownId,
  )
}

/** Returns the local visual treatment for a resolved row or catalog vendor. */
export function getModelVendorPresentation(
  vendor: ModelVendorPresentationInput,
): ModelVendorPresentation {
  if ("state" in vendor && vendor.state === "unknown") {
    return GENERIC_VENDOR_PRESENTATION
  }

  if (vendor.kind === "known" && isKnownModelVendorId(vendor.knownId)) {
    return KNOWN_VENDOR_PRESENTATION[vendor.knownId]
  }

  return GENERIC_VENDOR_PRESENTATION
}
