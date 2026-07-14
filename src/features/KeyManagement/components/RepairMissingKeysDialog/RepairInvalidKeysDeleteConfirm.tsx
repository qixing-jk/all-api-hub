import type { TFunction } from "i18next"
import { useMemo } from "react"

import { DestructiveConfirmDialog } from "~/components/ui"
import type { AccountKeyRepairInvalidToken } from "~/types/accountKeyAutoProvisioning"

import { getInvalidTokenKey } from "./repairMissingKeysDialogHelpers"

interface RepairInvalidKeysDeleteConfirmProps {
  isOpen: boolean
  isWorking: boolean
  selectedInvalidTokens: AccountKeyRepairInvalidToken[]
  onClose: () => void
  onConfirm: () => void
  t: TFunction
}

/**
 * Shows the destructive confirmation dialog for selected invalid keys.
 */
export function RepairInvalidKeysDeleteConfirm({
  isOpen,
  isWorking,
  selectedInvalidTokens,
  onClose,
  onConfirm,
  t,
}: RepairInvalidKeysDeleteConfirmProps) {
  const details = useMemo(() => {
    const previewTokens = selectedInvalidTokens.slice(0, 5)
    const hiddenCount = selectedInvalidTokens.length - previewTokens.length

    return (
      <div className="dark:border-dark-bg-tertiary dark:bg-dark-bg-tertiary/40 rounded-md border border-gray-200 bg-gray-50 p-3">
        <ul className="space-y-2 text-sm">
          {previewTokens.map((token) => (
            <li
              key={getInvalidTokenKey(token)}
              className="min-w-0 text-gray-700 dark:text-gray-300"
            >
              <span className="font-medium">{token.tokenName}</span>
              <span className="dark:text-dark-text-secondary text-gray-500">
                {" "}
                · {token.accountName}
              </span>
            </li>
          ))}
        </ul>
        {hiddenCount > 0 ? (
          <p className="dark:text-dark-text-secondary mt-2 text-xs text-gray-500">
            {t("keyManagement:repairMissingKeys.deleteConfirm.more", {
              count: hiddenCount,
            })}
          </p>
        ) : null}
      </div>
    )
  }, [selectedInvalidTokens, t])

  return (
    <DestructiveConfirmDialog
      isOpen={isOpen}
      onClose={onClose}
      onConfirm={onConfirm}
      title={t("keyManagement:repairMissingKeys.deleteConfirm.title", {
        count: selectedInvalidTokens.length,
      })}
      description={t(
        "keyManagement:repairMissingKeys.deleteConfirm.description",
      )}
      confirmLabel={t("keyManagement:repairMissingKeys.deleteConfirm.confirm")}
      workingLabel={t("common:status.deleting")}
      cancelLabel={t("common:actions.cancel")}
      details={details}
      isWorking={isWorking}
      size="md"
      confirmButtonTestId="repair-invalid-keys-confirm-delete"
    />
  )
}
