# Start here

This kit shows you how much profit each AI workflow really makes. A workflow is one job your AI agents do for a client, like an
outbound campaign, voice follow ups or an inbox reply agent.

Many teams look only at the token bill. But the real cost of an AI workflow also includes retries, tools, servers and the human time
spent checking and fixing the work. This kit adds all of it up, so you can see your real margin and what to fix first.

## Pick one way to use it

| Way | Best for | Open it |
| --- | --- | --- |
| The app | Seeing everything at a glance and playing with numbers | Double click `app/index.html`, or run `python3 tools/serve.py` |
| The spreadsheet | Excel or Google Sheets users, sharing with a partner | Open `AI-Agent-Profitability-Calculator.xlsx` |
| Claude Code | Letting Claude ask you the questions and explain the result | Say "audit my AI workflow costs" in this folder |

All three use the same math. The numbers match to the cent.

## What you need

- The app: any modern browser. No install, no internet, no account.
- The spreadsheet: Excel, Google Sheets (File > Import) or LibreOffice.
- The command line tool and Claude Code: Python 3.9 or newer. Nothing else to install.

## Your first 10 minutes

1. Open the app or the spreadsheet. You will see 3 sample workflows. They are made up, so you can learn without risk.
2. Look at the AI SDR outbound campaign. The client pays $1,500 a month. The real cost is $500. The margin is 66.7 percent.
3. Look at the AI voice follow ups. It is red, because it keeps less than 50 percent of what the client pays.
4. Now replace one sample with one of your own workflows. Start with the numbers you know. Use your bills for the rest.
5. Read the recommendations. Fix the red ones first.

## Where to get your numbers

- **Revenue**: what the client pays you per month for this workflow.
- **Runs, calls and tokens**: your model provider's usage page, or your logs. Not sure? Use the model cost override with the real monthly
  bill instead.
- **Token prices**: your provider's current price page. The prices in the samples are example rates only.
- **Infrastructure and tools**: your monthly bills for servers, automation tools, phone numbers, data tools and so on.
- **Human time**: how many hours a month someone checks the work and fixes things, and what that hour costs you.
- **Outcomes**: what the client really pays for, like qualified leads or booked meetings.

## Read next

- [01 The app](01-THE-APP.md)
- [02 The spreadsheet](02-THE-SPREADSHEET.md)
- [03 With Claude Code](03-WITH-CLAUDE-CODE.md)
- [04 How the math works](04-HOW-THE-MATH-WORKS.md)
- [05 Cut your costs](05-CUT-YOUR-COSTS.md)
- [Limits and honesty](LIMITS-AND-HONESTY.md)
- [Security](SECURITY.md)
