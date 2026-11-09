/** Preserve whitespace and bound raw response evidence across verification tests. */
export function VerificationOutputText({ text }: { text: string }) {
  return (
    <pre className="text-secondary-foreground max-h-64 overflow-auto text-xs break-words whitespace-pre-wrap">
      {text}
    </pre>
  )
}
