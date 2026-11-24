# Demo video: shot list (2 minutes)

The last open item of Issue 16. Record it, upload it, and paste the link back so the README and landing page can point to it.

## Before recording (one time)

1. `scripts/setup.sh trello`: create the Trello API key and token, and the two Boards ("Harbor Lane Maintenance" and "Fixline contract tests").
2. `npm run test:trello`: the Board contract suite passes against the test Board (no model calls).
3. `npm run seed:trello`: puts the three open sandbox Work Orders on the Harbor Lane Board (Sam's ceiling stain, the lobby light, Priya's heating). You can run it again safely.
4. Rehearse the two commands from shot 4 once. Each run uses a few Groq free-tier calls. Then archive the cards the rehearsal created (or make a fresh Board and seed it again), so the take starts clean.

Setup: browser on the left with fixline-phi.vercel.app and the Trello Board in two tabs; terminal on the right with a large font. Record with macOS Cmd+Shift+5 ("Record Selected Portion"). Upload to YouTube as **Unlisted** (or Loom).

## Shots

| Time | Screen | Say (roughly) |
| --- | --- | --- |
| 0:00–0:15 | Landing page, the animation plays | "Harbor Lane runs maintenance on a Trello board. Tenants send messy messages. Fixline is an AI agent that turns them into triaged work orders, with a human in the loop." |
| 0:15–0:45 | Demo → Review Queue → "Ceiling leak" run: the Message, the held reason, the Proposal diff, then step through the agent run | "This message is about *another* tenant's leak. The agent matched it to the open Work Order, but a cross-tenant match is a fixed review rule, so a Coordinator confirms it. The agent only proposes; deterministic code validates and applies. Every run is a replayable trace." |
| 0:45–1:05 | Sandbox → New Message as a Tenant → run → Review Queue → Approve → Board | "In the sandbox it runs live on a free-tier model. I send a message, it lands in the queue, I approve, and it's on the Board." |
| 1:05–1:40 | Switch to the Trello Board (seeded), then the terminal | "And here's the real Trello integration." Run both commands below; after each one, cut to Trello. |
| 1:40–1:55 | README Scorecard, or the console's Scorecard page | "Every model is scored on a golden dataset of hard cases: duplicates, emergencies, prompt injection. Not eyeballed." |
| 1:55–2:00 | Landing page | "It costs $0 to run. Link's in the description." |

### Shot 4 commands

```sh
# A repeat report from the same Tenant: attaches to the open heating card (applied automatically)
npm run intake -- --from priya.nair@example.com --body "STILL no heating in the living room, it's been a week and it's freezing."

# An emergency: a new card with a red "Urgency: emergency" label appears at once, flagged for a Coordinator
npm run intake -- --from maya.okafor@example.com --body "Water is pouring out from under my bathroom sink and the floor is flooding!"
```

On Trello: open Priya's heating card to show the update appended to its description; then show the new emergency card and its labels.

Don't put a question in the heating message (e.g. "when is someone coming?"). A Draft Reply sends the Proposal to review, and the command line's Review Queue only lasts for the run, so nothing would reach Trello.

## After uploading

Send Claude the link. It replaces the three placeholders: `README.md` line 6, the roadmap item, and `VIDEO_URL` in `app/page.tsx`.
