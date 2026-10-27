import AuditLog from '../models/AuditLog.js';

export const taskSnapshot = (t) => ({
  title: t.title,
  description: t.description,
  category: t.category,
  status: t.status,
  priority: t.priority,
  assignee: t.assignee ? String(t.assignee._id || t.assignee) : null,
  dependsOn: (t.dependsOn || []).map(String),
  isAtRisk: t.isAtRisk,
  riskReason: t.riskReason,
  blockerNote: t.blockerNote,
  isArchived: t.isArchived,
});

/** entries: [{ workspace, project, actorType, actorUser, action, entityType, entityId, proposalId?, before?, after?, note? }] */
export async function writeAudit(entries, { session } = {}) {
  if (!entries.length) return;
  const docs = entries.map(({ before = null, after = null, note = '', ...rest }) => ({
    ...rest,
    details: { before, after, note },
  }));
  await AuditLog.insertMany(docs, { session, ordered: true });
}
