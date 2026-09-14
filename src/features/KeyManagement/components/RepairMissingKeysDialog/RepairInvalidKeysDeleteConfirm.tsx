import type { TFunction } from "i18next"
import { useMemo } from "react"

import { ConfirmDialog } from "~/components/ui"
import { KEY_MANAGEMENT_TEST_IDS } from "~/features/KeyManagement/testIds"
import type { AccountKeyRepairInvalidResource } from "~/types/accountKeyAutoProvisioning"

import { LinkedChannelCleanupOption } from "../LinkedChannelCleanup"
import { getInvalidResourceKey } from "./repairMissingKeysDialogHelpers"

interface RepairInvalidKeysDeleteConfirmProps {
  cleanupLinkedChannels: boolean
  setCleanupLinkedChannels: (checked: boolean) => void
  isOpen: boolean
  isWorking: boolean
  selectedInvalidResources: AccountKeyRepairInvalidResource[]
  onClose: () => void
  onConfirm: () => void
  t: TFunction
}

/** Shows the destructive confirmation dialog for selected invalid resources. */
export function RepairInvalidKeysDeleteConfirm({
  cleanupLinkedChannels,
  setCleanupLinkedChannels,
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
      <div className="dark:bg-secondary/40 border-border bg-surface-subtle rounded-md border p-3">
        <ul className="space-y-2 text-sm">
          {previewResources.map((resource) => (
            <li
              key={getInvalidResourceKey(resource)}
              className="text-secondary-foreground min-w-0"
            >
              <span className="font-medium">
                {resource.displayLabel?.trim() ||
                  t("keyManagement:repairMissingKeys.invalidKeys.unnamed")}
              </span>
              <span className="dark:text-secondary-foreground text-muted-foreground">
                {" "}
                · {resource.accountName}
                {resource.groupLabel ? ` · ${resource.groupLabel}` : ""}
              </span>
            </li>
          ))}
        </ul>
        {hiddenCount > 0 ? (
          <p className="dark:text-secondary-foreground text-muted-foreground mt-2 text-xs">
            {t("keyManagement:repairMissingKeys.deleteConfirm.more", {
              count: hiddenCount,
            })}
          </p>
        ) : null}
      </div>
    )
  }, [selectedInvalidResources, t])

  return (
    <ConfirmDialog
      intent="destructive"
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
      details={
        <div className="space-y-3">
          {details}
          <LinkedChannelCleanupOption
            checked={cleanupLinkedChannels}
            onCheckedChange={setCleanupLinkedChannels}
            disabled={isWorking}
          />
        </div>
      }
      isWorking={isWorking}
      size="md"
      confirmButtonTestId={
        KEY_MANAGEMENT_TEST_IDS.repairInvalidKeysConfirmDeleteButton
      }
    />
  )
}
