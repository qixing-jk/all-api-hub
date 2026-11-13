import { useState } from "react"

/** Freeze the prompt at run admission; later draft edits belong to the next run. */
export function useVerificationRunPrompt({
  running,
  startedAt,
  draft,
  resultPrompt,
}: {
  running: boolean
  startedAt?: number
  draft?: string
  resultPrompt?: string
}) {
  const [snapshot, setSnapshot] = useState<{
    running: boolean
    startedAt?: number
    prompt?: string
  }>({ running: false })
  let current = snapshot
  if (
    running !== snapshot.running ||
    (running && startedAt !== snapshot.startedAt)
  ) {
    current = running
      ? { running, startedAt, prompt: draft }
      : { ...snapshot, running }
    setSnapshot(current)
  }
  return (
    resultPrompt ??
    (running || (startedAt !== undefined && startedAt === current.startedAt)
      ? current.prompt
      : undefined)
  )
}
