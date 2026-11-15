# Security

## What this kit does with your data

- Nothing leaves your device. The app, the spreadsheet and the tools make no network calls and send no data anywhere.
- The app saves your workflows in your browser's local storage on this device only. Clear your browser data to remove them.
- `tools/serve.py` serves the `app/` folder on your own computer at http://localhost:8765. It is not reachable from the internet
  unless you change your network setup yourself.
- `data/workflows.json` is a plain file in this folder. Keep it out of public repos if your numbers are private.

## No keys needed

The kit never asks for an API key, a password or a login. If something asks you for one, it is not part of this kit.

## Before you share

Your workflow file holds your prices and costs. Before you share an export, a CSV or a screenshot, check that it holds nothing you want
to keep private, like client names.

## Report a problem

If you find a security problem, open an issue on the repo without private details, and the maintainer will follow up:
https://github.com/onittindwani-ai/ai-agent-profitability-calculator
