import { useEffect } from "react"
import { useTranslation } from "react-i18next"

import { Heading3 } from "~/components/ui"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext.tsx"

import { menuItems } from "../constants"

interface SidebarProps {
  activeMenuItem: string
  onMenuItemClick: (itemId: string) => void
  isMobileOpen?: boolean
  onMobileClose?: () => void
}

function Sidebar({
  activeMenuItem,
  onMenuItemClick,
  isMobileOpen,
  onMobileClose
}: SidebarProps) {
  const { t } = useTranslation("ui")
  const { preferences } = useUserPreferencesContext()

  // 移动端打开时禁止背景滚动
  useEffect(() => {
    if (isMobileOpen) {
      document.body.style.overflow = "hidden"
    } else {
      document.body.style.overflow = ""
    }
    return () => {
      document.body.style.overflow = ""
    }
  }, [isMobileOpen])

  return (
    <>
      {/* 移动端遮罩层 */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/20 md:hidden"
          onClick={onMobileClose}
        />
      )}

      {/* 侧边栏 */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 flex-shrink-0 transform transition-transform duration-300 ease-in-out md:relative md:translate-x-0 ${isMobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"} mt-0 md:mt-0`}>
        <nav className="h-full overflow-hidden rounded-none border-r border-gray-200 bg-white shadow-sm dark:border-dark-bg-tertiary dark:bg-dark-bg-secondary md:h-auto md:rounded-lg md:border">
          <div className="border-b border-gray-100 p-3 dark:border-dark-bg-tertiary sm:p-4">
            <Heading3 className="uppercase tracking-wide text-gray-500 dark:text-dark-text-tertiary">
              {t("navigation.settingsOptions")}
            </Heading3>
          </div>
          <ul className="max-h-[calc(100vh-8rem)] divide-y divide-gray-100 overflow-y-auto dark:divide-dark-bg-tertiary md:max-h-none">
            {menuItems.map((item) => {
              const Icon = item.icon
              const isActive = activeMenuItem === item.id

              if (
                item.id === "autoCheckin" &&
                !preferences?.autoCheckin?.globalEnabled
              ) {
                return null
              }

              return (
                <li key={item.id}>
                  <button
                    onClick={() => onMenuItemClick(item.id)}
                    className={`flex w-full touch-manipulation items-center px-3 py-2.5 text-left transition-colors tap-highlight-transparent hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary sm:px-4 sm:py-3 ${
                      isActive
                        ? "border-r-2 border-blue-600 bg-blue-50 text-blue-700 dark:border-blue-500 dark:bg-blue-900/20 dark:text-blue-400"
                        : "text-gray-700 dark:text-dark-text-secondary"
                    }`}>
                    <Icon
                      className={`mr-2 h-4 w-4 flex-shrink-0 sm:mr-3 sm:h-5 sm:w-5 ${
                        isActive
                          ? "text-blue-600 dark:text-blue-500"
                          : "text-gray-400 dark:text-dark-text-tertiary"
                      }`}
                    />
                    <span className="text-sm sm:text-base">
                      {t(`navigation.${item.id}`)}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </nav>
      </aside>
    </>
  )
}

export default Sidebar
