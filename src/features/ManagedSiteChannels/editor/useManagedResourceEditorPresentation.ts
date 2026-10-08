import type { TFunction } from "i18next"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import type { ManagedSiteType } from "~/constants/siteType"
import { getManagedResourceFieldPolicy } from "~/features/ManagedSiteChannels/editor/managedResourceFieldPolicy"
import { type useManagedResourceMutationController } from "~/features/ManagedSiteChannels/editor/useManagedResourceMutationController"
import { presentManagedResourceFailure } from "~/features/ManagedSiteChannels/presentation/managedResourceFailurePresentation"
import { type useManagedResourceInteraction } from "~/features/ManagedSiteChannels/workspace/useManagedResourceInteraction"
import { getEditedResourceFieldIssues } from "~/features/ResourceEditor/model/resourceEditorValidation"
import toast from "~/lib/notify"
import type { ManagedResourceProductPolicy } from "~/services/accountSiteDefinitions/contracts"
import {
  MANAGED_RESOURCE_FAILURE_CODES,
  ManagedResourceError,
  type EditableResourceProjection,
  type ResourceOperationOptions,
} from "~/services/apiAdapters/contracts/managedResourceNative"

/** Owns the editable draft and feedback projection of the mutation session. */
export function useManagedResourceEditorPresentation({
  siteType,
  primaryKind,
  mutation,
  runRead,
  t,
}: {
  siteType: ManagedSiteType
  primaryKind: ManagedResourceProductPolicy["primaryKind"]
  mutation: Pick<
    ReturnType<typeof useManagedResourceMutationController>,
    | "editor"
    | "editorMode"
    | "editorFailure"
    | "editorFeedback"
    | "opening"
    | "submit"
    | "closeEditor"
  >
  runRead: ReturnType<typeof useManagedResourceInteraction>["runRead"]
  t: TFunction
}) {
  const [editorValues, setEditorValues] = useState<EditableResourceProjection>(
    {},
  )
  useEffect(() => {
    setEditorValues(mutation.editor?.initialValues ?? {})
  }, [mutation.editor])
  const editorSecretLoader = mutation.editor?.loadSecret
  const editorOptionLoader = mutation.editor?.loadOptions
  const loadEditorSecret = useCallback(
    async (fieldId: string, options?: ResourceOperationOptions) => {
      if (!editorSecretLoader) {
        throw new ManagedResourceError({
          code: MANAGED_RESOURCE_FAILURE_CODES.PermissionDenied,
        })
      }
      return await runRead(
        () => editorSecretLoader(fieldId, options),
        t("channelDialog:title.edit"),
        options?.signal,
      )
    },
    [editorSecretLoader, runRead, t],
  )
  const loadEditorOptions = useCallback(
    async (
      fieldId: string,
      values: EditableResourceProjection,
      options?: ResourceOperationOptions,
    ) => {
      if (!editorOptionLoader) {
        throw new ManagedResourceError({
          code: MANAGED_RESOURCE_FAILURE_CODES.PermissionDenied,
        })
      }
      return await runRead(
        () => editorOptionLoader(fieldId, values, options),
        t("channelDialog:title.edit"),
        options?.signal,
      )
    },
    [editorOptionLoader, runRead, t],
  )
  const editorPolicy =
    mutation.editor && mutation.editorMode
      ? getManagedResourceFieldPolicy(
          siteType,
          primaryKind,
          mutation.editorMode,
        )
      : undefined
  const editorValidation = mutation.editor?.validate(editorValues) ?? null
  const initialEditorValidation = useMemo(
    () => mutation.editor?.validate(mutation.editor.initialValues) ?? null,
    [mutation.editor],
  )
  const liveEditorValidation =
    mutation.editorFailure?.code ===
    MANAGED_RESOURCE_FAILURE_CODES.ValidationFailed
      ? editorValidation
      : null
  const editorFieldIssues = liveEditorValidation
    ? liveEditorValidation.valid
      ? []
      : liveEditorValidation.issues
    : mutation.editorFailure?.fieldIssues ??
      getEditedResourceFieldIssues(
        editorValidation,
        editorValues,
        mutation.editor?.initialValues ?? {},
        initialEditorValidation,
      )
  const notifiedEditorFeedback = useRef<typeof mutation.editorFeedback>(null)
  useEffect(() => {
    const feedback = mutation.editorFeedback
    if (feedback === notifiedEditorFeedback.current) return
    notifiedEditorFeedback.current = feedback
    if (
      !feedback ||
      (feedback.kind !== "save-failed" && feedback.kind !== "save-uncertain")
    )
      return
    const failure = feedback.failure
    if (
      failure.code === MANAGED_RESOURCE_FAILURE_CODES.ValidationFailed &&
      failure.fieldIssues?.length
    )
      return
    const fallbackMessage =
      feedback.kind === "save-uncertain"
        ? t("managedSiteChannels:alerts.partialMutation.description")
        : failure.code === MANAGED_RESOURCE_FAILURE_CODES.ResourceChanged
          ? t("managedSiteChannels:alerts.resourceChanged.description")
          : t("managedSiteChannels:alerts.editorSaveError.description")
    toast.error(
      presentManagedResourceFailure(failure, {
        category: "",
        message: fallbackMessage,
      }).message,
    )
  }, [mutation.editorFeedback, t])
  const editorPageFailure = (() => {
    if (mutation.opening?.status === "failure") return null
    switch (mutation.editorFeedback?.kind) {
      case "open-failed":
        return presentManagedResourceFailure(mutation.editorFeedback.failure, {
          category: t("managedSiteChannels:alerts.editorLoadError.title"),
          message: t("managedSiteChannels:alerts.editorLoadError.description"),
        })
      case "save-failed":
      case "save-uncertain":
        return null
      case "saved-refresh-failed":
        return {
          category: t("managedSiteChannels:alerts.savedRefreshError.title"),
          message: t(
            "managedSiteChannels:alerts.savedRefreshError.description",
          ),
          variant: "warning" as const,
        }
      default:
        return null
    }
  })()
  const handleSubmitEditor = () => {
    void mutation.submit(editorValues).catch(() => {
      mutation.closeEditor()
      toast.error(t("managedSiteChannels:alerts.partialMutation.description"))
    })
  }

  return {
    editorValues,
    setEditorValues,
    editorPolicy,
    editorValidation,
    editorFieldIssues,
    loadEditorSecret,
    loadEditorOptions,
    editorPageFailure,
    handleSubmitEditor,
  }
}
