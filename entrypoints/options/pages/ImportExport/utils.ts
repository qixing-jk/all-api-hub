import { t } from "i18next"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

import { accountStorage } from "~/services/accountStorage"
import { userPreferences } from "~/services/userPreferences"

// 导出所有数据
export const handleExportAll = async (
  setIsExporting: (isExporting: boolean) => void
) => {
  const { t } = useTranslation()
  try {
    setIsExporting(true)

    // 获取账号数据和用户偏好设置
    const [accountData, preferencesData] = await Promise.all([
      accountStorage.exportData(),
      userPreferences.exportPreferences()
    ])

    const exportData = {
      version: "1.0",
      timestamp: Date.now(),
      accounts: accountData,
      preferences: preferencesData
    }

    // 创建下载链接
    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: "application/json"
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `all-api-hub-backup-${new Date().toISOString().split("T")[0]}.json`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)

    toast.success(t("importExport.dataExported"))
  } catch (error) {
    console.error("导出失败:", error)
    toast.error(t("importExport.exportFailed"))
  } finally {
    setIsExporting(false)
  }
}

// 导出账号数据
export const handleExportAccounts = async (
  setIsExporting: (isExporting: boolean) => void
) => {
  const { t } = useTranslation()
  try {
    setIsExporting(true)

    const accountData = await accountStorage.exportData()
    const exportData = {
      version: "1.0",
      timestamp: Date.now(),
      type: "accounts",
      data: accountData
    }

    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: "application/json"
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `accounts-backup-${new Date().toISOString().split("T")[0]}.json`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)

    toast.success(t("importExport.accountsExported"))
  } catch (error) {
    console.error("导出账号数据失败:", error)
    toast.error(t("importExport.exportFailed"))
  } finally {
    setIsExporting(false)
  }
}

// 导出用户设置
export const handleExportPreferences = async (
  setIsExporting: (isExporting: boolean) => void
) => {
  try {
    setIsExporting(true)

    const preferencesData = await userPreferences.exportPreferences()
    const exportData = {
      version: "1.0",
      timestamp: Date.now(),
      type: "preferences",
      data: preferencesData
    }

    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: "application/json"
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `preferences-backup-${new Date().toISOString().split("T")[0]}.json`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)

    toast.success(t("importExport.settingsExported"))
  } catch (error) {
    console.error("导出用户设置失败:", error)
    toast.error(t("importExport.exportFailed"))
  } finally {
    setIsExporting(false)
  }
}
