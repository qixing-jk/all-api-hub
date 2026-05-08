import { t } from "~/utils/i18n/core"

import { SITE_ANNOUNCEMENTS_LIMITS } from "./constants"

const MARKDOWN_LINK_PATTERN = /\[([^\]]+)\]\([^)]+\)/g
const MARKDOWN_TOKEN_PATTERN = /[`*_>#~-]+/g
const MARKDOWN_HEADING_PATTERN = /^#{1,6}\s+/gm
const MARKDOWN_HEADING_LINE_PATTERN = /^\s*#{1,6}\s+/
const HTML_BLOCK_BOUNDARY_PATTERN =
  /<\/?(?:address|article|aside|blockquote|br|center|dd|details|dialog|div|dl|dt|fieldset|figcaption|figure|footer|form|h[1-6]|header|hr|li|main|nav|ol|p|pre|section|table|tbody|td|tfoot|th|thead|tr|ul)\b[^>]*>/gi
const HTML_TAG_PATTERN = /<[^>]+>/g
const HTML_ENTITY_PATTERN = /&(?:nbsp|amp|lt|gt|quot|#39);/gi
const WHITESPACE_PATTERN = /\s+/g
const LINE_BREAK_PATTERN = /\r\n?/g
const TRAILING_TITLE_DELIMITER_PATTERN = /[。！？!?；;：:.]+$/
const ANNOUNCEMENT_SHORT_TITLE_LENGTH = 80
const ANNOUNCEMENT_PREVIEW_LENGTH = 120

interface AnnouncementContentParts {
  title: string
}

interface AnnouncementLineParts {
  title: string
}

interface AnnouncementDisplayText {
  title: string
  body: string
  preview: string
}

/**
 * Decodes the small set of HTML entities supported in announcement previews.
 */
function decodeBasicHtmlEntity(entity: string): string {
  switch (entity.toLowerCase()) {
    case "&nbsp;":
      return " "
    case "&amp;":
      return "&"
    case "&lt;":
      return "<"
    case "&gt;":
      return ">"
    case "&quot;":
      return '"'
    case "&#39;":
      return "'"
    default:
      return entity
  }
}

/**
 * Trims string announcement text and drops non-string values.
 */
export function normalizeAnnouncementText(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

/**
 * Removes common HTML and Markdown formatting from announcement text.
 */
function stripAnnouncementFormatting(value: string): string {
  return value
    .replace(HTML_TAG_PATTERN, " ")
    .replace(MARKDOWN_HEADING_PATTERN, "")
    .replace(MARKDOWN_LINK_PATTERN, "$1")
    .replace(MARKDOWN_TOKEN_PATTERN, " ")
    .replace(HTML_ENTITY_PATTERN, decodeBasicHtmlEntity)
    .replace(WHITESPACE_PATTERN, " ")
    .trim()
}

/**
 * Splits announcement content into candidate display lines.
 */
function splitAnnouncementCandidateLines(value: string): string[] {
  return value
    .replace(LINE_BREAK_PATTERN, "\n")
    .replace(HTML_BLOCK_BOUNDARY_PATTERN, "\n")
    .split("\n")
}

/**
 * Removes trailing punctuation used only to delimit inferred titles.
 */
function trimTitleDelimiter(value: string): string {
  return value.replace(TRAILING_TITLE_DELIMITER_PATTERN, "").trim()
}

/**
 * Finds the first punctuation mark that can separate a title from body text.
 */
function findTitleDelimiterIndex(value: string): number {
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index]
    const previous = value[index - 1] ?? ""
    const next = value[index + 1] ?? ""

    if ("。！？!?；;：".includes(char ?? "")) {
      return index
    }

    if (char === ":") {
      if (/\d/.test(previous) && /\d/.test(next)) {
        continue
      }

      if (/\bhttps?$/i.test(value.slice(0, index))) {
        continue
      }

      return index
    }

    if (char === "." && (!next || /\s/.test(next)) && !/\d/.test(previous)) {
      return index
    }
  }

  return -1
}

/**
 * Extracts a display title from one candidate announcement line.
 */
function splitAnnouncementTitleLine(line: string): AnnouncementLineParts {
  const titleLine = line.trim()
  if (!titleLine) {
    return { title: "" }
  }

  if (MARKDOWN_HEADING_LINE_PATTERN.test(titleLine)) {
    return {
      title: stripAnnouncementFormatting(titleLine),
    }
  }

  const plainTitleLine = stripAnnouncementFormatting(titleLine)
  const delimiterIndex = findTitleDelimiterIndex(plainTitleLine)
  if (delimiterIndex === -1) {
    return {
      title: plainTitleLine,
    }
  }

  const title = trimTitleDelimiter(plainTitleLine.slice(0, delimiterIndex + 1))

  return title
    ? {
        title,
      }
    : {
        title: plainTitleLine,
      }
}

/**
 * Builds a plain-text preview for an announcement body.
 */
export function getAnnouncementPreviewText(
  value: string,
  maxLength: number = SITE_ANNOUNCEMENTS_LIMITS.summaryLength,
): string {
  return summarizeAnnouncement(value, maxLength)
}

/**
 * Shortens announcement text after removing formatting markup.
 */
export function summarizeAnnouncement(
  value: string,
  maxLength: number = SITE_ANNOUNCEMENTS_LIMITS.summaryLength,
): string {
  const plain = stripAnnouncementFormatting(value)
  if (plain.length <= maxLength) {
    return plain
  }

  return `${plain.slice(0, Math.max(0, maxLength - 1)).trim()}…`
}

/**
 * Extracts inferred display parts from raw announcement content.
 */
function splitAnnouncementContent(value: string): AnnouncementContentParts {
  const content = normalizeAnnouncementText(value)
  if (!content) {
    return { title: "" }
  }

  const lines = splitAnnouncementCandidateLines(content)
  const titleLineIndex = lines.findIndex((line) =>
    Boolean(stripAnnouncementFormatting(line)),
  )
  if (titleLineIndex === -1) {
    return { title: "" }
  }

  const lineParts = splitAnnouncementTitleLine(lines[titleLineIndex] ?? "")

  return { title: lineParts.title }
}

/**
 * Builds the title, body, and preview used by announcement UI surfaces.
 */
export function buildAnnouncementDisplayText(
  input: {
    title?: string
    content?: string
  },
  options: {
    previewLength?: number
  } = {},
): AnnouncementDisplayText {
  const explicitTitle = stripAnnouncementFormatting(input.title ?? "")
  const content = normalizeAnnouncementText(input.content)
  const previewLength = options.previewLength ?? ANNOUNCEMENT_PREVIEW_LENGTH

  if (explicitTitle) {
    const body = content || normalizeAnnouncementText(input.title)
    const previewSource = content ? body : ""
    return {
      title: explicitTitle,
      body,
      preview: getAnnouncementPreviewText(previewSource, previewLength),
    }
  }

  const contentParts = splitAnnouncementContent(content)

  return {
    title: contentParts.title || t("siteAnnouncements:title"),
    body: content,
    preview: content ? getAnnouncementPreviewText(content, previewLength) : "",
  }
}

/**
 * Builds the display title for an announcement.
 */
export function buildAnnouncementTitle(input: {
  title?: string
  content?: string
}): string {
  return buildAnnouncementDisplayText(input).title
}

/**
 * Builds a shortened title suitable for compact notification surfaces.
 */
export function buildAnnouncementShortTitle(
  input: {
    title?: string
    content?: string
  },
  maxLength: number = ANNOUNCEMENT_SHORT_TITLE_LENGTH,
): string {
  return summarizeAnnouncement(buildAnnouncementTitle(input), maxLength)
}

/**
 * Creates a stable fingerprint from normalized announcement identity parts.
 */
export function fingerprintAnnouncement(parts: unknown[]): string {
  return parts
    .map((part) =>
      String(part ?? "")
        .trim()
        .replace(WHITESPACE_PATTERN, " "),
    )
    .map((part) => `${part.length}:${part}`)
    .join("|")
}
