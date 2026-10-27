# Technical Requirements Document (TRD): OperateOS

**Version:** 1.0 (decisions from Q&A incorporated, see §16)
**Source:** `prd.md` v1.0
**Stack:** Plain JavaScript (ES Modules) — React (Vite) + Tailwind + lucide-react, Node.js + Express, MongoDB + Mongoose, **Gemini (primary LLM)** with deterministic fallback
**Hosting:** Vercel (client), Render (API), MongoDB Atlas. No Docker/CI for v1.0.

> Items marked **[ASSUMPTION]** are defaults where neither the PRD nor your answers decided the point. Confirmed decisions are in §16.

---

## 1. Scope & Goals

Implement the four PRD workflows:
1. Workspace / project / multi-view board management (RBAC).
2. Launch brief → AI decomposition → proposal → human approval → atomic execution.
3. Deterministic graph engine: DFS cycle check, BFS risk cascade, health score, critical path.
4. Meeting transcript → context-aware action proposals → approval → cascade → audit ledger, plus search.

Technical invariants (from PRD §7):
- **I1:** No AI output mutates `Tasks` without passing through an `AgentProposal` approved by ADMIN/LEAD.
- **I2:** Every mutation (human or AI) writes an `AuditLog` entry with before/after.
- **I3:** The dependency graph is always acyclic.
- **I4:** `isAtRisk` / health values are always consistent with the graph after any mutation.
- **I5:** Proposal approval is idempotent.

---

## 2. Architecture

```
React SPA (Vite, Tailwind)
   │  REST/JSON + JWT (Authorization: Bearer)
Express API
   ├─ middleware: helmet, cors, rate-limit, authN (JWT), authZ (workspace role), validate (zod), error handler
   ├─ routes → controllers → services
   │     ├─ GraphEngine (pure, no I/O)           ← DFS / BFS / health / critical path
   │     ├─ ProposalExecutor (transactional)     ← applies approved actions
   │     ├─ AIOrchestrator (LLM adapter)         ← prompts, schema, retries, validation
   │     ├─ AuditService
   │     └─ SearchService
   └─ Mongoose models
MongoDB (replica set required for transactions, e.g. Atlas)
LLM provider (Gemini or OpenAI, behind an adapter interface)
```

Layering rule: controllers never touch the LLM or graph logic directly; `GraphEngine` is a pure module (input: array of task nodes; output: results) so it is unit-testable without a DB.

### Suggested repo layout
```
/client   src/{pages,components,features,api,hooks,store}
/server   src/{config,models,routes,controllers,services,middleware,utils,seed}
          src/services/graph/{cycle.js,cascade.js,health.js,criticalPath.js}
          src/services/ai/{provider.js,gemini.js,openai.js,prompts.js,schemas.js}
/docs
```

---

## 3. Data Model (Mongoose)

All collections: `createdAt`, `updatedAt` via `timestamps`. IDs are ObjectId.

**User**: `name`, `email` (unique, lowercase), `passwordHash`.

**Workspace**: `name`, `owner` (User), `members[{ user, role: ADMIN|LEAD|MEMBER, joinedAt }]`.
Index: `members.user`.

**Project**: `workspace`, `name`, `description`, `createdBy`, `healthScore` (0–100), `healthStatus` (ON_TRACK|AT_RISK|CRITICAL), `healthSummary`, `aiBrief`, `criticalPathTask` (Task, nullable), `healthUpdatedAt`.
Index: `workspace`.

**Task**: `project`, `workspace` (denormalized for authz/search), `title`, `description`, `category` (PRODUCT|ENGINEERING|MARKETING), `status` (TODO|IN_PROGRESS|BLOCKED|DONE), `priority` (LOW|MEDIUM|HIGH|CRITICAL), `assignee` (ObjectId ref User, default null), `dependsOn[ObjectId]`, `isAtRisk`, `riskReason`, `blockerNote`, `sourceDocId`, `sourceProposalId`, `isArchived` (Boolean, default false; soft delete). Archiving a task also pulls its ID from every other task's `dependsOn` and triggers recompute.
Indexes: `{project, status}`, `{project, category}`, `{project, isAtRisk}`, text index on `title, description`.

