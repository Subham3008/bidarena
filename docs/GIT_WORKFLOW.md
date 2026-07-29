# BidArena Git Workflow

## Current-phase freeze

This repository is currently in shared-foundation verification. During this phase:

- Do not create `main`, `developer`, `subham`, `rohit`, or any other branch.
- Do not commit.
- Do not push.
- Do not merge.
- Keep all foundation changes available for review and report the exact files changed and verification results.

The branch workflow below is the mandatory future workflow after the team explicitly begins branch-based development. Documenting it now does not authorize Git operations in the current phase.

## Long-lived branch topology

```text
main
  |
  +-- developer
        |-- subham
        `-- rohit
```

Changes move toward release in only this direction:

```text
subham --+
         +--> developer --> main
rohit  --+
```

Neither domain branch may merge directly into `main`.

## Branch responsibilities

| Branch | Owner/purpose | Allowed work | Prohibited work |
|---|---|---|---|
| `main` | Stable production release | Complete, tested releases from `developer`; explicitly approved emergency fixes | Feature development, experiments, incomplete work |
| `developer` | Shared integration | Domain merges, cross-domain verification, deployment rehearsal, final QA | Treating incomplete integration as production-ready |
| `subham` | Subham, Domain A | Marketplace and UX, React UI, frontend integrations, Domain A docs and tests | Auction-engine and backend-authority implementation |
| `rohit` | Rohit, Domain B | Auction engine, real-time server state, backend, persistence, Redis, payments backend, recovery, Domain B tests | Marketplace UI and frontend-owned UX implementation |

Ownership follows the code's primary responsibility, not its filename. A frontend Socket.IO hook belongs to `subham`; Socket.IO server handlers belong to `rohit`.

## Domain ownership

### Domain A: Subham

Domain A includes registration and login UI, session restoration UX, auction creation and discovery, auction detail and room pages, bid controls, timer display, statistics and timelines, spectator and chat UI, profiles, seller views, payment UI, responsive design, and loading/error/empty/disabled states.

Domain A code is developed, tested, committed, and pushed only on `subham`.

### Domain B: Rohit

Domain B includes Socket.IO server setup and authentication, auction rooms, validation, bid queues and ordering, idempotency, server sequence numbers, MongoDB persistence and transactions, authoritative timers, winners and completion, reconnection and restart recovery, isolation, backend chat, Razorpay order/signature work, Redis, and backend testing.

Domain B code is developed, tested, committed, and pushed only on `rohit`.

### Shared integration

Cross-domain features are split before implementation:

| Feature | `subham` responsibility | `rohit` responsibility | `developer` verification |
|---|---|---|---|
| Live bidding | Bid controls and live state display | Validation, queue, persistence, sequence, broadcast | Two-browser flow, payloads, ordering, errors |
| Timer | Visual countdown | Authoritative `endAt`, expiry, completion | Clock sync, late-bid rejection, completion |
| Payment | Razorpay checkout UI | Order creation and signature verification | End-to-end payment status and room update |

One branch must not absorb the other owner's complete portion merely because the feature spans both domains.

## Feature workflow after branches are authorized

For each small, meaningful feature:

1. Classify it as Domain A, Domain B, or split integration work.
2. Work only on the responsible domain branch.
3. Keep the change focused; do not mix unrelated cleanup or another owner's code.
4. Update the applicable contracts, traceability, and technical documentation.
5. Run the relevant tests, lint command, or production build.
6. Review the exact staged files and confirm that no secret or unrelated file is included.
7. Commit with a meaningful conventional commit message.
8. Push only to the same domain branch.
9. Merge the completed domain branch into `developer`.
10. Run cross-domain integration checks on `developer`.

Do not call a feature complete until it is implemented, integrated where necessary, tested, documented, and committed to the correct branch.

## Merge and testing rules

1. Merge `subham` into `developer`; never merge it directly into `main`.
2. Merge `rohit` into `developer`; never merge it directly into `main`.
3. Run relevant feature tests before each domain commit.
4. After each domain merge, verify contract names, payload shapes, authentication hand-off, timers, state synchronization, race handling, and room isolation as applicable.
5. Fix blocking defects on the branch that owns the defective behavior.
6. Test the fix there, then re-merge that branch into `developer` and repeat integration checks.
7. Run final automated tests, two-browser bidding, reconnection, server-restart, payment, production-build, and deployment-rehearsal checks on `developer`.
8. Merge `developer` into `main` only when all blocking issues are resolved and the completion gate is satisfied.
9. Do not force-push unless it is explicitly required, understood, and approved.
10. Do not commit secrets or make undocumented cross-domain edits.

The SRS does not mandate a squash, rebase, or merge-commit policy. Whichever merge mechanism the team later selects must preserve understandable feature history and must not bypass the branch flow above.

## Integration sequence

Future Domain A integration:

```text
checkout subham
pull subham
implement and test Domain A feature
commit and push subham
checkout developer
pull developer
merge subham
run integration tests
push developer
```

Future Domain B integration:

```text
checkout rohit
pull rohit
implement and test Domain B feature
commit and push rohit
checkout developer
pull developer
merge rohit
run integration tests
push developer
```

Release:

```text
pull and fully verify developer
checkout and pull main
merge developer into main
push main
```

These are future procedures only. No command in these sequences is to be executed during shared-foundation verification.

## Conflict handling

Important business-logic conflicts must never be resolved blindly.

When a conflict occurs:

1. Stop the merge and list every conflicted file.
2. Identify the responsibility represented by each conflicting change.
3. Ask the responsible owner to decide auction rules, UI behavior, or persistence semantics when intent is not unambiguous.
4. Preserve both sides only when their behavior is compatible with the frozen REST and Socket.IO contracts.
5. Move a substantive fix back to its owning domain branch, test it there, and re-merge it into `developer`.
6. Re-run the affected unit and integration tests after resolution.
7. Document any contract or ownership decision that changed.

Never hide a conflict by choosing one entire side without reviewing the lost behavior. Never use force-push as a routine conflict-resolution tool.

## Conventional commits

Use a short imperative summary with a focused scope:

```text
<type>(<scope>): <summary>
```

Examples aligned with the SRS:

```text
feat(auth): add user registration flow
feat(auction): add auction creation form
feat(socket): add authenticated auction room joining
feat(bidding): add per-auction bid queue
feat(timer): add authoritative server countdown
feat(recovery): restore auction snapshot on reconnect
feat(payment): verify Razorpay payment signature
feat(redis): cache active auction state
test(bidding): cover simultaneous bid ordering
docs(defense): explain race-condition handling
```

Avoid vague messages such as `done`, `changes`, `updated code`, `full project`, or `final`. A commit should represent one working, explainable change rather than the whole application.

Before every future commit, report:

- Feature, owner, and branch.
- Exact files changed.
- Feature flow and why the approach was chosen.
- Tests/builds executed and their actual results.
- SRS requirements affected.
- Remaining risk.
- Exact commit message and push result.

## Contract changes

REST and Socket.IO contracts are shared integration boundaries. A contract change must be documented before dependent UI and backend implementations diverge. Domain A implements the client side on `subham`; Domain B implements the server side on `rohit`; compatibility is verified after both merge into `developer`.

Do not solve a contract mismatch by making an undocumented cross-domain edit on whichever branch happens to expose the failure.

## Release gate

`developer` may merge into `main` only after the SRS completion gate is honestly satisfied, including:

- Frontend production build and backend startup pass.
- MongoDB and production Socket.IO work; Redis connects or fails gracefully.
- Authentication, auction creation/discovery, two-browser bidding, invalid and simultaneous bid handling, authoritative timers, single-winner completion, and recovery flows work.
- Chat isolation and Razorpay test payment work.
- Required documentation, SRS traceability, environment examples, and deployment evidence are complete.
- No secrets, critical TODOs, fake core-flow data, or blocking defects remain.

`main` is deployed only from this tested release state. Direct commits to `main` are prohibited except explicitly approved emergency fixes.
