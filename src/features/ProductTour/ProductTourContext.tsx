import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"
import { EVENTS, Joyride, STATUS, type EventData } from "react-joyride"

import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { useIsMobile, useMediaQuery } from "~/hooks/useMediaQuery"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_EVENTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"
import { trackProductAnalyticsEvent } from "~/services/productAnalytics/dispatch"

import {
  getProductTourTargetSelector,
  PRODUCT_TOUR_FOCUS_RETURN_ATTRIBUTE,
  PRODUCT_TOUR_SOURCES,
  PRODUCT_TOUR_TARGETS,
  PRODUCT_TOUR_VERSION,
  type ProductTourSource,
} from "./constants"
import {
  buildProductTourSteps,
  shouldOfferProductTour,
  type ProductTourMobileSurface,
} from "./model"
import { ProductTourTooltip } from "./ProductTourTooltip"

const PRODUCT_TOUR_SESSION_DEFERRED_KEY =
  "all-api-hub:product-tour-invitation-deferred"
const MOBILE_SIDEBAR_TRANSITION_FALLBACK_BUFFER_MS = 100
const MOBILE_SIDEBAR_TRANSITION_FALLBACK_LIMIT_MS = 1000

interface ProductTourContextValue {
  isRunning: boolean
  shouldOfferTour: boolean
  startTour: (source: ProductTourSource) => void
  deferTourInvitation: () => void
}

const ProductTourContext = createContext<ProductTourContextValue | undefined>(
  undefined,
)

/** Map a start source to its privacy-safe analytics surface. */
function getSourceSurface(source: ProductTourSource) {
  return source === PRODUCT_TOUR_SOURCES.About
    ? PRODUCT_ANALYTICS_SURFACE_IDS.OptionsProductTourAboutReplay
    : PRODUCT_ANALYTICS_SURFACE_IDS.OptionsProductTourOverviewPrompt
}

/** Read the non-essential, session-only invitation deferral marker. */
function readSessionDeferredState() {
  try {
    return sessionStorage.getItem(PRODUCT_TOUR_SESSION_DEFERRED_KEY) === "true"
  } catch {
    return false
  }
}

/** Wait until the drawer transform settles, with a bounded fallback for lost events. */
async function waitForMobileSidebarTransition(prefersReducedMotion: boolean) {
  await new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => resolve())
  })

  const sidebar = document.querySelector<HTMLElement>(
    getProductTourTargetSelector(PRODUCT_TOUR_TARGETS.Navigation),
  )
  if (!sidebar || prefersReducedMotion) return

  const styles = window.getComputedStyle(sidebar)
  const parseCssTime = (value: string) =>
    Math.max(
      0,
      ...value.split(",").map((time) => {
        const normalized = time.trim()
        return normalized.endsWith("ms")
          ? Number.parseFloat(normalized)
          : Number.parseFloat(normalized) * 1000
      }),
    )
  const transitionMs =
    parseCssTime(styles.transitionDuration) +
    parseCssTime(styles.transitionDelay)
  if (!Number.isFinite(transitionMs) || transitionMs <= 0) return

  await new Promise<void>((resolve) => {
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      window.clearTimeout(fallbackId)
      sidebar.removeEventListener("transitionend", handleTransitionEnd)
      resolve()
    }
    const handleTransitionEnd = (event: TransitionEvent) => {
      if (event.target === sidebar && event.propertyName === "transform") {
        finish()
      }
    }
    const fallbackId = window.setTimeout(
      finish,
      Math.min(
        transitionMs + MOBILE_SIDEBAR_TRANSITION_FALLBACK_BUFFER_MS,
        MOBILE_SIDEBAR_TRANSITION_FALLBACK_LIMIT_MS,
      ),
    )

    sidebar.addEventListener("transitionend", handleTransitionEnd)
  })
}

interface ProductTourProviderProps {
  children: ReactNode
  isSidebarCollapsed: boolean
  onExpandSidebar: () => void
  isMobileSidebarOpen: boolean
  onMobileSidebarOpenChange: (open: boolean) => void
}

