import mongoose from 'mongoose';

const agentProposalSchema = new mongoose.Schema(
  {
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
    workspace: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true },
    sourceDoc: { type: mongoose.Schema.Types.ObjectId, ref: 'ContextDoc', default: null },
    triggerType: { type: String, enum: ['BRIEF', 'TRANSCRIPT'], required: true },
    summary: { type: String, default: '' },
    // Discriminated union validated by services/proposals/actions.js
    proposedActions: { type: [mongoose.Schema.Types.Mixed], default: [] },
    status: { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED'], default: 'PENDING' },
    source: { type: String, enum: ['LLM', 'FALLBACK'], default: 'LLM' },
    warnings: { type: [String], default: [] },
    submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },
    rejectionReason: { type: String, default: '' },
    model: { type: String, default: '' },
    promptVersion: { type: String, default: '' },
    executionResult: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: true }
);

agentProposalSchema.index({ project: 1, status: 1, createdAt: -1 });

export default mongoose.model('AgentProposal', agentProposalSchema);
