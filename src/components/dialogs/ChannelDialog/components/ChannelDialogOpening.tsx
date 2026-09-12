import { useTranslation } from "react-i18next"

import { Alert } from "~/components/ui"
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
  const failureDescription = t(
    "managedSiteChannels:alerts.editorLoadError.description",
  )
  const failureMessage =
    opening.status === "failure"
      ? presentManagedResourceFailure(opening.failure, {
          category: "",
          message: failureDescription,
        }).message
      : null
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
      onSubmit={(event) => {
        event.preventDefault()
        if (opening.status === "failure") onRetry()
      }}
      closeLabel={t("common:actions.cancel")}
      showSubmit={opening.status === "failure"}
      submitLabel={t("common:actions.retry")}
    >
      {opening.status === "failure" ? (
        <Alert
          compact
          variant="destructive"
          title={t("managedSiteChannels:alerts.editorLoadError.title")}
          description={failureDescription}
        >
          {failureMessage && failureMessage !== failureDescription ? (
            <p className="mt-3 border-t border-current/15 pt-3 text-xs leading-relaxed wrap-anywhere whitespace-pre-wrap opacity-80">
              {failureMessage}
            </p>
          ) : null}
        </Alert>
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
