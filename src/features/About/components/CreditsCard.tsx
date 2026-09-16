import { Heart } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Badge, BodySmall, Card, CardContent, Heading6 } from "~/components/ui"

const CreditsCard = () => {
  const { t } = useTranslation("about")
  return (
    <Card>
      <CardContent>
        <div className="flex items-start space-x-4">
          <Heart className="text-primary mt-density-1 h-6 w-6 shrink-0" />
          <div className="flex-1">
            <Heading6 className="mb-density-2">{t("devMaintenance")}</Heading6>
            <BodySmall className="dark:text-secondary-foreground text-muted-foreground mb-density-4">
              {t("thanksDesc")}
            </BodySmall>
            <div className="gap-y-density-2 flex flex-wrap gap-x-2">
              <Badge variant="secondary" size="sm">
                Made with ❤️
              </Badge>
              <Badge variant="secondary" size="sm">
                Open Source
              </Badge>
              <Badge variant="default" size="sm">
                Privacy First
              </Badge>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export default CreditsCard
