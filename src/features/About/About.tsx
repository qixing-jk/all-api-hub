import type { TFunction } from "i18next"
import {
  Bug,
  Code2,
  Download,
  Globe2,
  Info,
  Languages,
  Lightbulb,
  MessageSquareMore,
  Star,
  Users,
} from "lucide-react"
import { useTranslation } from "react-i18next"

import FeatureList from "~/components/FeatureList"
import LinkCard from "~/components/LinkCard"
import { PageHeader } from "~/components/PageHeader"
import { ReleaseUpdateStatusPanel } from "~/components/ReleaseUpdateStatusPanel"
import { Heading4 } from "~/components/ui"
import { FEATURES, FUTURE_FEATURES } from "~/constants/about"
import { EXTENSION_STORE_LISTING_URLS } from "~/constants/extensionStores"
import { ProductTourReplayCard } from "~/features/ProductTour"
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
  const feedbackDestinations = getFeedbackDestinationUrls(i18n.language)

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
      name: "Radix UI",
      version: getPkgVersion("radix-ui"),
      description: t("techStack.radix"),
    },
  ]

  return (
    <div className="py-density-6 px-6">
      <PageHeader
        icon={Info}
        title={t("title")}
        description={t("description")}
      />

      <div className="space-y-density-6">
        {/* 插件信息 */}
        <section>
          <PluginIntroCard version={version} />
        </section>

        <section>
          <ProductTourReplayCard />
        </section>

        {/* 项目链接 */}
        <section>
          <Heading4 className="mb-density-4">{t("projectLinks")}</Heading4>
          <div className="gap-y-density-4 grid grid-cols-1 gap-x-4 md:grid-cols-2">
            <LinkCard
              Icon={Code2}
              title={t("githubRepo")}
              description={t("githubDesc")}
              href={feedbackDestinations.repository}
              buttonText={t("starRepo")}
              buttonVariant="default"
              iconClass="text-foreground"
            />
            <LinkCard
              Icon={Globe2}
              title={t("homepage")}
              description={t("homepageDesc")}
              href={homepage}
              buttonText={t("visitHomepage")}
              buttonVariant="secondary"
              iconClass="text-theme-600 dark:text-theme-400"
            />
          </div>
        </section>

        <section>
          <Heading4 className="mb-density-4">
            {t("releaseUpdate.title")}
          </Heading4>
          <ReleaseUpdateStatusPanel />
        </section>

        <section>
          <Heading4 className="mb-density-4">
            {t("feedbackSection.title")}
          </Heading4>
          <div className="gap-y-density-4 grid grid-cols-1 gap-x-4 md:grid-cols-2 xl:grid-cols-3">
            <LinkCard
              Icon={Bug}
              title={t("ui:feedback.bugReport")}
              description={t("feedbackSection.bugReport.description")}
              href={feedbackDestinations.bugReport}
              buttonText={t("feedbackSection.bugReport.button")}
              buttonVariant="default"
              iconClass="text-link"
            />
            <LinkCard
              Icon={Lightbulb}
              title={t("ui:feedback.featureRequest")}
              description={t("feedbackSection.featureRequest.description")}
              href={feedbackDestinations.featureRequest}
              buttonText={t("feedbackSection.featureRequest.button")}
              buttonVariant="secondary"
              iconClass="text-link"
            />
            <LinkCard
              Icon={Languages}
              title={t("ui:feedback.languageRequest")}
              description={t("feedbackSection.languageRequest.description")}
              href={feedbackDestinations.languageRequest}
              buttonText={t("feedbackSection.languageRequest.button")}
              buttonVariant="secondary"
              iconClass="text-theme-600 dark:text-theme-400"
            />
            <LinkCard
              Icon={Users}
              title={t("ui:feedback.community")}
              description={t("feedbackSection.community.description")}
              href={feedbackDestinations.community}
              buttonText={t("feedbackSection.community.button")}
              buttonVariant="outline"
              iconClass="text-link"
            />
            <LinkCard
              Icon={MessageSquareMore}
              title={t("ui:feedback.discussion")}
              description={t("feedbackSection.discussion.description")}
              href={feedbackDestinations.discussions}
              buttonText={t("feedbackSection.discussion.button")}
              buttonVariant="outline"
              iconClass="text-theme-600 dark:text-theme-400"
            />
          </div>
        </section>

        {/* 商店评分与下载 */}
        <section>
          <Heading4 className="mb-density-4">
            {t("storesSection.title")}
          </Heading4>
          <div className="gap-y-density-4 grid grid-cols-1 gap-x-4 md:grid-cols-2">
            <LinkCard
              Icon={Star}
              title={t("storesSection.review.title")}
              description={t("storesSection.review.description", {
                store: currentStoreName,
              })}
              href={EXTENSION_STORE_LISTING_URLS[currentStoreId]}
              buttonText={t("storesSection.review.button", {
                store: currentStoreName,
              })}
              buttonVariant="default"
              iconClass="text-link"
            />
            {otherStoreIds.map((storeId) => {
              const storeLabel = getStoreLabel(t, storeId)

              return (
                <LinkCard
                  key={storeId}
                  Icon={Download}
                  title={storeLabel}
                  description={t("storesSection.download.description", {
                    store: storeLabel,
                  })}
                  href={EXTENSION_STORE_LISTING_URLS[storeId]}
                  buttonText={t("storesSection.download.button")}
                  buttonVariant="secondary"
                  iconClass="text-theme-600 dark:text-theme-400"
                />
              )
            })}
          </div>
        </section>

        {/* 功能特性 */}
        {isNotEmptyArray(FEATURES) && isNotEmptyArray(FUTURE_FEATURES) && (
          <section>
            <Heading4 className="mb-density-4">{t("features")}</Heading4>
            <div className="space-y-density-6">
              {/* 主要功能 */}
              <FeatureList
                title={t("implementedFeatures")}
                items={FEATURES}
                variant="success"
              />

              {/* 未来功能 */}
              <FeatureList
                title={t("upcomingFeatures")}
                items={FUTURE_FEATURES}
                variant="primary"
              />
            </div>
          </section>
        )}

        {/* 技术栈 */}
        <section>
          <Heading4 className="mb-density-4">{t("techStack.title")}</Heading4>
          <TechStackGrid items={techStack} />
        </section>

        {/* 版权和致谢 */}
        <section>
          <Heading4 className="mb-density-4">{t("copyrightAck")}</Heading4>
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
