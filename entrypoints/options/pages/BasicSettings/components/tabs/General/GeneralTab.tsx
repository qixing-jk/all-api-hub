import { LanguageIcon } from "@heroicons/react/24/outline"
import { useTranslation } from "react-i18next"

import { LanguageSwitcher } from "~/components/LanguageSwitcher"
import { BodySmall, Card, CardItem, CardList, Heading3 } from "~/components/ui"
import DangerousZone from "~/entrypoints/options/pages/BasicSettings/components/DangerousZone"

import ThemeToggle from "../../../../../components/ThemeToggle"
import ActionClickBehaviorSettings from "./ActionClickBehaviorSettings"
import ChangelogOnUpdateSettings from "./ChangelogOnUpdateSettings"
import DisplaySettings from "./DisplaySettings"
import LoggingSettings from "./LoggingSettings"

/**
 * General Basic Settings tab for display preferences, theme/language, and dangerous zone.
 */
export default function GeneralTab() {
  const { t } = useTranslation("settings")

  return (
    <div className="space-y-6">
      <DisplaySettings />
      <ActionClickBehaviorSettings />
      <LoggingSettings />
      <ChangelogOnUpdateSettings />

      {/* Appearance & Language Section */}
      <section id="appearance" className="space-y-6">
        <div className="space-y-1.5">
          <Heading3>{t("theme.appearance")}</Heading3>
          <BodySmall>{t("display.description")}</BodySmall>
        </div>

        <Card padding="none">
          <CardList>
            <ThemeToggle />
            <CardItem
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

      <section id="dangerous-zone">
        <DangerousZone />
      </section>
    </div>
  )
}
