import { z } from 'zod';
import mongoose from 'mongoose';
import AgentProposal from '../models/AgentProposal.js';
import Task from '../models/Task.js';
import { getProjectAccess, getWorkspaceAccess, canManage } from '../middleware/access.js';
import { approveProposal, rejectProposal } from '../services/proposals/executor.js';
import { forbidden, notFound } from '../utils/errors.js';

export const listProposalsQuery = z.object({
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional(),
});
export const rejectSchema = z.object({ reason: z.string().trim().max(500).optional().default('') });

/** Adds `refTasks` so the review UI can show titles/current status for existing tasks an action points at. */
export async function serializeProposal(p) {
  const ids = new Set();
  for (const a of p.proposedActions || []) {
    for (const v of [a.taskId, a.taskRef, a.dependsOnRef, ...(a.dependsOnRefs || [])]) {
      if (v && mongoose.isValidObjectId(v) && String(v).length === 24) ids.add(String(v));
    }
  }
  const tasks = ids.size ? await Task.find({ _id: { $in: [...ids] } }).select('title status') : [];

  return {
    id: p._id,
    project: p.project,
    triggerType: p.triggerType,
    summary: p.summary,
    status: p.status,
    source: p.source,
    warnings: p.warnings,
    proposedActions: p.proposedActions,
    refTasks: Object.fromEntries(tasks.map((t) => [String(t._id), { title: t.title, status: t.status }])),
    submittedBy: p.submittedBy,
    reviewedBy: p.reviewedBy,
    reviewedAt: p.reviewedAt,
    rejectionReason: p.rejectionReason,
    createdAt: p.createdAt,
  };
}

export async function listProposals(req, res) {
  const { project } = await getProjectAccess(req.params.pid, req.user._id);
  const filter = { project: project._id };
  if (req.query.status) filter.status = req.query.status;
  const proposals = await AgentProposal.find(filter).sort({ createdAt: -1 }).limit(50);
  res.json({ proposals: await Promise.all(proposals.map(serializeProposal)) });
}

async function loadProposal(id, userId) {
  if (!mongoose.isValidObjectId(id)) throw notFound('Proposal not found');
  const proposal = await AgentProposal.findById(id);
  if (!proposal) throw notFound('Proposal not found');
  const { role } = await getWorkspaceAccess(proposal.workspace, userId);
  return { proposal, role };
}

export async function getProposal(req, res) {
  const { proposal } = await loadProposal(req.params.id, req.user._id);
  res.json({ proposal: await serializeProposal(proposal) });
}

export async function approve(req, res) {
  const { proposal, role } = await loadProposal(req.params.id, req.user._id);
  if (!canManage(role)) throw forbidden('Only ADMIN or LEAD can approve AI proposals');
  const approved = await approveProposal(proposal._id, req.user._id);
  res.json({ proposal: await serializeProposal(approved) });
}

export async function reject(req, res) {
  const { proposal, role } = await loadProposal(req.params.id, req.user._id);
  if (!canManage(role)) throw forbidden('Only ADMIN or LEAD can reject AI proposals');
  const rejected = await rejectProposal(proposal._id, req.user._id, req.body.reason);
  res.json({ proposal: await serializeProposal(rejected) });
}
