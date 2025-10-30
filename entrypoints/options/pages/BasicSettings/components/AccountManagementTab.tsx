import { UsersIcon } from "@heroicons/react/24/outline"
import { useTranslation } from "react-i18next"

import { Button, Card, CardContent, Heading4 } from "~/components/ui"

export default function AccountManagementTab() {
  const { t } = useTranslation("settings")

  const handleNavigate = () => {
    const url = browser.runtime.getURL("options.html#account")
    window.location.href = url
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
              className="flex items-center gap-2 self-start">
              <UsersIcon className="h-5 w-5" />
              <span>{t("accountManagement.openPage")}</span>
            </Button>
          </CardContent>
        </Card>
      </section>
    </div>
  )
}
