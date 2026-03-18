import {
  ArrowDownTrayIcon,
  BugAntIcon,
  ChatBubbleLeftEllipsisIcon,
  CodeBracketIcon,
  GlobeAltIcon,
  LightBulbIcon,
  StarIcon,
} from "@heroicons/react/24/outline"
import type { TFunction } from "i18next"
import { Info } from "lucide-react"
import { useTranslation } from "react-i18next"

import FeatureList from "~/components/FeatureList"
import LinkCard from "~/components/LinkCard"
import { PageHeader } from "~/components/PageHeader"
import { Heading4 } from "~/components/ui"
import { FEATURES, FUTURE_FEATURES } from "~/constants/about"
import { EXTENSION_STORE_LISTING_URLS } from "~/constants/extensionStores"
import { isNotEmptyArray } from "~/utils"
import type { ExtensionStoreId } from "~/utils/browser"
import { detectExtensionStore } from "~/utils/browser"
import { getDocsHomepageUrl } from "~/utils/navigation/docsLinks"
import { getFeedbackDestinationUrls } from "~/utils/navigation/feedbackLinks"
import { getPkgVersion } from "~/utils/navigation/packageMeta"
import packageJson from "~~/package.json"

import CreditsCard from "./components/CreditsCard"
import PluginIntroCard from "./components/PluginIntroCard"
import PrivacyNotice from "./components/PrivacyNotice"
import TechStackGrid from "./components/TechStackGrid"

const getStoreLabel = (t: TFunction, storeId: ExtensionStoreId) => {
  switch (storeId) {
    case "chrome":
      return t("about:stores.chrome")
    case "edge":
      return t("about:stores.edge")
    case "firefox":
      return t("about:stores.firefox")
  }
}

/**
 * Options/About page: displays app metadata, links, features, tech stack, credits, and privacy notice.
 */
export default function About() {
  const { t, i18n } = useTranslation("about")
  const version = packageJson.version

  // 从工具函数获取元数据
  const homepage = getDocsHomepageUrl(i18n.language)
  const feedbackDestinations = getFeedbackDestinationUrls()

  // Store CTA: ask for a positive review on the current store, and provide download links for other stores.
  const currentStoreId = detectExtensionStore()
  const currentStoreName = getStoreLabel(t, currentStoreId)
  const otherStoreIds = (
    Object.keys(EXTENSION_STORE_LISTING_URLS) as ExtensionStoreId[]
  ).filter((storeId) => storeId !== currentStoreId)

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
      <PageHeader
        icon={Info}
        title={t("title")}
        description={t("ui:app.description")}
      />

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
              href={feedbackDestinations.repository}
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
              buttonVariant="secondary"
              iconClass="text-blue-600 dark:text-blue-400"
            />
          </div>
        </section>

        <section>
          <Heading4 className="mb-4">{t("feedbackSection.title")}</Heading4>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            <LinkCard
              Icon={BugAntIcon}
              title={t("ui:feedback.bugReport")}
              description={t("feedbackSection.bugReport.description")}
              href={feedbackDestinations.bugReport}
              buttonText={t("feedbackSection.bugReport.button")}
              buttonVariant="default"
              iconClass="text-red-600 dark:text-red-400"
            />
            <LinkCard
              Icon={LightBulbIcon}
              title={t("ui:feedback.featureRequest")}
              description={t("feedbackSection.featureRequest.description")}
              href={feedbackDestinations.featureRequest}
              buttonText={t("feedbackSection.featureRequest.button")}
              buttonVariant="secondary"
              iconClass="text-amber-500 dark:text-amber-400"
            />
            <LinkCard
              Icon={ChatBubbleLeftEllipsisIcon}
              title={t("ui:feedback.discussion")}
              description={t("feedbackSection.discussion.description")}
              href={feedbackDestinations.discussions}
              buttonText={t("feedbackSection.discussion.button")}
              buttonVariant="outline"
              iconClass="text-blue-600 dark:text-blue-400"
            />
          </div>
        </section>

        {/* 商店评分与下载 */}
        <section>
          <Heading4 className="mb-4">{t("storesSection.title")}</Heading4>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <LinkCard
              Icon={StarIcon}
              title={t("storesSection.review.title")}
              description={t("storesSection.review.description", {
                store: currentStoreName,
              })}
              href={EXTENSION_STORE_LISTING_URLS[currentStoreId]}
              buttonText={t("storesSection.review.button", {
                store: currentStoreName,
              })}
              buttonVariant="default"
              iconClass="text-yellow-500 dark:text-yellow-400"
            />
            {otherStoreIds.map((storeId) => {
              const storeLabel = getStoreLabel(t, storeId)

              return (
                <LinkCard
                  key={storeId}
                  Icon={ArrowDownTrayIcon}
                  title={storeLabel}
                  description={t("storesSection.download.description", {
                    store: storeLabel,
                  })}
                  href={EXTENSION_STORE_LISTING_URLS[storeId]}
                  buttonText={t("storesSection.download.button")}
                  buttonVariant="secondary"
                  iconClass="text-blue-600 dark:text-blue-400"
                />
              )
            })}
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
