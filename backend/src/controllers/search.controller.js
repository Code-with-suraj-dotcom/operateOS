import { z } from 'zod';
import Task, { CATEGORIES, STATUSES } from '../models/Task.js';
import ContextDoc from '../models/ContextDoc.js';
import AuditLog from '../models/AuditLog.js';
import Project from '../models/Project.js';
import { getWorkspaceAccess } from '../middleware/access.js';
import { serializeAuditLogs } from './audit.controller.js';

export const searchQuery = z.object({
  q: z.string().trim().max(100).optional().default(''),
  type: z.enum(['all', 'task', 'doc', 'audit']).default('all'),
  department: z.enum(CATEGORIES).optional(),
  status: z.enum(STATUSES).optional(),
  atRisk: z.enum(['true', 'false']).optional(),
  actorType: z.enum(['HUMAN', 'AI_AGENT']).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Workspace-wide search across tasks, context docs and audit logs.
 * Substring, case-insensitive. Department/status/risk filters apply to tasks, actorType to audit.
 */
export async function search(req, res) {
  const { workspace } = await getWorkspaceAccess(req.params.wid, req.user._id);
  const { q, type, department, status, atRisk, actorType, limit } = req.query;
  const rx = q ? { $regex: escapeRegex(q), $options: 'i' } : null;
  const wantsTasks = type === 'all' || type === 'task';
  const wantsDocs = type === 'all' || type === 'doc';
  const wantsAudit = type === 'all' || type === 'audit';

  const taskFilter = { workspace: workspace._id, isArchived: false };
  if (department) taskFilter.category = department;
  if (status) taskFilter.status = status;
  if (atRisk) taskFilter.isAtRisk = atRisk === 'true';
  if (rx) taskFilter.$or = [{ title: rx }, { description: rx }, { blockerNote: rx }, { riskReason: rx }];

  const taskFiltersUsed = !!(department || status || atRisk);

  const out = { tasks: [], docs: [], audit: [], counts: { tasks: 0, docs: 0, audit: 0 } };

  if (wantsTasks) {
    const [total, tasks] = await Promise.all([
      Task.countDocuments(taskFilter),
      Task.find(taskFilter).sort({ updatedAt: -1 }).limit(limit).populate('assignee', 'name'),
    ]);
    const projects = await Project.find({ _id: { $in: tasks.map((t) => t.project) } }).select('name');
    const pname = new Map(projects.map((p) => [String(p._id), p.name]));
    out.counts.tasks = total;
    out.tasks = tasks.map((t) => ({
      id: t._id,
      projectId: t.project,
      projectName: pname.get(String(t.project)) || '',
      title: t.title,
      category: t.category,
      status: t.status,
      priority: t.priority,
      isAtRisk: t.isAtRisk,
      riskReason: t.riskReason,
      assignee: t.assignee?.name || null,
    }));
  }

  // Docs are only searched by keyword; task-only filters (department/status/risk) don't apply to them.
  if (wantsDocs && !(taskFiltersUsed && type === 'all')) {
    const docFilter = { workspace: workspace._id };
    if (rx) docFilter.$or = [{ title: rx }, { content: rx }];
    const [total, docs] = await Promise.all([
      ContextDoc.countDocuments(docFilter),
      ContextDoc.find(docFilter).sort({ createdAt: -1 }).limit(limit).populate('author', 'name'),
    ]);
    out.counts.docs = total;
    out.docs = docs.map((d) => {
      const idx = rx ? d.content.toLowerCase().indexOf(q.toLowerCase()) : 0;
      const start = Math.max(0, idx - 60);
      return {
        id: d._id,
        projectId: d.project,
        type: d.type,
        title: d.title,
        author: d.author?.name || '',
        createdAt: d.createdAt,
        snippet: `${start > 0 ? '…' : ''}${d.content.slice(start, start + 220)}${d.content.length > start + 220 ? '…' : ''}`,
      };
    });
  }

  if (wantsAudit && !(taskFiltersUsed && type === 'all')) {
    const auditFilter = { workspace: workspace._id };
    if (actorType) auditFilter.actorType = actorType;
    if (rx) {
      // Match the action, the note, or the title of the task the entry is about.
      const matchingTasks = await Task.find({ workspace: workspace._id, title: rx }).select('_id').limit(200);
      auditFilter.$or = [
        { action: rx },
        { 'details.note': rx },
        { entityId: { $in: matchingTasks.map((t) => t._id) } },
      ];
    }
    const [total, logs] = await Promise.all([
      AuditLog.countDocuments(auditFilter),
      AuditLog.find(auditFilter).sort({ createdAt: -1 }).limit(limit).populate('actorUser', 'name'),
    ]);
    out.counts.audit = total;
    out.audit = await serializeAuditLogs(logs);
  }

  res.json(out);
}
