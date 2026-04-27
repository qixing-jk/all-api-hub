import type { ReactNode } from "react"
import { useMemo } from "react"
import { useTranslation } from "react-i18next"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui"
import {
  AXON_HUB,
  CLAUDE_CODE_HUB,
  DONE_HUB,
  NEW_API,
  OCTOPUS,
  VELOERA,
  type ManagedSiteType,
} from "~/constants/siteType"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { cn } from "~/lib/utils"
import {
  getManagedSiteAdminConfigForType,
  getManagedSiteLabel,
} from "~/services/managedSites/utils/managedSite"
import { showUpdateToast } from "~/utils/core/toastHelpers"

const MANAGED_SITE_TYPES: ManagedSiteType[] = [
  NEW_API,
  DONE_HUB,
  VELOERA,
  OCTOPUS,
  AXON_HUB,
  CLAUDE_CODE_HUB,
]

interface ManagedSiteTypeSwitcherProps {
  ariaLabel?: string
  configuredOnly?: boolean
  hideWhenSingleOption?: boolean
  label?: ReactNode
  labelClassName?: string
  size?: "sm" | "default"
  triggerClassName?: string
  wrapperClassName?: string
}

/**
 * Shared managed-site switcher that can be reused in settings, popup, and
 * managed-site pages without duplicating update and filtering logic.
 */
export default function ManagedSiteTypeSwitcher({
  ariaLabel,
  configuredOnly = false,
  hideWhenSingleOption = false,
  label,
  labelClassName,
  size = "default",
  triggerClassName,
  wrapperClassName,
}: ManagedSiteTypeSwitcherProps) {
  const { t } = useTranslation("settings")
  const { managedSiteType, preferences, updateManagedSiteType } =
    useUserPreferencesContext()

  const options = useMemo(() => {
    const allOptions = MANAGED_SITE_TYPES.map((siteType) => ({
      siteType,
      isConfigured: Boolean(
        preferences && getManagedSiteAdminConfigForType(preferences, siteType),
      ),
    }))

    if (!configuredOnly) {
      return allOptions
    }

    const configuredOptions = allOptions.filter(
      ({ isConfigured, siteType }) =>
        isConfigured || siteType === managedSiteType,
    )

    return configuredOptions.length ? configuredOptions : allOptions
  }, [configuredOnly, managedSiteType, preferences])

  if (hideWhenSingleOption && options.length < 2) {
    return null
  }

  const handleManagedSiteTypeChange = async (value: string) => {
    const siteType = value as ManagedSiteType
    if (siteType === managedSiteType) return

    const success = await updateManagedSiteType(siteType)
    showUpdateToast(success, t("managedSite.siteTypeLabel"))
  }

  return (
    <div className={wrapperClassName}>
      {label ? (
        <div
          className={cn(
            "mb-1 text-xs font-medium text-gray-500 dark:text-gray-400",
            labelClassName,
          )}
        >
          {label}
        </div>
      ) : null}

      <Select
        value={managedSiteType}
        onValueChange={handleManagedSiteTypeChange}
        disabled={options.length < 2}
      >
        <SelectTrigger
          className={cn("w-full", triggerClassName)}
          size={size}
          aria-label={ariaLabel ?? t("managedSite.siteTypeLabel")}
        >
          <SelectValue placeholder={t("managedSite.siteTypeLabel")} />
        </SelectTrigger>
        <SelectContent>
          {options.map(({ siteType }) => (
            <SelectItem key={siteType} value={siteType}>
              {getManagedSiteLabel(t, siteType)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
