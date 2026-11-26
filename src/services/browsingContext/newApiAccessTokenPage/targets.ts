import { normalizeUrlPathname } from "~/utils/core/urlParsing"

export const SECURITY_ACCESS_SECTION_SELECTOR =
  'section[aria-labelledby="security-access"]'
const MODERN_CARD = '[data-slot="card"]'
const MODERN_TITLE = '[data-slot="card-title"], h4'
const LEGACY_CARD = ".semi-card"
const LEGACY_SECURITY_TAB =
  '.semi-card [role="tab"][data-tabkey="semiTabsecurity"]'
const HEADING = "h2, h3, h4, h5, h6, [role=heading]"
const ACTION = 'button, [role="button"]'
const PERSONAL_PATHS = new Set(["/console/personal", "/personal", "/profile"])

// Labels from the upstream security and personal-settings translation files.
const TOKEN_TITLES = new Set([
  "access token",
  "access tokens",
  "访问令牌",
  "存取令牌",
  "アクセストークン",
  "jeton d'accès",
  "jetons d'accès",
  "token truy cập",
  "токен доступа",
  "токены доступа",
])
const CREATE_ACTIONS = new Set([
  "create access token",
  "创建访问令牌",
  "建立存取令牌",
  "アクセストークンを作成",
  "créer un jeton d'accès",
  "tạo token truy cập",
  "создать токен доступа",
])
const GENERATE_ACTIONS = new Set([
  "generate",
  "regenerate",
  "生成",
  "重新生成",
  "產生",
  "再生成",
  "générer",
  "régénérer",
  "tạo",
  "tạo lại",
  "создать",
  "перегенерировать",
])
const SYSTEM_TOKEN_TITLES = new Set([
  "system access token",
  "系统访问令牌",
  "系統訪問令牌",
  "システムアクセストークン",
  "jeton d'accès au système",
  "токен доступа к системе",
  "mã thông báo truy cập hệ thống",
])
const SYSTEM_TOKEN_ACTIONS = new Set([
  "generate token",
  "regenerate",
  "生成令牌",
  "重新生成",
  "トークン生成",
  "再生成",
  "générer un jeton",
  "régénérer",
  "сгенерировать токен",
  "сгенерировать заново",
  "tạo mã thông báo",
  "tạo lại",
])

/** Matches a heading or button label without accessing form values. */
function hasLabel(element: Element, labels: ReadonlySet<string>) {
  return [element.textContent, element.getAttribute("aria-label")].some(
    (label) =>
      label &&
      labels.has(
        label.replace(/’/gu, "'").replace(/\s+/gu, " ").trim().toLowerCase(),
      ),
  )
}

const CREDENTIAL_LABEL =
  /^(?:(?:create |generate |new )?(?:(?:personal |management )?access tokens?|system (?:access )?tokens?)\b|(?:创建|新建|建立|生成|添加)?(?:系统|个人|管理)?(?:访问令牌|存取權杖|管理令牌)|(?:システム|アクセス)トークン)/iu
const LEGACY_NOT_FOUND_LABELS = new Set([
  "页面未找到，请检查您的浏览器地址是否正确",
  "頁面未找到，請檢查您的瀏覽器位址是否正確",
  "page not found, please check if your browser address is correct",
  "ページが見つかりませんでした。ブラウザのアドレスが正しいかご確認ください",
  "page non trouvée, veuillez vérifier si l'adresse de votre navigateur est correcte",
  "không tìm thấy trang, vui lòng kiểm tra xem địa chỉ trình duyệt của bạn có chính xác không",
  "страница не найдена, пожалуйста, проверьте правильность адреса в браузере",
])

/** The route probe also recognizes older deployment-specific labels. */
export function isCredentialPageAction(element: Element) {
  return (
    hasLabel(element, CREATE_ACTIONS) ||
    [element.textContent, element.getAttribute("aria-label")].some(
      (label) =>
        label && CREDENTIAL_LABEL.test(label.replace(/\s+/gu, " ").trim()),
    )
  )
}

