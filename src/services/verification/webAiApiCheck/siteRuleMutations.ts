import type { WebAiApiCheckAutoDetectPreferences } from "~/services/preferences/preferencesSchema"
import { WEB_AI_API_CHECK_RULE_MUTATION } from "~/services/verification/webAiApiCheck/siteRuleConstants"

import {
  normalizeWebAiApiCheckSiteRules,
  resolveWebAiApiCheckSiteRules,
  sameWebAiApiCheckSiteRule,
  uniqueWebAiApiCheckSiteRules,
  type WebAiApiCheckRuleMutation,
} from "./siteRules"

/** Derive a rule edit from the admitted snapshot without mutating its lists. */
export function applyWebAiApiCheckRuleMutation(
  config: Partial<WebAiApiCheckAutoDetectPreferences>,
  command: WebAiApiCheckRuleMutation,
) {
  const resolved = resolveWebAiApiCheckSiteRules(config)
  const rules = {
    ...resolved,
    whitelist: [...resolved.whitelist],
    blacklist: [...resolved.blacklist],
  }
  if (command.type === WEB_AI_API_CHECK_RULE_MUTATION.PRIORITY)
    rules.priority = command.priority
  else if (command.type === WEB_AI_API_CHECK_RULE_MUTATION.REMOVE)
    rules[command.list] = rules[command.list].filter(
      (rule) => !sameWebAiApiCheckSiteRule(rule, command.rule),
    )
  else {
    const additions =
      command.type === WEB_AI_API_CHECK_RULE_MUTATION.ADD
        ? command.rules
        : [command.rule]
    const validated = additions.flatMap((rule) => {
      const result = normalizeWebAiApiCheckSiteRules(
        [rule.pattern],
        rule.syntax,
      )
      if (result.invalid.length || !result.rules.length)
        throw new Error("Invalid website rule")
      return result.rules
    })
    if (command.type === WEB_AI_API_CHECK_RULE_MUTATION.EDIT) {
      const index = rules[command.list].findIndex((rule) =>
        sameWebAiApiCheckSiteRule(rule, command.original),
      )
      if (index < 0) throw new Error("Website rule changed in another context")
      rules[command.list].splice(index, 1, ...validated)
    } else rules[command.list].push(...validated)
    rules[command.list] = uniqueWebAiApiCheckSiteRules(rules[command.list])
  }
  return rules
}
