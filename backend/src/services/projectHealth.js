import Task from '../models/Task.js';
import Project from '../models/Project.js';
import { computeRisk, computeHealth, findCriticalPath, buildSummary } from './graph/engine.js';
import { writeAudit } from './audit.js';

/**
 * Recomputes risk flags (BFS cascade) and the cached health block for a project.
 * Persists only tasks whose flags changed and audits each flag change.
 * actor: { workspace, actorType, actorUser, proposalId? }
 */
export async function recomputeProject(projectId, actor, { session } = {}) {
  const docs = await Task.find({ project: projectId, isArchived: false }).session(session || null);
  const nodes = docs.map((t) => ({
    id: String(t._id),
    title: t.title,
    status: t.status,
    priority: t.priority,
    dependsOn: t.dependsOn.map(String),
  }));

  const risk = computeRisk(nodes);
  const changed = [];
  for (const t of docs) {
    const next = risk.get(String(t._id));
    if (t.isAtRisk !== next.isAtRisk || t.riskReason !== next.riskReason) {
      changed.push({
        id: t._id,
        before: { isAtRisk: t.isAtRisk, riskReason: t.riskReason },
        after: next,
      });
      t.isAtRisk = next.isAtRisk;
      t.riskReason = next.riskReason;
    }
  }

  if (changed.length) {
    await Task.bulkWrite(
      changed.map((c) => ({
        updateOne: { filter: { _id: c.id }, update: { $set: c.after } },
      })),
      { session }
    );
    await writeAudit(
      changed.map((c) => ({
        workspace: actor.workspace,
        project: projectId,
        actorType: actor.actorType,
        actorUser: actor.actorUser,
        proposalId: actor.proposalId || null,
        action: 'RISK_FLAG_CHANGED',
        entityType: 'Task',
        entityId: c.id,
        before: c.before,
        after: c.after,
        note: 'Recalculated by dependency engine',
      })),
      { session }
    );
  }

  const flagged = nodes.map((n) => ({ ...n, isAtRisk: risk.get(n.id).isAtRisk }));
  const health = computeHealth(flagged);
  const critical = findCriticalPath(flagged);

  await Project.updateOne(
    { _id: projectId },
    {
      $set: {
        healthScore: health.score,
        healthStatus: health.status,
        healthSummary: buildSummary(health, critical),
        aiBrief: critical
          ? `${critical.task.title} is the bottleneck: ${critical.downstreamCount} downstream task(s) are waiting on it.`
          : '',
      },
    },
    { session }
  );

  return { health, critical, changedCount: changed.length };
}
