import { z } from 'zod';
import Workspace, { ROLES } from '../models/Workspace.js';
import User from '../models/User.js';
import { getWorkspaceAccess, requireRole } from '../middleware/access.js';
import { badRequest, notFound } from '../utils/errors.js';
import { seedDemoWorkspace } from '../utils/demoSeed.js';

export const createWorkspaceSchema = z.object({ name: z.string().trim().min(1).max(80) });
export const addMemberSchema = z.object({
  email: z.string().trim().email(),
  role: z.enum(ROLES).default('MEMBER'),
});
export const updateMemberSchema = z.object({ role: z.enum(ROLES) });

async function serialize(workspace, role) {
  await workspace.populate('members.user', 'name email');
  return {
    id: workspace._id,
    name: workspace.name,
    owner: workspace.owner,
    isDemo: workspace.isDemo,
    myRole: role,
    members: workspace.members.map((m) => ({
      userId: m.user._id,
      name: m.user.name,
      email: m.user.email,
      role: m.role,
    })),
  };
}

export async function createWorkspace(req, res) {
  const workspace = await Workspace.create({
    name: req.body.name,
    owner: req.user._id,
    members: [{ user: req.user._id, role: 'ADMIN' }],
  });
  res.status(201).json({ workspace: await serialize(workspace, 'ADMIN') });
}

export async function listWorkspaces(req, res) {
  const workspaces = await Workspace.find({ 'members.user': req.user._id }).sort({ createdAt: -1 });
  res.json({
    workspaces: workspaces.map((w) => ({
      id: w._id,
      name: w.name,
      isDemo: w.isDemo,
      memberCount: w.members.length,
      myRole: w.members.find((m) => String(m.user) === String(req.user._id)).role,
    })),
  });
}

export async function getWorkspace(req, res) {
  const { workspace, role } = await getWorkspaceAccess(req.params.id, req.user._id);
  res.json({ workspace: await serialize(workspace, role) });
}

export async function addMember(req, res) {
  const { workspace, role } = await getWorkspaceAccess(req.params.id, req.user._id);
  requireRole(role, 'ADMIN');
  const user = await User.findOne({ email: req.body.email.toLowerCase() });
  if (!user) throw notFound('No registered user with that email');
  if (workspace.members.some((m) => String(m.user) === String(user._id))) {
    throw badRequest('User is already a member of this workspace');
  }
  workspace.members.push({ user: user._id, role: req.body.role });
  await workspace.save();
  res.status(201).json({ workspace: await serialize(workspace, role) });
}

async function guardLastAdmin(workspace, userId) {
  const target = workspace.members.find((m) => String(m.user) === String(userId));
  if (!target) throw notFound('Member not found');
  const admins = workspace.members.filter((m) => m.role === 'ADMIN').length;
  if (target.role === 'ADMIN' && admins <= 1) {
    throw badRequest('A workspace must keep at least one ADMIN');
  }
  return target;
}

export async function updateMemberRole(req, res) {
  const { workspace, role } = await getWorkspaceAccess(req.params.id, req.user._id);
  requireRole(role, 'ADMIN');
  const target = workspace.members.find((m) => String(m.user) === String(req.params.userId));
  if (!target) throw notFound('Member not found');
  if (req.body.role !== 'ADMIN') await guardLastAdmin(workspace, req.params.userId);
  target.role = req.body.role;
  await workspace.save();
  res.json({ workspace: await serialize(workspace, role) });
}

export async function removeMember(req, res) {
  const { workspace, role } = await getWorkspaceAccess(req.params.id, req.user._id);
  requireRole(role, 'ADMIN');
  await guardLastAdmin(workspace, req.params.userId);
  workspace.members = workspace.members.filter((m) => String(m.user) !== String(req.params.userId));
  await workspace.save();
  res.json({ workspace: await serialize(workspace, role) });
}

// Public: creates a fresh demo workspace and returns a session per demo role.
export async function createDemoWorkspace(_req, res) {
  const { workspace, project, sessions } = await seedDemoWorkspace();
  res.status(201).json({ workspaceId: workspace._id, projectId: project._id, sessions });
}
