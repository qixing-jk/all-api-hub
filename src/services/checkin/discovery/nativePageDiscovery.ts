import { normalizeCheckInPagePath } from "~/services/checkin/autoCheckin/configuration/nativePagePath"
import {
  NATIVE_CHECK_IN_PAGE_SOURCES,
  NATIVE_CHECK_IN_PAGE_STATES,
  type CheckInNavigationEvidence,
  type NativeCheckInPageCandidate,
} from "~/services/checkin/discovery/evidence/scanTypes"

/** A read-only page observation, never a grant or proof of authentication. */
export interface NativeCheckInPageProbe extends CheckInNavigationEvidence {
  success: boolean
  hasTarget: boolean
  hasCheckInArea?: boolean
  /** Multiple native actions cannot authorize any automatic choice. */
  hasAmbiguousTarget?: boolean
  pageUrl?: string
}

export interface NativeCheckInPageExploration {
  candidates: NativeCheckInPageCandidate[]
  complete: boolean
  /** An unavailable inspector retains the old trigger's own target checks. */
  inspectionUnavailable?: boolean
}

export interface NativeCheckInPageDiscoveryInput {
  pageUrl: string
  navigate: (url: string) => Promise<unknown>
  inspect: () => Promise<NativeCheckInPageProbe>
  scan?: () => Promise<NativeCheckInPageExploration>
  /** Previously verified hint; still requires a new target inspection. */
  learnedPath?: string
  signal?: AbortSignal
}

const MAX_CANDIDATE_PAGES = 3

const toPath = (url: URL) => url.pathname + url.search + url.hash

/** Manual review can use observations from a partially explored site. */
export async function exploreNativeCheckInPages(
  input: NativeCheckInPageDiscoveryInput,
): Promise<NativeCheckInPageExploration> {
  return inspectNativeCheckInPages(input, false)
}

