import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/errors.js';
import * as auth from '../controllers/auth.controller.js';
import * as ws from '../controllers/workspace.controller.js';
import * as proj from '../controllers/project.controller.js';
import * as task from '../controllers/task.controller.js';
import * as ctx from '../controllers/context.controller.js';
import * as proposal from '../controllers/proposal.controller.js';
import * as audit from '../controllers/audit.controller.js';
import * as searchCtl from '../controllers/search.controller.js';

const router = Router();
const h = asyncHandler;
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 50, standardHeaders: true, legacyHeaders: false });

const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  keyGenerator: (req) => String(req.user._id),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many AI requests, please wait a minute' } },
});

// Auth
router.post('/auth/register', authLimiter, validate(auth.registerSchema), h(auth.register));
router.post('/auth/login', authLimiter, validate(auth.loginSchema), h(auth.login));
router.get('/auth/me', authenticate, auth.me);

// Demo (public)
router.post('/workspaces/demo', authLimiter, h(ws.createDemoWorkspace));

// Everything below requires a logged-in user
router.use(authenticate);

// Account
router.patch('/auth/me', validate(auth.updateProfileSchema), h(auth.updateProfile));
router.post('/auth/change-password', authLimiter, validate(auth.changePasswordSchema), h(auth.changePassword));

// Workspaces & members
router.post('/workspaces', validate(ws.createWorkspaceSchema), h(ws.createWorkspace));
router.get('/workspaces', h(ws.listWorkspaces));
router.get('/workspaces/:id', h(ws.getWorkspace));
router.post('/workspaces/:id/members', validate(ws.addMemberSchema), h(ws.addMember));
router.patch('/workspaces/:id/members/:userId', validate(ws.updateMemberSchema), h(ws.updateMemberRole));
router.delete('/workspaces/:id/members/:userId', h(ws.removeMember));

// Projects
router.post('/workspaces/:wid/projects', validate(proj.createProjectSchema), h(proj.createProject));
router.get('/workspaces/:wid/projects', h(proj.listProjects));
router.get('/projects/:id', h(proj.getProject));

// Tasks
router.get('/projects/:pid/tasks', validate(task.listTasksQuery, 'query'), h(task.listTasks));
router.post('/projects/:pid/tasks', validate(task.createTaskSchema), h(task.createTask));
router.patch('/tasks/:id', validate(task.updateTaskSchema), h(task.updateTask));
router.delete('/tasks/:id', h(task.archiveTask));

// Context (briefs) -> AI proposals
router.post('/projects/:pid/context/brief', aiLimiter, validate(ctx.submitContextSchema), h(ctx.submitBrief));
router.post('/projects/:pid/context/transcript', aiLimiter, validate(ctx.submitContextSchema), h(ctx.submitTranscript));

// Proposals (human-in-the-loop approval gate)
router.get('/projects/:pid/proposals', validate(proposal.listProposalsQuery, 'query'), h(proposal.listProposals));
router.get('/proposals/:id', h(proposal.getProposal));
router.post('/proposals/:id/approve', h(proposal.approve));
router.post('/proposals/:id/reject', validate(proposal.rejectSchema), h(proposal.reject));

// Audit ledger & workspace search
router.get('/workspaces/:wid/audit', validate(audit.auditQuery, 'query'), h(audit.listAudit));
router.get('/workspaces/:wid/search', validate(searchCtl.searchQuery, 'query'), h(searchCtl.search));

export default router;
