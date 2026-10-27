import { z } from 'zod';
import Project from '../models/Project.js';
import Task from '../models/Task.js';
import { getProjectAccess, getWorkspaceAccess, canManage } from '../middleware/access.js';
import { forbidden } from '../utils/errors.js';

export const createProjectSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).optional().default(''),
});

const serialize = (p) => ({
  id: p._id,
  workspace: p.workspace,
  name: p.name,
  description: p.description,
  health: {
    score: p.healthScore,
    status: p.healthStatus,
    summary: p.healthSummary,
    aiBrief: p.aiBrief,
  },
  createdAt: p.createdAt,
});

export async function createProject(req, res) {
  const { workspace, role } = await getWorkspaceAccess(req.params.wid, req.user._id);
  if (!canManage(role)) throw forbidden('Only ADMIN or LEAD can create projects');
  const project = await Project.create({
    workspace: workspace._id,
    name: req.body.name,
    description: req.body.description,
    createdBy: req.user._id,
  });
  res.status(201).json({ project: serialize(project) });
}

export async function listProjects(req, res) {
  const { workspace } = await getWorkspaceAccess(req.params.wid, req.user._id);
  const projects = await Project.find({ workspace: workspace._id }).sort({ createdAt: -1 });
  const counts = await Task.aggregate([
    { $match: { workspace: workspace._id, isArchived: false } },
    { $group: { _id: '$project', count: { $sum: 1 } } },
  ]);
  const byProject = Object.fromEntries(counts.map((c) => [String(c._id), c.count]));
  res.json({ projects: projects.map((p) => ({ ...serialize(p), taskCount: byProject[String(p._id)] || 0 })) });
}

export async function getProject(req, res) {
  const { project, workspace, role } = await getProjectAccess(req.params.id, req.user._id);
  res.json({ project: serialize(project), workspace: { id: workspace._id, name: workspace.name }, myRole: role });
}
