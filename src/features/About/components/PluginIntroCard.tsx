import { useRef } from "react"
import { useTranslation } from "react-i18next"

import iconImage from "~/assets/icon.png"
import { Body, Card, CardContent, Heading2 } from "~/components/ui"
import toast from "~/lib/notify"
import { toggleDevUnlocked } from "~/utils/core/devMode"
import { isDevelopmentMode } from "~/utils/core/environment"

export interface PluginIntroCardProps {
  version: string
}

const PluginIntroCard = ({ version }: PluginIntroCardProps) => {
  const { t } = useTranslation("about")
  const clickCountRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleVersionClick = () => {
    clickCountRef.current += 1
    if (timerRef.current) clearTimeout(timerRef.current)

    timerRef.current = setTimeout(() => {
      clickCountRef.current = 0
    }, 2500)

    if (clickCountRef.current >= 5) {
      clickCountRef.current = 0
      if (timerRef.current) clearTimeout(timerRef.current)
      const result = toggleDevUnlocked()
      if (result === "already_dev") {
        toast.info("当前处于开发构建环境 (wxt dev)，开发者模式默认保持启用")
        return
      }
      if (result === "unlocked") {
        toast.success("🛠️ 开发者模式已激活！全部 Dev 实验室已解锁")
        setTimeout(() => {
          if (typeof window !== "undefined") window.location.reload()
        }, 500)
      } else {
        toast.info("已退出开发者模式")
        setTimeout(() => {
          if (typeof window !== "undefined") window.location.reload()
        }, 500)
      }
    }
  }

  const isDev = isDevelopmentMode()

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
            <Heading2 className="mb-density-2">{t("ui:app.name")}</Heading2>
            <Body className="dark:text-secondary-foreground text-muted-foreground mb-density-4">
              {t("intro")}
            </Body>
            <div className="text-sm">
              <div>
                <span className="dark:text-secondary-foreground text-muted-foreground">
                  {t("version")}
                </span>
                <span
                  onClick={handleVersionClick}
                  title={
                    isDev
                      ? "当前处于开发调试环境 (wxt dev)"
                      : "连续点击 5 次可切换开发者模式"
                  }
                  className="text-foreground ml-2 cursor-pointer font-medium transition-opacity select-none active:opacity-60"
                >
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
