# How the math works

Every number in the app, the spreadsheet and `tools/margin.py` comes from the same formulas. The math runs at full precision. Money is
rounded to 2 decimals and percents to 1 decimal only when it is shown.

## The worked example (fictional)

An AI SDR outbound campaign. The client pays **$1,500** a month.

| Cost | Per month |
| --- | --- |
| AI model, base | $150 |
| AI model, retries | $30 |
| Automation and infrastructure | $70 |
| Other tools | $100 |
| Human review and upkeep | $150 |
| **Total delivery cost** | **$500** |

Gross profit is $1,500 minus $500, so **$1,000**. Gross margin is $1,000 divided by $1,500, so **66.7 percent**.

## Part 1: agent cost tracker

```
model_base = runs × calls per run × (input tokens × input price + output tokens × output price) ÷ 1,000,000
agent_costs = model_base + infrastructure + tools
```

Prices are per 1 million tokens. In the example: 1,000 runs × 5 calls × (3,000 × $3 + 1,400 × $15) ÷ 1,000,000 = **$150**.

**Override.** If you know the real monthly model bill, type it as the model cost override. Then:

```
model_cost = override
model_base = override ÷ (1 + retry rate)
retry_cost = override - model_base
```

## Part 2: hidden cost tracker

```
retry_cost       = model_base × retry rate
review_cost      = review hours × hourly rate
maintenance_cost = upkeep hours × hourly rate
hidden_costs     = retry_cost + review_cost + maintenance_cost
model_cost       = model_base + retry_cost
```

In the example: $150 × 0.20 = $30 of retries, 4 hours × $25 = $100 of review, 2 hours × $25 = $50 of upkeep.

## Part 3: cost per outcome

For each outcome (up to 3):

```
cost per outcome    = delivery cost ÷ count
revenue per outcome = revenue ÷ count
profit per outcome  = gross profit ÷ count
```

When the count is 0, these stay empty. In the example, 40 qualified leads cost $12.50 each and bring in $37.50 each.

## Part 4: profit and pricing

```
delivery_cost    = agent_costs + hidden_costs
gross_profit     = revenue - delivery_cost
gross_margin     = gross_profit ÷ revenue        (empty when revenue is 0)
model_share      = model_cost ÷ delivery_cost    (0 when delivery cost is 0)
cost_per_run     = delivery_cost ÷ runs
break_even_price = delivery_cost
price_for_target = delivery_cost ÷ (1 - target margin)
```

In the example, the price that reaches a 60 percent margin is $500 ÷ 0.4 = $1,250.

**Status.** Red when the margin is under the warning margin (50 percent by default) or there is no revenue. Amber when it is under the
target margin (60 percent by default). Green otherwise.

**Portfolio.** Total revenue, total delivery cost and total gross profit are sums. Portfolio margin is total gross profit ÷ total revenue.
The tool also counts the red workflows and names the most and least profitable by margin.

## Part 5: recommendations

The rules run in this order. Every rule that applies shows up.

| # | Id | Shows when | Level |
| --- | --- | --- | --- |
| 1 | `margin_below_warning` | margin is under the warning margin | red |
| 2 | `margin_below_target` | margin is at or above warning, but under target | amber |
| 3 | `model_heavy` | the AI model is more than 40 percent of delivery cost | amber |
| 4 | `retries_high` | the retry rate is above 15 percent | amber |
| 5 | `chatty_agents` | more than 4 agent calls per run | amber |
| 6 | `review_heavy` | review plus upkeep hours per outcome is above 0.25 | info |
| 7 | `use_simple_automation` | you marked the workflow as fixed rules | info |
| 8 | `losing_per_outcome` | an outcome costs more to deliver than it brings in | red |

When none apply, you see one `healthy` item.

## The 3 sample workflows (fictional)

| Workflow | Revenue | Delivery cost | Profit | Margin | Status |
| --- | --- | --- | --- | --- | --- |
| AI SDR outbound campaign | $1,500.00 | $500.00 | $1,000.00 | 66.7% | green |
| AI voice follow ups | $800.00 | $514.76 | $285.24 | 35.7% | red |
| Inbox reply agent | $1,000.00 | $189.55 | $810.45 | 81.0% | green |
| Portfolio | $3,300.00 | $1,204.31 | $2,095.69 | 63.5% | 1 red |

`tests/fixtures/expected.json` holds these numbers. The tests check that the app engine (`app/engine.js`), the command line tool
(`tools/margin.py`) and the spreadsheet all produce them.
