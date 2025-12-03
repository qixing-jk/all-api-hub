import dayjs from "dayjs"
import i18n from "i18next"

import "dayjs/locale/zh-cn"

import { DEFAULT_LANG } from "~/constants"
import { userPreferences } from "~/services/userPreferences"

// 自动导入 locales 下的 json 文件
const modules = import.meta.glob("~/locales/*/*.json", { eager: true })

// 动态组装成 i18n 资源对象
const resources: Record<string, Record<string, any>> = {}
for (const path in modules) {
  const match = path.match(/locales\/([^/]+)\/([^/]+)\.json$/)
  if (match) {
    const [, lang, ns] = match
    resources[lang] ??= {}
    resources[lang][ns] = (modules[path] as any).default
  }
}

/**
 * 将 i18next 的语言代码转换为 dayjs 可识别的 locale 名称
 */
function mapToDayjsLocale(lng: string): string {
  return lng.toLowerCase().replace("_", "-")
}

/**
 * 初始化 background i18n
 */
export async function initBackgroundI18n() {
  await i18n.init({
    resources,
    fallbackLng: DEFAULT_LANG,
    defaultNS: "common",
    ns: ["common", "messages", "settings", "ui", "redemptionAssist"], // 精简即可
    interpolation: { escapeValue: false },
    returnEmptyString: false,
  })

  // 尝试读取用户偏好语言
  const storedLanguage = (await userPreferences.getLanguage()) || DEFAULT_LANG
  await i18n.changeLanguage(storedLanguage)

  // 同步 dayjs locale
  dayjs.locale(mapToDayjsLocale(storedLanguage))
}

// 监听语言变更，保持 dayjs 一致
i18n.on("languageChanged", (lng) => {
  dayjs.locale(mapToDayjsLocale(lng))
})

export default i18n
