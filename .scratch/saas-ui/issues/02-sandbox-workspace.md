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

**Status:** ready-for-agent

- [ ] `inbox` renamed to `incomingMessages` in code, with `SANDBOX_VERSION` 2
- [ ] Incoming Messages, Review Queue (with working decisions and shortcuts) and New Message work in the sandbox workspace
- [ ] Reset and the own-key box live in the workspace menu; limit errors are readable
- [ ] `/live` lands in the sandbox workspace
- [ ] Existing sandbox tests and the smoke test pass
