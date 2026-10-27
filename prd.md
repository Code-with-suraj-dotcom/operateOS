# Product Requirements Document (PRD): OperateOS

**Document Version:** 1.0 (End-Term Release Specification)  
**Product Name:** OperateOS — AI Operating System for Teams  
**Category:** B2B SaaS / AI-Native Project Intelligence & Workspace Platform  
**Core Technology Stack:** React (Vite), Tailwind CSS, Node.js, Express.js, MongoDB, Gemini/OpenAI API  

---

## 1. Executive Summary & Product Vision

**OperateOS** is an AI-native workspace and project intelligence platform that unifies team documents, meeting transcripts, tasks, and cross-functional dependencies into a single connected graph. 

Traditional project management tools (such as Jira, Trello, or Linear) act as passive databases where humans must manually translate product briefs into tickets, manually link dependencies, and manually update task statuses after every meeting. When a critical engineering task is delayed, downstream product and marketing teams often remain unaware until deadlines slip.

OperateOS solves this by treating **unstructured team context** (launch briefs and meeting transcripts) as active inputs. Using LLM structured extraction paired with a deterministic **Directed Acyclic Graph (DAG) Dependency Engine** and strict **Human-in-the-Loop Approval Boundaries**, OperateOS automatically decomposes launch briefs into dependency-linked plans, detects cascading blocker risks in real time, calculates mathematical project health scores, and maintains a 100% auditable ledger of every human and AI action.

---

## 2. Problem Statement

Modern software and product teams suffer from four systemic operational failures:
1. **The Context-to-Execution Gap:** Product managers write detailed Launch Briefs or PRDs, and engineering leads spend hours manually decomposing those paragraphs into categorized tasks and mapping out execution order.
2. **The Post-Meeting Sync Black Hole:** Crucial decisions, blocker updates, and new action items discussed during daily standups or sync calls remain trapped in meeting notes rather than updating the live project board.
3. **Blind Downstream Cascade Risk:** Tasks across **Product**, **Engineering**, and **Marketing** are deeply interconnected. When an upstream task (e.g., *Auth Service*) becomes `BLOCKED`, downstream tasks that depend on it (e.g., *Payments API*, *Mobile Onboarding*, *Landing Page*) are not automatically flagged, leaving leadership blind to launch risks.
4. **Unsafe or Passive AI Integrations:** Existing AI tools either act as passive chat wrappers with no ability to mutate workspace state, or modify records without role-based human approval and auditability.

---

## 3. Target Users & Personas (RBAC Model)

OperateOS enforces strict **Role-Based Access Control (RBAC)** across workspaces:

| Persona / Role | Description & Core Responsibilities | System Permissions |
| :--- | :--- | :--- |
| **Workspace Admin** *(Founder / VP Eng)* | Owns the workspace, manages team members, oversees multi-project launch health, and audits system-wide changes. | Full CRUD on workspace, projects, members, tasks, and dependencies. Authorized to **Approve/Reject** AI Agent Proposals. |
| **Project Lead** *(Product Manager / Tech Lead)* | Authors launch briefs, runs team meetings, reviews AI-generated execution plans, and monitors the critical path. | Can create projects, submit Launch Briefs/Transcripts, manage tasks/dependencies, and **Approve/Reject** AI Agent Proposals. |
| **Team Member** *(Engineer / Designer / Marketer)* | Executes assigned tasks across Product, Engineering, or Marketing, updates task statuses, and logs blockers. | Can view workspace data, update task statuses/blockers, and submit Meeting Transcripts/Briefs to generate AI proposals, **but cannot approve or execute AI proposals**. |

---

## 4. Core Product Workflows (Functional Scope)

OperateOS is engineered around **four end-to-end operational workflows** that combine deterministic backend algorithms with structured AI intelligence:

### Workflow 1: Workspace, Project & Multi-View Board Management
1. **User Onboarding & Workspace Creation:** A user registers/logs in via JWT authentication, creates an isolated Workspace, and invites or assigns roles (`ADMIN`, `LEAD`, `MEMBER`).
2. **Blueprint Departmental View (Primary Layout):** Inside a project, tasks are organized into three cross-functional columns matching how real launch teams operate: **Product**, **Engineering**, and **Marketing**. Each task card displays its status badge (`TODO`, `IN_PROGRESS`, `BLOCKED`, `DONE`), priority, upstream dependency count, and dynamic risk alerts (`AT_RISK`).
3. **View Switcher:** Users can toggle seamlessly between:
   * **Departmental Blueprint View** (`Product` | `Engineering` | `Marketing`)
   * **Status Kanban View** (`Todo` | `In Progress` | `Blocked` | `Done`)
   * **Dependency Graph Matrix View** (Visualizing upstream blockers and downstream dependents for each task)

### Workflow 2: Messy Launch Brief → AI Plan Decomposition & Approval Gate
1. **Context Ingestion:** A user pastes or writes an unstructured **Product Launch Brief** into the OperateOS Context Drawer.
2. **Structured AI Decomposition:** The backend passes the brief to the LLM API enforcing a strict JSON response schema. The AI decomposes the brief into:
   * Categorized tasks (`PRODUCT`, `ENGINEERING`, `MARKETING`)
   * Suggested priority levels (`LOW`, `MEDIUM`, `HIGH`, `CRITICAL`)
   * Sequential dependency links (identifying which tasks must finish before others can begin)
