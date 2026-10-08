import { loadNewApiChannelKeyWithVerification } from "~/features/ManagedSiteVerification/loadNewApiChannelKeyWithVerification"
import { NEW_API_MANAGED_VERIFICATION_CLOSE_MODES } from "~/features/ManagedSiteVerification/useNewApiManagedVerification"
import { PROTECTION_BYPASS_USER_COMMANDS } from "~/services/protectionBypass/contracts"
import type {
  ManagedSiteTokenBatchExportMatchedChannel,
  ManagedSiteTokenBatchExportPreviewItem,
} from "~/types/managedSiteTokenBatchExport"
import { getErrorMessage } from "~/utils/core/error"

type VerificationTarget = {
  item: ManagedSiteTokenBatchExportPreviewItem
  candidate: ManagedSiteTokenBatchExportMatchedChannel
}
type ChannelKeyLoadInput = Parameters<
  typeof loadNewApiChannelKeyWithVerification
>[0]

type BatchVerificationInput = {
  targets: VerificationTarget[]
  config: ChannelKeyLoadInput["config"]
  isActive: () => boolean
  openVerification: ChannelKeyLoadInput["openVerification"]
  onProgress: (itemId: string | null) => void
  onResolved: (target: VerificationTarget, key: string) => void
  onFailure: (message: string | null) => void
}

/** Verify rows sequentially, resuming after deferred verification only for the active workflow. */
export async function verifyManagedSiteTokenBatchTargets({
  targets,
  config,
  isActive,
  openVerification,
  onProgress,
  onResolved,
  onFailure,
}: BatchVerificationInput) {
  const failureMessages: string[] = []

  onFailure(null)

  const verifyTargetsFromIndex = async (startIndex: number) => {
    for (let index = startIndex; index < targets.length; index += 1) {
      if (!isActive()) return

      const target = targets[index]
      if (!target) return
      const { item, candidate } = target
      const resourceRef = candidate.ref
      let resolvedChannelKey = ""
      let shouldContinueAfterDeferredLoad = false
      let loadCompleted = false

      onProgress(item.id)

      const handleLoaded = async () => {
        if (!isActive()) return

        loadCompleted = true
        if (resolvedChannelKey) {
          onResolved(target, resolvedChannelKey)
        }
        onFailure(null)
        if (shouldContinueAfterDeferredLoad && isActive()) {
          await verifyTargetsFromIndex(index + 1)
        }
      }

      try {
        const loadedImmediately = await loadNewApiChannelKeyWithVerification({
          resourceRef,
          command: PROTECTION_BYPASS_USER_COMMANDS.ManageApiKeys,
          label: candidate.name,
          requestKind: "channel",
          config,
          setKey: (key) => {
            if (!isActive()) return
            resolvedChannelKey = key
          },
          onLoaded: handleLoaded,
          openVerification: (request) => {
            if (!isActive()) return
            openVerification({
              ...request,
              closeMode:
                NEW_API_MANAGED_VERIFICATION_CLOSE_MODES.CLOSE_AFTER_VERIFICATION,
            })
          },
        })

        if (!isActive()) return
        if (!loadedImmediately) {
          if (!loadCompleted) {
            shouldContinueAfterDeferredLoad = true
            onProgress(null)
            return
          }
        }
      } catch (error) {
        if (!isActive()) return
        failureMessages.push(getErrorMessage(error))
      }
    }

    if (!isActive()) return
    onProgress(null)
    if (failureMessages.length > 0) {
      onFailure(failureMessages.join("; "))
    }
  }

  try {
    await verifyTargetsFromIndex(0)
  } catch (error) {
    if (!isActive()) return
    onProgress(null)
    onFailure(getErrorMessage(error))
  }
}