/** Owns the options-page tour runtime, persistence, focus restoration, and telemetry. */
export function ProductTourProvider({
  children,
  isSidebarCollapsed,
  onExpandSidebar,
  isMobileSidebarOpen,
  onMobileSidebarOpenChange,
}: ProductTourProviderProps) {
  const { t } = useTranslation("productTour")
  const { preferences, completeProductTour, dismissProductTour } =
    useUserPreferencesContext()
  const isMobile = useIsMobile()
  const prefersReducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)")
  const [isRunning, setIsRunning] = useState(false)
  const [invitationDeferred, setInvitationDeferred] = useState(
    readSessionDeferredState,
  )
  const [handledInSession, setHandledInSession] = useState(false)
  const sourceRef = useRef<ProductTourSource>(PRODUCT_TOUR_SOURCES.Overview)
  const focusOriginRef = useRef<HTMLElement | null>(null)
  const finalizingRef = useRef(false)
  const viewedStepIndexesRef = useRef(new Set<number>())
  const startedOnMobileRef = useRef(false)
  const initialMobileSidebarOpenRef = useRef(false)
  const mobileSidebarOpenRef = useRef(isMobileSidebarOpen)
  const tourViewportRef = useRef<boolean | null>(null)
  mobileSidebarOpenRef.current = isMobileSidebarOpen

  const prepareMobileSurface = useCallback(
    async (surface: ProductTourMobileSurface) => {
      const shouldOpen = surface === "navigation"
      if (mobileSidebarOpenRef.current === shouldOpen) return

      mobileSidebarOpenRef.current = shouldOpen
      onMobileSidebarOpenChange(shouldOpen)
      await waitForMobileSidebarTransition(prefersReducedMotion)
    },
    [onMobileSidebarOpenChange, prefersReducedMotion],
  )

  const steps = useMemo(
    () =>
      buildProductTourSteps(t, {
        isCompact: isMobile,
        prepareMobileSurface,
      }),
    [isMobile, prepareMobileSurface, t],
  )

  const restoreFocus = useCallback(() => {
    const focusOrigin = focusOriginRef.current
    focusOriginRef.current = null
    window.setTimeout(() => {
      if (focusOrigin?.isConnected && focusOrigin !== document.body) {
        focusOrigin.focus()
        return
      }

      document
        .querySelector<HTMLElement>(`[${PRODUCT_TOUR_FOCUS_RETURN_ATTRIBUTE}]`)
        ?.focus()
    }, 0)
  }, [])

  const finishTour = useCallback(
    async (completed: boolean) => {
      if (finalizingRef.current) return
      finalizingRef.current = true
      if (startedOnMobileRef.current) {
        mobileSidebarOpenRef.current = initialMobileSidebarOpenRef.current
        onMobileSidebarOpenChange(initialMobileSidebarOpenRef.current)
        startedOnMobileRef.current = false
      }
      tourViewportRef.current = null
      setIsRunning(false)
      setHandledInSession(true)
      restoreFocus()

      void trackProductAnalyticsEvent(
        PRODUCT_ANALYTICS_EVENTS.FeatureActionCompleted,
        {
          feature_id: PRODUCT_ANALYTICS_FEATURE_IDS.ProductTour,
          action_id: PRODUCT_ANALYTICS_ACTION_IDS.RunProductTour,
          surface_id: getSourceSurface(sourceRef.current),
          entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
          result: completed
            ? PRODUCT_ANALYTICS_RESULTS.Success
            : PRODUCT_ANALYTICS_RESULTS.Skipped,
          item_count: viewedStepIndexesRef.current.size,
        },
      )

      try {
        const result = completed
          ? await completeProductTour(PRODUCT_TOUR_VERSION)
          : await dismissProductTour(PRODUCT_TOUR_VERSION)

        if (!result.ok) {
          toast.error(t("productTour:errors.saveProgress"))
        }
      } catch {
        toast.error(t("productTour:errors.saveProgress"))
      }
    },
    [
      completeProductTour,
      dismissProductTour,
      onMobileSidebarOpenChange,
      restoreFocus,
      t,
    ],
  )

  const startTour = useCallback(
    (source: ProductTourSource) => {
      if (isRunning) return
      if (!isMobile && isSidebarCollapsed) {
        onExpandSidebar()
      }

      startedOnMobileRef.current = isMobile
      initialMobileSidebarOpenRef.current = isMobileSidebarOpen
      tourViewportRef.current = isMobile

      sourceRef.current = source
      focusOriginRef.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null
      finalizingRef.current = false
      viewedStepIndexesRef.current.clear()
      setIsRunning(true)

      void trackProductAnalyticsEvent(
        PRODUCT_ANALYTICS_EVENTS.FeatureActionStarted,
        {
          feature_id: PRODUCT_ANALYTICS_FEATURE_IDS.ProductTour,
          action_id: PRODUCT_ANALYTICS_ACTION_IDS.RunProductTour,
          surface_id: getSourceSurface(source),
          entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
        },
      )
    },
    [
      isMobile,
      isMobileSidebarOpen,
      isRunning,
      isSidebarCollapsed,
      onExpandSidebar,
    ],
  )

  const deferTourInvitation = useCallback(() => {
    setInvitationDeferred(true)
    void trackProductAnalyticsEvent(
      PRODUCT_ANALYTICS_EVENTS.FeatureActionCompleted,
      {
        feature_id: PRODUCT_ANALYTICS_FEATURE_IDS.ProductTour,
        action_id: PRODUCT_ANALYTICS_ACTION_IDS.DeferProductTour,
        surface_id:
          PRODUCT_ANALYTICS_SURFACE_IDS.OptionsProductTourOverviewPrompt,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
        result: PRODUCT_ANALYTICS_RESULTS.Skipped,
      },
    )
    try {
      sessionStorage.setItem(PRODUCT_TOUR_SESSION_DEFERRED_KEY, "true")
    } catch {
      // Session persistence is optional; local state still defers the prompt.
    }
  }, [])

  const handleJoyrideEvent = useCallback(
    (event: EventData) => {
      if (
        event.type === EVENTS.TOOLTIP &&
        !viewedStepIndexesRef.current.has(event.index)
      ) {
        viewedStepIndexesRef.current.add(event.index)
        void trackProductAnalyticsEvent(
          PRODUCT_ANALYTICS_EVENTS.FeatureActionCompleted,
          {
            feature_id: PRODUCT_ANALYTICS_FEATURE_IDS.ProductTour,
            action_id: PRODUCT_ANALYTICS_ACTION_IDS.ViewProductTourStep,
            surface_id: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsProductTourTooltip,
            entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
            result: PRODUCT_ANALYTICS_RESULTS.Success,
            item_count: event.index + 1,
          },
        )
      }

      if (event.type === EVENTS.TOUR_END) {
        void finishTour(event.status === STATUS.FINISHED)
      }
    },
    [finishTour],
  )

  useEffect(() => {
    if (!isRunning) return

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      event.preventDefault()
      event.stopPropagation()
      void finishTour(false)
    }

    window.addEventListener("keydown", handleEscape, true)
    return () => window.removeEventListener("keydown", handleEscape, true)
  }, [finishTour, isRunning])

  useEffect(() => {
    if (
      isRunning &&
      tourViewportRef.current !== null &&
      tourViewportRef.current !== isMobile
    ) {
      void finishTour(false)
    }
  }, [finishTour, isMobile, isRunning])

  const value = useMemo<ProductTourContextValue>(
    () => ({
      isRunning,
      shouldOfferTour:
        !isRunning &&
        !invitationDeferred &&
        !handledInSession &&
        shouldOfferProductTour(preferences.productTour),
      startTour,
      deferTourInvitation,
    }),
    [
      deferTourInvitation,
      handledInSession,
      invitationDeferred,
      isRunning,
      preferences.productTour,
      startTour,
    ],
  )

  return (
    <ProductTourContext.Provider value={value}>
      {children}
      <Joyride
        run={isRunning}
        continuous
        steps={steps}
        onEvent={handleJoyrideEvent}
        tooltipComponent={ProductTourTooltip}
        locale={{
          back: t("productTour:actions.back"),
          close: t("productTour:actions.close"),
          last: t("productTour:actions.finish"),
          next: t("productTour:actions.next"),
          skip: t("productTour:actions.skip"),
        }}
        options={{
          blockTargetInteraction: true,
          buttons: ["back", "close", "primary", "skip"],
          closeButtonAction: "skip",
          dismissKeyAction: false,
          overlayClickAction: false,
          scrollDuration: prefersReducedMotion ? 0 : 250,
          scrollOffset: 24,
          showProgress: false,
          skipBeacon: true,
          spotlightPadding: 8,
          spotlightRadius: 10,
          targetWaitTimeout: 1500,
          width: "min(352px, calc(100vw - 2rem))",
          zIndex: 90,
        }}
      />
    </ProductTourContext.Provider>
  )
}

/** Access the options product-tour controller. */
export function useProductTour() {
  const context = useContext(ProductTourContext)
  if (!context) {
    throw new Error("useProductTour must be used within ProductTourProvider")
  }
  return context
}
