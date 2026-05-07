import { LanguageIcon } from "@heroicons/react/24/outline"
import { useTranslation } from "react-i18next"

import { LanguageSwitcher } from "~/components/LanguageSwitcher"
import { BodySmall, Card, CardItem, CardList, Heading3 } from "~/components/ui"
import ThemeToggle from "~/entrypoints/options/components/ThemeToggle"

/**
 * Settings section for theme and interface language preferences.
 */
export default function AppearanceSettings() {
  const { t } = useTranslation("settings")

  return (
    <section id="appearance" className="space-y-6">
      <div className="space-y-1.5">
        <Heading3>{t("theme.appearance")}</Heading3>
        <BodySmall>{t("display.description")}</BodySmall>
      </div>

      <Card padding="none">
        <CardList>
          <ThemeToggle />
          <CardItem
            id="appearance-language"
            icon={
              <LanguageIcon className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            }
            title={t("appearanceLanguage.language")}
            description={t("appearanceLanguage.languageDesc")}
            rightContent={<LanguageSwitcher />}
          />
        </CardList>
      </Card>
    </section>
  )
}