**ContextDoc**: `project`, `workspace`, `type` (BRIEF|TRANSCRIPT), `title`, `content`, `author`.
Index: text on `title, content`; `{project, type}`. Content size cap (e.g. 50k chars) **[ASSUMPTION]**.

**AgentProposal**: `project`, `workspace`, `sourceDoc`, `triggerType` (BRIEF|TRANSCRIPT), `summary`, `proposedActions[]`, `status` (PENDING|APPROVED|REJECTED|FAILED), `submittedBy`, `reviewedBy`, `reviewedAt`, `rejectionReason`, `model`, `promptVersion`, `executionResult` (created IDs / errors).

`proposedActions[]` is a discriminated union:
```
CREATE_TASK        { tempId, title, description, category, priority, dependsOnRefs[] }   // refs = tempId | existing taskId
UPDATE_TASK_STATUS { taskId, newStatus, blockerNote? }
ADD_DEPENDENCY     { taskRef, dependsOnRef }                                              // refs = tempId | taskId
```
Each action also carries `rationale` (short AI explanation). v1.0 approves/rejects the whole batch; per-action checkboxes (`excludedActionIndexes`) are an optional nice-to-have, no inline editing. Proposals also store `source: LLM|FALLBACK`.

**AuditLog** (append-only): `workspace`, `project`, `actorType` (HUMAN|AI_AGENT), `actorUser` (the human who approved/submitted), `action` (e.g. TASK_CREATED, TASK_STATUS_CHANGED, DEPENDENCY_ADDED, PROPOSAL_APPROVED, PROPOSAL_REJECTED, RISK_FLAG_CHANGED, PROJECT_CREATED, MEMBER_ADDED…), `entityType`, `entityId`, `details{before, after}`, `proposalId`, `createdAt`.
Immutability enforced at the app layer: model exposes only `create`; pre-hooks throw on update/delete/`findOneAndUpdate`/`deleteMany`; DB user in production has no update/delete privileges on this collection **[ASSUMPTION: best-effort at Atlas level]**.
Indexes: `{workspace, createdAt:-1}`, `{project, createdAt:-1}`, `{entityType, entityId}`, `{actorType}`.

Unique rule: a task cannot depend on itself and `dependsOn` has no duplicates; same project only.

---

## 4. Authentication & Authorization

- Register/login with email + password; bcrypt (cost 12). JWT access token (e.g. 1h) **[ASSUMPTION: access token only, stored in memory/localStorage; refresh tokens deferred — Q4]**.
- `authenticate` middleware → `req.user`.
- `requireWorkspaceRole(...roles)` loads membership for the workspace derived from the route/resource (never trusted from request body). Non-members get 404/403.
- Permission matrix:

| Action | ADMIN | LEAD | MEMBER |
|---|---|---|---|
| Manage members/roles, delete workspace | ✅ | ❌ | ❌ |
| Create project | ✅ | ✅ | ❌ |
| Create/edit/delete tasks, edit dependencies | ✅ | ✅ | ❌ |
| Update task status / blocker note | ✅ | ✅ | ✅ |
| Submit brief / transcript (creates PENDING proposal) | ✅ | ✅ | ✅ |
| View proposals, tasks, audit, search | ✅ | ✅ | ✅ |
| Approve / reject proposal | ✅ | ✅ | ❌ (403) |

Note: a MEMBER status update to `BLOCKED` runs the cascade directly (human action, audited as HUMAN).

---

## 5. API Specification (REST, prefix `/api/v1`)

All responses JSON; errors use `{ error: { code, message, details? } }`.

**Auth**
- `POST /auth/register`, `POST /auth/login`, `GET /auth/me`

**Workspaces**
- `POST /workspaces`, `GET /workspaces`, `GET /workspaces/:id`
- `POST /workspaces/:id/members` (add by email, role), `PATCH /workspaces/:id/members/:userId` (role), `DELETE …` (ADMIN)
- `POST /workspaces/demo` — creates the seeded demo workspace for the caller (idempotent per user)

