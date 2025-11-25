import { useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

import { accountStorage } from "~/services/accountStorage"
import { channelConfigStorage } from "~/services/channelConfigStorage"
import { userPreferences } from "~/services/userPreferences"
import { getErrorMessage } from "~/utils/error"

export const useImportExport = () => {
  const { t } = useTranslation()
  const [isExporting, setIsExporting] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [importData, setImportData] = useState("")

  // 处理文件导入
  const handleFileImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (e) => {
      const content = e.target?.result as string
      setImportData(content)
    }
    reader.readAsText(file)
  }

  // 导入数据
  const handleImport = async () => {
    if (!importData.trim()) {
      toast.error(t("importExport:import.selectFileImport"))
      return
    }

    try {
      setIsImporting(true)

      const data = JSON.parse(importData)

      // 验证数据格式
      if (!data.version || !data.timestamp) {
        throw new Error(t("importExport:import.formatNotCorrect"))
      }

      let importSuccess = false
      let importedChannelConfigs = 0

      // 根据数据类型进行导入
      if (data.accounts || !data.type) {
        const accountsToImport = data.accounts?.accounts || data.data?.accounts

        const { migratedCount } = await accountStorage.importData({
          accounts: accountsToImport
        })

        importSuccess = true
        if (migratedCount > 0) {
          toast.success(
            t("messages:toast.success.importedAccounts", { migratedCount })
          )
        } else {
          toast.success(t("messages:toast.success.importSuccess"))
        }
      }

      if (data.preferences || data.type === "preferences") {
        // 导入用户设置
        const preferencesData = data.preferences || data.data
        if (preferencesData) {
          const success =
            await userPreferences.importPreferences(preferencesData)
          if (success) {
            importSuccess = true
            toast.success(t("importExport:import.importSuccess"))
          }
        }
      }

      if (data.channelConfigs || data.type === "channelConfigs") {
        const configsData = data.channelConfigs || data.data
        if (configsData) {
          importedChannelConfigs =
            await channelConfigStorage.importConfigs(configsData)
          importSuccess = true
          toast.success(
            t("importExport:import.channelConfigImported", {
              count: importedChannelConfigs
            })
          )
        }
      }

      if (!importSuccess) {
        throw new Error(t("importExport:import.noImportableData"))
      }

      // 清空输入框
      setImportData("")
    } catch (error) {
      console.error("导入失败:", error)
      if (error instanceof SyntaxError) {
        toast.error(t("importExport:import.formatError"))
      } else {
        toast.error(
          t("importExport:import.importFailed", {
            error: getErrorMessage(error)
          })
        )
      }
    } finally {
      setIsImporting(false)
    }
  }

  // 验证导入数据
  const validateImportData = () => {
    if (!importData.trim()) return null

    try {
      const data = JSON.parse(importData)
      return {
        valid: true,
        hasAccounts: !!(
          data.accounts ||
          (data.type !== "preferences" && data.data)
        ),
        hasPreferences: !!(data.preferences || data.type === "preferences"),
        hasChannelConfigs: !!(
          data.channelConfigs || data.type === "channelConfigs"
        ),
        timestamp: data.timestamp
          ? new Date(data.timestamp).toLocaleString()
          : t("common:labels.unknown")
      }
    } catch {
      return { valid: false }
    }
  }

  return {
    isExporting,
    setIsExporting,
    isImporting,
    importData,
    setImportData,
    handleFileImport,
    handleImport,
    validateImportData
  }
}
