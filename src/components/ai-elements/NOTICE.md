# AI process components

Copyright 2023 Vercel, Inc. Licensed under Apache-2.0. The [license and attribution](../../public/licenses/ai-elements.txt) ship with the extension.

The local `reasoning.tsx`, `tool.tsx`, and `conversation.tsx` wrappers originated
from [Vercel AI Elements](https://github.com/vercel/ai-elements/tree/ca8be600bfd01b3131f9bf6134b51602a71f4374/packages/elements/src).
Their original attribution is retained for the adapted application code.

The implementation now composes [shadcn/ui AI Elements](https://ui.shadcn.com/docs/ai-elements):
[Trace](https://ui.shadcn.com/docs/components/radix/trace),
[Message Scroller](https://ui.shadcn.com/docs/components/radix/message-scroller)
and [scroll-fade](https://ui.shadcn.com/docs/utils/scroll-fade).
The two primitives in `../ui/` were generated with the configured shadcn CLI
from the official `radix-rhea` registry on 2026-11-11. Explicit registry URLs
are needed because the configured `new-york` registry has no Trace entry.
Existing Button and Collapsible primitives were preserved.

shadcn/ui is Copyright (c) 2023 shadcn, MIT licensed. Its
[license](../../public/licenses/shadcn-ui.txt) ships with the extension.
Message Scroller uses `@shadcn/react`; scroll-fade comes from `shadcn/tailwind.css`.

Local changes: project imports, design tokens, translated labels supplied by callers,
shared sanitized Markdown and evidence rendering, reader-owned disclosure state,
no inferred reasoning duration, bounded scrolling without animation, and omission
of unused download and empty-state features.

The verification composer follows the shadcn/ui AI Elements
[Prompt Input](https://ui.shadcn.com/docs/ai-elements/base/prompt-input) and
[Model Selector](https://ui.shadcn.com/docs/ai-elements/base/model-selector) patterns
on the existing Input Group and Popover primitives. Conversation turns use Message and
Message Content; `../ui/message.tsx` was generated from the official `radix-rhea` registry on
2026-11-11, with the project's `cn` import substituted. The model selector provides an
inline conversation entry point with custom input and suggested model discovery, kept in
sync with the workspace request configuration. Attachments are omitted because test
modalities are configured via verification probes.

Reasoning keeps a scroll-fade tail preview, a bounded full-content viewport and a
bottom collapse action that returns focus to its disclosure trigger. The preview
follows its content size while collapsed, leaving expanded reading independent.
The process is one Message Scroller item with no message anchoring or virtualized
content. Short replies grow naturally; long runs use a bounded viewport. Unused
generated helpers and English fallback labels are omitted.
