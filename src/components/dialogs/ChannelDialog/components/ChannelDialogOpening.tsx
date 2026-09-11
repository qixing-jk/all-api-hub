import { useTranslation } from "react-i18next"

import { Button } from "~/components/ui"
import { presentManagedResourceFailure } from "~/features/ManagedSiteChannels/presentation/managedResourceFailurePresentation"
import {
  NativeResourceEditorLoadingSkeleton,
  useNativeResourceEditorLoadingVisibility,
} from "~/features/ResourceEditor/NativeResourceEditorLoading"
import type { NativeResourceEditorOpeningState } from "~/features/ResourceEditor/nativeResourceEditorOpeningState"
import type { ResourceFailure } from "~/services/apiAdapters/contracts/managedResourceNative"

import { ChannelEditorShell } from "./ChannelEditorShell"

export type ChannelDialogOpeningState = NativeResourceEditorOpeningState<
  "create" | "edit" | "view",
  ResourceFailure
>

/** Keeps asynchronous channel preparation visible, cancellable and retryable. */
export function ChannelDialogOpening({
  opening,
  onClose,
  onRetry,
}: {
  opening: ChannelDialogOpeningState
  onClose: () => void
  onRetry: () => void
}) {
  const { t } = useTranslation([
    "channelDialog",
    "common",
    "managedSiteChannels",
  ])
  const showSkeleton = useNativeResourceEditorLoadingVisibility(
    opening.status === "loading" ? opening : null,
  )
  if (opening.status === "idle") return null
  const loadingLabel = t("channelDialog:opening.loading")
  return (
    <ChannelEditorShell
      isOpen
      title={t(
        opening.mode === "create"
          ? "channelDialog:title.add"
          : opening.mode === "edit"
            ? "channelDialog:title.edit"
            : "channelDialog:title.view",
      )}
      onClose={onClose}
      onSubmit={(event) => event.preventDefault()}
      closeLabel={t("common:actions.cancel")}
      showSubmit={false}
    >
      {opening.status === "failure" ? (
        <div className="space-y-3">
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {
              presentManagedResourceFailure(opening.failure, {
                category: "",
                message: t(
                  "managedSiteChannels:alerts.editorLoadError.description",
                ),
              }).message
            }
          </p>
          <Button type="button" variant="outline" onClick={onRetry}>
            {t("common:actions.retry")}
          </Button>
        </div>
      ) : (
        <div aria-busy="true">
          {showSkeleton ? (
            <NativeResourceEditorLoadingSkeleton
              accessibleLabel={loadingLabel}
            />
          ) : (
            <p role="status" className="text-muted-foreground text-sm">
              {loadingLabel}
            </p>
          )}
        </div>
      )}
    </ChannelEditorShell>
  )
}
