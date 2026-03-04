import { useTranslation } from "react-i18next"

import iconImage from "~/assets/icon.png"
import { Body, Card, CardContent, Heading2 } from "~/components/ui"

export interface PluginIntroCardProps {
  version: string
}

const PluginIntroCard = ({ version }: PluginIntroCardProps) => {
  const { t } = useTranslation("about")
  return (
    <Card
      padding="md"
      variant="default"
      className="border-blue-200 bg-linear-to-r from-blue-50 to-indigo-50 dark:border-blue-800 dark:from-blue-900/30 dark:to-indigo-900/30"
    >
      <CardContent padding={"none"}>
        <div className="flex items-start space-x-4">
          <img
            src={iconImage}
            alt={t("ui:app.name")}
            className="h-16 w-16 shrink-0 rounded-lg shadow-sm"
          />
          <div className="flex-1">
            <Heading2 className="mb-2">{t("ui:app.name")}</Heading2>
            <Body className="dark:text-dark-text-secondary mb-4 text-gray-600">
              {t("intro")}
            </Body>
            <div className="text-sm">
              <div>
                <span className="dark:text-dark-text-secondary text-gray-500">
                  {t("version")}
                </span>
                <span className="dark:text-dark-text-primary ml-2 font-medium text-gray-900">
                  v{version}
                </span>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export default PluginIntroCard