/** Both entrances inspect the page and bounded same-origin alternatives without clicking. */
async function inspectNativeCheckInPages(
  input: NativeCheckInPageDiscoveryInput,
  requireComplete: boolean,
): Promise<NativeCheckInPageExploration> {
  input.signal?.throwIfAborted()
  const origin = new URL(input.pageUrl).origin
  const candidates = new Map<string, NativeCheckInPageCandidate>()
  let current = input.pageUrl
  let complete = true
  const add = (candidate: NativeCheckInPageCandidate) => {
    if (!normalizeCheckInPagePath(candidate.path)) return
    const previous = candidates.get(candidate.path)
    candidates.set(candidate.path, {
      ...previous,
      ...candidate,
      sources: [
        ...new Set([...(previous?.sources ?? []), ...candidate.sources]),
      ],
    })
  }
  const observe = (
    candidate: NativeCheckInPageCandidate,
    probe: NativeCheckInPageProbe,
  ) => {
    const url = new URL(probe.pageUrl ?? new URL(candidate.path, origin).href)
    if (!probe.success || url.origin !== origin) {
      complete = false
      return
    }
    if (probe.hasAmbiguousTarget) complete = false
    const found = probe.hasTarget || probe.hasCheckInArea
    add({
      ...candidate,
      path: found ? toPath(url) : candidate.path,
      sources: found
        ? [...candidate.sources, NATIVE_CHECK_IN_PAGE_SOURCES.Area]
        : candidate.sources,
      state: probe.hasTarget
        ? NATIVE_CHECK_IN_PAGE_STATES.Actionable
        : probe.hasCheckInArea
          ? NATIVE_CHECK_IN_PAGE_STATES.Area
          : NATIVE_CHECK_IN_PAGE_STATES.Unverified,
    })
  }
  try {
    let initial: NativeCheckInPageProbe
    try {
      initial = await input.inspect()
    } catch {
      input.signal?.throwIfAborted()
      return { candidates: [], complete: false, inspectionUnavailable: true }
    }
    input.signal?.throwIfAborted()
    if (!initial.success)
      return { candidates: [], complete: false, inspectionUnavailable: true }
    if (initial.hasTarget || initial.hasCheckInArea) {
      observe({ path: toPath(new URL(input.pageUrl)), sources: [] }, initial)
      return { candidates: [...candidates.values()], complete }
    }
    if (input.learnedPath && normalizeCheckInPagePath(input.learnedPath)) {
      current = new URL(input.learnedPath, origin).href
      try {
        await input.navigate(current)
        const probe = await input.inspect()
        input.signal?.throwIfAborted()
        if (
          probe.success &&
          new URL(probe.pageUrl ?? current).origin === origin &&
          (probe.hasTarget || probe.hasCheckInArea)
        ) {
          observe({ path: input.learnedPath, sources: [] }, probe)
          return { candidates: [...candidates.values()], complete }
        }
      } catch {
        input.signal?.throwIfAborted()
      }
      await input.navigate(input.pageUrl)
      current = input.pageUrl
    }
    complete = initial.candidatesComplete !== false
    const initialPaths = new Set(
      initial.candidates.filter((path) => normalizeCheckInPagePath(path)),
    )
    for (const path of initialPaths)
      add({
        path,
        sources: [NATIVE_CHECK_IN_PAGE_SOURCES.Navigation],
        state: NATIVE_CHECK_IN_PAGE_STATES.Unverified,
      })
    const checked = new Set<string>([toPath(new URL(input.pageUrl))])
    const inspectCandidates = async () => {
      if (requireComplete && !complete) return
      const pending = [...candidates.values()].filter(
        (candidate) => !checked.has(candidate.path),
      )
      const remaining = MAX_CANDIDATE_PAGES - (checked.size - 1)
      if (pending.length > remaining) {
        complete = false
        if (requireComplete) return
      }
      for (const candidate of pending.slice(0, remaining)) {
        input.signal?.throwIfAborted()
        checked.add(candidate.path)
        current = new URL(candidate.path, origin).href
        await input.navigate(current)
        const probe = await input.inspect()
        input.signal?.throwIfAborted()
        observe(candidate, probe)
      }
    }
    await inspectCandidates()
    const found = () =>
      [...candidates.values()].some(
        (candidate) =>
          candidate.state !== NATIVE_CHECK_IN_PAGE_STATES.Unverified,
      )
    if (!found() && input.scan) {
      if (current !== input.pageUrl) {
        await input.navigate(input.pageUrl)
        current = input.pageUrl
      }
      input.signal?.throwIfAborted()
      const clues = await input.scan()
      input.signal?.throwIfAborted()
      complete &&= clues.complete
      clues.candidates.forEach((candidate) =>
        add({ ...candidate, state: NATIVE_CHECK_IN_PAGE_STATES.Unverified }),
      )
      if (!requireComplete) {
        // The rendered page can finish hydrating while the source scan runs.
        try {
          const probe = await input.inspect()
          input.signal?.throwIfAborted()
          if (!probe.success) complete = false
          else if (probe.hasTarget || probe.hasCheckInArea)
            observe(
              { path: toPath(new URL(input.pageUrl)), sources: [] },
              probe,
            )
        } catch {
          input.signal?.throwIfAborted()
          complete = false
        }
      }
      if (!found()) await inspectCandidates()
    }
    return { candidates: [...candidates.values()], complete }
  } catch {
    input.signal?.throwIfAborted()
    return { candidates: [...candidates.values()], complete: false }
  } finally {
    if (current !== input.pageUrl && !input.signal?.aborted)
      await input.navigate(input.pageUrl)
  }
}

/** Script clues and checked areas never authorize a click. */
export async function discoverNativeCheckInPage(
  input: NativeCheckInPageDiscoveryInput,
): Promise<string | null> {
  const result = await inspectNativeCheckInPages(input, true)
  input.signal?.throwIfAborted()
  if (result.inspectionUnavailable) return input.pageUrl
  const matches = result.candidates.filter(
    (candidate) => candidate.state === NATIVE_CHECK_IN_PAGE_STATES.Actionable,
  )
  if (!result.complete || matches.length !== 1) return null
  const destination = new URL(matches[0]!.path, input.pageUrl).href
  if (destination !== input.pageUrl) await input.navigate(destination)
  return destination
}