/** Matches the legacy router's translated Semi Design Empty description. */
export function isLegacyCredentialRouteMissing() {
  return Array.from(document.querySelectorAll(".semi-empty-description")).some(
    (element) => hasLabel(element, LEGACY_NOT_FOUND_LABELS),
  )
}

/** Excludes elements hidden by their own styles or by an ancestor. */
function isVisible(element: HTMLElement) {
  if (element.checkVisibility?.() === false) return false
  for (
    let current: HTMLElement | null = element;
    current;
    current = current.parentElement
  ) {
    if (current.hidden || current.getAttribute("aria-hidden") === "true")
      return false
    const { display, visibility } = window.getComputedStyle(current)
    if (
      display === "none" ||
      visibility === "hidden" ||
      visibility === "collapse"
    )
      return false
  }
  return true
}

/** Returns the first visible match in document order. */
function visibleMatch(
  root: ParentNode,
  selector: string,
  matches: (element: HTMLElement) => boolean,
) {
  return Array.from(root.querySelectorAll<HTMLElement>(selector)).find(
    (element) =>
      element instanceof HTMLElement && matches(element) && isVisible(element),
  )
}

type CueTarget = {
  group: HTMLElement
  findAction?: () => HTMLElement | undefined
}

/** Finds only the token card, even when the neighboring sessions card is much larger. */
function findModernTarget(section: Element): CueTarget | undefined {
  const title = visibleMatch(
    section,
    MODERN_TITLE,
    (element) =>
      Boolean(element.closest(MODERN_CARD)) && hasLabel(element, TOKEN_TITLES),
  )
  const group = title?.closest<HTMLElement>(MODERN_CARD)
  if (group && group !== section && section.contains(group)) {
    return {
      group,
      findAction: () =>
        visibleMatch(
          group,
          ACTION,
          (element) =>
            hasLabel(element, CREATE_ACTIONS) ||
            hasLabel(element, GENERATE_ACTIONS),
        ),
    }
  }
  // A fork may omit or rename the card heading. A specific create label is
  // still useful on its own, without promoting the whole section to a target.
  const action = visibleMatch(section, ACTION, (element) =>
    hasLabel(element, CREATE_ACTIONS),
  )
  if (action) return { group: action }
}

/** Matches the legacy Semi Design token card or a specific fork action. */
function findPersonalTarget(): CueTarget | undefined {
  const title = visibleMatch(
    document,
    HEADING,
    (element) =>
      hasLabel(element, SYSTEM_TOKEN_TITLES) || hasLabel(element, TOKEN_TITLES),
  )
  const group = title?.closest<HTMLElement>(LEGACY_CARD)
  if (group) {
    return {
      group,
      findAction: () =>
        visibleMatch(
          group,
          ACTION,
          (element) =>
            hasLabel(element, SYSTEM_TOKEN_ACTIONS) ||
            hasLabel(element, CREATE_ACTIONS),
        ),
    }
  }
  const action = visibleMatch(document, ACTION, (element) =>
    hasLabel(element, CREATE_ACTIONS),
  )
  const fallback = action ?? title
  if (fallback) return { group: fallback }
  // Upstream legacy settings open on Account Binding. The adjacent Security
  // Settings tab is the visible control until the user selects it.
  const tab = visibleMatch(document, LEGACY_SECURITY_TAB, () => true)
  if (tab) return { group: tab }
}

/** Identifies the New API elements eligible for a read-only cue. */
export function findAccessTokenCueTarget() {
  const section = document.querySelector(SECURITY_ACCESS_SECTION_SELECTOR)
  if (section) return findModernTarget(section)
  if (PERSONAL_PATHS.has(normalizeUrlPathname(window.location.pathname)))
    return findPersonalTarget()
}
