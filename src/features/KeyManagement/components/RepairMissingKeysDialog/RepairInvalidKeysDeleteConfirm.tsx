import type { TFunction } from "i18next"
import { useMemo } from "react"

import { DestructiveConfirmDialog } from "~/components/ui"
import { KEY_MANAGEMENT_TEST_IDS } from "~/features/KeyManagement/testIds"
import type { AccountKeyRepairInvalidResource } from "~/types/accountKeyAutoProvisioning"

import { getInvalidResourceKey } from "./repairMissingKeysDialogHelpers"

interface RepairInvalidKeysDeleteConfirmProps {
  isOpen: boolean
  isWorking: boolean
  selectedInvalidResources: AccountKeyRepairInvalidResource[]
  onClose: () => void
  onConfirm: () => void
  t: TFunction
}

/** Shows the destructive confirmation dialog for selected invalid resources. */
export function RepairInvalidKeysDeleteConfirm({
  isOpen,
  isWorking,
  selectedInvalidResources,
  onClose,
  onConfirm,
  t,
}: RepairInvalidKeysDeleteConfirmProps) {
  const details = useMemo(() => {
    const previewResources = selectedInvalidResources.slice(0, 5)
    const hiddenCount =
      selectedInvalidResources.length - previewResources.length

    return (
      <div className="dark:border-dark-bg-tertiary dark:bg-dark-bg-tertiary/40 rounded-md border border-gray-200 bg-gray-50 p-3">
        <ul className="space-y-2 text-sm">
          {previewResources.map((resource) => (
            <li
              key={getInvalidResourceKey(resource)}
              className="min-w-0 text-gray-700 dark:text-gray-300"
            >
              <span className="font-medium">
                {resource.displayLabel?.trim() ||
                  t("keyManagement:repairMissingKeys.invalidKeys.unnamed")}
              </span>
              <span className="dark:text-dark-text-secondary text-gray-500">
                {" "}
                · {resource.accountName}
                {resource.groupLabel ? ` · ${resource.groupLabel}` : ""}
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
  }, [selectedInvalidResources, t])

  return (
    <DestructiveConfirmDialog
      isOpen={isOpen}
      onClose={onClose}
      onConfirm={onConfirm}
      title={t("keyManagement:repairMissingKeys.deleteConfirm.title", {
        count: selectedInvalidResources.length,
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
      confirmButtonTestId={
        KEY_MANAGEMENT_TEST_IDS.repairInvalidKeysConfirmDeleteButton
      }
    />
  )
}
