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
      className="border-theme-200 from-theme-50 dark:border-theme-800 dark:from-theme-900/30 to-card bg-linear-to-r"
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
            <Body className="dark:text-secondary-foreground text-muted-foreground mb-4">
              {t("intro")}
            </Body>
            <div className="text-sm">
              <div>
                <span className="dark:text-secondary-foreground text-muted-foreground">
                  {t("version")}
                </span>
                <span className="text-foreground ml-2 font-medium">
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
