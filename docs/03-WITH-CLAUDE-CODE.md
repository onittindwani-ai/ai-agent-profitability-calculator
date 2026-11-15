# With Claude Code

This repo has a Claude Code skill and 2 commands. Claude asks you simple questions, writes your numbers to `data/workflows.json`, runs
the calculator and explains the result.

## Set it up

Give Claude this repo link and say:

> Set up the AI Agent Profitability Calculator for me, open the app, and help me fill in my first workflow.

Repo: https://github.com/onittindwani-ai/ai-agent-profitability-calculator

Or clone it yourself and open Claude Code in the folder.

## What you can say

- "Audit my AI workflow costs."
- "What is my real margin on the voice agent?"
- "Which workflow loses me money?"
- `/margin-audit` asks you about each workflow, step by step, then runs the report.
- `/margin-report` runs the report on the numbers you already saved and explains the top 3 fixes.

## What Claude does

1. Asks for the numbers of each workflow in plain questions (what the client pays, runs, calls, tokens, bills, hours, outcomes).
2. Writes them to `data/workflows.json`. It never makes up a number. If you do not know one, it asks, or uses the model cost override
   with your real bill.
3. Runs `python3 tools/margin.py check`, then `python3 tools/margin.py report`.
4. Explains your margin and the top 3 fixes in plain words.
5. Offers to open the app with `python3 tools/serve.py`, so you can see it all.

## Run the tool yourself

```
python3 tools/margin.py check      # find mistakes in your file
python3 tools/margin.py report     # readable report
python3 tools/margin.py json       # machine readable output
python3 tools/margin.py csv        # one row per workflow
python3 tools/margin.py report --file data/sample-workflows.json
python3 tools/margin.py report --settings target_margin=0.65,warning_margin=0.5
```

## Privacy

Everything stays on your computer. The tool makes no network calls and sends nothing anywhere. Claude only reads the files in this folder.
