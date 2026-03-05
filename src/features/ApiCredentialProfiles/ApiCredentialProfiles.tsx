import { KeyRound } from "lucide-react"
import { useTranslation } from "react-i18next"

import { PageHeader } from "~/components/PageHeader"
import { Button } from "~/components/ui"

import { ApiCredentialProfilesListView } from "./components/ApiCredentialProfilesListView"
import { useApiCredentialProfilesController } from "./hooks/useApiCredentialProfilesController"

/**
 * Options page for managing API credential profiles.
 */
export default function ApiCredentialProfiles() {
  const { t } = useTranslation([
    "apiCredentialProfiles",
    "aiApiVerification",
    "common",
  ])

  const controller = useApiCredentialProfilesController()

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        icon={KeyRound}
        title={t("title")}
        description={t("description")}
        actions={
          <Button onClick={controller.openAddDialog}>
            {t("apiCredentialProfiles:actions.add")}
          </Button>
        }
      />

      <ApiCredentialProfilesListView controller={controller} />
    </div>
  )
}
