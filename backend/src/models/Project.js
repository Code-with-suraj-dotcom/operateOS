import mongoose from 'mongoose';

// Health fields are cached values. They are recalculated by the Graph Engine (Workflow 3).
const projectSchema = new mongoose.Schema(
  {
    workspace: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    healthScore: { type: Number, default: 100 },
    healthStatus: { type: String, enum: ['ON_TRACK', 'AT_RISK', 'CRITICAL'], default: 'ON_TRACK' },
    healthSummary: { type: String, default: 'No tasks yet' },
    aiBrief: { type: String, default: '' },
  },
  { timestamps: true }
);

export default mongoose.model('Project', projectSchema);
