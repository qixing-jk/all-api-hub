import { userPreferences } from "~/services/preferences/userPreferences"
import { getModelContextInfo } from "~/services/verification/modelQuality/contextTokens"
import { needleHistory } from "~/services/verification/verificationResultHistory/needleHistory"
import { discardInactiveContextCheckpoints } from "~/services/verification/webAiApiCheck/contextCapacityCheckpoint"
import { onTabRemoved, onTabUpdated } from "~/utils/browser/tabs"
import { isHttpUrl } from "~/utils/core/urlParsing"

import {
  resolveWebAiApiCheckCreateTagMessage,
  resolveWebAiApiCheckGetBaseUrlHistorySuggestionsMessage,
  resolveWebAiApiCheckListTagsMessage,
  resolveWebAiApiCheckRecordBaseUrlHistoryMessage,
  resolveWebAiApiCheckRemoveBaseUrlHistoryMessage,
  resolveWebAiApiCheckRenameTagMessage,
  resolveWebAiApiCheckShouldPromptMessage,
} from "./backgroundMetadataHandlers"
import { resolveWebAiApiCheckFetchModelsMessage } from "./backgroundModelDiscovery"
import {
  resolveContextHistory,
  resolveNeedleRun,
  resolveWebAiApiCheckRunContextCapacityMessage,
} from "./backgroundModelQualityHandlers"
import {
  resolveWebAiApiCheckCancelRunProbeMessage,
  resolveWebAiApiCheckQuestionAnswerMessage,
  resolveWebAiApiCheckRunPelicanMessage,
  resolveWebAiApiCheckRunProbeMessage,
} from "./backgroundProbeHandlers"
import { resolveWebAiApiCheckSaveProfileMessage } from "./backgroundProfileHandlers"
import { needleRunControls, probeRuns } from "./backgroundRunState"
import { toGenericFailureResponse } from "./backgroundUtils"
import { onWebAiApiCheckMessage, WebAiApiCheckMessageTypes } from "./messaging"
import { discardInactiveNeedleCheckpoints } from "./needleCheckpoint"

export {
  resolveWebAiApiCheckQuestionAnswerMessage,
  resolveWebAiApiCheckRunProbeMessage,
  resolveWebAiApiCheckCancelRunProbeMessage,
} from "./backgroundProbeHandlers"
export {
  resolveWebAiApiCheckShouldPromptMessage,
  resolveWebAiApiCheckRecordBaseUrlHistoryMessage,
  resolveWebAiApiCheckRemoveBaseUrlHistoryMessage,
} from "./backgroundMetadataHandlers"
export { resolveWebAiApiCheckSaveProfileMessage } from "./backgroundProfileHandlers"
export { resolveWebAiApiCheckFetchModelsMessage } from "./backgroundModelDiscovery"

let webAiApiCheckMessagingCleanup: Array<() => void> | null = null

/**
 * Register typed background listeners for Web AI API Check runtime RPCs.
 */
