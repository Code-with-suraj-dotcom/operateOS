import { z } from 'zod';
import mongoose from 'mongoose';
import AuditLog from '../models/AuditLog.js';
import Task from '../models/Task.js';
import Project from '../models/Project.js';
import { getWorkspaceAccess } from '../middleware/access.js';

export const auditQuery = z.object({
  actorType: z.enum(['HUMAN', 'AI_AGENT']).optional(),
  entityType: z.string().trim().max(40).optional(),
  action: z.string().trim().max(60).optional(),
  projectId: z.string().refine((v) => mongoose.isValidObjectId(v), 'Invalid id').optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

/** Turns raw audit docs into UI rows (actor name, project name, entity title). */
export async function serializeAuditLogs(logs) {
  const taskIds = logs.filter((l) => l.entityType === 'Task').map((l) => l.entityId);
  const projectIds = [...new Set(logs.map((l) => l.project).filter(Boolean).map(String))];
  const [tasks, projects] = await Promise.all([
    taskIds.length ? Task.find({ _id: { $in: taskIds } }).select('title') : [],
    projectIds.length ? Project.find({ _id: { $in: projectIds } }).select('name') : [],
  ]);
  const taskTitle = new Map(tasks.map((t) => [String(t._id), t.title]));
  const projectName = new Map(projects.map((p) => [String(p._id), p.name]));

  return logs.map((l) => ({
    id: l._id,
    createdAt: l.createdAt,
    actorType: l.actorType,
    actorName: l.actorUser?.name || 'Unknown',
    action: l.action,
    entityType: l.entityType,
    entityId: l.entityId,
    entityLabel: taskTitle.get(String(l.entityId)) || '',
    projectName: l.project ? projectName.get(String(l.project)) || '' : '',
    proposalId: l.proposalId,
    details: l.details,
  }));
}

export async function listAudit(req, res) {
  const { workspace } = await getWorkspaceAccess(req.params.wid, req.user._id);
  const { actorType, entityType, action, projectId, from, to, page, limit } = req.query;

  const filter = { workspace: workspace._id };
  if (actorType) filter.actorType = actorType;
  if (entityType) filter.entityType = entityType;
  if (action) filter.action = action;
  if (projectId) filter.project = projectId;
  if (from || to) filter.createdAt = { ...(from && { $gte: from }), ...(to && { $lte: to }) };

  const [total, logs] = await Promise.all([
    AuditLog.countDocuments(filter),
    AuditLog.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('actorUser', 'name'),
  ]);

  res.json({ logs: await serializeAuditLogs(logs), total, page, pages: Math.max(1, Math.ceil(total / limit)) });
}
