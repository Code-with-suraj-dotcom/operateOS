import mongoose from 'mongoose';

// Append-only: the model only ever allows inserts. Updates and deletes are rejected here
// (in production the DB user should also lack update/delete privileges on this collection).
const auditLogSchema = new mongoose.Schema(
  {
    workspace: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true },
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', default: null },
    actorType: { type: String, enum: ['HUMAN', 'AI_AGENT'], required: true },
    actorUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    action: { type: String, required: true },
    entityType: { type: String, required: true },
    entityId: { type: mongoose.Schema.Types.ObjectId, required: true },
    proposalId: { type: mongoose.Schema.Types.ObjectId, ref: 'AgentProposal', default: null },
    details: {
      before: { type: mongoose.Schema.Types.Mixed, default: null },
      after: { type: mongoose.Schema.Types.Mixed, default: null },
      note: { type: String, default: '' },
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

auditLogSchema.index({ workspace: 1, createdAt: -1 });
auditLogSchema.index({ project: 1, createdAt: -1 });
auditLogSchema.index({ entityType: 1, entityId: 1 });
auditLogSchema.index({ actorType: 1 });

const immutable = () => {
  throw new Error('AuditLog is append-only');
};
auditLogSchema.pre(
  ['updateOne', 'updateMany', 'findOneAndUpdate', 'findOneAndReplace', 'replaceOne', 'findOneAndDelete', 'deleteOne', 'deleteMany'],
  immutable
);
auditLogSchema.pre('save', function () {
  if (!this.isNew) immutable();
});

export default mongoose.model('AuditLog', auditLogSchema);
