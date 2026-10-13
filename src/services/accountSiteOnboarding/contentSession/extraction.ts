import { isUnknownAccountSiteType } from "~/constants/siteType"
import { getContentSessionExtractors } from "~/services/accountSiteOnboarding/registry"

import {
  ContentSessionProtocolError,
  type ContentSessionExtractionContext,
} from "../contracts"

export class ContentSessionOriginMismatchError extends Error {}

/** Selects registered session protocols; speculative failure cannot block later candidates. */
export async function extractContentSession(
  context: ContentSessionExtractionContext,
  assertOrigin: () => void,
) {
  const { diagnostics, ...selectionContext } = context
  const allowProbe =
    isUnknownAccountSiteType(context.siteTypeHint) &&
    context.allowSessionProbe === true
  let probeError: unknown
  let probeFailed = false
  const extractors = getContentSessionExtractors()
  const candidates = allowProbe
    ? [
        ...extractors.filter((extractor) => !extractor.isUnverifiedFallback),
        ...extractors.filter((extractor) => extractor.isUnverifiedFallback),
      ]
    : extractors
  for (const extractor of candidates) {
    assertOrigin()
    if (allowProbe && probeFailed && extractor.isUnverifiedFallback) continue
    const canExtract = extractor.canExtract(selectionContext)
    if (!canExtract && !(allowProbe && extractor.probe)) continue
    diagnostics?.record("extractor_started", {
      extractor: extractor.id,
      siteType: context.siteTypeHint,
      ...(canExtract ? {} : { mode: "probe" }),
    })
    let result
    let failed = false
    if (canExtract) {
      // A confirmed protocol error remains authoritative (e.g. an invalid
      // New API AuthBundle must never fall through to stale stored user data).
      result = await extractor.extract(context)
    } else {
      try {
        result = await extractor.probe!(context)
      } catch (error) {
        if (error instanceof ContentSessionProtocolError) {
          assertOrigin()
          throw error
        }
        if (!probeFailed) probeError = error
        probeFailed = true
        failed = true
        diagnostics?.record("extractor_finished", {
          extractor: extractor.id,
          outcome: "probe_failed",
        })
      }
    }
    assertOrigin()
    if (failed) continue
    diagnostics?.record("extractor_finished", {
      extractor: extractor.id,
      outcome: result ? "success" : "empty",
    })
    if (!result) continue
    diagnostics?.finish("success", { extractor: extractor.id })
    return result
  }
  if (probeFailed) throw probeError
  return null
}
