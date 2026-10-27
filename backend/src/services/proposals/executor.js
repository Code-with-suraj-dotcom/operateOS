import mongoose from 'mongoose';
import AgentProposal from '../../models/AgentProposal.js';
import Task from '../../models/Task.js';
import { findCyclePath } from '../graph/engine.js';
import { recomputeProject } from '../projectHealth.js';
import { taskSnapshot, writeAudit } from '../audit.js';
import { actionsSchema } from './actions.js';
import { badRequest, conflict } from '../../utils/errors.js';

async function inTransaction(fn) {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}

/**
 * Approves a PENDING proposal and applies all its actions atomically.
 * - The PENDING -> APPROVED claim happens inside the transaction, so a double click cannot execute twice.
 * - Every action is validated against an in-memory graph (unknown refs, cycles) before anything is written.
 * - Any failure aborts the transaction: nothing is written and the proposal stays PENDING.
 */
export async function approveProposal(proposalId, approverId) {
  return inTransaction(async (session) => {
    const proposal = await AgentProposal.findOneAndUpdate(
      { _id: proposalId, status: 'PENDING' },
      { $set: { status: 'APPROVED', reviewedBy: approverId, reviewedAt: new Date() } },
      { new: true, session }
    );
    if (!proposal) throw conflict('This proposal has already been processed');

    const parsed = actionsSchema.safeParse(proposal.proposedActions);
    if (!parsed.success) throw badRequest('Stored proposal actions are invalid', parsed.error.issues.slice(0, 5));
    const actions = parsed.data;

    const existing = await Task.find({ project: proposal.project, isArchived: false }).session(session);
    const original = new Map(existing.map((t) => [String(t._id), t]));
    const graph = existing.map((t) => ({
      id: String(t._id),
      title: t.title,
      status: t.status,
      dependsOn: t.dependsOn.map(String),
    }));
    const nodeById = new Map(graph.map((n) => [n.id, n]));
    const tempMap = new Map(); // tempId -> new task id (string)
    const createdIds = new Set();

    // 1) Allocate ids for new tasks so edges can reference them.
    const creates = actions.filter((a) => a.type === 'CREATE_TASK');
    for (const a of creates) {
      if (tempMap.has(a.tempId)) throw badRequest(`Duplicate tempId "${a.tempId}" in proposal`);
      const id = String(new mongoose.Types.ObjectId());
      tempMap.set(a.tempId, id);
      createdIds.add(id);
      const node = { id, title: a.title, status: 'TODO', dependsOn: [] };
      graph.push(node);
      nodeById.set(id, node);
    }

    const resolve = (ref) => (tempMap.has(ref) ? tempMap.get(ref) : nodeById.has(ref) ? ref : null);

    // 2) Edges, each checked for cycles against the evolving graph.
    const addEdge = (taskId, depId) => {
      if (taskId === depId) throw badRequest('A task cannot depend on itself');
      const node = nodeById.get(taskId);
      if (node.dependsOn.includes(depId)) return;
      const cycle = findCyclePath(graph, taskId, depId);
      if (cycle) {
        const names = cycle.map((id) => nodeById.get(id).title);
        throw badRequest(`Circular dependency: ${names.join(' → ')}`, { cyclePath: names });
      }
      node.dependsOn.push(depId);
    };

    for (const a of actions) {
      if (a.type === 'CREATE_TASK') {
        const taskId = tempMap.get(a.tempId);
        for (const ref of a.dependsOnRefs) {
          const dep = resolve(ref);
          if (!dep) throw badRequest(`Task "${a.title}" depends on unknown task "${ref}"`);
          addEdge(taskId, dep);
        }
      } else if (a.type === 'ADD_DEPENDENCY') {
        const taskId = resolve(a.taskRef);
        const depId = resolve(a.dependsOnRef);
        if (!taskId || !depId) throw badRequest('ADD_DEPENDENCY references a task that does not exist');
        addEdge(taskId, depId);
      }
    }

    // 3) Status updates.
    const statusUpdates = [];
    for (const a of actions.filter((x) => x.type === 'UPDATE_TASK_STATUS')) {
      const doc = original.get(a.taskId);
      if (!doc) throw badRequest(`UPDATE_TASK_STATUS references a task that no longer exists (${a.taskId})`);
      statusUpdates.push({
        doc,
        newStatus: a.newStatus,
        blockerNote: a.newStatus === 'BLOCKED' ? a.blockerNote : '',
      });
    }

    // ---- All validation passed: write ----
    const actor = { workspace: proposal.workspace, actorType: 'AI_AGENT', actorUser: approverId, proposalId: proposal._id };
    const audit = [];
    const base = { workspace: proposal.workspace, project: proposal.project, actorType: 'AI_AGENT', actorUser: approverId, proposalId: proposal._id };

    if (creates.length) {
      const docs = creates.map((a) => ({
        _id: tempMap.get(a.tempId),
        project: proposal.project,
        workspace: proposal.workspace,
        title: a.title,
        description: a.description,
        category: a.category,
        priority: a.priority,
        status: 'TODO',
        dependsOn: nodeById.get(tempMap.get(a.tempId)).dependsOn,
        sourceDocId: proposal.sourceDoc,
      }));
      await Task.insertMany(docs, { session, ordered: true });
      for (const d of docs) {
        audit.push({ ...base, action: 'TASK_CREATED', entityType: 'Task', entityId: d._id, after: taskSnapshot(d) });
      }
    }

    const bulk = [];
    for (const [id, doc] of original) {
      const next = nodeById.get(id).dependsOn;
      const prev = doc.dependsOn.map(String);
      if (next.length !== prev.length) {
        bulk.push({ updateOne: { filter: { _id: id }, update: { $set: { dependsOn: next } } } });
        audit.push({
          ...base, action: 'DEPENDENCY_ADDED', entityType: 'Task', entityId: id,
          before: { dependsOn: prev }, after: { dependsOn: next },
        });
      }
    }
    for (const u of statusUpdates) {
      if (u.doc.status === u.newStatus && u.doc.blockerNote === u.blockerNote) continue;
      bulk.push({
        updateOne: { filter: { _id: u.doc._id }, update: { $set: { status: u.newStatus, blockerNote: u.blockerNote } } },
      });
      audit.push({
        ...base, action: 'TASK_STATUS_CHANGED', entityType: 'Task', entityId: u.doc._id,
        before: { status: u.doc.status, blockerNote: u.doc.blockerNote },
        after: { status: u.newStatus, blockerNote: u.blockerNote },
      });
    }
    if (bulk.length) await Task.bulkWrite(bulk, { session });

    audit.push({
      ...base, action: 'PROPOSAL_APPROVED', entityType: 'AgentProposal', entityId: proposal._id,
      before: { status: 'PENDING' }, after: { status: 'APPROVED' },
      note: `${actions.length} action(s) executed`,
    });
    await writeAudit(audit, { session });

    // 4) Cascade + health (also audits any risk-flag changes).
    const { health } = await recomputeProject(proposal.project, actor, { session });

    proposal.executionResult = {
      createdTasks: Object.fromEntries(tempMap),
      statusUpdates: statusUpdates.length,
      healthScore: health.score,
    };
    proposal.markModified('executionResult');
    await proposal.save({ session });
    return proposal;
  });
}

export async function rejectProposal(proposalId, reviewerId, reason = '') {
  return inTransaction(async (session) => {
    const proposal = await AgentProposal.findOneAndUpdate(
      { _id: proposalId, status: 'PENDING' },
      { $set: { status: 'REJECTED', reviewedBy: reviewerId, reviewedAt: new Date(), rejectionReason: reason } },
      { new: true, session }
    );
    if (!proposal) throw conflict('This proposal has already been processed');
    await writeAudit(
      [{
        workspace: proposal.workspace, project: proposal.project, actorType: 'HUMAN', actorUser: reviewerId,
        proposalId: proposal._id, action: 'PROPOSAL_REJECTED', entityType: 'AgentProposal', entityId: proposal._id,
        before: { status: 'PENDING' }, after: { status: 'REJECTED' }, note: reason,
      }],
      { session }
    );
    return proposal;
  });
}
