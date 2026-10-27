# OperateOS

**An AI operating system for teams.** OperateOS turns messy launch briefs and meeting transcripts into dependency-linked plans, warns you when a blocked task puts downstream work at risk, and records every human and AI action in an audit log.

> Live app: (https://operate-os-ten.vercel.app/) · API: (https://operateos.onrender.com/healthz)
> Click **Load Demo Workspace** on the login page to try everything without signing up.
> Project demo video : (https://drive.google.com/file/d/1UOXvk0ilfgKtsh1V8VYXpXhPv2bFH0Az/view?usp=sharing)

---

## Problem Statement

Product and engineering teams lose time and visibility in four places:

1. **Context-to-execution gap.** A product manager writes a launch brief, then someone spends hours turning paragraphs into tasks and working out the order.
2. **Post-meeting black hole.** Decisions, blockers and new action items from standups stay in meeting notes instead of updating the project board.
3. **Blind cascade risk.** When one task (for example *Auth Service*) is blocked, tasks that depend on it (*Payments API*, *Landing Page*) are not flagged, so leadership finds out when deadlines slip.
4. **Unsafe AI tools.** Most AI tools are chat wrappers that cannot change anything, or they change records with no approval and no audit trail.

## Target Users

Teams that ship products across **Product, Engineering and Marketing**, for example startup teams, student project and event teams, and small product organisations. Three roles are supported:

| Role | Who | Can do |
|---|---|---|
| **Admin** | Founder, VP Engineering | Everything, including managing members and approving AI proposals |
| **Lead** | Product manager, tech lead | Create projects and tasks, submit briefs, approve or reject AI proposals |
| **Member** | Engineer, designer, marketer | View everything, update task status and blocker notes, submit briefs and transcripts. Cannot approve AI proposals |

## Solution

OperateOS treats unstructured team context as input and keeps a human in control:

- **AI proposes, humans approve.** Gemini decomposes a brief or a transcript into a *proposal*. Nothing touches the live board until a Lead or Admin approves it.
- **A deterministic engine does the maths.** Cycle detection (DFS), blocker cascade (BFS) and a health score are plain algorithms, not AI guesses.
- **Everything is auditable.** Every change, by a person or by the AI agent, is stored with before and after state in an append-only log.
- **It never crashes on AI failure.** If Gemini is overloaded, out of quota or unconfigured, a built-in rule-based parser takes over, and the proposal is labelled as such.

## Key Features

**Workspaces and boards**
- Register and log in with JWT authentication. Create workspaces, add members by email and set their roles.
- Projects with three board views: **Departments** (Product / Engineering / Marketing), **Status Kanban** (Todo / In Progress / Blocked / Done) and a **Dependency view** showing what blocks each task and what it blocks.
- Task cards show status, priority, assignee, upstream dependency count and risk alerts. Red means blocked; amber with a tooltip means at risk.

**AI plan from a launch brief**
- Paste a messy brief and get tasks with departments, priorities and dependency links.
- Review the proposal, then **Approve and Execute** or **Reject**.

**Blocker cascade and health score**
- Marking a task blocked flags every direct and indirect downstream task as at risk with a reason ("Blocked upstream by: Auth service"). Resolving the blocker clears the flags.
- Linking tasks that would form a loop is rejected with the exact cycle path.
- Project health (0 to 100%, On track / At risk / Critical), the critical-path bottleneck and an executive summary update after every change.

**Meeting transcript to actions**
- Paste standup notes. The AI compares them with your real tasks and proposes status changes, new action items and dependency links.

**Audit and search**
- Audit log with filters (Human vs AI agent, entity, project) and an expandable before/after view.
- Workspace search across tasks, briefs, transcripts and audit history, filtered by department, status, risk state and actor.

**App experience**
- Left sidebar with your workspaces and projects, collapsible, with account settings (name, password).
- One-click **Demo Workspace** with Admin, Lead and Member roles and a pending AI proposal.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, Tailwind CSS, React Router, Axios, lucide-react |
| Backend | Node.js (ES modules), Express, Mongoose, Zod, JWT, bcryptjs, Helmet, express-rate-limit |
| Database | MongoDB Atlas (replica set, needed for transactions) |
| AI | Google Gemini API with JSON-schema output, retries and model fallback |
| Hosting | Vercel (frontend), Render (backend), MongoDB Atlas |

## Architecture

```
React SPA (Vite + Tailwind)
   │  REST/JSON, JWT in the Authorization header
Express API
   ├─ middleware: auth, role checks (per workspace), Zod validation, rate limits, error handler
   ├─ services/graph       Pure algorithms: cycle detection (DFS), risk cascade (BFS), health, critical path
   ├─ services/ai          Gemini client (retries + model chain), prompts, plan validation, rule-based fallbacks
   ├─ services/proposals   Proposal state machine and atomic executor (MongoDB transaction)
   ├─ services/audit       Append-only audit writer
   └─ models               Users, Workspaces, Projects, Tasks, ContextDocs, AgentProposals, AuditLogs
MongoDB Atlas
```

**Approval flow.** A brief or transcript is saved as a `ContextDoc`. The AI service produces a plan, which is validated (unknown task references, no-op changes and cycles are dropped with warnings) and stored as a `PENDING` `AgentProposal`. When a Lead or Admin approves, one transaction claims the proposal (`PENDING → APPROVED`, so a double click cannot run it twice), re-validates every action against the real graph, applies the changes, recalculates risk and health, and writes audit entries. If anything fails, everything rolls back and the proposal stays `PENDING`.

**Health score.** With `N` active tasks, `B` blocked tasks and `R` at-risk (not blocked, not done) tasks:
`score = max(0, round(100 − ((B × 1.0 + R × 0.5) / N) × 100))`.
Critical if the score is below 50 or at least 35% of tasks are blocked; At risk if the score is below 80 or `B ≥ 1` or `R ≥ 1`; otherwise On track.

**Project structure**
```
backend/    src/{config,controllers,middleware,models,routes,services,utils}, scripts/
frontend/   src/{api,components,context,pages,views}
prd.md      Product requirements
trd.md      Technical requirements and design decisions
```

**API overview** (prefix `/api/v1`)

| Area | Endpoints |
|---|---|
| Auth | `POST /auth/register`, `POST /auth/login`, `GET/PATCH /auth/me`, `POST /auth/change-password` |
| Workspaces | `POST/GET /workspaces`, `GET /workspaces/:id`, members: `POST/PATCH/DELETE /workspaces/:id/members`, `POST /workspaces/demo` |
| Projects and tasks | `POST/GET /workspaces/:wid/projects`, `GET /projects/:id`, `GET/POST /projects/:pid/tasks`, `PATCH/DELETE /tasks/:id` |
| AI | `POST /projects/:pid/context/brief`, `POST /projects/:pid/context/transcript` |
| Proposals | `GET /projects/:pid/proposals`, `GET /proposals/:id`, `POST /proposals/:id/approve`, `POST /proposals/:id/reject` |
| Audit and search | `GET /workspaces/:wid/audit`, `GET /workspaces/:wid/search` |

## Local Setup

**Prerequisites:** Node.js 20 or newer, and a MongoDB Atlas cluster. A plain local `mongod` will not work because proposal approval uses transactions. A Gemini API key is optional; without one the rule-based fallback is used.

```bash
# 1. Backend
cd backend
cp .env.example .env        # then fill in MONGODB_URI and JWT_SECRET (see below)
npm install
npm run dev                 # http://localhost:5000  (check /healthz)

# 2. Frontend (new terminal)
cd frontend
cp .env.example .env        # VITE_API_URL=http://localhost:5000/api/v1
npm install
npm run dev                 # http://localhost:5173
```

Open http://localhost:5173 and either register or click **Load Demo Workspace**. In the demo, use the account menu at the bottom of the sidebar to switch between Admin, Lead and Member.

To see which Gemini models your key can use: `node backend/scripts/listModels.js`.

## Environment Variables

Never commit real values. `.env` files are git-ignored; only the `.env.example` templates are tracked.

**Backend (`backend/.env`)**

| Variable | Required | Description |
|---|---|---|
| `MONGODB_URI` | Yes | Atlas connection string including the database name, e.g. `mongodb+srv://<user>:<password>@<cluster>/operateos` |
| `JWT_SECRET` | Yes | Long random string used to sign tokens |
| `JWT_EXPIRES_IN` | No | Token lifetime, default `1d` |
| `CLIENT_ORIGIN` | Yes | Allowed frontend origin(s) for CORS, comma separated, e.g. `http://localhost:5173` |
| `PORT` | No | Default `5000` (Render sets it automatically) |
| `GEMINI_API_KEY` | No | Enables AI. If empty, the rule-based parser is used |
| `GEMINI_MODEL` | No | Primary model, default `gemini-3.8-flash` |
| `GEMINI_FALLBACK_MODELS` | No | Comma-separated backups tried in order when the primary is overloaded or out of quota |

**Frontend (`frontend/.env`)**

| Variable | Required | Description |
|---|---|---|
| `VITE_API_URL` | Yes | Backend base URL including `/api/v1` |

## Deployment

| Part | Platform | Settings |
|---|---|---|
| Database | MongoDB Atlas | Allow network access from `0.0.0.0/0` (Render has no fixed IP) |
| Backend | Render Web Service | Root directory `backend`, build `npm install`, start `npm start`, health check `/healthz`, set the backend environment variables above plus `NODE_VERSION=22` |
| Frontend | Vercel | Root directory `frontend`, framework Vite, set `VITE_API_URL` to `https://<your-render-app>.onrender.com/api/v1`. `vercel.json` rewrites all routes to the SPA |

After both are deployed, set the backend's `CLIENT_ORIGIN` to the Vercel URL (no trailing slash).

- **Live frontend:** `<add your Vercel URL here>`
- **Live backend:** `<add your Render URL here>`

The Render free tier sleeps when idle, so the first request after a pause can take up to a minute. The free Gemini tier has daily request limits; when they are hit, the app falls back to the rule-based parser automatically.

## Roadmap

Manual dependency editing in the UI, real-time collaboration (WebSockets), semantic search over workspace history, GitHub and calendar integrations, and background queues for long recordings (see the "Future Scope" section of `prd.md`).
