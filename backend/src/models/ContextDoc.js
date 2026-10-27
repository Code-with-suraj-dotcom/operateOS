import mongoose from 'mongoose';

const contextDocSchema = new mongoose.Schema(
  {
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
    workspace: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true },
    type: { type: String, enum: ['BRIEF', 'TRANSCRIPT'], required: true },
    title: { type: String, default: '' },
    content: { type: String, required: true },
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

contextDocSchema.index({ project: 1, type: 1 });

export default mongoose.model('ContextDoc', contextDocSchema);
