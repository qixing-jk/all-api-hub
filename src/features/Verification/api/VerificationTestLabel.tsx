import {
  ArrowDownUp,
  Binary,
  Braces,
  GitBranch,
  Globe,
  Image,
  List,
  MessageSquareText,
  Palette,
  ScanText,
  Search,
  Video,
  Wrench,
  type LucideIcon,
} from "lucide-react"
import type { ReactNode } from "react"

import {
  API_VERIFICATION_PROBE_IDS,
  type ApiVerificationProbeId,
} from "~/services/verification/aiApiVerification"
import { PELICAN_PROMPT_ID } from "~/services/verification/modelQuality/constants"
import { CONTEXT_CAPACITY_TEST_ID } from "~/services/verification/modelQuality/contextCapacityConstants"
import { NEEDLE_TEST_ID } from "~/services/verification/modelQuality/needleConstants"

export type VerificationTestId =
  | ApiVerificationProbeId
  | typeof PELICAN_PROMPT_ID
  | typeof CONTEXT_CAPACITY_TEST_ID
  | typeof NEEDLE_TEST_ID

const TEST_ICONS: Record<VerificationTestId, LucideIcon> = {
  [API_VERIFICATION_PROBE_IDS.Models]: List,
  [API_VERIFICATION_PROBE_IDS.TextGeneration]: MessageSquareText,
  [API_VERIFICATION_PROBE_IDS.ToolCalling]: Wrench,
  [API_VERIFICATION_PROBE_IDS.StructuredOutput]: Braces,
  [API_VERIFICATION_PROBE_IDS.WebSearch]: Globe,
  [API_VERIFICATION_PROBE_IDS.Embedding]: Binary,
  [API_VERIFICATION_PROBE_IDS.Rerank]: ArrowDownUp,
  [API_VERIFICATION_PROBE_IDS.ImageGeneration]: Image,
  [API_VERIFICATION_PROBE_IDS.VideoGeneration]: Video,
  [API_VERIFICATION_PROBE_IDS.Decision]: GitBranch,
  [PELICAN_PROMPT_ID]: Palette,
  [CONTEXT_CAPACITY_TEST_ID]: ScanText,
  [NEEDLE_TEST_ID]: Search,
}

/** Consistent decorative test icons without changing translated labels. */
function VerificationTestIcon({
  testId,
  className,
}: {
  testId: VerificationTestId
  className?: string
}) {
  const Icon = TEST_ICONS[testId]
  return <Icon className={className} aria-hidden="true" />
}

/** Pairs the shared decorative icon with a readable test label. */
export function VerificationTestLabel({
  testId,
  children,
}: {
  testId: VerificationTestId
  children: ReactNode
}) {
  return (
    <span className="flex max-w-full min-w-0 items-center gap-2">
      <VerificationTestIcon
        testId={testId}
        className="text-muted-foreground size-4 shrink-0"
      />
      <span className="truncate">{children}</span>
    </span>
  )
}
