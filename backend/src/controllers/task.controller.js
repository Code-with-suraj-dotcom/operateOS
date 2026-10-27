import { z } from 'zod';
import mongoose from 'mongoose';
import Task, { CATEGORIES, STATUSES, PRIORITIES } from '../models/Task.js';
import { getProjectAccess, getTaskAccess, canManage } from '../middleware/access.js';
import { badRequest, forbidden } from '../utils/errors.js';
import { taskSnapshot, writeAudit } from '../services/audit.js';
import { recomputeProject } from '../services/projectHealth.js';

const humanActor = (user, workspaceId) => ({ workspace: workspaceId, actorType: 'HUMAN', actorUser: user._id });

const objectId = z.string().refine((v) => mongoose.isValidObjectId(v), 'Invalid id');

export const createTaskSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000).optional().default(''),
  category: z.enum(CATEGORIES),
  status: z.enum(STATUSES).optional().default('TODO'),
  priority: z.enum(PRIORITIES).optional().default('MEDIUM'),
  assignee: objectId.nullable().optional(),
  // Only settable at creation: a brand-new task cannot be part of a cycle.
  // Editing dependencies (with DFS cycle detection) is part of Workflow 3.
  dependsOn: z.array(objectId).optional().default([]),
  blockerNote: z.string().trim().max(1000).optional().default(''),
});

export const updateTaskSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(5000),
    category: z.enum(CATEGORIES),
    status: z.enum(STATUSES),
    priority: z.enum(PRIORITIES),
    assignee: objectId.nullable(),
    blockerNote: z.string().trim().max(1000),
  })
  .partial()
  .refine((o) => Object.keys(o).length > 0, 'No fields to update');

export const listTasksQuery = z.object({
  category: z.enum(CATEGORIES).optional(),
  status: z.enum(STATUSES).optional(),
  atRisk: z.enum(['true', 'false']).optional(),
  q: z.string().trim().max(100).optional(),
});

const MEMBER_EDITABLE = ['status', 'blockerNote'];
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const serialize = (t) => ({
  id: t._id,
  project: t.project,
  title: t.title,
  description: t.description,
  category: t.category,
  status: t.status,
  priority: t.priority,
  assignee: t.assignee ? { id: t.assignee._id, name: t.assignee.name } : null,
  dependsOn: t.dependsOn.map(String),
  isAtRisk: t.isAtRisk,
  riskReason: t.riskReason,
  blockerNote: t.blockerNote,
  createdAt: t.createdAt,
  updatedAt: t.updatedAt,
});

function assertAssigneeIsMember(workspace, assigneeId) {
  if (assigneeId && !workspace.members.some((m) => String(m.user) === String(assigneeId))) {
    throw badRequest('Assignee must be a member of this workspace');
  }
}

export async function listTasks(req, res) {
  const { project } = await getProjectAccess(req.params.pid, req.user._id);
  const { category, status, atRisk, q } = req.query;
  const filter = { project: project._id, isArchived: false };
  if (category) filter.category = category;
  if (status) filter.status = status;
  if (atRisk) filter.isAtRisk = atRisk === 'true';
  if (q) filter.title = { $regex: escapeRegex(q), $options: 'i' };
  const tasks = await Task.find(filter).sort({ createdAt: 1 }).populate('assignee', 'name');
  res.json({ tasks: tasks.map(serialize) });
}

export async function createTask(req, res) {
  const { project, workspace, role } = await getProjectAccess(req.params.pid, req.user._id);
  if (!canManage(role)) throw forbidden('Only ADMIN or LEAD can create tasks');

  const body = req.body;
  assertAssigneeIsMember(workspace, body.assignee);

  const depIds = [...new Set(body.dependsOn)];
  if (depIds.length) {
    const found = await Task.countDocuments({ _id: { $in: depIds }, project: project._id, isArchived: false });
    if (found !== depIds.length) throw badRequest('dependsOn must reference active tasks in this project');
  }

  const task = await Task.create({
    ...body,
    assignee: body.assignee || null,
    dependsOn: depIds,
    project: project._id,
    workspace: workspace._id,
  });
  await writeAudit([
    { ...humanActor(req.user, workspace._id), project: project._id, action: 'TASK_CREATED', entityType: 'Task', entityId: task._id, after: taskSnapshot(task) },
  ]);
  await recomputeProject(project._id, humanActor(req.user, workspace._id));
  const fresh = await Task.findById(task._id).populate('assignee', 'name');
  res.status(201).json({ task: serialize(fresh) });
}

export async function updateTask(req, res) {
  const { task, workspace, role } = await getTaskAccess(req.params.id, req.user._id);
  const updates = req.body;

  if (!canManage(role)) {
    const disallowed = Object.keys(updates).filter((k) => !MEMBER_EDITABLE.includes(k));
    if (disallowed.length) throw forbidden(`MEMBER can only update: ${MEMBER_EDITABLE.join(', ')}`);
  }
  if ('assignee' in updates) assertAssigneeIsMember(workspace, updates.assignee);

  const before = taskSnapshot(task);
  Object.assign(task, updates);
  // A blocker note only makes sense while blocked.
  if (updates.status && updates.status !== 'BLOCKED' && !('blockerNote' in updates)) task.blockerNote = '';
  await task.save();
  const after = taskSnapshot(task);
  const statusChanged = before.status !== after.status;
  await writeAudit([
    {
      ...humanActor(req.user, workspace._id), project: task.project,
      action: statusChanged ? 'TASK_STATUS_CHANGED' : 'TASK_UPDATED',
      entityType: 'Task', entityId: task._id, before, after,
    },
  ]);
  await recomputeProject(task.project, humanActor(req.user, workspace._id));
  const fresh = await Task.findById(task._id).populate('assignee', 'name');
  res.json({ task: serialize(fresh) });
}

// Soft archive; also strips the task from other tasks' dependsOn arrays.
export async function archiveTask(req, res) {
  const { task, workspace, role } = await getTaskAccess(req.params.id, req.user._id);
  if (!canManage(role)) throw forbidden('Only ADMIN or LEAD can archive tasks');
  const before = taskSnapshot(task);
  task.isArchived = true;
  await task.save();
  await Task.updateMany({ project: task.project, dependsOn: task._id }, { $pull: { dependsOn: task._id } });
  await writeAudit([
    { ...humanActor(req.user, workspace._id), project: task.project, action: 'TASK_ARCHIVED', entityType: 'Task', entityId: task._id, before, after: taskSnapshot(task) },
  ]);
  await recomputeProject(task.project, humanActor(req.user, workspace._id));
  res.json({ ok: true });
}
