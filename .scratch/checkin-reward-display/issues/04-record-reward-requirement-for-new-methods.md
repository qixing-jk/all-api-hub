# 04 — 新签到方法必须登记奖励语义

- Status: resolved（本轮改动：contracts.ts 注释 + docs/agents/site-integrations.md 的 Check-in methods 段）
- Parent: `../spec.md`
- 关联：#1446 天才程序员、#1548 小白Code、#1552 AI-ROUTER 在 2026-09 内连续新增，且都带奖励字段

## 问题

签到方法一直在增加，每次新增都在"解析奖励 → 丢弃"这条老路上重复一遍。这个缺口不会被测试发现（丢字段不报错），只会表现为用户看不到金额。

## 交付

1. `src/services/checkin/autoCheckin/providers/contracts.ts`：在 `AutoCheckinProvider.checkIn` 与 `AutoCheckinProviderOutcome.reward` 的文档块里写明——新方法必须评估签到响应是否含权威奖励；有则在 provider 内换算成内部 quota 单位后填入 `reward`，没有则明确不填。
2. `docs/agents/site-integrations.md`：在签到相关条目补一句同样的要求，并把"按部署确认单位"（Sub2API/USD 与 new-api/quota 的差别、RixAPI 6.x 的 USD 形态）指向本目录的覆盖表。
3. `../spec.md` 的站点覆盖表作为长期清单维护：新增方法时补一行（字段、单位、证据、状态）。
4. 不做静态强制校验：无法从代码判定"某站点确实没有奖励字段"，因此靠清单 + review，不引入假阳性检查。

## 验收

- 新增签到方法的 PR 能按上述两处文档回答"奖励字段是什么、单位是什么、为什么没有"。
- 覆盖表里每个已注册方法都有一行（`providers/index.ts` 的 `PROVIDER_BY_METHOD_ID` 与覆盖表一一对应）。
