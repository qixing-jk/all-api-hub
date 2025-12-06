import React, { createContext, useContext, useEffect, useState } from "react"

interface DeviceContextType {
  isTouchDevice: boolean
  isMobile: boolean
  isTablet: boolean
  isDesktop: boolean
}

/**
 * React context storing coarse device capability flags derived from viewport
 * breakpoints and pointer characteristics.
 */
const DeviceContext = createContext<DeviceContextType | undefined>(undefined)

/**
 * Provide responsive device flags to descendant components so layout logic
 * can branch without duplicating media-query bookkeeping.
 */
export function DeviceProvider({ children }: { children: React.ReactNode }) {
  const [isTouchDevice, setIsTouchDevice] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [isTablet, setIsTablet] = useState(false)
  const [isDesktop, setIsDesktop] = useState(true)

  useEffect(() => {
    // 使用 Tailwind 的断点值保持一致
    // sm: 480px, md: 768px, lg: 1024px
    const mobileQuery = window.matchMedia("(max-width: 767px)") // < md (768px)
    const tabletQuery = window.matchMedia(
      "(min-width: 768px) and (max-width: 1023px)",
    ) // md to lg
    const desktopQuery = window.matchMedia("(min-width: 1024px)") // >= lg
    const touchQuery = window.matchMedia("(pointer: coarse)")

    const updateDevice = () => {
      // 检测触摸设备
      const hasTouch =
        "ontouchstart" in window ||
        navigator.maxTouchPoints > 0 ||
        touchQuery.matches

      setIsTouchDevice(hasTouch)

      // 使用媒体查询检测屏幕尺寸，与 Tailwind 断点保持一致
      setIsMobile(mobileQuery.matches)
      setIsTablet(tabletQuery.matches)
      setIsDesktop(desktopQuery.matches)
    }

    // 初始检测
    updateDevice()

    // 监听媒体查询变化
    const handleChange = () => updateDevice()

    mobileQuery.addEventListener("change", handleChange)
    tabletQuery.addEventListener("change", handleChange)
    desktopQuery.addEventListener("change", handleChange)
    touchQuery.addEventListener("change", handleChange)

    return () => {
      mobileQuery.removeEventListener("change", handleChange)
      tabletQuery.removeEventListener("change", handleChange)
      desktopQuery.removeEventListener("change", handleChange)
      touchQuery.removeEventListener("change", handleChange)
    }
  }, [])

  return (
    <DeviceContext.Provider
      value={{ isTouchDevice, isMobile, isTablet, isDesktop }}
    >
      {children}
    </DeviceContext.Provider>
  )
}

/**
 * Consume the {@link DeviceContext} flags, ensuring callers are wrapped inside
 * {@link DeviceProvider}. Throws early to make misuse obvious in development.
 */
export function useDevice() {
  const context = useContext(DeviceContext)
  if (context === undefined) {
    throw new Error("useDevice must be used within a DeviceProvider")
  }
  return context
}
