---
description: Audit the real profit margin of your AI workflows, step by step
---

Use the `agent-profitability` skill in `.claude/skills/agent-profitability/SKILL.md` and follow its steps in full.

1. Read `data/workflows.json`. If it holds the fictional samples, ask whether to replace them.
2. Ask me for the numbers of each workflow in plain questions, a few at a time. Never invent a number. If I do not know one, help me
   find it or use the model cost override with my real monthly bill.
3. Write my answers to `data/workflows.json`.
4. Run `python3 tools/margin.py check` and fix any problem with me, then run `python3 tools/margin.py report`.
5. Explain my portfolio margin, each workflow's real margin, and the top 3 fixes, biggest money first.
6. Offer to open the app with `python3 tools/serve.py`.

Nothing leaves this computer. No network calls.

$ARGUMENTS
