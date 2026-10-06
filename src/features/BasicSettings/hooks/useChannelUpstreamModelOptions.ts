import { useEffect, useState } from "react"

import { type CompactMultiSelectOption } from "~/components/ui"
import { modelMetadataService } from "~/services/models/modelMetadata"
import type { ModelMetadata } from "~/services/models/modelMetadata/types"
import { sendModelSyncMessage } from "~/services/models/modelSync/messaging"
import { ModelSyncMessageTypes } from "~/services/runtimeMessaging/messageTypes"
import { createLogger } from "~/utils/core/logger"

const logger = createLogger("ManagedSiteModelSyncSettings")

/**
 * Builds sorted multi-select options from an array of model metadata.
 * @param metadata Array of model metadata objects to convert into select options.
 * @returns Options consumable by compact multi-select inputs.
 */
function buildModelOptions(
  metadata: ModelMetadata[],
): CompactMultiSelectOption[] {
  const options = metadata.map((model) => ({
    label: model.id,
    value: model.id,
  }))
  return options.sort((a, b) => a.label.localeCompare(b.label))
}

/**
 * Converts plain model ID strings into sorted compact multi-select options.
 * @param modelIds Array of model identifiers returned from remote APIs.
 * @returns Options list sorted alphabetically by label.
 */
function buildOptionsFromIds(modelIds: string[]): CompactMultiSelectOption[] {
  const options = modelIds
    .map((model) => model.trim())
    .filter(Boolean)
    .map((model) => ({
      label: model,
      value: model,
    }))

  return options.sort((a, b) => a.label.localeCompare(b.label))
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
      } catch (error: any) {
        logger.error("Failed to load allowed model options", error)
        if (isMounted) {
          setOptionsError(error?.message || "Unknown error")
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
