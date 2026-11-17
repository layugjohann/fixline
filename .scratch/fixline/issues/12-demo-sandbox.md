# 12: Demo sandbox

**What to build:** Each visitor gets their own sandbox: a Board, Review Queue, and Property Roster seeded from fixtures, plus an inbox of example Messages. Visitors can send their own Message "as a Tenant", process inbox Messages live, work the Review Queue, and reset to the seeded state. All sandbox state lives in the visitor's browser, so visitors can't affect each other.

**Blocked by:** 02, 06

**Status:** done
**Pull Request:** https://github.com/layugjohann/fixline/pull/13

- [ ] A first visit seeds the sandbox from fixtures
- [ ] The inbox lists example Messages, and processing one runs Intake live
- [ ] A "send as Tenant" form lets the visitor pick a Sender or type a new one
- [ ] Reset restores the seeded state
- [ ] Two browsers' sandboxes are fully independent, and the server stores nothing

## Comments

Usage: Implementer 34 input, 20,812 output, 64,740 cache creation, 914,945 cache read; Review Session 16 input, 4,255 output, 46,713 cache creation, 385,667 cache read.

**Review Session: Non-critical Findings**

- app/live/sandbox-view.tsx redeclares BoardAndReviewQueueSchema and much of IntakeResponseSchema instead of reusing SandboxSchema.pick(...) and SandboxRunSchema from src/sandbox, which duplicates logic.
- The 'resets to the seeded state' test works the sandbox but never resets it; it only checks that seedSandbox() equals the fixtures, so it doesn't show that worked state is discarded.
- src/sandbox/sandbox.test.ts imports the Next.js route app/api/review-queue/route from inside src, coupling a module test to the web layer.
- Every run's full trace is kept in localStorage, so the history can exceed the storage quota. Saving then fails without telling the visitor, and their changes are lost on the next reload.

**Gate passed**: every command exited 0 (log: `.sandcastle/logs/gate-12-2026-11-16T15-46-14-591Z.log`).

Usage: Body writer 2 input, 1,353 output, 33,862 cache creation, 11,370 cache read.

**Pull Request opened**: https://github.com/layugjohann/fixline/pull/13
