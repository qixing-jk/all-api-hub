import type { TFunction } from "i18next"
import { Info } from "lucide-react"

import Tooltip from "~/components/Tooltip"
import { Checkbox, Label } from "~/components/ui"

interface RepairRenameOptionProps {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  t: TFunction
}

/**
 * Controls whether auto-created template tokens are renamed during repair.
 */
export function RepairRenameOption({
  checked,
  onCheckedChange,
  t,
}: RepairRenameOptionProps) {
  return (
    <div className="dark:border-dark-bg-tertiary dark:bg-dark-bg-primary/40 rounded-lg border border-gray-200 bg-gray-50/70 p-3">
      <div className="flex items-start gap-3">
        <Checkbox
          id="repair-missing-keys-rename-auto-template"
          checked={checked}
          onCheckedChange={(nextChecked) =>
            onCheckedChange(nextChecked === true)
          }
        />
        <div className="min-w-0 space-y-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <Label
              htmlFor="repair-missing-keys-rename-auto-template"
              className="cursor-pointer text-sm font-medium text-gray-800 dark:text-gray-200"
            >
              {t("keyManagement:repairMissingKeys.renameOption.label")}
            </Label>
            <Tooltip
              content={t(
                "keyManagement:repairMissingKeys.renameOption.tooltip",
              )}
              position="top"
              className="max-w-xs"
            >
              <button
                type="button"
                className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-gray-400 transition-colors hover:text-gray-600 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none dark:text-gray-500 dark:hover:text-gray-300"
                aria-label={t(
                  "keyManagement:repairMissingKeys.renameOption.infoLabel",
                )}
              >
                <Info className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </Tooltip>
          </div>
          <p className="text-xs leading-5 text-gray-500 dark:text-gray-400">
            {t("keyManagement:repairMissingKeys.renameOption.helper")}
          </p>
        </div>
      </div>
    </div>
  )
}
