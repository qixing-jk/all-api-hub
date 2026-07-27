import fs from "node:fs"
import path from "node:path"

const packageRoot = process.cwd()
const docsRoot = path.join(packageRoot, "docs")
const localeDirs = new Set(["en", "ja"])

// eslint-disable-next-line no-control-regex -- Slug normalization strips ASCII control characters.
const rControl = /[\u0000-\u001f]/g
const rSpecial = /[\s~`!@#$%^&*()\-_+=[\]{}|;:'",.<>/?\\]+/g
const rCombining = /[\u0300-\u036f]/g

const files = []
const errors = []
const warnings = []

function slugify(str) {
  return str
    .normalize("NFKD")
    .replace(rCombining, "")
    .replace(rControl, "")
    .replace(rSpecial, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/^(\d)/, "_$1")
    .toLowerCase()
}

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(fullPath)
      continue
    }

    if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(fullPath)
    }
  }
}

function toPosixPath(filePath) {
  return filePath.replaceAll("\\", "/")
}

function getDocLocale(relativePath) {
  const firstSegment = toPosixPath(relativePath).split("/")[0]
  return localeDirs.has(firstSegment) ? firstSegment : "zh"
}

function getLocalizedVariant(relativePath, locale) {
  const posixPath = toPosixPath(relativePath)
  const currentLocale = getDocLocale(posixPath)
  const basePath =
    currentLocale === "zh"
      ? posixPath
      : posixPath.slice(currentLocale.length + 1)

  return locale === "zh" ? basePath : `${locale}/${basePath}`
}

function routeToRelativeDocPath(routePath) {
  const trimmed = routePath.replace(/^\/+/, "")
  if (!trimmed) {
    return "README.md"
  }

  if (trimmed.endsWith("/")) {
    return `${trimmed}README.md`
  }

  if (trimmed.endsWith(".html")) {
    return `${trimmed.slice(0, -5)}.md`
  }

  if (path.extname(trimmed)) {
    return trimmed
  }

  return `${trimmed}.md`
}

function resolveInternalDocTarget(sourceFile, rawTarget) {
  const [targetWithoutQuery] = rawTarget.split("?")
  const [targetPath, fragment = ""] = targetWithoutQuery.split("#")

  if (!targetPath) {
    return {
      kind: "same-file",
      filePath: sourceFile,
      fragment: decodeURIComponent(fragment),
    }
  }

  if (targetPath.startsWith("/")) {
    const relativePath = routeToRelativeDocPath(targetPath)
    return {
      kind: "doc",
      relativePath,
      filePath: path.join(docsRoot, relativePath),
      fragment: decodeURIComponent(fragment),
      rawPath: targetPath,
    }
  }

  const resolvedPath = path.resolve(path.dirname(sourceFile), targetPath)
  const extension = path.extname(resolvedPath).toLowerCase()

  if (extension && ![".md", ".html"].includes(extension)) {
    return { kind: "asset" }
  }

  let normalizedPath = resolvedPath
  if (!extension) {
    normalizedPath += ".md"
  } else if (extension === ".html") {
    normalizedPath = `${normalizedPath.slice(0, -5)}.md`
  }

  if (!normalizedPath.startsWith(docsRoot)) {
    return { kind: "outside-docs", rawPath: targetPath }
  }

  return {
    kind: "doc",
    relativePath: toPosixPath(path.relative(docsRoot, normalizedPath)),
    filePath: normalizedPath,
    fragment: decodeURIComponent(fragment),
    rawPath: targetPath,
  }
}

function isStableAnchorId(fragment) {
  return /^[a-z][a-z0-9-]*$/.test(fragment)
}

function collectAnchors(content) {
  const allAnchors = new Set()
  const explicitAnchors = new Set()
  const headingAnchors = new Set()
  const slugCounts = new Map()
  const lines = content.split(/\r?\n/)

  let inFence = false

  for (const line of lines) {
    if (/^```/.test(line.trim())) {
      inFence = !inFence
      continue
    }

    if (inFence) {
      continue
    }

    for (const match of line.matchAll(/<a\s+id=["']([^"']+)["']/g)) {
      allAnchors.add(match[1])
      explicitAnchors.add(match[1])
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/)
    if (!headingMatch) {
      continue
    }

    const headingText = headingMatch[2].trim()
    if (!headingText) {
      continue
    }

    const baseSlug = slugify(headingText)
    const duplicateIndex = slugCounts.get(baseSlug) ?? 0
    slugCounts.set(baseSlug, duplicateIndex + 1)
    const slug = duplicateIndex === 0 ? baseSlug : `${baseSlug}-${duplicateIndex}`
    allAnchors.add(slug)
    headingAnchors.add(slug)
  }

  return {
    allAnchors,
    explicitAnchors,
    headingAnchors,
  }
}

