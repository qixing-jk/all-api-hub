import { useState } from "react"

import { AppLayout } from "~/components/AppLayout"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"

import Header from "./components/Header"
import Sidebar from "./components/Sidebar"
import { menuItems } from "./constants"
import { useHashNavigation } from "./hooks/useHashNavigation"
import BasicSettings from "./pages/BasicSettings"

/**
 * Main Options page shell: renders header, sidebar, and routed content panes.
 * Handles hash navigation, mobile sidebar toggles, and collapse state.
 */
function OptionsPage() {
  const { activeMenuItem, routeParams, handleMenuItemChange, refreshKey } =
    useHashNavigation()
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)

  // 获取当前活动的组件
  const ActiveComponent =
    menuItems.find((item) => item.id === activeMenuItem)?.component ||
    BasicSettings

  const handleTitleClick = () => {
    handleMenuItemChange(MENU_ITEM_IDS.BASIC)
  }

  const handleMenuItemClick = (itemId: string) => {
    handleMenuItemChange(itemId)
    setIsMobileSidebarOpen(false) // 移动端选择后关闭侧边栏
  }

  return (
    <div className="dark:bg-dark-bg-primary flex min-h-screen flex-col bg-gray-50">
      <Header
        onTitleClick={handleTitleClick}
        onMenuToggle={() => setIsMobileSidebarOpen(!isMobileSidebarOpen)}
        isMobileSidebarOpen={isMobileSidebarOpen}
      />

      <div className="dark:bg-dark-bg-primary flex flex-1 flex-col bg-gray-50 md:flex-row">
        <Sidebar
          activeMenuItem={activeMenuItem}
          onMenuItemClick={handleMenuItemClick}
          isMobileOpen={isMobileSidebarOpen}
          onMobileClose={() => setIsMobileSidebarOpen(false)}
          isCollapsed={isSidebarCollapsed}
          onCollapseToggle={() => setIsSidebarCollapsed((prev) => !prev)}
        />

        {/* 右侧内容区域 */}
        <main className="flex-1">
          <div className="mx-auto w-full max-w-7xl px-2 py-3 sm:px-4 sm:py-5 md:px-6 md:py-6">
            <div className="dark:border-dark-bg-tertiary dark:bg-dark-bg-secondary min-h-[400px] overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm md:min-h-[600px]">
              <ActiveComponent
                routeParams={routeParams}
                refreshKey={refreshKey}
              />
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}

/**
 * Wraps OptionsPage with shared AppLayout (theme/providers).
 */
function App() {
  return (
    <AppLayout>
      <OptionsPage />
    </AppLayout>
  )
}

export default App
