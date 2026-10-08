import { useEffect, useState } from "react"

import type { CompactMultiSelectOption } from "~/components/ui/useCompactMultiSelectModel"
import { modelMetadataService } from "~/services/models/modelMetadata"
import type { ModelMetadata } from "~/services/models/modelMetadata/types"
import { sendModelSyncMessage } from "~/services/models/modelSync/messaging"
import { ModelSyncMessageTypes } from "~/services/runtimeMessaging/messageTypes"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"

const logger = createLogger("ManagedSiteModelSyncSettings")

/**
 * Creates sorted compact multi-select options from unique model identifier strings.
 */
function createSortedModelOptions(
  modelIds: string[],
): CompactMultiSelectOption[] {
  return modelIds
    .map((id) => id.trim())
    .filter(Boolean)
    .map((id) => ({
      label: id,
      value: id,
    }))
    .sort((a, b) => a.label.localeCompare(b.label))
}

/**
 * Builds sorted multi-select options from an array of model metadata.
 */
function buildModelOptions(
  metadata: ModelMetadata[],
): CompactMultiSelectOption[] {
  return createSortedModelOptions(metadata.map((model) => model.id))
}

/**
 * Converts plain model ID strings into sorted compact multi-select options.
 */
function buildOptionsFromIds(modelIds: string[]): CompactMultiSelectOption[] {
  return createSortedModelOptions(modelIds)
}

/** Owns runtime model options and the metadata fallback lifetime. */
export function useChannelUpstreamModelOptions() {
  const [channelUpstreamModelOptions, setChannelUpstreamModelOptions] =
    useState<CompactMultiSelectOption[]>([])
  const [optionsLoading, setOptionsLoading] = useState(true)
  const [optionsError, setOptionsError] = useState<string | null>(null)

  useEffect(() => {
    let isMounted = true
    const loadChannelUpstreamOptions = async () => {
      try {
        setOptionsLoading(true)
        setOptionsError(null)

        const response = await sendModelSyncMessage(
          ModelSyncMessageTypes.GetChannelUpstreamModelOptions,
        )

        if (response?.success && Array.isArray(response.data)) {
          if (isMounted) {
            setChannelUpstreamModelOptions(buildOptionsFromIds(response.data))
          }
          return
        }

        await modelMetadataService.initialize()
        const models = modelMetadataService.getAllMetadata()
        if (isMounted) {
          setChannelUpstreamModelOptions(buildModelOptions(models))
        }
      } catch (error) {
        logger.error("Failed to load allowed model options", error)
        if (isMounted) {
          setOptionsError(getErrorMessage(error))
          setChannelUpstreamModelOptions([])
        }
      } finally {
        if (isMounted) {
          setOptionsLoading(false)
        }
      }
    }

    void loadChannelUpstreamOptions()

    return () => {
      isMounted = false
    }
  }, [])

  return {
    channelUpstreamModelOptions,
    optionsLoading,
    optionsError,
  }
}
