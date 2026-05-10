import { CheckIcon, ClipboardDocumentIcon } from "@heroicons/react/24/outline"
import { useCallback, useEffect, useId, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

import { Alert, Button, Input, Modal } from "~/components/ui"
import type { ApiToken } from "~/types"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"

const logger = createLogger("OneTimeApiKeyDialog")

interface OneTimeApiKeyDialogProps {
  isOpen: boolean
  token: ApiToken | null
  onClose: () => void
  autoCopy?: boolean
}

/**
 * Forces users to acknowledge and copy one-time API key secrets returned only
 * during token creation, such as AIHubMix `full_key` responses.
 */
export function OneTimeApiKeyDialog({
  isOpen,
  token,
  onClose,
  autoCopy = true,
}: OneTimeApiKeyDialogProps) {
  const { t } = useTranslation("keyManagement")
  const keyInputId = useId()
  const [copied, setCopied] = useState(false)

  const copyKey = useCallback(async () => {
    if (!token?.key) return

    try {
      await navigator.clipboard.writeText(token.key)
      setCopied(true)
      toast.success(t("oneTimeKey.copied"))
    } catch (error) {
      logger.error("Failed to copy one-time API key", error)
      toast.error(getErrorMessage(error, t("oneTimeKey.copyFailed")))
    }
  }, [t, token])

  useEffect(() => {
    if (!isOpen) {
      setCopied(false)
      return
    }

    if (autoCopy && token?.key) {
      void copyKey()
    }
  }, [autoCopy, copyKey, isOpen, token?.key])

  const handleClose = () => {
    setCopied(false)
    onClose()
  }

  return (
    <Modal
      isOpen={isOpen && !!token}
      onClose={handleClose}
      closeOnBackdropClick={false}
      size="lg"
      header={
        <div className="min-w-0 pr-10">
          <h2 className="dark:text-dark-text-primary truncate text-base font-semibold text-gray-900 sm:text-lg">
            {t("oneTimeKey.title")}
          </h2>
          <p className="dark:text-dark-text-tertiary mt-1 text-sm text-gray-500">
            {token?.name
              ? t("oneTimeKey.subtitle", { name: token.name })
              : t("oneTimeKey.subtitleUnnamed")}
          </p>
        </div>
      }
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="secondary" onClick={handleClose}>
            {t("oneTimeKey.close")}
          </Button>
          <Button
            type="button"
            onClick={copyKey}
            leftIcon={
              copied ? (
                <CheckIcon className="h-4 w-4" />
              ) : (
                <ClipboardDocumentIcon className="h-4 w-4" />
              )
            }
          >
            {copied ? t("oneTimeKey.copiedAction") : t("oneTimeKey.copy")}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Alert
          variant="warning"
          title={t("oneTimeKey.warningTitle")}
          description={t("oneTimeKey.warningDescription")}
        />

        <div>
          <label
            htmlFor={keyInputId}
            className="dark:text-dark-text-secondary text-sm font-medium text-gray-700"
          >
            {t("oneTimeKey.keyLabel")}
          </label>
          <Input
            id={keyInputId}
            className="mt-2 font-mono text-xs"
            value={token?.key ?? ""}
            readOnly
            autoFocus
            onFocus={(event) => event.currentTarget.select()}
          />
        </div>
      </div>
    </Modal>
  )
}
