import { useCallback, useEffect, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

import {
  fetchAccountAvailableModels,
  fetchUserGroups,
} from "~/services/apiService"
import type { UserGroupInfo } from "~/services/apiService/common/type"
import type { DisplaySiteData } from "~/types"

import type { FormData } from "./useTokenForm"

export function useTokenData(
  isOpen: boolean,
  currentAccount: DisplaySiteData | undefined,
  setFormData: React.Dispatch<React.SetStateAction<FormData>>,
) {
  const { t } = useTranslation("keyManagement")
  const [isLoading, setIsLoading] = useState(false)
  const [availableModels, setAvailableModels] = useState<string[]>([])
  const [groups, setGroups] = useState<Record<string, UserGroupInfo>>({})

  const loadInitialData = useCallback(async () => {
    if (!currentAccount) return

    setIsLoading(true)
    try {
      const [models, groupsData] = await Promise.all([
        fetchAccountAvailableModels(currentAccount),
        fetchUserGroups(currentAccount),
      ])

      setAvailableModels(models)
      setGroups(groupsData)

      // Set default group
      if (groupsData.default) {
        setFormData((prev) => ({ ...prev, group: "default" }))
      } else {
        const firstGroup = Object.keys(groupsData)[0]
        if (firstGroup) {
          setFormData((prev) => ({ ...prev, group: firstGroup }))
        }
      }
    } catch (error) {
      console.error("Failed to load initial data:", error)
      toast.error(t("dialog.loadDataFailed"))
    } finally {
      setIsLoading(false)
    }
  }, [currentAccount, setFormData, t])

  useEffect(() => {
    if (isOpen && currentAccount) {
      loadInitialData()
    }
  }, [isOpen, currentAccount, loadInitialData])

  const resetData = () => {
    setAvailableModels([])
    setGroups({})
  }

  return { isLoading, availableModels, groups, resetData }
}