**Projects**
- `POST /workspaces/:wid/projects`, `GET /workspaces/:wid/projects`, `GET /projects/:id` (includes health block)

**Tasks**
- `GET /projects/:pid/tasks?view=&category=&status=&atRisk=&q=`
- `POST /projects/:pid/tasks` (LEAD+), `PATCH /tasks/:id` (LEAD+ for fields; MEMBER limited to `status`, `blockerNote`), `DELETE /tasks/:id` (LEAD+)
- `POST /tasks/:id/dependencies` `{ dependsOnId }` → DFS check; 400 with `cyclePath` on cycle
- `DELETE /tasks/:id/dependencies/:dependsOnId`
- `GET /projects/:pid/graph` → nodes, edges, per-node upstream/downstream counts (for matrix view)

**Context & AI**
- `POST /projects/:pid/context/brief` `{ title?, content }` → saves ContextDoc, calls AI, returns PENDING proposal
- `POST /projects/:pid/context/transcript` `{ title?, content }` → same, with existing task snapshot sent to AI
- `GET /projects/:pid/docs`, `GET /docs/:id`

**Proposals**
- `GET /projects/:pid/proposals?status=`, `GET /proposals/:id`
- `POST /proposals/:id/approve` (LEAD+) — body optionally `{ excludedActionIndexes: [] }`
- `POST /proposals/:id/reject` (LEAD+) `{ reason? }`

**Audit & Search**
- `GET /workspaces/:wid/audit?actorType=&entityType=&projectId=&from=&to=&page=`
- `GET /workspaces/:wid/search?q=&type=task|doc|audit&department=&status=&atRisk=&actorType=&page=`

Validation with `zod` (or Joi) on every body/query/param. Pagination: `page`, `limit` (max 100).

---

## 6. Graph Engine (pure module)

Input: `tasks = [{ id, status, dependsOn[], title, category }]`. Edge direction: `B.dependsOn ∋ A` means A → B (A upstream). Build `downstream` adjacency map (A → [B…]) once per invocation.

### 6.1 Cycle detection (DFS)
`wouldCreateCycle(tasks, taskId, dependsOnId)`: adding edge `dependsOn → task`. A cycle exists iff `taskId` is already reachable from… precisely: if `dependsOnId` is reachable from `taskId` following *downstream* edges (or `dependsOnId === taskId`). Iterative DFS with parent map to reconstruct and return the **exact cycle path** (`[A, B, …, A]` as titles + IDs) for the 400 response. For batch proposals, edges are added to an in-memory graph one at a time and checked incrementally, so a proposal containing a cycle (including among new `tempId` tasks) is rejected before any write. Complexity O(V+E).

### 6.2 Risk cascade (BFS)
`computeRisk(tasks)` — **full recompute** over the project graph rather than incremental patching (simple, provably consistent, fine at expected scale):
1. `blockedSet = tasks with status BLOCKED`.
2. Multi-source BFS from all blocked tasks through downstream edges; record for each reached node the set of blocking root(s) (nearest blocker(s) or all upstream blockers — **[ASSUMPTION: list all distinct blocking ancestors, truncated to 3 names + "+N more"]**).
3. A reached task is `isAtRisk = true` unless its own status is `DONE` or `BLOCKED` (confirmed). DONE tasks are never flagged; BLOCKED tasks are counted only in B. `riskReason = "Blocked upstream by: X, Y"`.
4. All other tasks: `isAtRisk=false`, `riskReason=""`.
5. Diff against stored values; persist only changed tasks (bulk write) and audit each flag change as `RISK_FLAG_CHANGED` with actor = SYSTEM-triggered-by original actor.

Resolution (blocker → IN_PROGRESS/DONE) is handled by the same recompute, which naturally keeps flags for tasks that still have another blocker.

