import { useLayoutEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import toast from "~/lib/notify"
import type { AccountRuntimeKey } from "~/services/accounts/accountRuntimeKeys"
import { resolveDisplayAccountRuntimeKeySecret } from "~/services/accounts/utils/apiServiceRequest"
import { startProductAnalyticsAction } from "~/services/productAnalytics/actions"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"
import { siteTypeObservations } from "~/services/siteDetection/siteTypeObservations"
import type { DisplaySiteData } from "~/types"

/** Resolve plaintext only for a current user action and discard stale disclosures. */
export function useRuntimeKeyDisclosure(
  account: DisplaySiteData,
  runtimeKey: AccountRuntimeKey,
) {
  const { t } = useTranslation("keyManagement")
  const sourceRef = useRef<AbortController | null>(null)
  const resolvingRef = useRef(false)
  const [secret, setSecret] = useState<string | null>(null)
  const [visible, setVisible] = useState(false)
  const [resolving, setResolving] = useState(false)

  useLayoutEffect(() => {
    const source = new AbortController()
    sourceRef.current = source
    resolvingRef.current = false
    setSecret(null)
    setVisible(false)
    setResolving(false)
    return () => source.abort()
  }, [
    account.id,
    account.baseUrl,
    account.siteType,
    account.authType,
    account.token,
    account.userId,
    account.cookieAuthSessionCookie,
    runtimeKey.id,
    runtimeKey.secret,
  ])

  const run = async (copy: boolean) => {
    if (!copy && visible) {
      setVisible(false)
      return
    }
    if (!copy && secret) {
      setVisible(true)
      return
    }
    if (resolvingRef.current) return
    const source = sourceRef.current
    if (!source || source.signal.aborted) return
    const tracker = startProductAnalyticsAction({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.KeyManagement,
      actionId: copy
        ? PRODUCT_ANALYTICS_ACTION_IDS.CopyAccountTokenKey
        : PRODUCT_ANALYTICS_ACTION_IDS.RevealAccountTokenKey,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsKeyManagementRowActions,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
    resolvingRef.current = true
    setResolving(true)

    const failureMessage = copy
      ? t("messages.copyFailed")
      : t("messages.revealFailed")

    /**
     * Revealing a masked key is where a site type that no longer matches shows up
     * (the request uses this type's verb), so the failure carries the type the
     * site itself resolves to when a check-in run recorded one.
     */
    const describeRevealFailure = async () => {
      const mismatch = await siteTypeObservations.readForAccount(
        account.id,
        account.siteType,
      )
      if (!mismatch) return failureMessage

      return `${failureMessage} ${t("messages.keySiteTypeMismatch", {
        storedType: mismatch.storedSiteType,
        suggestedType: mismatch.suggestedSiteType,
      })}`
    }

    try {
      let resolved: Awaited<
        ReturnType<typeof resolveDisplayAccountRuntimeKeySecret>
      >
      try {
        resolved = await resolveDisplayAccountRuntimeKeySecret(
          account,
          runtimeKey,
          { abortSignal: source.signal },
        )
      } catch {
        if (source.signal.aborted) {
          tracker.complete(PRODUCT_ANALYTICS_RESULTS.Cancelled)
          return
        }
        tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
          errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
        })
        toast.error(await describeRevealFailure())
        return
      }

      if (source.signal.aborted || sourceRef.current !== source) {
        tracker.complete(PRODUCT_ANALYTICS_RESULTS.Cancelled)
        return
      }
      if (copy) {
        await navigator.clipboard.writeText(resolved.secret)
        if (source.signal.aborted || sourceRef.current !== source) {
          tracker.complete(PRODUCT_ANALYTICS_RESULTS.Cancelled)
          return
        }
        toast.success(t("messages.keyCopied", { name: runtimeKey.label }))
      } else {
        setSecret(resolved.secret)
        setVisible(true)
      }
      tracker.complete(PRODUCT_ANALYTICS_RESULTS.Success)
    } catch {
      if (source.signal.aborted) {
        tracker.complete(PRODUCT_ANALYTICS_RESULTS.Cancelled)
        return
      }
      tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
      })
      toast.error(failureMessage)
    } finally {
      if (sourceRef.current === source) {
        resolvingRef.current = false
        setResolving(false)
      }
    }
  }

  return {
    secret: visible ? secret : null,
    visible,
    resolving,
    toggle: () => run(false),
    copy: () => run(true),
  }
}
