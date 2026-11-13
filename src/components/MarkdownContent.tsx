import type { ComponentPropsWithoutRef } from "react"
import rehypeRaw from "rehype-raw"
import rehypeSanitize, { defaultSchema } from "rehype-sanitize"
import remarkBreaks from "remark-breaks"
import { defaultRemarkPlugins, Streamdown, type Components } from "streamdown"

import { cn } from "~/lib/utils"

type MarkdownContentProps = Omit<
  ComponentPropsWithoutRef<"div">,
  "children" | "content" | "dangerouslySetInnerHTML"
> & {
  content: string
  breaks?: boolean
  streaming?: boolean
}

// External content retains semantics; appearance remains owned by the reader.
const authoredAppearance = new Set([
  "style",
  "className",
  "id",
  "size",
  "face",
  "color",
])
const schema = {
  ...defaultSchema,
  attributes: Object.fromEntries(
    Object.entries(defaultSchema.attributes ?? {}).map(([tag, attributes]) => [
      tag,
      attributes.filter(
        (attribute) =>
          !authoredAppearance.has(
            typeof attribute === "string" ? attribute : attribute[0],
          ),
      ),
    ]),
  ),
}
const rehypePlugins = [rehypeRaw, [rehypeSanitize, schema]] as NonNullable<
  ComponentPropsWithoutRef<typeof Streamdown>["rehypePlugins"]
>
const remarkPlugins = Object.values(defaultRemarkPlugins)
const breakingRemarkPlugins = [...remarkPlugins, remarkBreaks]

// Semantic elements preserve native disclosure state and project typography.
const components: Components = {
  a: ({ node: _node, ...props }) => (
    <a {...props} target="_blank" rel="noopener noreferrer" />
  ),
  p: "p",
  h1: "h1",
  h2: "h2",
  h3: "h3",
  h4: "h4",
  h5: "h5",
  h6: "h6",
  ul: "ul",
  ol: "ol",
  li: "li",
  blockquote: "blockquote",
  strong: "strong",
  em: "em",
  hr: "hr",
  pre: "pre",
  code: "code",
  inlineCode: ({ node: _node, ...props }) => <code {...props} />,
  table: "table",
  thead: "thead",
  tbody: "tbody",
  tr: "tr",
  th: "th",
  td: "td",
}

/** Shared static and incremental Markdown with owned HTML, links and typography. */
export function MarkdownContent({
  content,
  breaks = false,
  streaming = false,
  className,
  ...props
}: MarkdownContentProps) {
  return (
    <div
      {...props}
      className={cn(
        "app-markdown prose prose-sm max-w-none text-sm wrap-anywhere",
        "prose-headings:mt-density-4 prose-headings:mb-density-3 prose-headings:font-semibold",
        "prose-p:my-density-2 prose-ol:my-density-2 prose-ul:my-density-2",
        "prose-blockquote:my-density-3 prose-pre:my-density-3",
        "[&>:first-child]:mt-0 [&>:last-child]:mb-0",
        className,
      )}
    >
      <Streamdown
        mode={streaming ? "streaming" : "static"}
        isAnimating={streaming}
        components={components}
        rehypePlugins={rehypePlugins}
        remarkPlugins={breaks ? breakingRemarkPlugins : remarkPlugins}
        controls={false}
      >
        {content}
      </Streamdown>
    </div>
  )
}