3. **Human-in-the-Loop Approval Gate:** The AI output is **never** written directly to the live `Tasks` collection. Instead, it is saved as a `PENDING` document in the `AgentProposals` collection.
4. **Lead Review & Execution:** A `Project Lead` or `Workspace Admin` opens the Proposal Review UI, inspects the proposed tasks and dependency links, and clicks **[Approve & Execute]** (or **[Reject]**). Upon approval, the backend executes an atomic batch operation to create the tasks, resolves temporary IDs into MongoDB ObjectIds for dependency edges, recalculates project health, and writes an entry to the immutable `AuditLog`.

### Workflow 3: Deterministic Dependency Graph, Blocker Cascade & Mathematical Health Engine
1. **Cycle-Safe Dependency Linking:** When a user or approved AI proposal links Task B as dependent on Task A (`Task B dependsOn Task A`), the backend runs a **Depth-First Search (DFS) Cycle Detection algorithm**. If linking the tasks would create a circular dependency (`A → B → A`), the API rejects the mutation with a clear validation error.
2. **Real-Time Blocker Cascade (BFS Traversal):** When any task’s status is updated to `BLOCKED` (e.g., *Auth Service* is marked `BLOCKED`), the backend automatically executes a **Breadth-First Search (BFS)** across the project’s dependency graph:
   * Every direct and transitive downstream task (e.g., *Payments API*, *Mobile Onboarding*, *Landing Page*) is automatically flagged with `isAtRisk: true` and populated with a contextual `riskReason` (*"Blocked upstream by: Auth Service"*).
   * When the upstream blocker is resolved (`IN_PROGRESS` or `DONE`), the engine re-evaluates the graph and clears the downstream risk flags if no other upstream blockers remain.
3. **Mathematical Project Health Formula:** Every state or graph change triggers the deterministic **Health Calculation Engine**:
   * Let $N$ be the total number of active tasks in the project ($N > 0$).
   * Let $B$ be the number of tasks currently in `BLOCKED` status.
   * Let $R$ be the number of unblocked tasks currently flagged as downstream `isAtRisk = true`.
   * Let $C$ be the number of completed (`DONE`) tasks.
   * The deterministic penalty score is calculated as:
     $$\text{Penalty} = \left(\frac{B \times 1.0 + R \times 0.5}{N}\right) \times 100$$
   * The **Project Health Score** is bounded between $0\%$ and $100\%$:
     $$\text{Health Score} = \max\left(0, \text{round}\left(100 - \text{Penalty}\right)\right)$$
   * **Health Status Classification:**
     * `ON_TRACK`: $\text{Health Score} \ge 80\%$ and $B = 0$
     * `AT_RISK`: $50\% \le \text{Health Score} < 80\%$ or $B \ge 1$
     * `CRITICAL`: $\text{Health Score} < 50\%$ or $\ge 30\%$ of project tasks are blocked/at-risk
   * **Critical Path & Executive Brief Banner:** The backend identifies the blocked task with the highest number of downstream dependents (the **Critical Path bottleneck**) and updates the top dashboard cards (**Launch Health** status and **AI Brief** summary, e.g., *"68% — Backend delay affects 3 dependent tasks. Auth is the critical path this week."*).

### Workflow 4: Meeting Transcript → Context-Aware Action Extraction & Audit Ledger
1. **Transcript Ingestion:** After a team sync or standup, a user submits raw meeting notes or a transcript into the project.
2. **Context-Aware Matching:** The backend retrieves the project’s existing task list (IDs, titles, current statuses) and sends it alongside the transcript to the LLM API.
3. **Action Proposal Generation:** The AI identifies concrete operational mutations mentioned in the meeting:
   * `UPDATE_TASK_STATUS` (e.g., marking an existing task `BLOCKED` with a blocker note, or moving a task to `IN_PROGRESS` / `DONE`)
   * `CREATE_TASK` (e.g., adding a newly discovered action item)
   * `ADD_DEPENDENCY` (e.g., linking two tasks based on discussion)
4. **Approval & Cascade Trigger:** Once approved by a `LEAD` or `ADMIN`, the mutations are applied to the database, automatically triggering the **BFS Dependency Cascade Engine** (Workflow 3) and logging every state transition (`before` and `after` snapshots) to the **Audit Log**.
5. **Workspace Search & Audit Inspection:** Users can filter and search across all tasks, context documents, and audit logs by keyword, department, status, risk state, or actor type (`HUMAN` vs. `AI_AGENT`).

---

## 5. System Architecture & Data Model Overview

