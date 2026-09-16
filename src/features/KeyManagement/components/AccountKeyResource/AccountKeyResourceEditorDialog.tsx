import type { TFunction } from "i18next"
import { useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { useTranslation } from "react-i18next"

import {
  ActionGroup,
  Alert,
  Button,
  ConfirmDialog,
  Modal,
} from "~/components/ui"
import {
  NativeResourceEditorBody,
  type ResourceEditorControlledOptionState,
} from "~/features/ResourceEditor/NativeResourceEditorBody"
import {
  NativeResourceEditorLoadingSkeleton,
  useNativeResourceEditorLoadingVisibility,
} from "~/features/ResourceEditor/NativeResourceEditorLoading"
import type { NativeResourceEditorOpeningState } from "~/features/ResourceEditor/nativeResourceEditorOpeningState"
import type {
  EditableResourceProjection,
  ResourceFailure,
  ResourceFieldDescriptor,
} from "~/services/apiAdapters/contracts/accountKeyResource"
import {
  RESOURCE_FIELD_OPTION_LOAD_TRIGGERS,
  RESOURCE_FIELD_TYPES,
  type ResourceFieldValue,
} from "~/services/apiAdapters/contracts/resourceNative"

import { getNativeKeyResourceEditorPresentation } from "../../presentation/nativeKeyResourceFieldPolicy"
import { KEY_MANAGEMENT_TEST_IDS } from "../../testIds"

export type AccountKeyResourceEditorDialogState = {
  /** Stable for the dialog session; changes only when opening a different editor. */
  editorId: number
  siteType: string
  mode: "create" | "edit"
  fields: readonly ResourceFieldDescriptor[]
  initialValues: EditableResourceProjection
  values: EditableResourceProjection
  feedback?: ResourceFailure | null
  optionsByField?: Readonly<
    Record<string, readonly { value: string; displayLabel?: string }[]>
  >
  optionFailuresByField?: Readonly<Record<string, ResourceFailure | undefined>>
  loadingFieldIds?: readonly string[]
  /** A confirmed mutation keeps the shell mounted long enough for Modal to settle focus. */
  terminalClose?: boolean
}

export type AccountKeyResourceEditorOpeningState =
  NativeResourceEditorOpeningState<
    AccountKeyResourceEditorDialogState["mode"],
    ResourceFailure
  >

export type AccountKeyResourceEditorDialogProps = {
  notice?: string
  editor: AccountKeyResourceEditorDialogState | null
  /** View-only closing shell retained while Modal settles its focus workflow. */
  terminalCloseEditor?: AccountKeyResourceEditorDialogState | null
  opening?: AccountKeyResourceEditorOpeningState
  onRetryOpening?: (attemptId: number) => void
  onCancelOpening?: (attemptId: number) => void
  onClose: (editorId: number) => void
  onTerminalCloseSettled?: (editorId: number) => void
  onSubmit: (
    editorId: number,
    values: EditableResourceProjection,
  ) => Promise<unknown> | void
  /** The controller owns the projection so asynchronous corrections cannot lose local edits. */
  onValuesChange: (editorId: number, values: EditableResourceProjection) => void
  onLoadOptions?: (
    editorId: number,
    fieldId: string,
    values: EditableResourceProjection,
  ) => void
  /** Kept stable by the controller across editor -> one-time-secret handoff. */
  focusWorkflowId?: string | number
}

type DynamicOptionField = Extract<
  ResourceFieldDescriptor,
  {
    type:
      | typeof RESOURCE_FIELD_TYPES.Select
      | typeof RESOURCE_FIELD_TYPES.MultiSelect
  }
>

const isDynamicOptionField = (
  descriptor: ResourceFieldDescriptor,
): descriptor is DynamicOptionField =>
  (descriptor.type === RESOURCE_FIELD_TYPES.Select ||
    descriptor.type === RESOURCE_FIELD_TYPES.MultiSelect) &&
  descriptor.optionLoader !== undefined

const isSameProjection = (
  left: EditableResourceProjection,
  right: EditableResourceProjection,
) => JSON.stringify(left) === JSON.stringify(right)

/** Converts adapter-owned UTC instants to the local value shape required by datetime-local. */
const toLocalDateTimeInputValue = (
  value: ResourceFieldValue,
): ResourceFieldValue => {
  if (typeof value !== "string" || !value.endsWith("Z")) return value
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const pad = (part: number) => String(part).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

const toEditorValues = (
  values: EditableResourceProjection,
  fields: readonly ResourceFieldDescriptor[],
): EditableResourceProjection => {
  const result = { ...values }
  for (const descriptor of fields) {
    if (
      descriptor.type === RESOURCE_FIELD_TYPES.DateTime &&
      Object.hasOwn(values, descriptor.fieldId)
    )
      result[descriptor.fieldId] = toLocalDateTimeInputValue(
        values[descriptor.fieldId],
      )
  }
  return result
}

const feedbackMessage = (failure: ResourceFailure, t: TFunction) => {
  switch (failure.code) {
    case "permission_denied":
      return t("keyManagement:native.editor.feedback.permissionDenied")
    case "authentication_failed":
      return t("keyManagement:native.editor.feedback.authenticationFailed")
    case "unavailable":
      return t("keyManagement:native.editor.feedback.unavailable")
    case "mutation_state_uncertain":
      return t("keyManagement:native.editor.feedback.uncertain")
    default:
      return t("keyManagement:native.editor.feedback.error")
  }
}

const feedbackDescription = (failure: ResourceFailure, t: TFunction) => {
  const details = [failure.message, failure.upstreamCode].filter(
    (detail): detail is string => Boolean(detail),
  )
  return [feedbackMessage(failure, t), ...details].join("\n")
}

/** Renders the provider's native projection while its controller owns operations. */
export function AccountKeyResourceEditorDialog({
  editor,
  terminalCloseEditor = null,
  opening = { attemptId: 0, status: "idle" },
  onRetryOpening,
  onCancelOpening,
  onClose,
  onTerminalCloseSettled,
  onSubmit,
  onValuesChange,
  onLoadOptions,
  focusWorkflowId,
  notice,
}: AccountKeyResourceEditorDialogProps) {
  const { t } = useTranslation()
  const editorCloseRequestRef = useRef<(() => void) | null>(null)
  const [editorFooterHost, setEditorFooterHost] =
    useState<HTMLDivElement | null>(null)
  const [committedCloseEditorId, setCommittedCloseEditorId] = useState<
    number | null
  >(null)
  const [committedCloseOpeningAttemptId, setCommittedCloseOpeningAttemptId] =
    useState<number | null>(null)
  useEffect(() => {
    if (
      committedCloseEditorId !== null &&
      committedCloseEditorId !== editor?.editorId
    )
      setCommittedCloseEditorId(null)
  }, [committedCloseEditorId, editor?.editorId])
  useEffect(() => {
    if (
      committedCloseOpeningAttemptId !== null &&
      committedCloseOpeningAttemptId !== opening.attemptId
    )
      setCommittedCloseOpeningAttemptId(null)
  }, [committedCloseOpeningAttemptId, opening.attemptId])
  const activeEditor = editor ?? terminalCloseEditor
  const isLoadingVisible = useNativeResourceEditorLoadingVisibility(
    opening.status === "loading"
      ? { attemptId: opening.attemptId, reveal: opening.reveal }
      : null,
  )
  const activeOpening =
    opening.status === "failure"
      ? opening
      : opening.status === "loading" && isLoadingVisible
        ? opening
        : null
  const isOpen = activeEditor !== null || activeOpening !== null
  if (!isOpen) return null
  const isOpening = activeEditor === null
  const editorMode = activeEditor?.mode ?? activeOpening?.mode
  const title =
    editorMode === "create"
      ? t("keyManagement:native.editor.title.create")
      : t("keyManagement:native.editor.title.edit")
  const requestClose = () => {
    if (activeEditor) {
      if (
        activeEditor.terminalClose ||
        committedCloseEditorId === activeEditor.editorId
      ) {
        if (activeEditor.terminalClose) {
          if (onTerminalCloseSettled) {
            onTerminalCloseSettled(activeEditor.editorId)
          } else {
            onClose(activeEditor.editorId)
          }
        } else {
          onClose(activeEditor.editorId)
        }
        return
      }
      editorCloseRequestRef.current?.()
      return
    }
    if (committedCloseOpeningAttemptId === opening.attemptId) {
      onCancelOpening?.(opening.attemptId)
    } else {
      setCommittedCloseOpeningAttemptId(opening.attemptId)
    }
  }

  return (
    <Modal
      isOpen
      onClose={requestClose}
      title={title}
      size="lg"
      header={<h2 className="text-base font-semibold">{title}</h2>}
      footer={
        isOpening ? (
          <ActionGroup>
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                setCommittedCloseOpeningAttemptId(opening.attemptId)
              }
              disabled={!onCancelOpening}
            >
              {t(
                opening.status === "loading"
                  ? "common:actions.cancel"
                  : "common:actions.close",
              )}
            </Button>
            {opening.status === "failure" ? (
              <Button
                type="button"
                onClick={() => onRetryOpening?.(opening.attemptId)}
                disabled={!onRetryOpening}
              >
                {t("keyManagement:native.editor.opening.retry")}
              </Button>
            ) : null}
          </ActionGroup>
        ) : activeEditor && !activeEditor.terminalClose ? (
          <div ref={setEditorFooterHost} className="contents" />
        ) : undefined
      }
      footerTestId={KEY_MANAGEMENT_TEST_IDS.nativeEditorFooter}
      focusFallbackKey={
        activeEditor
          ? activeEditor.editorId
          : `${opening.attemptId}:${opening.status}`
      }
      terminalCloseKey={
        activeEditor?.terminalClose ||
        committedCloseEditorId === activeEditor?.editorId
          ? activeEditor?.editorId
          : committedCloseOpeningAttemptId === opening.attemptId && isOpening
            ? `opening-${opening.attemptId}`
            : null
      }
      focusWorkflowId={focusWorkflowId}
      panelTestId={KEY_MANAGEMENT_TEST_IDS.nativeEditor}
    >
      {notice && activeEditor && !activeEditor.terminalClose ? (
        <Alert compact variant="default" description={notice} />
      ) : null}
      {activeEditor && !activeEditor.terminalClose ? (
        <AccountKeyResourceEditorDialogSession
          key={activeEditor.editorId}
          editor={activeEditor}
          onSubmit={onSubmit}
          onValuesChange={onValuesChange}
          onLoadOptions={onLoadOptions}
          onRequestCloseRef={editorCloseRequestRef}
          onCommitClose={(editorId) => setCommittedCloseEditorId(editorId)}
          footerHost={editorFooterHost}
        />
      ) : activeOpening ? (
        <AccountKeyResourceEditorOpeningContent opening={activeOpening} />
      ) : null}
    </Modal>
  )
}

/** Presents the state of a native editor launch without creating a second modal. */
function AccountKeyResourceEditorOpeningContent({
  opening,
}: {
  opening: Exclude<AccountKeyResourceEditorOpeningState, { status: "idle" }>
}) {
  const { t } = useTranslation()
  if (opening.status === "loading") {
    return (
      <NativeResourceEditorLoadingSkeleton
        accessibleLabel={t("keyManagement:native.editor.opening.loading")}
        testId={KEY_MANAGEMENT_TEST_IDS.nativeEditorLoading}
      />
    )
  }

  return (
    <Alert
      variant="destructive"
      compact
      role="alert"
      aria-live="polite"
      aria-atomic="true"
      title={t("keyManagement:native.editor.opening.failed")}
      description={feedbackDescription(opening.failure, t)}
    />
  )
}

type AccountKeyResourceEditorDialogSessionProps = Pick<
  AccountKeyResourceEditorDialogProps,
  "onSubmit" | "onValuesChange" | "onLoadOptions"
> & {
  editor: AccountKeyResourceEditorDialogState
  onRequestCloseRef: { current: (() => void) | null }
  onCommitClose: (editorId: number) => void
  footerHost: HTMLDivElement | null
}

/** Owns local UI state for one immutable editor session. */
function AccountKeyResourceEditorDialogSession({
  editor,
  onSubmit,
  onValuesChange,
  onLoadOptions,
  onRequestCloseRef,
  onCommitClose,
  footerHost,
}: AccountKeyResourceEditorDialogSessionProps) {
  const { t, i18n } = useTranslation()
  const presentation = getNativeKeyResourceEditorPresentation(
    editor.siteType,
    editor.mode,
  )
  const [values, setValues] = useState<EditableResourceProjection>(() =>
    toEditorValues(editor.values, editor.fields),
  )
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(
    presentation.collapsibleSection?.initiallyOpen(editor.values) ?? false,
  )
  const submittingRef = useRef(false)
  const initialValuesRef = useRef<EditableResourceProjection>(
    toEditorValues(editor.initialValues, editor.fields),
  )
  const valuesRef = useRef(values)
  const loadedOptionSignaturesRef = useRef(new Map<string, string>())

  useEffect(() => {
    const controllerValues = toEditorValues(editor.values, editor.fields)
    if (!isSameProjection(valuesRef.current, controllerValues)) {
      valuesRef.current = controllerValues
      setValues(controllerValues)
    }
  }, [editor.fields, editor.values])

  const dynamicOptionFields = useMemo(
    () => editor.fields.filter(isDynamicOptionField),
    [editor.fields],
  )
  const automaticDynamicOptionFields = useMemo(
    () =>
      dynamicOptionFields.filter(
        (descriptor) =>
          descriptor.optionLoader?.trigger !==
          RESOURCE_FIELD_OPTION_LOAD_TRIGGERS.Manual,
      ),
    [dynamicOptionFields],
  )

  useEffect(() => {
    if (!onLoadOptions) return
    for (const candidate of automaticDynamicOptionFields) {
      const signature = (candidate.optionLoader?.dependsOn ?? [])
        .map((fieldId) => JSON.stringify(values[fieldId]))
        .join("|")
      if (
        loadedOptionSignaturesRef.current.get(candidate.fieldId) === signature
      )
        continue
      loadedOptionSignaturesRef.current.set(candidate.fieldId, signature)
      onLoadOptions(editor.editorId, candidate.fieldId, values)
    }
  }, [automaticDynamicOptionFields, editor.editorId, onLoadOptions, values])

  const controlledOptionStates:
    | Readonly<Record<string, ResourceEditorControlledOptionState>>
    | undefined = onLoadOptions
    ? Object.fromEntries(
        dynamicOptionFields.map(
          (descriptor): [string, ResourceEditorControlledOptionState] => {
            const options = editor.optionsByField?.[descriptor.fieldId]
            const failure = editor.optionFailuresByField?.[descriptor.fieldId]
            const isLoading = editor.loadingFieldIds?.includes(
              descriptor.fieldId,
            )
            const isManual =
              descriptor.optionLoader?.trigger ===
              RESOURCE_FIELD_OPTION_LOAD_TRIGGERS.Manual
            const feedback = presentation.getOptionFeedback?.(
              descriptor,
              options,
              failure,
              t,
            )
            const ignoreFailure = feedback?.ignoreFailure === true
            return [
              descriptor.fieldId,
              {
                status: isLoading
                  ? "loading"
                  : failure
                    ? ignoreFailure
                      ? "ready"
                      : "error"
                    : options || isManual
                      ? "ready"
                      : "loading",
                options: options ?? [],
                ...(failure && !ignoreFailure
                  ? { errorMessage: feedbackDescription(failure, t) }
                  : {}),
                ...(feedback?.emptyMessage
                  ? { emptyMessage: feedback.emptyMessage }
                  : {}),
              },
            ]
          },
        ),
      )
    : undefined
  const hasUnresolvedDependentOptions = dynamicOptionFields.some(
    (descriptor) => {
      const state = controlledOptionStates?.[descriptor.fieldId]
      if (!state || state.status === "ready") return false
      const value = values[descriptor.fieldId]
      const hasSelectedValue = Array.isArray(value)
        ? value.length > 0
        : value !== null && value !== undefined && value !== ""
      if (presentation.requireFreshOptions)
        return descriptor.required || hasSelectedValue
      const isUnchanged =
        JSON.stringify(value) ===
        JSON.stringify(initialValuesRef.current[descriptor.fieldId])
      return (
        (descriptor.required && !hasSelectedValue) ||
        (hasSelectedValue && !isUnchanged)
      )
    },
  )

  const updateValues = (fieldId: string, value: ResourceFieldValue) => {
    const next = { ...valuesRef.current, [fieldId]: value }
    for (const candidate of dynamicOptionFields) {
      if (
        candidate.optionLoader?.trigger !==
          RESOURCE_FIELD_OPTION_LOAD_TRIGGERS.Manual &&
        candidate.optionLoader?.dependsOn.includes(fieldId)
      ) {
        next[candidate.fieldId] = candidate.nullable ? null : ""
      }
    }
    const previousAutoName = presentation.getAutomaticName?.(
      valuesRef.current,
      editor.optionsByField,
    )
    const nextAutoName = presentation.getAutomaticName?.(
      next,
      editor.optionsByField,
    )
    if (
      previousAutoName !== undefined &&
      next.name === previousAutoName &&
      nextAutoName !== undefined
    ) {
      next.name = nextAutoName
    }
    valuesRef.current = next
    setValues(next)
    onValuesChange(editor.editorId, next)
  }
  const close = () => {
    onCommitClose(editor.editorId)
  }
  const requestClose = () => {
    if (isSubmitting) return
    if (!isSameProjection(values, initialValuesRef.current)) {
      setConfirmDiscard(true)
      return
    }
    close()
  }
  onRequestCloseRef.current = requestClose
  const submit = async () => {
    if (submittingRef.current || hasUnresolvedDependentOptions) return
    submittingRef.current = true
    setIsSubmitting(true)
    try {
      const submitValues = { ...values }
      // datetime-local shows minutes. Preserve the original seconds when that
      // visible field was not edited instead of truncating an upstream expiry.
      for (const descriptor of editor.fields) {
        if (
          descriptor.type === RESOURCE_FIELD_TYPES.DateTime &&
          values[descriptor.fieldId] ===
            initialValuesRef.current[descriptor.fieldId]
        )
          submitValues[descriptor.fieldId] =
            editor.initialValues[descriptor.fieldId]
      }
      await onSubmit(editor.editorId, submitValues)
    } finally {
      submittingRef.current = false
      setIsSubmitting(false)
    }
  }

  const fieldIssues = editor.feedback?.fieldIssues
  return (
    <>
      {/* Keep the keyed session state local while using Modal's fixed footer. */}
      {footerHost
        ? createPortal(
            <ActionGroup>
              <Button
                type="button"
                variant="outline"
                disabled={isSubmitting}
                onClick={requestClose}
              >
                {t("keyManagement:native.editor.actions.cancel")}
              </Button>
              <Button
                type="button"
                loading={isSubmitting}
                disabled={hasUnresolvedDependentOptions}
                onClick={() => void submit()}
                data-testid={KEY_MANAGEMENT_TEST_IDS.nativeEditorSubmitButton}
              >
                {t("keyManagement:native.editor.actions.save")}
              </Button>
            </ActionGroup>,
            footerHost,
          )
        : null}
      {presentation.summary ? (
        <Alert
          variant="default"
          compact
          role="status"
          aria-live="polite"
          aria-atomic="true"
          title={presentation.summary.title(t)}
          description={presentation.summary.describe(values, t, i18n.language)}
        />
      ) : null}
      {editor.feedback && !fieldIssues?.length ? (
        <Alert
          variant="destructive"
          compact
          title={t("keyManagement:native.editor.feedback.title")}
          description={feedbackDescription(editor.feedback, t)}
        />
      ) : null}
      <ConfirmDialog
        isOpen={confirmDiscard}
        intent="destructive"
        onClose={() => setConfirmDiscard(false)}
        title={t("keyManagement:native.editor.unsaved.title")}
        description={t("keyManagement:native.editor.unsaved.description")}
        cancelLabel={t("keyManagement:native.editor.unsaved.keepEditing")}
        confirmLabel={t("keyManagement:native.editor.unsaved.discard")}
        onConfirm={close}
      />
      <NativeResourceEditorBody
        t={t}
        descriptors={editor.fields}
        policy={presentation.policy}
        sectionOrder={presentation.sectionOrder}
        sectionLabelResolvers={presentation.sectionLabelResolvers}
        values={values}
        fieldIssues={fieldIssues}
        disabled={isSubmitting}
        onValueChange={updateValues}
        controlledOptionStates={controlledOptionStates}
        onRetryControlledOptions={(fieldId) =>
          onLoadOptions?.(editor.editorId, fieldId, values)
        }
        renderSectionOverride={(section, label, children) =>
          section === presentation.collapsibleSection?.id ? (
            <details
              className="space-y-density-4"
              open={isAdvancedOpen}
              onToggle={(event) => setIsAdvancedOpen(event.currentTarget.open)}
              aria-label={label}
              role="group"
            >
              <summary className="text-foreground cursor-pointer text-sm font-semibold">
                {label}
              </summary>
              <div className="pt-density-2">{children}</div>
            </details>
          ) : undefined
        }
      />
    </>
  )
}
