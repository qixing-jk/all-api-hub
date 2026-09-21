/** Escapes literal diagnostic cells without interpreting user edits as HTML. */
function escapeDiagnosticCell(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
}

/** Formats literal diagnostic fields into one shared disclosure table layout. */
export function formatDiagnosticSection(label: string, value: string): string {
  if (!value.trim()) return ""
  const rows: string[] = []
  let literalLines: string[] = []
  const flushLiteralLines = () => {
    if (!literalLines.length) return
    rows.push(
      `<tr><td colspan="2">${literalLines.map(escapeDiagnosticCell).join("<br>")}</td></tr>`,
    )
    literalLines = []
  }
  for (const line of value.split(/\r?\n/)) {
    // The delimiter is a colon followed by a space (or end of line), which
    // retains colons inside method IDs and endpoint paths in the field name.
    const match = /^\s*(?:- )?(.+?):(?: (.*))?$/.exec(line)
    if (!match) {
      literalLines.push(line)
      continue
    }
    flushLiteralLines()
    const key = match[1]
    if (key === undefined) {
      literalLines.push(line)
      continue
    }
    const fieldValue = match[2]
    const name = /^[a-zA-Z][a-zA-Z0-9_]*$/.test(key)
      ? key
          .replace(/([a-z])([A-Z])/g, "$1 $2")
          .replaceAll("_", " ")
          .toLowerCase()
      : key
    rows.push(
      fieldValue === undefined
        ? `<tr><th colspan="2">${escapeDiagnosticCell(name)}</th></tr>`
        : `<tr><th scope="row">${escapeDiagnosticCell(name)}</th><td>${escapeDiagnosticCell(fieldValue)}</td></tr>`,
    )
  }
  flushLiteralLines()
  return `<details>\n<summary>${escapeDiagnosticCell(label)}</summary>\n\n<table>\n${rows.join("\n")}\n</table>\n\n</details>`
}