### High-Level Architecture
* **Client Layer (React + Vite + Tailwind CSS):** Single-Page Application (SPA) featuring the Blueprint Intelligence Header (`Launch Health` + `AI Brief` cards), Multi-View Task Board (`Departmental` / `Kanban` / `Dependency`), AI Context Input Modal, Pending Proposals Review Drawer, and Immutable Audit Log Viewer.
* **API & Business Logic Layer (Node.js + Express.js):**
  * **Auth & RBAC Middleware:** Validates JWT tokens and enforces role checks (`ADMIN` / `LEAD` vs. `MEMBER`) on protected routes.
  * **Graph Engine Service:** Pure algorithmic module executing DFS (cycle prevention) and BFS (downstream risk propagation + critical path identification) + Mathematical Health Score calculation.
  * **AI Orchestration Service:** Formats prompts with active workspace context and enforces strict JSON output schemas via Gemini/OpenAI API.
* **Persistence Layer (MongoDB + Mongoose):** Document store maintaining 7 core collections (`Users`, `Workspaces`, `Projects`, `Tasks`, `ContextDocs`, `AgentProposals`, and `AuditLogs`).

### Core Database Entities
1. **`Users`**: Stores credentials, profile details, and account timestamps.
2. **`Workspaces`**: Stores workspace metadata, owner reference, and an embedded `members` array mapping `userId` to role (`ADMIN`, `LEAD`, `MEMBER`).
3. **`Projects`**: Scoped to a workspace; stores project details and cached intelligence metrics (`healthStatus`, `healthScore`, `healthSummary`, `aiBrief`).
4. **`Tasks`**: Scoped to a project; stores `title`, `description`, `category` (`PRODUCT`, `ENGINEERING`, `MARKETING`), `status`, `priority`, `dependsOn` (array of upstream Task IDs), `isAtRisk` (boolean), `riskReason` (string), `blockerNote` (string), and `sourceDocId`.
5. **`ContextDocs`**: Stores raw text of submitted Launch Briefs and Meeting Transcripts linked to the author and project.
6. **`AgentProposals`**: Stores pending/reviewed AI action batches (`triggerType`, `summary`, `proposedActions[]`, `status`, `reviewedBy`).
7. **`AuditLogs`**: Append-only collection recording `actorType` (`HUMAN` or `AI_AGENT`), `actorUser`, `action`, `entityType`, `entityId`, and `details` (`before`/`after` state diff).

---

## 6. Non-Functional Requirements, Error Handling & Security

1. **Security & Credential Hygiene:**
   * All passwords hashed using `bcrypt` prior to storage.
   * All API secrets (`MONGODB_URI`, `JWT_SECRET`, `GEMINI_API_KEY` / `OPENAI_API_KEY`) managed strictly via `.env` environment variables and excluded via `.gitignore`.
   * Strict server-side authorization checks ensuring `MEMBER` roles cannot hit proposal approval endpoints (`403 Forbidden`).
2. **Resilience & Error Handling:**
   * **Circular Dependency Prevention:** Returns `400 Bad Request` with the exact cycle path if a user attempts to link conflicting dependencies.
   * **LLM Output Validation & Fallback:** Validates AI JSON responses against expected schema keys before creating an `AgentProposal`. Gracefully handles API timeouts or rate limits with clear user-facing error states.
   * **Idempotent Proposal Approval:** Prevents double-execution if an admin clicks "Approve" multiple times by checking `proposal.status === 'PENDING'` inside an atomic update.
3. **UX & Visual Feedback:**
   * Clear loading skeletons during AI decomposition and transcript extraction.
   * Instant visual distinction between healthy tasks, directly `BLOCKED` tasks (red badge), and downstream `AT_RISK` tasks (amber warning border with upstream blocker tooltip).
   * Pre-seeded demo workspace option allowing evaluators to test the exact blueprint scenario (*Auth Service*, *Payments API*, *Mobile Onboarding*, *Landing Page*) with one click.

---

## 7. Success Metrics & Evaluation Alignment

* **Zero Unapproved AI Mutations:** 100% of AI-generated task creations, status updates, and dependency links pass through the `AgentProposal` approval state machine and generate an `AuditLog` entry.
* **Deterministic Graph Accuracy:** 100% accuracy in flagging multi-hop downstream dependent tasks via BFS when an upstream node is marked `BLOCKED`, with zero circular dependencies permitted.
* **Evaluator Experience:** Publicly deployed frontend and backend with a 1-click "Load Demo Workspace" button so evaluators can immediately test all 4 workflows without friction.

---

## Appendix: Future Scope (Post-Submission v2.0 Evolution)

Following the v1.0 release, OperateOS is architected to expand into a high-scale enterprise release incorporating:
1. **Real-Time Presence & Live Cursors:** WebSockets (`Socket.io`) for instant multi-user board synchronization and live comment threads.
2. **Workspace-Wide Vector RAG Search:** MongoDB Atlas Vector Search embeddings across `100k+` workspace objects for `<1s` semantic Q&A across historical briefs, transcripts, and tasks.
3. **External Webhook & OAuth Integrations:** Automated GitHub PR status syncing (auto-closing tasks on PR merge) and Google Calendar meeting ingestion.
4. **Asynchronous Background Queues:** Redis + BullMQ workers for processing long audio meeting recordings and scheduled weekly project health digests.