import { CodeBracketIcon, GlobeAltIcon } from "@heroicons/react/24/outline"
import { Info } from "lucide-react"
import { useTranslation } from "react-i18next"

import FeatureList from "~/components/FeatureList"
import LinkCard from "~/components/LinkCard"
import { Heading4 } from "~/components/ui"
import { FEATURES, FUTURE_FEATURES } from "~/constants/about"
import { PageHeader } from "~/entrypoints/options/components/PageHeader"
import packageJson from "~/package.json"
import { isNotEmptyArray } from "~/utils"
import { getHomepage, getPkgVersion, getRepository } from "~/utils/packageMeta"

import CreditsCard from "./components/CreditsCard"
import PluginIntroCard from "./components/PluginIntroCard"
import PrivacyNotice from "./components/PrivacyNotice"
import TechStackGrid from "./components/TechStackGrid"

export default function About() {
  const { t } = useTranslation("about")
  const version = packageJson.version

  // 从工具函数获取元数据
  const homepage = getHomepage()
  const repository = getRepository()

  // 技术栈版本动态化
  const techStack = [
    {
      name: "WXT",
      version: getPkgVersion("wxt"),
      description: t("techStack.wxt"),
    },
    {
      name: "React",
      version: getPkgVersion("react"),
      description: t("techStack.react"),
    },
    {
      name: "TypeScript",
      version: getPkgVersion("typescript"),
      description: t("techStack.typescript"),
    },
    {
      name: "Tailwind CSS",
      version: getPkgVersion("tailwindcss"),
      description: t("techStack.tailwindcss"),
    },
    {
      name: "Headless UI",
      version: getPkgVersion("@headlessui/react"),
      description: t("techStack.headlessui"),
    },
  ]

  return (
    <div className="p-6">
      <PageHeader icon={Info} title={t("title")} description={t("intro")} />

      <div className="space-y-6">
        {/* 插件信息 */}
        <section>
          <PluginIntroCard version={version} />
        </section>

        {/* 项目链接 */}
        <section>
          <Heading4 className="mb-4">{t("projectLinks")}</Heading4>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <LinkCard
              Icon={CodeBracketIcon}
              title={t("githubRepo")}
              description={t("githubDesc")}
              href={repository}
              buttonText={t("starRepo")}
              buttonVariant="default"
              iconClass="text-gray-900 dark:text-gray-100"
            />
            <LinkCard
              Icon={GlobeAltIcon}
              title={t("homepage")}
              description={t("homepageDesc")}
              href={homepage}
              buttonText={t("visitHomepage")}
              buttonVariant="default"
              iconClass="text-blue-600 dark:text-blue-400"
            />
          </div>
        </section>

        {/* 功能特性 */}
        {isNotEmptyArray(FEATURES) && isNotEmptyArray(FUTURE_FEATURES) && (
          <section>
            <Heading4 className="mb-4">{t("features")}</Heading4>
            <div className="space-y-6">
              {/* 主要功能 */}
              <FeatureList
                title={t("implementedFeatures")}
                items={FEATURES}
                color="green"
              />

              {/* 未来功能 */}
              <FeatureList
                title={t("upcomingFeatures")}
                items={FUTURE_FEATURES}
                color="blue"
              />
            </div>
          </section>
        )}

        {/* 技术栈 */}
        <section>
          <Heading4 className="mb-4">{t("techStack.title")}</Heading4>
          <TechStackGrid items={techStack} />
        </section>

        {/* 版权和致谢 */}
        <section>
          <Heading4 className="mb-4">{t("copyrightAck")}</Heading4>
          <CreditsCard />
        </section>

        {/* 隐私声明 */}
        <section>
          <PrivacyNotice />
        </section>
      </div>
    </div>
  )
}
