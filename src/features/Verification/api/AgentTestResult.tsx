import { useTranslation } from "react-i18next"

import { Alert, CollapsibleSection } from "~/components/ui"
import { AGENT_TEST_OUTCOMES } from "~/services/verification/modelQuality/constants"
import type { PelicanTestResult } from "~/services/verification/modelQuality/pelican"

/** Local evidence for a bounded tool run; no model content is sent to telemetry. */
export function AgentTestResult({
  agent,
  latencyMs,
  showCalls = true,
}: {
  agent: NonNullable<PelicanTestResult["agent"]>
  latencyMs: number
  showCalls?: boolean
}) {
  const { t } = useTranslation("aiApiVerification")
  return (
    <div className="space-y-density-2" data-testid="agent-test-result">
      <div className="text-xs text-muted-foreground">
        {t("verifyDialog.tools.agent.summary", {
          steps: agent.steps,
          calls: agent.calls.length,
          seconds: (latencyMs / 1000).toFixed(1),
        })}
      </div>
      {agent.outcome === AGENT_TEST_OUTCOMES.Completed ? (
        <div className="text-xs text-muted-foreground">
          {t("verifyDialog.tools.agent.completed")}
        </div>
      ) : (
        <Alert variant="warning">
          <p>{t("verifyDialog.tools.agent.noArtifact")}</p>
        </Alert>
      )}
      {showCalls ? (
        <CollapsibleSection
          title={t("verifyDialog.tools.agent.calls")}
          buttonClassName="border-border-subtle bg-surface-subtle rounded-md border px-3 py-2"
        >
          <ol className="max-h-64 space-y-density-2 overflow-auto">
            {agent.calls.map((call, index) => (
              <li
                key={index}
                className="rounded-md border border-border-subtle p-2"
              >
                <span className="text-xs font-medium text-foreground">
                  {call.toolName}
                </span>
                <pre className="mt-density-1 text-xs break-words whitespace-pre-wrap text-secondary-foreground">
                  {JSON.stringify(
                    { input: call.input, output: call.output },
                    null,
                    2,
                  )}
                </pre>
              </li>
            ))}
          </ol>
        </CollapsibleSection>
      ) : null}
      <CollapsibleSection
        title={t("verifyDialog.tools.agent.files")}
        buttonClassName="border-border-subtle bg-surface-subtle rounded-md border px-3 py-2"
      >
        {agent.files.map((file) => (
          <CollapsibleSection
            key={file.path}
            title={file.path}
            buttonClassName="border-border-subtle rounded-md border px-3 py-2"
          >
            <pre className="max-h-64 overflow-auto text-xs break-words whitespace-pre-wrap text-secondary-foreground">
              {file.content}
            </pre>
          </CollapsibleSection>
        ))}
      </CollapsibleSection>
    </div>
  )
}
