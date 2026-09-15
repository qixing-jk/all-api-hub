import { Users } from "lucide-react"
import { useTranslation } from "react-i18next"

import {
  Card,
  CardContent,
  Heading4,
  WorkflowTransitionButton,
} from "~/components/ui"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { pushWithinOptionsPage } from "~/utils/navigation"

import AutoFillCurrentSiteUrlOnAccountAddSettings from "./AutoFillCurrentSiteUrlOnAccountAddSettings"
import AutoProvisionKeyOnAccountAddSettings from "./AutoProvisionKeyOnAccountAddSettings"
import DuplicateAccountWarningOnAddSettings from "./DuplicateAccountWarningOnAddSettings"
import SortingPrioritySettings from "./SortingPrioritySettings"

/**
 * Basic Settings tab section for account management and sorting priorities.
 * Provides link to full Account page and embeds SortingPrioritySettings.
 */
export default function AccountManagementTab() {
  const { t } = useTranslation("settings")

  const handleNavigate = () => {
    pushWithinOptionsPage(`#${MENU_ITEM_IDS.ACCOUNT}`)
  }

  return (
    <div className="space-y-density-6">
      <section id="account-management">
        <Heading4 className="mb-density-2 gap-y-density-2 flex items-center gap-x-2">
          <Users className="text-theme-600 dark:text-theme-400 h-5 w-5" />
          <span>{t("accountManagement.title")}</span>
        </Heading4>
        <Card>
          <CardContent className="space-y-density-4">
            <p className="text-secondary-foreground text-sm">
              {t("accountManagement.description")}
            </p>
            <WorkflowTransitionButton
              onClick={handleNavigate}
              variant="default"
              className="gap-y-density-2 flex items-center gap-x-2 self-start"
              leftIcon={<Users className="h-5 w-5" />}
            >
              <span>{t("accountManagement.openPage")}</span>
            </WorkflowTransitionButton>
          </CardContent>
        </Card>
      </section>

      <AutoProvisionKeyOnAccountAddSettings />
      <AutoFillCurrentSiteUrlOnAccountAddSettings />
      <DuplicateAccountWarningOnAddSettings />

      <SortingPrioritySettings />
    </div>
  )
}
