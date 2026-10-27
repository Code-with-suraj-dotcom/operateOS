import mongoose from 'mongoose';
import Workspace from '../models/Workspace.js';
import Project from '../models/Project.js';
import Task from '../models/Task.js';
import { forbidden, notFound } from '../utils/errors.js';

const isId = (v) => mongoose.isValidObjectId(v);

/**
 * Loads a workspace and the caller's membership. Non-members get 404 so that
 * workspace existence is not leaked.
 */
export async function getWorkspaceAccess(workspaceId, userId) {
  if (!isId(workspaceId)) throw notFound('Workspace not found');
  const workspace = await Workspace.findById(workspaceId);
  if (!workspace) throw notFound('Workspace not found');
  const membership = workspace.members.find((m) => String(m.user) === String(userId));
  if (!membership) throw notFound('Workspace not found');
  return { workspace, role: membership.role };
}

export async function getProjectAccess(projectId, userId) {
  if (!isId(projectId)) throw notFound('Project not found');
  const project = await Project.findById(projectId);
  if (!project) throw notFound('Project not found');
  const { workspace, role } = await getWorkspaceAccess(project.workspace, userId);
  return { project, workspace, role };
}

export async function getTaskAccess(taskId, userId) {
  if (!isId(taskId)) throw notFound('Task not found');
  const task = await Task.findById(taskId);
  if (!task || task.isArchived) throw notFound('Task not found');
  const { workspace, role } = await getWorkspaceAccess(task.workspace, userId);
  return { task, workspace, role };
}

export function requireRole(role, ...allowed) {
  if (!allowed.includes(role)) throw forbidden();
}

export const canManage = (role) => role === 'ADMIN' || role === 'LEAD';
