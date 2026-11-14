import { Bot } from "lucide-react"
import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"

import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "~/components/ai-elements/conversation"
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "~/components/ai-elements/reasoning"
import { Tool, ToolContent, ToolHeader } from "~/components/ai-elements/tool"
import { MarkdownContent } from "~/components/MarkdownContent"
import { Alert, Badge } from "~/components/ui"
import { Message, MessageContent } from "~/components/ui/message"
import {
  VERIFICATION_GENERATION_PART_TYPES,
  VERIFICATION_GENERATION_TOOL_STATES,
} from "~/services/verification/aiApiVerification/generationProgress"
import type { VerificationGenerationPart } from "~/services/verification/aiApiVerification/generationProgress"

import { VerificationOutputText } from "./VerificationOutputText"

/** Present each received block once; late results stay attached to their tool call. */
export function VerificationGenerationFeed({
  parts,
  running,
  partial,
  activity,
  question,
}: {
  parts: VerificationGenerationPart[]
  running: boolean
  partial: boolean
  activity?: ReactNode
  question?: string
}) {
  const { t } = useTranslation("aiApiVerification")
  return (
    <div
      data-slot="verification-feed"
      className="flex min-h-0 min-w-0 flex-1 flex-col [@container(min-width:52rem)]:min-h-48"
    >
      <Conversation
        aria-label={t("verifyDialog.generation.process")}
        aria-live="off"
      >
        <ConversationContent aria-label={t("verifyDialog.generation.process")}>
          {question ? (
            <Message
              role="region"
              align="end"
              aria-label={t("verifyDialog.tools.questionAnswer.runQuestion")}
              className="mb-5"
            >
              <MessageContent className="w-fit max-w-[90%] rounded-2xl rounded-tr-sm bg-muted px-4 py-3">
                <p className="text-sm break-words whitespace-pre-wrap text-foreground">
                  {question}
                </p>
              </MessageContent>
            </Message>
          ) : null}
          <ol className="space-y-5">
            {parts.map((part, index) => (
              <li key={part.id} className="min-w-0">
                {part.type === VERIFICATION_GENERATION_PART_TYPES.Text ? (
                  <section
                    aria-label={t("verifyDialog.tools.questionAnswer.response")}
                    className="space-y-2"
                  >
                    <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                      <span
                        aria-hidden="true"
                        className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted"
                      >
                        <Bot className="size-4" />
                      </span>
                      {t("verifyDialog.tools.questionAnswer.response")}
                    </p>
                    <MarkdownContent
                      content={part.text}
                      streaming={running && index === parts.length - 1}
                    />
                  </section>
                ) : part.type ===
                  VERIFICATION_GENERATION_PART_TYPES.Reasoning ? (
                  <Reasoning streaming={running && index === parts.length - 1}>
                    <ReasoningTrigger>
                      {t("verifyDialog.generation.reasoning")}
                    </ReasoningTrigger>
                    <ReasoningContent
                      collapseLabel={t(
                        "verifyDialog.generation.collapseReasoning",
                      )}
                      streaming={running && index === parts.length - 1}
                    >
                      {part.text}
                    </ReasoningContent>
                  </Reasoning>
                ) : part.type === VERIFICATION_GENERATION_PART_TYPES.Error ? (
                  <Alert variant="warning">{part.text}</Alert>
                ) : (
                  <Tool>
                    <ToolHeader
                      title={part.name}
                      status={
                        <Badge
                          size="sm"
                          variant={
                            part.state ===
                            VERIFICATION_GENERATION_TOOL_STATES.OutputError
                              ? "danger"
                              : part.state ===
                                  VERIFICATION_GENERATION_TOOL_STATES.OutputAvailable
                                ? "success"
                                : "outline"
                          }
                        >
                          {part.state ===
                          VERIFICATION_GENERATION_TOOL_STATES.OutputError
                            ? t("verifyDialog.generation.toolError")
                            : part.state ===
                                VERIFICATION_GENERATION_TOOL_STATES.OutputAvailable
                              ? t("verifyDialog.generation.toolCompleted")
                              : !running
                                ? t("verifyDialog.generation.toolIncomplete")
                                : part.state ===
                                    VERIFICATION_GENERATION_TOOL_STATES.InputStreaming
                                  ? t("verifyDialog.generation.toolPreparing")
                                  : t("verifyDialog.generation.toolRunning")}
                        </Badge>
                      }
                    />
                    <ToolContent>
                      {part.input ? (
                        <section className="space-y-1">
                          <p className="text-xs text-muted-foreground">
                            {t("verifyDialog.details.input")}
                          </p>
                          <VerificationOutputText text={part.input} />
                        </section>
                      ) : null}
                      {part.output !== undefined ? (
                        <section className="space-y-1">
                          <p className="text-xs text-muted-foreground">
                            {t("verifyDialog.details.output")}
                          </p>
                          <VerificationOutputText text={part.output} />
                        </section>
                      ) : null}
                    </ToolContent>
                  </Tool>
                )}
              </li>
            ))}
          </ol>
          {activity}
        </ConversationContent>
        <ConversationScrollButton>
          {!running &&
          !partial &&
          parts.some(
            (part) => part.type === VERIFICATION_GENERATION_PART_TYPES.Text,
          )
            ? t("verifyDialog.generation.jumpToAnswer")
            : t("verifyDialog.generation.jumpToLatest")}
        </ConversationScrollButton>
      </Conversation>
    </div>
  )
}