function maybeReportCrossLocaleLink({ sourceRelativePath, sourceLocale, targetRelativePath, rawTarget, lineNumber }) {
  if (sourceLocale === "zh") {
    return
  }

  const targetLocale = getDocLocale(targetRelativePath)
  if (targetLocale === sourceLocale) {
    return
  }

  const sameLocaleVariant = getLocalizedVariant(targetRelativePath, sourceLocale)
  const sameLocalePath = path.join(docsRoot, sameLocaleVariant)

  if (fs.existsSync(sameLocalePath)) {
    errors.push(
      `${sourceRelativePath}:${lineNumber} links to another locale (${rawTarget} -> ${targetRelativePath}) while same-locale target exists at ${sameLocaleVariant}`
    )
    return
  }

  warnings.push(
    `${sourceRelativePath}:${lineNumber} links to another locale (${rawTarget} -> ${targetRelativePath}) and no ${sourceLocale} variant exists`
  )
}

walk(docsRoot)

const anchorInfoMap = new Map(
  files.map((filePath) => [filePath, collectAnchors(fs.readFileSync(filePath, "utf8"))])
)

const markdownLinkPattern = /(?<!!)\[[^\]]*]\(([^)\s]+)\)/g
const htmlLinkPattern = /<a\b[^>]*\bhref=["']([^"']+)["']/gi

for (const filePath of files) {
  const relativePath = toPosixPath(path.relative(docsRoot, filePath))
  const locale = getDocLocale(relativePath)
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/)

  for (const [lineIndex, line] of lines.entries()) {
    for (const pattern of [markdownLinkPattern, htmlLinkPattern]) {
      for (const match of line.matchAll(pattern)) {
        const rawTarget = match[1]
        if (!rawTarget || /^(https?:|mailto:|data:|tel:)/i.test(rawTarget)) {
          continue
        }

        const resolvedTarget = resolveInternalDocTarget(filePath, rawTarget)
        if (resolvedTarget.kind === "asset" || resolvedTarget.kind === "outside-docs") {
          continue
        }

        const lineNumber = lineIndex + 1

        if (resolvedTarget.kind === "doc" && !fs.existsSync(resolvedTarget.filePath)) {
          errors.push(
            `${relativePath}:${lineNumber} points to missing doc target ${rawTarget} -> ${resolvedTarget.relativePath}`
          )
          continue
        }

        const targetFilePath =
          resolvedTarget.kind === "same-file" ? filePath : resolvedTarget.filePath

        if (resolvedTarget.fragment) {
          const anchorInfo = anchorInfoMap.get(targetFilePath)
          if (!anchorInfo?.allAnchors.has(resolvedTarget.fragment)) {
            const targetRelativePath =
              resolvedTarget.kind === "same-file"
                ? relativePath
                : toPosixPath(path.relative(docsRoot, targetFilePath))

            errors.push(
              `${relativePath}:${lineNumber} points to missing anchor ${rawTarget} -> ${targetRelativePath}#${resolvedTarget.fragment}`
            )
          } else {
            const targetRelativePath =
              resolvedTarget.kind === "same-file"
                ? relativePath
                : toPosixPath(path.relative(docsRoot, targetFilePath))

            if (!isStableAnchorId(resolvedTarget.fragment)) {
              errors.push(
                `${relativePath}:${lineNumber} uses unstable anchor ${rawTarget} -> ${targetRelativePath}#${resolvedTarget.fragment}; use an explicit ASCII anchor id such as <a id="..."></a>`
              )
            } else if (
              !anchorInfo.explicitAnchors.has(resolvedTarget.fragment) &&
              anchorInfo.headingAnchors.has(resolvedTarget.fragment)
            ) {
              errors.push(
                `${relativePath}:${lineNumber} links to heading-generated anchor ${rawTarget} -> ${targetRelativePath}#${resolvedTarget.fragment}; prefer a shared explicit anchor id instead of a heading slug`
              )
            }
          }
        }

        if (resolvedTarget.kind === "doc") {
          maybeReportCrossLocaleLink({
            sourceRelativePath: relativePath,
            sourceLocale: locale,
            targetRelativePath: resolvedTarget.relativePath,
            rawTarget,
            lineNumber,
          })
        }
      }
    }
  }
}

if (warnings.length > 0) {
  console.warn("Doc link warnings:")
  for (const warning of warnings) {
    console.warn(`- ${warning}`)
  }
}

if (errors.length > 0) {
  console.error("Doc link validation failed:")
  for (const error of errors) {
    console.error(`- ${error}`)
  }
  process.exit(1)
}

console.log(
  `Doc link validation passed for ${files.length} Markdown files with ${warnings.length} warning(s).`
)
