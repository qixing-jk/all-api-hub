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
    <div className="dark:bg-background/40 border-border bg-surface-subtle/70 rounded-lg border p-3">
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
              className="text-secondary-foreground cursor-pointer text-sm font-medium"
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
                className="text-faint-foreground hover:text-muted-foreground focus-visible:ring-ring dark:hover:text-secondary-foreground inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full transition-colors focus-visible:ring-2 focus-visible:outline-none"
                aria-label={t(
                  "keyManagement:repairMissingKeys.renameOption.infoLabel",
                )}
              >
                <Info className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </Tooltip>
          </div>
          <p className="text-muted-foreground text-xs leading-5">
            {t("keyManagement:repairMissingKeys.renameOption.helper")}
          </p>
        </div>
      </div>
    </div>
  )
}
