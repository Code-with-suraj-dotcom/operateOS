import { z } from 'zod';
import ContextDoc from '../models/ContextDoc.js';
import AgentProposal from '../models/AgentProposal.js';
import { getProjectAccess } from '../middleware/access.js';
import Task from '../models/Task.js';
import { generateBriefProposal } from '../services/ai/briefService.js';
import { generateTranscriptProposal } from '../services/ai/transcriptService.js';
import { actionsSchema } from '../services/proposals/actions.js';
import { writeAudit } from '../services/audit.js';
import { HttpError } from '../utils/errors.js';
import { serializeProposal } from './proposal.controller.js';

export const submitContextSchema = z.object({
  title: z.string().trim().max(120).optional().default(''),
  content: z.string().trim().min(20, 'Please provide at least 20 characters').max(20000),
});

// Any workspace member may submit a brief; it only ever creates a PENDING proposal.
export async function submitBrief(req, res) {
  const { project, workspace } = await getProjectAccess(req.params.pid, req.user._id);

  const doc = await ContextDoc.create({
    project: project._id,
    workspace: workspace._id,
    type: 'BRIEF',
    title: req.body.title || 'Launch brief',
    content: req.body.content,
    author: req.user._id,
  });

  const result = await generateBriefProposal(doc.content, project.name);
  const actions = actionsSchema.safeParse(result.actions);
  if (!actions.success || actions.data.length === 0) {
    throw new HttpError(422, 'AI_NO_ACTIONS', 'Could not extract any tasks from this brief. Try adding more detail.');
  }

  const proposal = await AgentProposal.create({
    project: project._id,
    workspace: workspace._id,
    sourceDoc: doc._id,
    triggerType: 'BRIEF',
    summary: result.summary,
    proposedActions: actions.data,
    source: result.source,
    warnings: result.warnings,
    submittedBy: req.user._id,
    model: result.model,
    promptVersion: result.promptVersion,
  });

  await writeAudit([
    {
      workspace: workspace._id,
      project: project._id,
      actorType: 'HUMAN',
      actorUser: req.user._id,
      action: 'BRIEF_SUBMITTED',
      entityType: 'ContextDoc',
      entityId: doc._id,
      proposalId: proposal._id,
      note: `Proposal created (${proposal.source}) with ${actions.data.length} action(s)`,
    },
  ]);

  res.status(201).json({ proposal: await serializeProposal(proposal) });
}

// Meeting transcript -> proposal of status updates / new tasks / dependency links against the project's real tasks.
export async function submitTranscript(req, res) {
  const { project, workspace } = await getProjectAccess(req.params.pid, req.user._id);

  const doc = await ContextDoc.create({
    project: project._id,
    workspace: workspace._id,
    type: 'TRANSCRIPT',
    title: req.body.title || 'Meeting transcript',
    content: req.body.content,
    author: req.user._id,
  });

  const tasks = await Task.find({ project: project._id, isArchived: false }).sort({ createdAt: 1 });
  const ctxTasks = tasks.map((t, i) => ({
    ref: `T${i + 1}`,
    id: String(t._id),
    title: t.title,
    status: t.status,
    category: t.category,
    dependsOn: t.dependsOn.map(String),
  }));

  const result = await generateTranscriptProposal(doc.content, ctxTasks, project.name);
  const actions = actionsSchema.safeParse(result.actions);
  if (!actions.success || actions.data.length === 0) {
    throw new HttpError(
      422,
      'AI_NO_ACTIONS',
      'No actionable updates were found in this transcript. Mention task names and what changed (blocked, started, done) or new action items.'
    );
  }

  const proposal = await AgentProposal.create({
    project: project._id,
    workspace: workspace._id,
    sourceDoc: doc._id,
    triggerType: 'TRANSCRIPT',
    summary: result.summary,
    proposedActions: actions.data,
    source: result.source,
    warnings: result.warnings,
    submittedBy: req.user._id,
    model: result.model,
    promptVersion: result.promptVersion,
  });

  await writeAudit([
    {
      workspace: workspace._id,
      project: project._id,
      actorType: 'HUMAN',
      actorUser: req.user._id,
      action: 'TRANSCRIPT_SUBMITTED',
      entityType: 'ContextDoc',
      entityId: doc._id,
      proposalId: proposal._id,
      note: `Proposal created (${proposal.source}) with ${actions.data.length} action(s)`,
    },
  ]);

  res.status(201).json({ proposal: await serializeProposal(proposal) });
}
