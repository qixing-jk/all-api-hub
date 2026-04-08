import { UsersIcon } from "@heroicons/react/24/outline"
import { useTranslation } from "react-i18next"

import { WorkflowTransitionIcon } from "~/components/icons/WorkflowTransitionIcon"
import { Button, Card, CardContent, Heading4 } from "~/components/ui"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { pushWithinOptionsPage } from "~/utils/navigation"

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
    <div className="space-y-6">
      <section id="account-management">
        <Heading4 className="mb-2 flex items-center gap-2">
          <UsersIcon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          <span>{t("accountManagement.title")}</span>
        </Heading4>
        <Card>
          <CardContent className="space-y-4">
            <p className="text-sm text-gray-700 dark:text-gray-300">
              {t("accountManagement.description")}
            </p>
            <Button
              onClick={handleNavigate}
              variant="default"
              className="flex items-center gap-2 self-start"
              leftIcon={<UsersIcon className="h-5 w-5" />}
              rightIcon={<WorkflowTransitionIcon className="h-4 w-4" />}
            >
              <span>{t("accountManagement.openPage")}</span>
            </Button>
          </CardContent>
        </Card>
      </section>

      <AutoProvisionKeyOnAccountAddSettings />
      <DuplicateAccountWarningOnAddSettings />

      <section id="sorting-priority">
        <SortingPrioritySettings />
      </section>
    </div>
  )
}
