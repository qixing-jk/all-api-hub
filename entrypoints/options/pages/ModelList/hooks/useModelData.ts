import { useCallback, useEffect, useMemo, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

import { fetchModelPricing } from "~/services/apiService"
import type { PricingResponse } from "~/services/apiService/common/type"
import type { DisplaySiteData } from "~/types"

interface UseModelDataProps {
  selectedAccount: string
  accounts: DisplaySiteData[] // ✅ Pass data instead of setState
  selectedGroup: string
}

interface UseModelDataReturn {
  pricingData: PricingResponse | null
  isLoading: boolean
  dataFormatError: boolean
  loadPricingData: (accountId: string) => Promise<void>
}

export function useModelData({
  selectedAccount,
  accounts,
}: UseModelDataProps): UseModelDataReturn {
  const { t } = useTranslation("modelList")
  const [pricingData, setPricingData] = useState<PricingResponse | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [dataFormatError, setDataFormatError] = useState(false)

  const safeDisplayData = useMemo(() => accounts || [], [accounts])

  const loadPricingData = useCallback(
    async (accountId: string) => {
      const account = safeDisplayData.find((acc) => acc.id === accountId)
      if (!account) return

      setIsLoading(true)
      setDataFormatError(false)
      try {
        const data = await fetchModelPricing(account)

        if (!Array.isArray(data.data)) {
          setDataFormatError(true)
          setPricingData(null)
          toast.error(t("status.formatNotStandard"))
          return
        }

        setPricingData(data)
        toast.success(t("status.dataLoaded"))
      } catch (error) {
        console.error("加载模型数据失败:", error)
        toast.error(t("status.loadFailed"))
        setPricingData(null)
        setDataFormatError(false)
      } finally {
        setIsLoading(false)
      }
    },
    [safeDisplayData, t],
  )

  useEffect(() => {
    if (selectedAccount) {
      loadPricingData(selectedAccount)
    } else {
      setPricingData(null)
    }
  }, [selectedAccount, loadPricingData])

  return {
    pricingData,
    isLoading,
    dataFormatError,
    loadPricingData,
  }
}
