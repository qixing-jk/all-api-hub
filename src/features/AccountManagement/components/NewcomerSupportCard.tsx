import { BookOpen, Info, Star } from "lucide-react"
import { useTranslation } from "react-i18next"

import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui"
import { useDialogStateContext } from "~/features/AccountManagement/hooks/DialogStateContext"
import { SPONSOR_RECOMMENDATION_SURFACES } from "~/features/AccountManagement/sponsors/constants"
import { SponsorRecommendationsSection } from "~/features/AccountManagement/sponsors/SponsorRecommendationsSection"
import { useSponsorRecommendations } from "~/features/AccountManagement/sponsors/useSponsorRecommendations"
import {
  openApiCredentialProfilesPage,
  openFullBookmarkManagerPage,
} from "~/utils/navigation"
import {
  getDocsGetStartedUrl,
  getDocsHomepageUrl,
} from "~/utils/navigation/docsLinks"
import { getRepository } from "~/utils/navigation/packageMeta"

const GITHUB_REPO_URL = getRepository()

interface NewcomerSupportActionGroupProps {
  onOpenRepo: () => void
  onOpenDocs: () => void
  onOpenAbout: () => void
}

/** Renders the newcomer card's original action buttons and hint text. */
function NewcomerSupportActionGroup({
  onOpenRepo,
  onOpenDocs,
  onOpenAbout,
}: NewcomerSupportActionGroupProps) {
  const { t } = useTranslation("account")

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          onClick={onOpenRepo}
          leftIcon={<Star className="h-4 w-4" />}
        >
          {t("newcomerSupport.actions.star")}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={onOpenDocs}
          leftIcon={<BookOpen className="h-4 w-4" />}
        >
          {t("newcomerSupport.actions.docs")}
        </Button>
        <Button size="sm" variant="outline" onClick={onOpenAbout}>
          {t("newcomerSupport.actions.about")}
        </Button>
      </div>
      <p className="dark:text-dark-text-tertiary text-[11px] text-gray-500">
        {t("newcomerSupport.hint")}
      </p>
    </div>
  )
}

export const NewcomerSupportCard = () => {
  const { t, i18n } = useTranslation("account")
  const { openAddAccount } = useDialogStateContext()
  const sponsorRecommendations = useSponsorRecommendations({
    surface: SPONSOR_RECOMMENDATION_SURFACES.Newcomer,
  })

  const docsHomepageUrl = getDocsHomepageUrl(i18n.language)
  const getStartedUrl = getDocsGetStartedUrl(i18n.language)
  const hasSponsorRecommendations = sponsorRecommendations.items.length > 0

  const handleOpenRepo = () => {
    window.open(GITHUB_REPO_URL, "_blank", "noopener,noreferrer")
  }

  const handleOpenDocs = () => {
    window.open(getStartedUrl, "_blank", "noopener,noreferrer")
  }

  const handleOpenAbout = () => {
    window.open(docsHomepageUrl, "_blank", "noopener,noreferrer")
  }

  return (
    <Card padding="md" className="mb-2">
      <CardHeader
        bordered={false}
        padding="sm"
        className="flex flex-row items-start gap-3"
      >
        <div className="rounded-md bg-blue-50 p-1.5 text-blue-600 dark:bg-blue-900/40 dark:text-blue-300">
          <Info className="h-4 w-4" />
        </div>
        <div className="space-y-1">
          <CardTitle>{t("newcomerSupport.title")}</CardTitle>
          <CardDescription className="leading-relaxed">
            {t("newcomerSupport.description")}
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent padding="sm" spacing="sm" className="space-y-4">
        <NewcomerSupportActionGroup
          onOpenRepo={handleOpenRepo}
          onOpenDocs={handleOpenDocs}
          onOpenAbout={handleOpenAbout}
        />
        {hasSponsorRecommendations ? (
          <SponsorRecommendationsSection
            surface={SPONSOR_RECOMMENDATION_SURFACES.Newcomer}
            items={sponsorRecommendations.items}
            onContinueAddAccount={openAddAccount}
            onOpenBookmarkManager={(prefill) => {
              void openFullBookmarkManagerPage({ create: prefill })
            }}
            onOpenApiCredentialProfiles={(prefill) => {
              void openApiCredentialProfilesPage({ create: prefill })
            }}
          />
        ) : null}
      </CardContent>
    </Card>
  )
}
