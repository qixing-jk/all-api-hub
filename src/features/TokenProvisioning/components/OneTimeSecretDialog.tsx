import { CheckIcon, ClipboardDocumentIcon } from "@heroicons/react/24/outline"
import { useCallback, useId, useLayoutEffect, useRef, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

import {
  Alert,
  Button,
  DestructiveConfirmDialog,
  Input,
  Modal,
} from "~/components/ui"
import { TOKEN_PROVISIONING_TEST_IDS } from "~/features/TokenProvisioning/testIds"

export interface OneTimeSecretPresentation {
  displayName: string
  secret: string
}

interface OneTimeSecretDialogProps {
  isOpen: boolean
  result: OneTimeSecretPresentation | null
  onClose: () => void
  autoCopy?: boolean
  saveAction?: { onSave: () => Promise<void>; label?: string }
  onCopyResult?: (result: "success" | "failure") => void
  onSaveResult?: (result: "success" | "failure") => void
  /** Optional explicit workflow key for preserving the opener across a terminal predecessor. */
  focusWorkflowId?: string | number
}

type OperationResult = "success" | "failure"

const notifyOperationResult = (
  observer: ((result: OperationResult) => void) | undefined,
  result: OperationResult,
) => {
  try {
    observer?.(result)
  } catch {
    // Observers must not alter the completed copy or save operation.
  }
}

/** Presents a create-response-only plaintext secret until the user handles it. */
export function OneTimeSecretDialog({
  isOpen,
  result,
  onClose,
  autoCopy = true,
  saveAction,
  onCopyResult,
  onSaveResult,
  focusWorkflowId,
}: OneTimeSecretDialogProps) {
  const { t } = useTranslation(["keyManagement", "common"])
  const [copied, setCopied] = useState(false)
  const [handled, setHandled] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isCopying, setIsCopying] = useState(false)
  const [hasSaved, setHasSaved] = useState(false)
  const [isCloseConfirmOpen, setIsCloseConfirmOpen] = useState(false)
  const isSavingRef = useRef(false)
  const isCopyingRef = useRef(false)
  const hasSavedGenerationRef = useRef<number | null>(null)
  const resultGenerationRef = useRef(0)
  const operationGenerationRef = useRef(0)
  const saveInvocationRef = useRef(0)
  const copyInvocationRef = useRef(0)
  const openCycleRef = useRef(0)
  const wasOpenRef = useRef(false)
  const autoCopyAttemptRef = useRef<{
    resultGeneration: number
    openCycle: number
  } | null>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const secretInputId = useId()

  const resetLocalState = useCallback(() => {
    setCopied(false)
    setHandled(false)
    setIsSaving(false)
    setIsCopying(false)
    setIsCloseConfirmOpen(false)
    isSavingRef.current = false
    isCopyingRef.current = false
  }, [])

  const invalidateOperations = useCallback(() => {
    operationGenerationRef.current += 1
  }, [])

  useLayoutEffect(() => {
    resultGenerationRef.current += 1
    invalidateOperations()
    resetLocalState()
    hasSavedGenerationRef.current = null
    setHasSaved(false)
  }, [invalidateOperations, resetLocalState, result])

  const copySecret = useCallback(async () => {
    if (!result || isCopyingRef.current) return false

    const operationGeneration = operationGenerationRef.current
    const invocation = copyInvocationRef.current + 1
    copyInvocationRef.current = invocation
    isCopyingRef.current = true
    setIsCopying(true)
    const isCurrent = () =>
      operationGenerationRef.current === operationGeneration &&
      copyInvocationRef.current === invocation

    let outcome: OperationResult | null = null

    try {
      await navigator.clipboard.writeText(result.secret)
      if (!isCurrent()) return false

      setCopied(true)
      setHandled(true)
      toast.success(t("keyManagement:oneTimeKey.copied"))
      outcome = "success"
    } catch {
      if (!isCurrent()) return false

      toast.error(t("keyManagement:oneTimeKey.copyFailed"))
      outcome = "failure"
    } finally {
      if (isCurrent()) {
        isCopyingRef.current = false
        setIsCopying(false)
      }
    }

    if (outcome) notifyOperationResult(onCopyResult, outcome)
    return outcome === "success"
  }, [onCopyResult, result, t])

  useLayoutEffect(() => {
    if (isOpen && !wasOpenRef.current) openCycleRef.current += 1
    wasOpenRef.current = isOpen
    if (!isOpen || !result || !autoCopy) return

    const attempt = {
      resultGeneration: resultGenerationRef.current,
      openCycle: openCycleRef.current,
    }
    if (
      autoCopyAttemptRef.current?.resultGeneration ===
        attempt.resultGeneration &&
      autoCopyAttemptRef.current.openCycle === attempt.openCycle
    ) {
      return
    }

    autoCopyAttemptRef.current = attempt
    void copySecret()
  }, [autoCopy, copySecret, isOpen, result])

  const close = useCallback(() => {
    invalidateOperations()
    resetLocalState()
    onClose()
  }, [invalidateOperations, onClose, resetLocalState])

  const requestClose = () => {
    if (handled) {
      close()
      return
    }
    setIsCloseConfirmOpen(true)
  }

  const cancelCloseConfirmation = () => {
    setIsCloseConfirmOpen(false)
    requestAnimationFrame(() => closeButtonRef.current?.focus())
  }

  const handleSave = async () => {
    const resultGeneration = resultGenerationRef.current
    if (
      !saveAction ||
      isSavingRef.current ||
      hasSavedGenerationRef.current === resultGeneration
    ) {
      return
    }

    const operationGeneration = operationGenerationRef.current
    const invocation = saveInvocationRef.current + 1
    saveInvocationRef.current = invocation
    isSavingRef.current = true
    setIsSaving(true)
    const isCurrent = () =>
      operationGenerationRef.current === operationGeneration &&
      saveInvocationRef.current === invocation

    let outcome: OperationResult | null = null

    try {
      await saveAction.onSave()
      if (!isCurrent()) return

      setHandled(true)
      hasSavedGenerationRef.current = resultGeneration
      setHasSaved(true)
      outcome = "success"
    } catch {
      if (!isCurrent()) return

      outcome = "failure"
    } finally {
      if (isCurrent()) {
        isSavingRef.current = false
        setIsSaving(false)
      }
    }

    if (outcome) notifyOperationResult(onSaveResult, outcome)
  }

  return (
    <>
      <Modal
        isOpen={isOpen && !!result}
        onClose={requestClose}
        title={t("keyManagement:oneTimeKey.title")}
        closeOnBackdropClick={false}
        focusWorkflowId={focusWorkflowId}
        size="lg"
        header={
          <div className="min-w-0 pr-10">
            <h2 className="dark:text-dark-text-primary truncate text-base font-semibold text-gray-900 sm:text-lg">
              {t("keyManagement:oneTimeKey.title")}
            </h2>
            <p className="dark:text-dark-text-tertiary mt-1 text-sm text-gray-500">
              {result?.displayName
                ? t("keyManagement:oneTimeKey.subtitle", {
                    name: result.displayName,
                  })
                : t("keyManagement:oneTimeKey.subtitleUnnamed")}
            </p>
          </div>
        }
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              ref={closeButtonRef}
              type="button"
              variant="secondary"
              onClick={requestClose}
              data-testid={TOKEN_PROVISIONING_TEST_IDS.oneTimeKeyCloseButton}
            >
              {t("keyManagement:oneTimeKey.close")}
            </Button>
            {saveAction ? (
              <Button
                type="button"
                onClick={() => void handleSave()}
                loading={isSaving}
                disabled={isCopying || hasSaved}
                data-testid={TOKEN_PROVISIONING_TEST_IDS.oneTimeKeySaveButton}
              >
                {isSaving
                  ? t("common:status.saving")
                  : saveAction.label ??
                    t("keyManagement:actions.saveToApiProfiles")}
              </Button>
            ) : null}
            <Button
              type="button"
              onClick={() => void copySecret()}
              loading={isCopying}
              data-testid={TOKEN_PROVISIONING_TEST_IDS.oneTimeKeyCopyButton}
              leftIcon={
                copied ? (
                  <CheckIcon className="h-4 w-4" />
                ) : (
                  <ClipboardDocumentIcon className="h-4 w-4" />
                )
              }
            >
              {copied
                ? t("keyManagement:oneTimeKey.copiedAction")
                : t("keyManagement:oneTimeKey.copy")}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Alert
            variant="warning"
            title={t("keyManagement:oneTimeKey.warningTitle")}
            description={t("keyManagement:oneTimeKey.warningDescription")}
          />
          <div>
            <label
              htmlFor={secretInputId}
              className="dark:text-dark-text-secondary text-sm font-medium text-gray-700"
            >
              {t("keyManagement:oneTimeKey.keyLabel")}
            </label>
            <Input
              id={secretInputId}
              data-testid={TOKEN_PROVISIONING_TEST_IDS.oneTimeKeyInput}
              className="mt-2 font-mono text-xs"
              value={result?.secret ?? ""}
              readOnly
              autoFocus
              onFocus={(event) => event.currentTarget.select()}
            />
          </div>
        </div>
      </Modal>
      <DestructiveConfirmDialog
        isOpen={isCloseConfirmOpen}
        onClose={cancelCloseConfirmation}
        onConfirm={close}
        title={t("keyManagement:oneTimeKey.closeConfirm.title")}
        description={t("keyManagement:oneTimeKey.closeConfirm.description")}
        confirmLabel={t("keyManagement:oneTimeKey.closeConfirm.confirm")}
        cancelLabel={t("keyManagement:oneTimeKey.closeConfirm.cancel")}
        confirmButtonTestId={
          TOKEN_PROVISIONING_TEST_IDS.oneTimeKeyConfirmCloseButton
        }
      />
    </>
  )
}