export function setupWebAiApiCheckMessagingListeners() {
  if (webAiApiCheckMessagingCleanup) {
    return
  }

  webAiApiCheckMessagingCleanup = [
    onWebAiApiCheckMessage(
      WebAiApiCheckMessageTypes.ShouldPrompt,
      async ({ data }) => resolveWebAiApiCheckShouldPromptMessage(data),
    ),
    onWebAiApiCheckMessage(
      WebAiApiCheckMessageTypes.SetSiteAccess,
      async ({ data }) => {
        try {
          if (!isHttpUrl(data.pageUrl) || typeof data.enabled !== "boolean")
            return toGenericFailureResponse()
          const result = await userPreferences.setWebAiApiCheckSiteEnabled(
            data.pageUrl,
            data.enabled,
          )
          if (!result.ok) return toGenericFailureResponse()
          return resolveWebAiApiCheckShouldPromptMessage({
            pageUrl: data.pageUrl,
          })
        } catch {
          return toGenericFailureResponse()
        }
      },
    ),
    onWebAiApiCheckMessage(
      WebAiApiCheckMessageTypes.FetchModels,
      async ({ data }) => resolveWebAiApiCheckFetchModelsMessage(data),
    ),
    onWebAiApiCheckMessage(
      WebAiApiCheckMessageTypes.GetBaseUrlHistorySuggestions,
      async ({ data }) =>
        resolveWebAiApiCheckGetBaseUrlHistorySuggestionsMessage(data),
    ),
    onWebAiApiCheckMessage(
      WebAiApiCheckMessageTypes.RecordBaseUrlHistory,
      async ({ data }) => resolveWebAiApiCheckRecordBaseUrlHistoryMessage(data),
    ),
    onWebAiApiCheckMessage(
      WebAiApiCheckMessageTypes.RemoveBaseUrlHistory,
      async ({ data }) => resolveWebAiApiCheckRemoveBaseUrlHistoryMessage(data),
    ),
    onWebAiApiCheckMessage(
      WebAiApiCheckMessageTypes.ListTags,
      async ({ data }) => resolveWebAiApiCheckListTagsMessage(data),
    ),
    onWebAiApiCheckMessage(
      WebAiApiCheckMessageTypes.CreateTag,
      async ({ data }) => resolveWebAiApiCheckCreateTagMessage(data),
    ),
    onWebAiApiCheckMessage(
      WebAiApiCheckMessageTypes.RenameTag,
      async ({ data }) => resolveWebAiApiCheckRenameTagMessage(data),
    ),
    onWebAiApiCheckMessage(
      WebAiApiCheckMessageTypes.RunProbe,
      async ({ data, sender }) =>
        resolveWebAiApiCheckRunProbeMessage(data, sender?.tab?.id),
    ),
    onWebAiApiCheckMessage(
      WebAiApiCheckMessageTypes.RunPelican,
      async ({ data, sender }) =>
        resolveWebAiApiCheckRunPelicanMessage(data, sender?.tab?.id),
    ),
    onWebAiApiCheckMessage(
      WebAiApiCheckMessageTypes.RunQuestionAnswer,
      async ({ data, sender }) =>
        resolveWebAiApiCheckQuestionAnswerMessage(data, sender?.tab?.id),
    ),
    onWebAiApiCheckMessage(
      WebAiApiCheckMessageTypes.ContextCounter,
      async ({ data }) => {
        if (typeof data.modelId !== "string" || !data.modelId.trim())
          return { success: false as const }
        try {
          return {
            success: true as const,
            counter: await getModelContextInfo(data.modelId),
          }
        } catch {
          return { success: false as const }
        }
      },
    ),
    onWebAiApiCheckMessage(
      WebAiApiCheckMessageTypes.NeedleHistory,
      async ({ data }) => {
        try {
          return {
            success: true as const,
            summary: await needleHistory.get(data, data.historyTarget),
          }
        } catch {
          return { success: false as const }
        }
      },
    ),
    onWebAiApiCheckMessage(
      WebAiApiCheckMessageTypes.RunNeedle,
      async ({ data, sender }) => resolveNeedleRun(data, sender),
    ),
    onWebAiApiCheckMessage(
      WebAiApiCheckMessageTypes.StopNeedleSelection,
      async ({ data }) => ({
        success: true as const,
        cancelled: Boolean(
          await needleRunControls
            .get(data.runId)
            ?.stopSelection(data.selection),
        ),
      }),
    ),
    onWebAiApiCheckMessage(
      WebAiApiCheckMessageTypes.DiscardNeedleCheckpoints,
      async () => {
        try {
          await discardInactiveNeedleCheckpoints()
          return { success: true as const }
        } catch {
          return { success: false as const }
        }
      },
    ),
    onWebAiApiCheckMessage(
      WebAiApiCheckMessageTypes.RunContextCapacity,
      async ({ data, sender }) =>
        resolveWebAiApiCheckRunContextCapacityMessage(data, sender),
    ),
    onWebAiApiCheckMessage(
      WebAiApiCheckMessageTypes.ContextHistory,
      async ({ data }) => resolveContextHistory(data),
    ),
    onWebAiApiCheckMessage(
      WebAiApiCheckMessageTypes.DiscardContextCheckpoints,
      async () => {
        try {
          return {
            success: true as const,
            discarded: await discardInactiveContextCheckpoints(),
          }
        } catch {
          return { success: false as const }
        }
      },
    ),
    onWebAiApiCheckMessage(
      WebAiApiCheckMessageTypes.CancelRunProbe,
      async ({ data }) => resolveWebAiApiCheckCancelRunProbeMessage(data),
    ),
    onWebAiApiCheckMessage(
      WebAiApiCheckMessageTypes.SaveProfile,
      async ({ data }) => resolveWebAiApiCheckSaveProfileMessage(data),
    ),
    // A removed tab or a navigation tears the content script down before it can
    // cancel its own runs, so the background aborts them on its side.
    onTabRemoved((tabId) => {
      probeRuns.cancelForTab(tabId)
    }),
    onTabUpdated((tabId, changeInfo) => {
      if (changeInfo.status === "loading") probeRuns.cancelForTab(tabId)
    }),
  ]
}
