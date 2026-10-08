import { useEffect, useRef, useState } from "react"
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
  ACCOUNT_KEY_RESOURCE_EDITOR_MODES as editorModes,
  type AccountKeyResourceEditorMode,
} from "~/features/KeyManagement/constants"
import {
  NativeResourceEditorBody,
  NativeResourceEditorLoadingSkeleton,
  useNativeResourceEditorLoadingVisibility,
} from "~/features/ResourceEditor"
import type { NativeResourceEditorOpeningState } from "~/features/ResourceEditor/nativeResourceEditorOpeningState"
import type {
  EditableResourceProjection,
  ResourceFailure,
  ResourceFieldDescriptor,
} from "~/services/apiAdapters/contracts/accountKeyResource"

import { KEY_MANAGEMENT_TEST_IDS } from "../../testIds"
import { feedbackDescription } from "./accountKeyResourceEditorFeedback"
import { useAccountKeyResourceEditorDraft } from "./useAccountKeyResourceEditorDraft"

export type AccountKeyResourceEditorDialogState = {
  /** Stable for the dialog session; changes only when opening a different editor. */
  editorId: number
  siteType: string
  mode: AccountKeyResourceEditorMode
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
    editorMode === editorModes.Create
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
  const {
    presentation,
    values,
    isSubmitting,
    confirmDiscard,
    setConfirmDiscard,
    isAdvancedOpen,
    setIsAdvancedOpen,
    controlledOptionStates,
    hasUnresolvedDependentOptions,
    updateValues,
    close,
    requestClose,
    submit,
  } = useAccountKeyResourceEditorDraft({
    editor,
    onSubmit,
    onValuesChange,
    onLoadOptions,
    onCommitClose,
  })
  onRequestCloseRef.current = requestClose
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
