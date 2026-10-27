import mongoose from 'mongoose';

export const CATEGORIES = ['PRODUCT', 'ENGINEERING', 'MARKETING'];
export const STATUSES = ['TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE'];
export const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

const taskSchema = new mongoose.Schema(
  {
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
    workspace: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    category: { type: String, enum: CATEGORIES, required: true },
    status: { type: String, enum: STATUSES, default: 'TODO' },
    priority: { type: String, enum: PRIORITIES, default: 'MEDIUM' },
    assignee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    dependsOn: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Task' }],
    isAtRisk: { type: Boolean, default: false },
    riskReason: { type: String, default: '' },
    blockerNote: { type: String, default: '' },
    sourceDocId: { type: mongoose.Schema.Types.ObjectId, ref: 'ContextDoc', default: null },
    isArchived: { type: Boolean, default: false },
  },
  { timestamps: true }
);

taskSchema.index({ project: 1, isArchived: 1, status: 1 });
taskSchema.index({ project: 1, category: 1 });

export default mongoose.model('Task', taskSchema);
