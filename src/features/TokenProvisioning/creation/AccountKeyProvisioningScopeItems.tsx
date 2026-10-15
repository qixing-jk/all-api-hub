import { KeyRound, Layers } from "lucide-react"
import { useTranslation } from "react-i18next"

import type { MenuAction } from "~/components/ActionMenu"
import {
  DropdownMenuItem,
  DropdownMenuLabel,
} from "~/components/ui/dropdown-menu"
import type { AccountKeyAutoProvisionMode } from "~/types/accountKeyAutoProvisioning"

/** Shared labels, icons and callbacks for both saved-account completion entry points. */
export function useAccountKeyProvisioningActions(
  onSelect?: (mode: AccountKeyAutoProvisionMode) => void,
  disabled = false,
): MenuAction[] {
  const { t } = useTranslation("keyManagement")
  return onSelect
    ? [
        {
          id: "default",
          label: t("keyManagement:provisioning.actions.default"),
          icon: KeyRound,
          disabled,
          onSelect: () => onSelect("default"),
        },
        {
          id: "all-groups",
          label: t("keyManagement:provisioning.actions.allGroups"),
          icon: Layers,
          disabled,
          onSelect: () => onSelect("all-groups"),
        },
      ]
    : []
}

/** Both saved-account entry points expose the same completion scopes and promise. */
export function AccountKeyProvisioningScopeItems({
  onSelect,
  disabled = false,
}: {
  onSelect: (mode: AccountKeyAutoProvisionMode) => void
  disabled?: boolean
}) {
  const { t } = useTranslation("keyManagement")
  const actions = useAccountKeyProvisioningActions(onSelect, disabled)
  return (
    <>
      <DropdownMenuLabel className="text-muted-foreground max-w-64 text-xs font-normal whitespace-normal">
        {t("keyManagement:provisioning.actions.hint")}
      </DropdownMenuLabel>
      {actions.map(
        ({ id, label, icon: Icon, disabled: isDisabled, onSelect: select }) => (
          <DropdownMenuItem
            key={id}
            disabled={isDisabled}
            onClick={(event) => event.stopPropagation()}
            onSelect={select}
          >
            <Icon className="h-4 w-4" aria-hidden />
            {label}
          </DropdownMenuItem>
        ),
      )}
    </>
  )
}
