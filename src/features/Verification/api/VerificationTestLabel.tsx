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
  Terminal,
  Video,
  Wrench,
  type LucideIcon,
} from "lucide-react"
import type { ReactNode } from "react"

import {
  API_VERIFICATION_PROBE_IDS,
  type ApiVerificationProbeId,
} from "~/services/verification/aiApiVerification"
import type { CliToolId } from "~/services/verification/cliSupportVerification"
import { PELICAN_PROMPT_ID } from "~/services/verification/modelQuality/constants"

type VerificationTestId =
  | ApiVerificationProbeId
  | CliToolId
  | typeof PELICAN_PROMPT_ID

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
  claude: Terminal,
  codex: Terminal,
  gemini: Terminal,
}

/** Consistent decorative test icons without changing translated labels. */
export function VerificationTestLabel({
  testId,
  children,
}: {
  testId: VerificationTestId
  children: ReactNode
}) {
  const Icon = TEST_ICONS[testId]
  return (
    <span className="inline-flex max-w-full min-w-0 items-center gap-2">
      <Icon
        className="text-muted-foreground size-4 shrink-0"
        aria-hidden="true"
      />
      <span className="truncate">{children}</span>
    </span>
  )
}
