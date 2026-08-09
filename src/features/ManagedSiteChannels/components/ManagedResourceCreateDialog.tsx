import { useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import { ChannelEditorShell } from "~/components/dialogs/ChannelDialog/components/ChannelEditorShell"
import type { ChannelDialogAdvisoryWarning } from "~/components/dialogs/ChannelDialog/context/ChannelDialogContext"
import { CHANNEL_DIALOG_TEST_IDS } from "~/components/dialogs/ChannelDialog/testIds"
import { ManagedSiteChannelAssessmentSignalsRow } from "~/components/ManagedSiteChannelAssessmentSignals"
import { Alert } from "~/components/ui"
import type { ManagedSiteType } from "~/constants/siteType"
import { ManagedResourceEditorBody } from "~/features/ManagedSiteChannels/presentation/ManagedResourceEditorBody"
import {
  getManagedResourceFieldPolicy,
  MANAGED_RESOURCE_EDITOR_MODES,
} from "~/features/ManagedSiteChannels/presentation/managedResourceFieldPolicy"
import type { ManagedResourceKind } from "~/services/accountSiteDefinitions/contracts"
import {
  MANAGED_RESOURCE_FAILURE_CODES,
  ManagedResourceError,
  type ResourceEditor,
  type ResourceFieldIssue,
  type ResourceFieldValue,
} from "~/services/apiAdapters/contracts/managedResourceNative"
import {
  assertManagedSiteMutationResult,
  MANAGED_SITE_MUTATION_OUTCOMES,
} from "~/services/managedSites/mutations"

type SaveFeedback =
  | { kind: "failed"; fieldIssues?: readonly ResourceFieldIssue[] }
  | { kind: "uncertain" }
  | null

export interface ManagedResourceCreateDialogProps {
  isOpen: boolean
  siteType: ManagedSiteType
  kind: ManagedResourceKind
  editor: ResourceEditor
  showModelPrefillWarning?: boolean
  advisoryWarning?: ChannelDialogAdvisoryWarning | null
  onClose: () => void
  onCloseComplete: () => void
  onSuccess: (result: {
    success: true
    data: unknown
    message?: string
  }) => void
}

/** Presents a provider-native managed-resource create editor outside its list page. */
export function ManagedResourceCreateDialog({
  isOpen,
  siteType,
  kind,
  editor,
  showModelPrefillWarning = false,
  advisoryWarning,
  onClose,
  onCloseComplete,
  onSuccess,
}: ManagedResourceCreateDialogProps) {
  const { t } = useTranslation([
    "managedSiteChannels",
    "channelDialog",
    "common",
  ])
  const [values, setValues] = useState(editor.initialValues)
  const [isSaving, setIsSaving] = useState(false)
  const [feedback, setFeedback] = useState<SaveFeedback>(null)
  const activeSubmit = useRef<AbortController | null>(null)
  const policy = getManagedResourceFieldPolicy(
    siteType,
    kind,
    MANAGED_RESOURCE_EDITOR_MODES.Create,
  )
  const validation = useMemo(() => editor.validate(values), [editor, values])
  const fieldIssues =
    feedback?.kind === "failed" && feedback.fieldIssues
      ? feedback.fieldIssues
      : []

  useEffect(() => {
    setValues(editor.initialValues)
    setFeedback(null)
    setIsSaving(false)
  }, [editor])

  useEffect(
    () => () => {
      activeSubmit.current?.abort()
    },
    [],
  )

  const updateValue = (fieldId: string, value: ResourceFieldValue) => {
    setFeedback((current) => (current?.kind === "failed" ? null : current))
    setValues((current) => ({ ...current, [fieldId]: value }))
  }

  const submit = async () => {
    if (!policy || isSaving || feedback?.kind === "uncertain") return
    if (!validation.valid) {
      setFeedback({ kind: "failed", fieldIssues: validation.issues })
      return
    }

    const controller = new AbortController()
    activeSubmit.current = controller
    setIsSaving(true)
    setFeedback(null)
    try {
      const result = await editor.submit(values, {
        signal: controller.signal,
      })
      assertManagedSiteMutationResult(result, { idempotent: false })
      switch (result.outcome) {
        case MANAGED_SITE_MUTATION_OUTCOMES.Succeeded:
          onSuccess({
            success: true,
            data: result.data,
            ...(result.message ? { message: result.message } : {}),
          })
          return
        case MANAGED_SITE_MUTATION_OUTCOMES.Rejected:
          setFeedback({ kind: "failed" })
          return
        case MANAGED_SITE_MUTATION_OUTCOMES.Partial:
        case MANAGED_SITE_MUTATION_OUTCOMES.Uncertain:
          setFeedback({ kind: "uncertain" })
          return
      }
    } catch (error) {
      if (controller.signal.aborted) return
      if (
        error instanceof ManagedResourceError &&
        error.failure.code === MANAGED_RESOURCE_FAILURE_CODES.ValidationFailed
      ) {
        setFeedback({
          kind: "failed",
          fieldIssues: error.failure.fieldIssues,
        })
        return
      }
      setFeedback({ kind: "failed" })
    } finally {
      if (activeSubmit.current === controller) {
        activeSubmit.current = null
        setIsSaving(false)
      }
    }
  }

  return (
    <ChannelEditorShell
      isOpen={isOpen}
      title={t("channelDialog:title.add")}
      description={t("channelDialog:description.add")}
      onClose={onClose}
      onCloseComplete={onCloseComplete}
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}
      submitLabel={t("channelDialog:actions.create")}
      closeLabel={t("common:actions.cancel")}
      submitTestId={CHANNEL_DIALOG_TEST_IDS.submitButton}
      isSubmitting={isSaving}
      isSubmitDisabled={
        !policy || validation.valid === false || feedback?.kind === "uncertain"
      }
      noValidate
    >
      {advisoryWarning ? (
        <Alert
          variant="warning"
          title={advisoryWarning.title}
          description={advisoryWarning.description}
          className="mb-4"
        >
          {advisoryWarning.assessment ? (
            <ManagedSiteChannelAssessmentSignalsRow
              assessment={advisoryWarning.assessment}
              managedSiteType={siteType}
              className="mt-3 min-w-0"
            />
          ) : null}
        </Alert>
      ) : null}
      {!policy ? (
        <Alert
          variant="destructive"
          title={t("managedSiteChannels:alerts.editorLoadError.title")}
          description={t(
            "managedSiteChannels:alerts.editorLoadError.description",
          )}
        />
      ) : null}
      {feedback?.kind === "failed" && fieldIssues.length === 0 ? (
        <Alert
          variant="destructive"
          title={t("managedSiteChannels:alerts.editorSaveError.title")}
          description={t(
            "managedSiteChannels:alerts.editorSaveError.description",
          )}
          className="mb-4"
        />
      ) : null}
      {feedback?.kind === "uncertain" ? (
        <Alert
          variant="warning"
          title={t("managedSiteChannels:alerts.partialMutation.title")}
          description={t(
            "managedSiteChannels:alerts.partialMutation.description",
          )}
          className="mb-4"
        />
      ) : null}
      {policy ? (
        <ManagedResourceEditorBody
          t={t}
          mode="create"
          descriptors={editor.fields}
          policy={policy}
          values={values}
          fieldIssues={fieldIssues}
          disabled={isSaving || feedback?.kind === "uncertain"}
          showModelPrefillWarning={showModelPrefillWarning}
          onValueChange={updateValue}
        />
      ) : null}
    </ChannelEditorShell>
  )
}
