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
import { getDocsGetStartedUrl, getDocsHomepageUrl } from "~/utils/docsLinks"
import { getRepository } from "~/utils/packageMeta"

const GITHUB_REPO_URL = getRepository()

export const NewcomerSupportCard = () => {
  const { t, i18n } = useTranslation("account")

  const docsHomepageUrl = getDocsHomepageUrl(i18n.language)
  const getStartedUrl = getDocsGetStartedUrl(i18n.language)

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
      <CardContent
        padding="sm"
        spacing="sm"
        className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            onClick={handleOpenRepo}
            leftIcon={<Star className="h-4 w-4" />}
          >
            {t("newcomerSupport.actions.star")}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={handleOpenDocs}
            leftIcon={<BookOpen className="h-4 w-4" />}
          >
            {t("newcomerSupport.actions.docs")}
          </Button>
          <Button size="sm" variant="outline" onClick={handleOpenAbout}>
            {t("newcomerSupport.actions.about")}
          </Button>
        </div>
        <p className="dark:text-dark-text-tertiary text-[11px] text-gray-500">
          {t("newcomerSupport.hint")}
        </p>
      </CardContent>
    </Card>
  )
}
