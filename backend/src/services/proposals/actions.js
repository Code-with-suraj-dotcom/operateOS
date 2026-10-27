import { z } from 'zod';
import mongoose from 'mongoose';
import { CATEGORIES, STATUSES, PRIORITIES } from '../../models/Task.js';

const objectId = z.string().refine((v) => mongoose.isValidObjectId(v), 'Invalid id');
const ref = z.string().min(1); // a tempId from this proposal, or an existing task id

export const createTaskAction = z.object({
  type: z.literal('CREATE_TASK'),
  tempId: z.string().min(1),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000).default(''),
  category: z.enum(CATEGORIES),
  priority: z.enum(PRIORITIES).default('MEDIUM'),
  dependsOnRefs: z.array(ref).default([]),
  rationale: z.string().max(1000).default(''),
});

export const updateTaskStatusAction = z.object({
  type: z.literal('UPDATE_TASK_STATUS'),
  taskId: objectId,
  newStatus: z.enum(STATUSES),
  blockerNote: z.string().trim().max(1000).default(''),
  rationale: z.string().max(1000).default(''),
});

export const addDependencyAction = z.object({
  type: z.literal('ADD_DEPENDENCY'),
  taskRef: ref, // the dependent task
  dependsOnRef: ref, // the upstream task
  rationale: z.string().max(1000).default(''),
});

export const actionSchema = z.discriminatedUnion('type', [
  createTaskAction,
  updateTaskStatusAction,
  addDependencyAction,
]);

export const actionsSchema = z.array(actionSchema);
