import type { ComponentProps, ReactNode } from "react"

import { VerificationPromptEditor } from "./VerificationPromptEditor"
import { VerificationSettingsCard } from "./VerificationSettingsCard"

/** Keep the shared prompt editor and optional test-specific options in one settings surface. */
export function VerificationPromptSettings({
  children,
  ...editor
}: ComponentProps<typeof VerificationPromptEditor> & { children?: ReactNode }) {
  return (
    <VerificationSettingsCard>
      {children}
      {children ? (
        <div className="border-border-subtle border-t pt-4">
          <VerificationPromptEditor {...editor} />
        </div>
      ) : (
        <VerificationPromptEditor {...editor} />
      )}
    </VerificationSettingsCard>
  )
}