### 6.3 Health
Per PRD:
```
N = tasks with isArchived === false;  B = #BLOCKED;
R = #(status !== 'BLOCKED' && status !== 'DONE' && isAtRisk === true)   // B and R are disjoint
C = #DONE
penalty = ((B*1.0 + R*0.5) / N) * 100
score   = max(0, round(100 - penalty))
```
N = 0 → score 100, status ON_TRACK, summary "No tasks yet".

Status classification (confirmed; strict `if / else if / else`):
1. `CRITICAL` if score < 50 **or** (B / N) ≥ 0.35
2. else `AT_RISK` if score < 80 **or** B ≥ 1 **or** R ≥ 1
3. else `ON_TRACK` (score ≥ 80, B = 0, R = 0)

(This replaces the PRD's 30% blocked/at-risk rule with 35% blocked-only, tuned so small ~7-task projects show "At risk" in the Blueprint scenario. Worked example: 7 tasks, B=1, R=3 → penalty = (1+1.5)/7×100 ≈ 35.7 → score 64 → AT_RISK; B/N = 0.14 so not CRITICAL.)

### 6.4 Critical path bottleneck
For each BLOCKED task, `downstreamCount` = size of transitive downstream set (BFS). Bottleneck = max count; ties broken by priority then earliest `createdAt`. If no blocked tasks → null.

### 6.5 Executive brief
`healthSummary` is **deterministic template text** (e.g. `"68% — Backend delay affects 3 dependent tasks. Auth Service is the critical path."`) so it never depends on LLM availability. Optional enhancement: LLM-polished `aiBrief` generated async and cached, falling back to the template **[ASSUMPTION — Q7]**.

### 6.6 Recalculation trigger
A single `recomputeProject(projectId, session, actorContext)` function is called after: task create/delete/update-status, dependency add/remove, proposal execution (once, at end of batch). It runs: load tasks → computeRisk → persist diffs → computeHealth → update `Project`.

---

## 7. AI Orchestration

### 7.1 Provider adapter
`LLMProvider.generateJson({ system, user, schema, timeoutMs })`. **Gemini is the implemented provider** (`GEMINI_API_KEY`, native `responseSchema` structured output); the adapter interface keeps an OpenAI implementation a drop-in later. Output is always **re-validated server-side with zod** (never trust the provider).

### 7.1a Deterministic fallback (confirmed)
If the key is missing, or the call times out / is rate-limited / returns invalid output after retry, `AIOrchestrator` falls back to a deterministic path instead of erroring:
- **Brief:** keyword/heuristic parser (split into bullet/sentence chunks, classify category by keywords such as auth/api/backend → ENGINEERING, landing/launch/creative/campaign → MARKETING, spec/onboarding/criteria → PRODUCT; priority by words like critical/urgent/must) and, for the demo brief, a canned decomposition matching the Blueprint scenario.
- **Transcript:** match existing task titles by fuzzy/keyword match + verbs (blocked/stuck → BLOCKED, started → IN_PROGRESS, done/shipped → DONE); the demo transcript maps to a canned proposal.
- Proposals record `source: 'LLM' | 'FALLBACK'` and the UI shows a small "Generated by fallback" chip. The same validators apply to both paths.

### 7.2 Brief decomposition
Input: brief text (+ project name). Output schema:
```
{ summary, tasks:[{ tempId, title, description, category, priority }], dependencies:[{ taskTempId, dependsOnTempId }] }
```
Server post-processing: dedupe tempIds, drop dependencies referencing unknown IDs (log), run cycle check on the whole proposed graph; if the AI produced a cycle, either auto-drop the offending edge(s) with a warning flag on the proposal or retry once with feedback **[ASSUMPTION: one retry, then drop & flag]**. Limits: max 40 tasks per proposal.

### 7.3 Transcript extraction
Input: transcript + existing tasks `[{id, title, status, category}]` (cap ~200 tasks; truncate by relevance/recency if more). Output: `{ summary, actions:[…union…] }`. Server validates: every `taskId` exists in this project; status transitions valid (e.g. not setting same status); `BLOCKED` actions should include `blockerNote`; unknown references discarded. To reduce hallucinated IDs, tasks are sent with short indices and mapped back server-side.

### 7.4 Prompt-injection & safety
- Transcript/brief text is placed in a delimited data block; system prompt states it's untrusted data, not instructions.
- Because every output goes through human approval and strict schema validation, injection blast radius is limited to a bad *proposal*.
- Prompt templates are versioned (`promptVersion` stored on proposal).

### 7.5 Failure handling
Timeout (e.g. 30s), one retry with backoff on 429/5xx, then **fall back per §7.1a** (user never sees a crash). Invalid JSON/schema → one repair retry, then fallback. Only if the fallback also yields nothing usable (e.g. empty input) return `422 AI_NO_ACTIONS` with a clear message. The ContextDoc stays saved so the user can regenerate.

Rate limiting for AI endpoints per user (e.g. 10/min) to control cost.

---

## 8. Proposal State Machine & Atomic Execution

States: `PENDING → APPROVED | REJECTED`. Failed validation/execution never changes state: the proposal stays `PENDING` and the API returns `400` with the reason (e.g. cycle path, missing task). No `FAILED` state in v1.

**Approve flow (single Mongo transaction):**
1. Authz: LEAD/ADMIN of the proposal's workspace.
2. `findOneAndUpdate({_id, status:'PENDING'}, {status:'APPROVED', reviewedBy, reviewedAt}, {session})` — if null → `409 Conflict` ("already processed") — this is the idempotency guard (I5).
3. Load project tasks; build in-memory graph.
4. Execute actions in order: creates first (assign real ObjectIds, map `tempId→ObjectId`), then dependency adds (each cycle-checked against the in-memory graph), then status updates. Any validation failure aborts the whole transaction (all-or-nothing, confirmed) and the proposal remains PENDING with a 400 returned. Validate all actions against the in-memory graph *before* mutating, then write inside the transaction.
5. `recomputeProject` once.
6. Write audit entries (`actorType: AI_AGENT`, `actorUser: approver`, `proposalId`) for each action with before/after, plus a `PROPOSAL_APPROVED` entry.
7. Commit.

Stale-state check: UPDATE_TASK_STATUS actions store the task's status at proposal time (`expectedCurrentStatus`); if it has changed by approval time, flag in UI and warn (non-blocking) **[ASSUMPTION]**.

Requires replica set (Atlas free tier works; local dev via `mongodb-memory-server` replset or docker single-node replset).

---

## 9. Frontend Requirements

- **Routing:** `/login`, `/register`, `/workspaces`, `/w/:wid` (projects), `/p/:pid` (board), `/w/:wid/audit`, `/w/:wid/search`.
- **State/data:** React Query (server state) + light store (Zustand/Context) for auth & UI. Axios with JWT interceptor, 401 → logout.
- **Board header:** Launch Health card (score, status chip, bottleneck) and AI Brief card; refreshes after any mutation.
- **View switcher** (persist choice per user in localStorage): Departmental (3 columns), Kanban (4 columns), Dependency matrix (per task: "Blocked By [upstream]" → Task → "Blocks [downstream]"; no canvas/graph library in v1.0).
- **Task card:** status badge, priority, upstream dependency count, red badge for BLOCKED, amber border + tooltip with `riskReason` for AT_RISK. Status changes via dropdown (drag-and-drop in Kanban is optional/stretch).
- **Context Drawer/Modal:** brief vs transcript tabs; skeleton loaders during AI call; error states for AI failures with Retry.
- **Proposals Drawer:** list of pending proposals, detail view with grouped actions (new tasks, dependency links, status changes, with before→after), risk of cycles flagged; Approve & Execute / Reject buttons shown only for LEAD/ADMIN (disabled with explanation for MEMBER); double-click protection (disable on submit).
- **Audit Log Viewer:** filterable table with expandable before/after JSON diff; HUMAN vs AI_AGENT badges.
- **Search:** global search bar with type tabs and filters.
- **Demo:** "Load Demo Workspace" button on landing/login page (auto-registers a demo user or logs into a shared demo account — Q11).
- Accessibility: keyboard-navigable drawers, color not the sole indicator (icons/labels alongside red/amber).

---

## 10. Search

MongoDB text indexes on Task (`title`, `description`), ContextDoc (`title`, `content`); AuditLog filtered by structured fields (+ regex/text on `action`/`details` summary field). Filters: department, status, risk state, actor type. Results scoped by workspace membership. Atlas Search / vector search deferred (PRD v2.0). Note: text index returns whole-word matches only; if substring search is required, use anchored regex with escaped input and accept the perf trade-off — Q12.

---

## 11. Non-Functional Requirements

| Area | Requirement |
|---|---|
| Security | bcrypt; secrets in `.env`, `.gitignore`d, `.env.example` provided; helmet; CORS allowlist; login rate limit; input validation; NoSQL-injection sanitization (`express-mongo-sanitize` or zod strict); all resource access checks workspace membership (prevent IDOR) |
| Performance | Board load < 500 ms for 500 tasks; graph recompute O(V+E) < 50 ms at 1k tasks; AI calls timeout 30 s |
| Reliability | Transactional execution; idempotent approve; graceful AI degradation |
| Observability | Structured logging (pino), request IDs, error handler never leaks stack in prod |
| Testing | Unit tests for GraphEngine (cycle, multi-hop cascade, diamond graphs, resolution with 2 blockers, health boundaries); integration tests for RBAC (MEMBER → 403 on approve), idempotent double-approve, atomic rollback; AI layer tested with mocked provider incl. malformed output; a few Playwright/Cypress smoke flows (optional) |
| Deployment | Frontend on Vercel/Netlify; backend on Render/Railway; MongoDB Atlas; env-based config; health endpoint `GET /healthz` |
| Browser support | Latest Chrome/Firefox/Safari/Edge, desktop-first, responsive down to tablet |

---

## 12. Demo Seed

"Load Demo Workspace" (`POST /workspaces/demo`) creates a **fresh, clean** demo workspace each click (or resets the caller's existing demo one) with the exact Blueprint slide scenario:
- **Product:** Acceptance criteria, Mobile onboarding
- **Engineering:** Auth service (**BLOCKED**), Payments API, App integration
- **Marketing:** Landing page, Launch creatives
- Dependencies **[ASSUMPTION]**: Payments API, Mobile onboarding and App integration depend on Auth service; Landing page depends on App integration (multi-hop demo); Launch creatives depends on Acceptance criteria. Cascade then flags Payments API, Mobile onboarding, App integration and Landing page as AT_RISK.
- **1 pending AI proposal** pre-created for inspection (source FALLBACK/canned), plus a sample brief and sample transcript as one-click buttons.
- **3 dummy team members** (one each ADMIN, LEAD, MEMBER) with known credentials/quick role-switch so RBAC and assignment can be tested immediately. Demo access is a dedicated demo user auto-logged-in on click. **[ASSUMPTION: shown as a role switcher in the demo only]**

---

## 13. Milestones (suggested)

1. **M1 – Foundation:** repo, config, models, auth, RBAC middleware, workspace/project CRUD.
2. **M2 – Tasks & Graph Engine:** task CRUD, dependency endpoints, DFS/BFS/health with unit tests, board views + header.
3. **M3 – AI & Proposals:** provider adapter, brief decomposition, proposal review UI, transactional approve, audit.
4. **M4 – Transcripts, Audit & Search:** transcript flow, audit viewer, search.
5. **M5 – Polish & Deploy:** demo seed, skeletons/error states, tests, deployment, README.

---

## 14. Risks

| Risk | Mitigation |
|---|---|
| LLM returns invalid/hallucinated IDs or cyclic graph | Schema + referential validation, cycle check, human gate |
| Mongo transactions unavailable (standalone DB) | Require replica set/Atlas; document it |
| LLM quota/latency during evaluation | Timeouts, retry, canned demo proposals |
| Ambiguous health rules produce inconsistent UI | Single `health.js` source of truth + boundary tests |
| Audit "immutability" only app-level | Restricted DB role; hooks; no update/delete routes |

---

## 15. Out of Scope (v1)
WebSockets/live presence, vector RAG, GitHub/Google integrations, BullMQ queues, audio transcription, refresh-token rotation, email invites (unless chosen in Q3).

---

## 16. Decisions Log & Remaining Assumptions

**Confirmed:** Gemini primary + deterministic fallback; health precedence/thresholds (§6.3); DONE/BLOCKED never in R; all-or-nothing approval; whole-batch review; list-based dependency matrix; add members by registered email only; `assignee` field; soft archive with dependsOn cleanup; fresh demo workspace with pending proposal and dummy members; plain JS ES Modules; Tailwind + lucide-react (cream/dark/purple Blueprint look); Vercel + Render + Atlas.

**Still assumed (tell me if wrong):**
- Auth: single JWT access token, no refresh tokens.
- Dependencies only within one project.
- MEMBERs may change task status/blocker note (BLOCKED applies immediately, audited as HUMAN) but cannot add/remove dependencies or edit other task fields; LEAD+ can.
- `healthSummary` is deterministic template text; no separate LLM narrative.
- Search uses Mongo text indexes (whole-word), plus structured filters.
- Render free tier cold starts: demo button shows a loading state; Atlas free tier supports the transactions we need.

<!-- Original open questions retained below for reference -->

### Original Open Questions (resolved above)

**Product / behavior**
1. **LLM provider:** Gemini or OpenAI as primary (which key do you have)? Should the adapter support both?
2. **Task assignment:** PRD mentions "assigned tasks" but `Tasks` has no `assignee`. Add `assignee` (+ filter "my tasks")?
3. **Invites:** Add existing registered users by email only, or generate invite links / send emails?
4. **Auth:** Single JWT access token OK, or do you want refresh tokens/httpOnly cookies?
5. **Health classification:** PRD rules overlap (e.g. score 90 with B=1 → AT_RISK; score 45 → both AT_RISK-by-B and CRITICAL). Is my precedence (CRITICAL > AT_RISK > ON_TRACK) correct? Is "≥30% of tasks blocked/at-risk" computed as (B+R)/N?
6. **At-risk & DONE:** Should a downstream task that is already `DONE` be flagged at-risk when an upstream gets blocked? (I assume no.) Should a BLOCKED task also count in R? (I assume no — R counts only unblocked.)
7. **AI Brief:** Deterministic template text only, or also an LLM-generated narrative?
8. **Dependency view:** Is a matrix/list showing upstream & downstream per task enough, or do you want an actual node-link graph (React Flow)?
9. **Proposal review granularity:** Approve/reject whole proposal only (as PRD says), or allow deselecting individual actions? Can reviewers edit proposed tasks before approving?
10. **Partial failure:** If one action in an approved proposal is invalid (e.g. task deleted since), fail the whole batch (my assumption) or apply the valid ones?
11. **Members & proposals:** Should a MEMBER's status update to BLOCKED apply immediately (my reading of PRD) — and should MEMBERs be able to add dependencies manually, or only LEAD+?
12. **Search:** Word-based text search okay, or need partial/substring matching?
13. **Demo:** Shared demo account vs. per-click fresh demo workspace? Pre-canned AI proposals as fallback if the LLM fails?
14. **Task deletion:** Hard delete (and strip from `dependsOn`) or soft archive? "Active tasks" in N suggests archive — confirm.
15. **Multi-project:** Do dependencies ever cross projects? (I assume no — same project only.)

**Delivery**
16. **Language:** JavaScript or TypeScript (server and/or client)? I'd recommend TypeScript.
17. **Tooling prefs:** React Query, zod, Zustand, Vitest/Jest, ESLint/Prettier — any preferences or constraints?
18. **Hosting:** Confirm targets (e.g. Vercel + Render + Atlas) and whether you need Docker/CI.
19. **Scale & deadline:** Expected max tasks per project, and your submission timeline (to trim scope if needed)?
20. **UI design:** Any mockups/brand/color or component-library preference (plain Tailwind vs. shadcn/ui, etc.)? Dark mode?
