import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"

import {
  featureGuidanceState,
  PRODUCT_TOUR_OUTCOMES,
  type FeatureGuidanceState,
  type GatewayGuidanceSurface,
  type ProductTourVariant,
} from "~/services/featureGuidance/featureGuidanceState"

interface FeatureGuidanceContextValue {
  state: FeatureGuidanceState
  completeProductTour: (
    variant: ProductTourVariant,
    version: number,
  ) => Promise<void>
  dismissProductTour: (
    variant: ProductTourVariant,
    version: number,
  ) => Promise<void>
  markGatewayGuidanceOnboardingCompleted: () => Promise<void>
  dismissGatewayGuidanceSurface: (
    surface: GatewayGuidanceSurface,
  ) => Promise<void>
  reloadFeatureGuidance: () => Promise<void>
}

const FeatureGuidanceContext = createContext<
  FeatureGuidanceContextValue | undefined
>(undefined)

/** Provides versioned product-guidance history independently from user settings. */
export function FeatureGuidanceProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<FeatureGuidanceState | null>(null)

  const reloadFeatureGuidance = useCallback(async () => {
    setState(await featureGuidanceState.getState())
  }, [])

  useEffect(() => {
    void reloadFeatureGuidance()
    return featureGuidanceState.watchState(setState)
  }, [reloadFeatureGuidance])

  const completeProductTour = useCallback(
    async (variant: ProductTourVariant, version: number) => {
      setState(
        await featureGuidanceState.markProductTourHandled(
          variant,
          version,
          PRODUCT_TOUR_OUTCOMES.Completed,
        ),
      )
    },
    [],
  )

  const dismissProductTour = useCallback(
    async (variant: ProductTourVariant, version: number) => {
      setState(
        await featureGuidanceState.markProductTourHandled(
          variant,
          version,
          PRODUCT_TOUR_OUTCOMES.Dismissed,
        ),
      )
    },
    [],
  )

  const markGatewayGuidanceOnboardingCompleted = useCallback(async () => {
    setState(
      await featureGuidanceState.markGatewayGuidanceOnboardingCompleted(),
    )
  }, [])

  const dismissGatewayGuidanceSurface = useCallback(
    async (surface: GatewayGuidanceSurface) => {
      setState(
        await featureGuidanceState.dismissGatewayGuidanceSurface(surface),
      )
    },
    [],
  )

  const value = useMemo<FeatureGuidanceContextValue | null>(
    () =>
      state
        ? {
            state,
            completeProductTour,
            dismissProductTour,
            markGatewayGuidanceOnboardingCompleted,
            dismissGatewayGuidanceSurface,
            reloadFeatureGuidance,
          }
        : null,
    [
      completeProductTour,
      dismissGatewayGuidanceSurface,
      dismissProductTour,
      markGatewayGuidanceOnboardingCompleted,
      reloadFeatureGuidance,
      state,
    ],
  )

  if (!value) return null

  return (
    <FeatureGuidanceContext.Provider value={value}>
      {children}
    </FeatureGuidanceContext.Provider>
  )
}

/** Consumes persisted feature-guidance history and its domain actions. */
export function useFeatureGuidanceContext() {
  const context = useContext(FeatureGuidanceContext)
  if (!context) {
    throw new Error(
      "useFeatureGuidanceContext must be used within FeatureGuidanceProvider",
    )
  }
  return context
}
