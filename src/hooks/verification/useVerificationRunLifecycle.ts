import { useCallback, useRef, useState } from "react"

import {
  getApiVerificationProbeDefinitions,
  type ApiVerificationApiType,
  type ApiVerificationProbeId,
} from "~/services/verification/aiApiVerification"

/** Owns controllers and queue interruption for account and profile verification. */
export function useVerificationRunLifecycle() {
  const [isRunning, setIsRunning] = useState(false)
  const stopped = useRef(false)
  const suite = useRef<AbortController | null>(null)
  const probes = useRef(new Map<ApiVerificationProbeId, AbortController>())

  const isStopped = useCallback(
    (signal?: AbortSignal) => stopped.current || Boolean(signal?.aborted),
    [],
  )

  const runSuite = useCallback(
    async (execute: (signal: AbortSignal) => Promise<void>) => {
      stopped.current = false
      const controller = new AbortController()
      suite.current = controller
      setIsRunning(true)
      try {
        await execute(controller.signal)
      } finally {
        if (suite.current === controller) suite.current = null
        setIsRunning(false)
      }
    },
    [],
  )

  const runProbe = useCallback(
    async <T>(
      probeId: ApiVerificationProbeId,
      execute: (signal: AbortSignal) => Promise<T>,
    ): Promise<T> => {
      stopped.current = false
      const controller = new AbortController()
      probes.current.set(probeId, controller)
      try {
        return await execute(controller.signal)
      } finally {
        if (probes.current.get(probeId) === controller)
          probes.current.delete(probeId)
      }
    },
    [],
  )

  const runSequentialProbes = useCallback(
    async (
      apiType: ApiVerificationApiType,
      execute: (
        probe: ReturnType<typeof getApiVerificationProbeDefinitions>[number],
        signal: AbortSignal,
      ) => Promise<void>,
      signal: AbortSignal,
    ) => {
      for (const probe of getApiVerificationProbeDefinitions(apiType)) {
        if (isStopped(signal)) break
        await execute(probe, signal)
      }
    },
    [isStopped],
  )

  const stopSuite = useCallback(() => {
    stopped.current = true
    suite.current?.abort()
  }, [])

  const stopProbe = useCallback(
    (probeId: ApiVerificationProbeId, options?: { interruptRun: boolean }) => {
      if (options?.interruptRun) stopped.current = true
      probes.current.get(probeId)?.abort()
    },
    [],
  )

  const stopAll = useCallback(() => {
    stopSuite()
    probes.current.forEach((controller) => controller.abort())
  }, [stopSuite])

  const reset = useCallback(() => {
    stopped.current = false
    suite.current?.abort()
    suite.current = null
    probes.current.forEach((controller) => controller.abort())
    probes.current.clear()
  }, [])

  return {
    isRunning,
    isStopped,
    runSuite,
    runProbe,
    runSequentialProbes,
    stopSuite,
    stopProbe,
    stopAll,
    reset,
  }
}
