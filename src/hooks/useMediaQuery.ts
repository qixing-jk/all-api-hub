import { useEffect, useState } from "react"

/**
 * 自定义 Hook 用于响应式媒体查询
 * @param query - CSS 媒体查询字符串
 * @returns boolean - 是否匹配媒体查询
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false)

  useEffect(() => {
    const media = window.matchMedia(query)

    // 设置初始状态
    setMatches(media.matches)

    // 监听变化
    const listener = (e: MediaQueryListEvent) => {
      setMatches(e.matches)
    }

    // 兼容旧版浏览器
    if (media.addEventListener) {
      media.addEventListener("change", listener)
    } else {
      media.addListener(listener)
    }

    return () => {
      if (media.removeEventListener) {
        media.removeEventListener("change", listener)
      } else {
        media.removeListener(listener)
      }
    }
  }, [query]) // 只依赖 query

  return matches
}

/**
 * 预定义的响应式断点 Hooks
 */
export const useIsMobile = () => useMediaQuery("(max-width: 767px)")
export const useIsTablet = () =>
  useMediaQuery("(min-width: 768px) and (max-width: 1023px)")
export const useIsDesktop = () => useMediaQuery("(min-width: 1024px)")
export const useIsSmallScreen = () => useMediaQuery("(max-width: 639px)")
