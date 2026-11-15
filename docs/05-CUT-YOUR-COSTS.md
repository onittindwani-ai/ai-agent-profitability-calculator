# Cut your costs

Once you see where the money goes, these are the usual fixes. Try one at a time, then change the numbers in the calculator and see what
happens to your margin.

## 1. Send simple steps to a cheaper model

Not every step needs your strongest model. Sorting, tagging, pulling out a name or a date, and yes or no checks often work well on a
smaller, cheaper model. Keep the strong model for the steps that need real judgement, like writing the reply a prospect will read.

How to test it: run the same 50 real inputs through both models and compare the results side by side before you switch.

## 2. Trim the context you send

Every call pays for every input token. Long system prompts, full email threads and big documents add up fast. Send only what the step
needs: the last few messages instead of the whole thread, a short summary instead of the full file, and only the fields you use.

## 3. Cache what repeats

If many calls start with the same long instructions or the same reference text, check if your provider offers prompt caching. Cached
input is often billed at a lower rate. Also save answers you already have, so the same question is not paid for twice.

## 4. Cut agent hand offs

When agents pass work to each other, each hand off usually sends the context again. 5 agents in a chain can mean 5 times the tokens.
Merge steps that always run together, and let one agent do a short sequence instead of passing it along.

## 5. Fix retries before you scale

A retry is a run you pay for twice. Find the step that fails most (bad output format, a tool timeout, a missing field) and fix that one
step first. A clear output format and a check before the model call often remove most retries.

## 6. Replace fixed rule steps with plain automation

If a step always does the same thing, like "if the reply says unsubscribe, remove the lead", it does not need a model. A plain rule in
your automation tool costs almost nothing per run.

## 7. Spot check instead of checking everything

Human review is often the biggest hidden cost. Once a workflow is stable, review a sample (for example 1 in 10) plus everything the
system flags as unsure, instead of every single item.

## 8. Reprice

Sometimes the workflow is fine and the price is too low. The calculator shows the price that reaches your target margin. If the client
gets real value, like booked meetings, price around that value, not around your token cost.

## Check the result

After every change, update the numbers and look at three things: delivery cost, gross margin and cost per outcome. If the margin goes up
but the outcomes go down, the change cost you more than it saved.
