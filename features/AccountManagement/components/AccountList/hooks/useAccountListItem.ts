import { useCallback, useEffect, useRef, useState } from "react"

/**
 * 管理 AccountList 中每个列表项的交互逻辑，如 hover 效果和菜单操作。
 * @returns
 */
export const useAccountListItem = () => {
  const [hoveredSiteId, setHoveredSiteId] = useState<string | null>(null)
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // 防抖的 hover 处理
  const handleMouseEnter = useCallback((siteId: string) => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current)
    }
    hoverTimeoutRef.current = setTimeout(() => {
      setHoveredSiteId(siteId)
    }, 50) // 50ms 防抖延迟
  }, [])

  const handleMouseLeave = useCallback(() => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current)
    }
    setHoveredSiteId(null)
  }, [])

  // 清理定时器
  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current)
      }
    }
  }, [])

  return {
    hoveredSiteId,
    handleMouseEnter,
    handleMouseLeave,
  }
}
