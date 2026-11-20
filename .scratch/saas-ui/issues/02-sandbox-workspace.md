# 02: Sandbox workspace in the console

**What to build:** Live mode moves into the console as the **Your sandbox (live)** workspace, using the shell from Issue 01. Behaviour is unchanged; only the presentation and the naming change.

- Rename the sandbox's inbox to **Incoming Messages** throughout (GLOSSARY.md): `inbox` / `InboxItem` / `inboxMessages` become `incomingMessages` and matching names. Bump `SANDBOX_VERSION` to 2 so old browser sandboxes are reseeded.
- **Incoming Messages** page: the unprocessed Messages, each with "Run Intake"; processed ones in a collapsed section. Rejected Proposals (validation) are shown with their problems and trace.
- **Review Queue** (sandbox): the three-pane layout from Issue 01 with a working decision bar: Approve & apply / Acknowledge, Edit (the existing edit flow, in a dialog or inline), and Reject with an optional reason, plus the A / E / R shortcuts. Decided entries go under "Auto-handled / decided".
- **New Message** (topbar or rail action): the send-as-a-Tenant form in a dialog.
- The workspace menu holds Reset sandbox and the own-key box (provider, key, model; still never saved). Live-run limit errors are shown as toasts or inline banners, not raw text.
- `/live` opens the sandbox workspace (redirect or the route itself).
- Keep `e2e/smoke.spec.ts` passing: a sandbox Message flows to the Review Queue and on to the Board.

**Blocked by:** 01
**Stacked on:** issue/01-design-system-and-console-shell

**Status:** awaiting-merge
**Pull Request:** https://github.com/layugjohann/fixline/pull/20

- [ ] `inbox` renamed to `incomingMessages` in code, with `SANDBOX_VERSION` 2
- [ ] Incoming Messages, Review Queue (with working decisions and shortcuts) and New Message work in the sandbox workspace
- [ ] Reset and the own-key box live in the workspace menu; limit errors are readable
- [ ] `/live` lands in the sandbox workspace
- [ ] Existing sandbox tests and the smoke test pass

## Comments

Usage: Implementer 20 input, 1,867 output, 22,222 cache creation, 252,407 cache read; Review Session 16 input, 5,469 output, 87,369 cache creation, 666,095 cache read.

**Review Session: Non-critical Findings**

- Toasts (Notices, z-40) render beneath the Radix dialog overlay (z-50), so when the server rejects an edited Proposal, its problems are shown dimmed behind the still-open Edit dialog and can't be dismissed until it closes (app/console/sandbox/notices.tsx, review-queue-view.tsx).
- The 'Agent run' placeholder rail for seeded entries in the sandbox Review Queue duplicates AgentRun's header markup instead of reusing it (app/console/sandbox/review-queue/review-queue-view.tsx).
- BoardView rebuilds its Urgency sort map on every render; it could be a module-level constant (app/console/sandbox/board/board-view.tsx).
- The sandbox Board is a plain table without the Spec's Kanban columns or filters; acceptable for this Issue, but should be noted for the later Board Issue.
- The smoke test could not be run in this review because Chromium cannot launch in the sandbox (macOS permission error), so the new role/label selectors are unverified in a browser.

**Gate passed**: every command exited 0 (log: `.sandcastle/logs/gate-02-2026-11-20T20-47-41-938Z.log`).

Usage: Body writer 2 input, 1,403 output, 76,776 cache creation, 11,842 cache read.

**Pull Request opened**: https://github.com/layugjohann/fixline/pull/20

Stacked on Base Issue 01: this Pull Request targets `issue/01-design-system-and-console-shell`, the branch of https://github.com/layugjohann/fixline/pull/19. Merge that Pull Request first.
