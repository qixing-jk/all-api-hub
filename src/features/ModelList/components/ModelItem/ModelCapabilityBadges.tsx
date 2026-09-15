import {
  Braces,
  Brain,
  Eye,
  FileText,
  Image,
  Paperclip,
  Video,
  Volume2,
  Wrench,
  type LucideIcon,
} from "lucide-react"
import { useTranslation } from "react-i18next"

import { Badge } from "~/components/ui"
import {
  getModelCapabilityBadges,
  MODEL_CAPABILITY_FILTER_LABEL_KEYS,
  MODEL_CAPABILITY_FILTER_VALUES,
  type ModelCapabilitySelectionValue,
} from "~/features/ModelList/modelCapabilityFilters"
import { cn } from "~/lib/utils"
import type { ModelMetadata } from "~/services/models/modelMetadata/types"

interface ModelCapabilityBadgesProps {
  modelMetadata?: ModelMetadata
  className?: string
}

const CAPABILITY_ICONS: Record<ModelCapabilitySelectionValue, LucideIcon> = {
  [MODEL_CAPABILITY_FILTER_VALUES.IMAGE_INPUT]: Eye,
  [MODEL_CAPABILITY_FILTER_VALUES.IMAGE_OUTPUT]: Image,
  [MODEL_CAPABILITY_FILTER_VALUES.AUDIO_INPUT]: Volume2,
  [MODEL_CAPABILITY_FILTER_VALUES.AUDIO_OUTPUT]: Volume2,
  [MODEL_CAPABILITY_FILTER_VALUES.VIDEO_INPUT]: Video,
  [MODEL_CAPABILITY_FILTER_VALUES.VIDEO_OUTPUT]: Video,
  [MODEL_CAPABILITY_FILTER_VALUES.PDF]: FileText,
  [MODEL_CAPABILITY_FILTER_VALUES.REASONING]: Brain,
  [MODEL_CAPABILITY_FILTER_VALUES.TOOL_CALL]: Wrench,
  [MODEL_CAPABILITY_FILTER_VALUES.STRUCTURED_OUTPUT]: Braces,
  [MODEL_CAPABILITY_FILTER_VALUES.ATTACHMENT]: Paperclip,
}

const CAPABILITY_GROUPS: Array<{
  id: "input" | "output" | "capabilities"
  capabilities: ModelCapabilitySelectionValue[]
}> = [
  {
    id: "input",
    capabilities: [
      MODEL_CAPABILITY_FILTER_VALUES.IMAGE_INPUT,
      MODEL_CAPABILITY_FILTER_VALUES.AUDIO_INPUT,
      MODEL_CAPABILITY_FILTER_VALUES.VIDEO_INPUT,
      MODEL_CAPABILITY_FILTER_VALUES.PDF,
    ],
  },
  {
    id: "output",
    capabilities: [
      MODEL_CAPABILITY_FILTER_VALUES.IMAGE_OUTPUT,
      MODEL_CAPABILITY_FILTER_VALUES.AUDIO_OUTPUT,
      MODEL_CAPABILITY_FILTER_VALUES.VIDEO_OUTPUT,
    ],
  },
  {
    id: "capabilities",
    capabilities: [
      MODEL_CAPABILITY_FILTER_VALUES.REASONING,
      MODEL_CAPABILITY_FILTER_VALUES.TOOL_CALL,
      MODEL_CAPABILITY_FILTER_VALUES.STRUCTURED_OUTPUT,
      MODEL_CAPABILITY_FILTER_VALUES.ATTACHMENT,
    ],
  },
]

/**
 * Shows metadata-backed model capabilities as a compact row-level badge group.
 */
export function ModelCapabilityBadges({
  modelMetadata,
  className,
}: ModelCapabilityBadgesProps) {
  const { t } = useTranslation("modelList")
  const capabilityBadges = getModelCapabilityBadges(modelMetadata)
  const capabilityDescriptions: Record<ModelCapabilitySelectionValue, string> =
    {
      [MODEL_CAPABILITY_FILTER_VALUES.IMAGE_INPUT]: t(
        "modelCapabilityFilter.descriptions.imageInput",
      ),
      [MODEL_CAPABILITY_FILTER_VALUES.IMAGE_OUTPUT]: t(
        "modelCapabilityFilter.descriptions.imageOutput",
      ),
      [MODEL_CAPABILITY_FILTER_VALUES.AUDIO_INPUT]: t(
        "modelCapabilityFilter.descriptions.audioInput",
      ),
      [MODEL_CAPABILITY_FILTER_VALUES.AUDIO_OUTPUT]: t(
        "modelCapabilityFilter.descriptions.audioOutput",
      ),
      [MODEL_CAPABILITY_FILTER_VALUES.VIDEO_INPUT]: t(
        "modelCapabilityFilter.descriptions.videoInput",
      ),
      [MODEL_CAPABILITY_FILTER_VALUES.VIDEO_OUTPUT]: t(
        "modelCapabilityFilter.descriptions.videoOutput",
      ),
      [MODEL_CAPABILITY_FILTER_VALUES.PDF]: t(
        "modelCapabilityFilter.descriptions.pdf",
      ),
      [MODEL_CAPABILITY_FILTER_VALUES.REASONING]: t(
        "modelCapabilityFilter.descriptions.reasoning",
      ),
      [MODEL_CAPABILITY_FILTER_VALUES.TOOL_CALL]: t(
        "modelCapabilityFilter.descriptions.toolCall",
      ),
      [MODEL_CAPABILITY_FILTER_VALUES.STRUCTURED_OUTPUT]: t(
        "modelCapabilityFilter.descriptions.structuredOutput",
      ),
      [MODEL_CAPABILITY_FILTER_VALUES.ATTACHMENT]: t(
        "modelCapabilityFilter.descriptions.attachment",
      ),
    }
  const groupLabels: Record<(typeof CAPABILITY_GROUPS)[number]["id"], string> =
    {
      input: t("modelCapabilityFilter.groups.input"),
      output: t("modelCapabilityFilter.groups.output"),
      capabilities: t("modelCapabilityFilter.groups.capabilities"),
    }

  if (capabilityBadges.length === 0) {
    return null
  }

  return (
    <div
      className={cn(
        "gap-y-density-1-5 flex min-w-0 flex-wrap items-center gap-x-3 sm:justify-end",
        className,
      )}
    >
      {CAPABILITY_GROUPS.map(({ id, capabilities }) => {
        const visibleCapabilities = capabilities.filter((capability) =>
          capabilityBadges.includes(capability),
        )

        if (visibleCapabilities.length === 0) {
          return null
        }

        return (
          <div
            key={id}
            className="gap-y-density-1-5 flex min-w-0 flex-wrap items-center gap-x-1.5"
          >
            <span className="text-muted-foreground shrink-0 text-[10px] font-medium sm:text-xs">
              {groupLabels[id]}
            </span>
            {visibleCapabilities.map((capability) => {
              const Icon = CAPABILITY_ICONS[capability]
              const label = t(MODEL_CAPABILITY_FILTER_LABEL_KEYS[capability])
              const description = capabilityDescriptions[capability]
              const accessibleLabel = `${label}: ${description}`

              return (
                <Badge
                  key={capability}
                  variant="outline"
                  size="sm"
                  className="border-border-strong bg-surface-subtle text-secondary-foreground dark:bg-card/70 text-[10px] sm:text-xs"
                  title={accessibleLabel}
                  aria-label={accessibleLabel}
                >
                  <Icon aria-hidden="true" className="h-3 w-3" />
                  {label}
                </Badge>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}
