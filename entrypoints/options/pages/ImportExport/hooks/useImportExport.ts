import { useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

import { getErrorMessage } from "~/utils/error"

import { importFromBackupObject, parseBackupSummary } from "../utils"

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
      const result = await importFromBackupObject(data)
      if (result.allImported) {
        toast.success(t("importExport:import.importSuccess"))
      }
    } catch (error) {
      console.error("导入失败:", error)
      if (error instanceof SyntaxError) {
        toast.error(t("importExport:import.formatError"))
      } else {
        toast.error(
          t("importExport:import.importFailed", {
            error: getErrorMessage(error),
          }),
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
      const summary = parseBackupSummary(importData, t("common:labels.unknown"))
      if (!summary || !("valid" in summary) || !summary.valid) {
        return { valid: false }
      }
      return summary
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
    validateImportData,
  }
}
