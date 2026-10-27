import mongoose from 'mongoose';

export const ROLES = ['ADMIN', 'LEAD', 'MEMBER'];

const memberSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, enum: ROLES, default: 'MEMBER' },
    joinedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const workspaceSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    isDemo: { type: Boolean, default: false },
    members: [memberSchema],
  },
  { timestamps: true }
);

workspaceSchema.index({ 'members.user': 1 });

export default mongoose.model('Workspace', workspaceSchema);
