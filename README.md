# OperateOS

- `backend/` — Node + Express + MongoDB API
- `frontend/` — React (Vite) + Tailwind SPA
- `prd.md`, `trd.md` — specs

## Run locally

```bash
# backend
cd backend
cp .env.example .env     # set MONGODB_URI and JWT_SECRET
npm install
npm run dev              # http://localhost:5000

# frontend
cd frontend
cp .env.example .env     # VITE_API_URL=http://localhost:5000/api/v1
npm install
npm run dev              # http://localhost:5173
```

Click **Load Demo Workspace** on the login page for the seeded Blueprint project (demo Admin / Lead / Member switcher in the navbar).

## Implemented: Workflow 1
Auth (JWT + bcrypt), workspaces, members & roles (ADMIN/LEAD/MEMBER), projects, task CRUD with assignee and soft archive, and the three board views (Departments, Status Kanban, Dependency list). Role rules are enforced server-side: MEMBERs can only change task status and blocker note.

## Implemented: Workflow 2
Paste a launch brief (**Add context**) -> Gemini (JSON-schema output, validated with zod; deterministic fallback parser if the key is missing or the call fails) -> a `PENDING` **AgentProposal**. Nothing touches `Tasks` until a LEAD/ADMIN clicks **Approve & Execute**, which runs in one MongoDB transaction: claim PENDING->APPROVED (idempotent, double click returns 409), validate all refs and cycles, create tasks, resolve tempIds to ObjectIds, recompute risk + health, write `AuditLog` entries. Any validation failure rolls everything back and the proposal stays PENDING.
Needs a replica set (Atlas works; a standalone local mongod does not support transactions).

## Implemented: Workflow 4
Paste a meeting transcript (**Add brief / transcript -> Meeting transcript**). The backend sends the project's real tasks (as short refs T1, T2...) plus the transcript to Gemini; the reply is validated against those tasks (unknown refs, no-op status changes and cycles are dropped with warnings) and saved as a PENDING proposal of `UPDATE_TASK_STATUS` / `CREATE_TASK` / `ADD_DEPENDENCY`. Approval reuses the same atomic executor, so the BFS cascade runs and every transition is audited with before/after. Falls back to a deterministic parser if Gemini is unavailable.
- **Audit log page** (`/workspace/:id/audit`): filter by actor (Human / AI agent), entity, project; expandable before/after diff.
- **Search page** (`/workspace/:id/search`): keyword search over tasks, briefs/transcripts and audit history, with department, status, risk-state and actor filters.

## Not yet
Manual dependency editing UI, real-time collaboration, vector search (v2 scope in the PRD).
