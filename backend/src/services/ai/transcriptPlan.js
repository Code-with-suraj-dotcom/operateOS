import { z } from 'zod';
import { CATEGORIES, PRIORITIES, STATUSES } from '../../models/Task.js';
import { findCyclePath } from '../graph/engine.js';
import { classify, priorityOf } from './fallbackBrief.js';

export const MAX_ACTIONS = 25;

const text = z.string().nullish().transform((v) => (v ?? '').trim());

// Flat shape (LLMs handle this better than unions). Refs: "T3" = existing task #3, "N1" = a task created in this plan.
export const transcriptPlanSchema = z.object({
  summary: text,
  actions: z.array(
    z.object({
      type: z.enum(['UPDATE_TASK_STATUS', 'CREATE_TASK', 'ADD_DEPENDENCY']),
      taskRef: text,
      newStatus: text,
      blockerNote: text,
      newRef: text,
      title: text,
      description: text,
      category: text,
      priority: text,
      dependsOnRef: text,
      rationale: text,
    })
  ),
});

const str = { type: 'STRING' };
export const transcriptResponseSchema = {
  type: 'OBJECT',
  properties: {
    summary: str,
    actions: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          type: { type: 'STRING', enum: ['UPDATE_TASK_STATUS', 'CREATE_TASK', 'ADD_DEPENDENCY'] },
          taskRef: str,
          newStatus: { type: 'STRING', enum: STATUSES },
          blockerNote: str,
          newRef: str,
          title: str,
          description: str,
          category: { type: 'STRING', enum: CATEGORIES },
          priority: { type: 'STRING', enum: PRIORITIES },
          dependsOnRef: str,
          rationale: str,
        },
        required: ['type', 'rationale'],
      },
    },
  },
  required: ['summary', 'actions'],
};

/**
 * Validates a raw plan against the project's real tasks and converts it to proposal actions.
 * ctxTasks: [{ ref: 'T1', id, title, status, dependsOn: [id] }]
 * Anything referencing unknown tasks, no-op status changes and cycle-creating links is dropped with a warning.
 */
export function normalizeTranscriptPlan(plan, ctxTasks) {
  const warnings = [];
  const byRef = new Map(ctxTasks.map((t) => [t.ref.toUpperCase(), t]));
  const graph = ctxTasks.map((t) => ({ id: t.id, title: t.title, dependsOn: [...t.dependsOn] }));
  const nodeById = new Map(graph.map((n) => [n.id, n]));
  const newRefs = new Map(); // "N1" -> tempId

  let raw = plan.actions;
  if (raw.length > MAX_ACTIONS) {
    warnings.push(`Found ${raw.length} actions; only the first ${MAX_ACTIONS} were kept.`);
    raw = raw.slice(0, MAX_ACTIONS);
  }

  const resolve = (ref) => {
    const key = (ref || '').toUpperCase();
    if (byRef.has(key)) return byRef.get(key).id;
    if (newRefs.has(key)) return newRefs.get(key);
    return null;
  };
  const labelOf = (ref) => ref || 'unknown';

  // 1) New tasks first, so later actions can reference them.
  const creates = [];
  let n = 0;
  for (const a of raw.filter((x) => x.type === 'CREATE_TASK')) {
    if (!a.title) {
      warnings.push('Dropped a new task with no title.');
      continue;
    }
    const tempId = `n${++n}`;
    if (a.newRef) newRefs.set(a.newRef.toUpperCase(), tempId);
    newRefs.set(`N${n}`, tempId);
    const node = { id: tempId, title: a.title, dependsOn: [] };
    graph.push(node);
    nodeById.set(tempId, node);
    creates.push({
      raw: a,
      action: {
        type: 'CREATE_TASK',
        tempId,
        title: a.title.slice(0, 200),
        description: a.description,
        category: CATEGORIES.includes(a.category) ? a.category : classify(`${a.title} ${a.description}`),
        priority: PRIORITIES.includes(a.priority) ? a.priority : priorityOf(a.title),
        dependsOnRefs: [],
        rationale: a.rationale,
      },
    });
  }

  const addEdge = (taskId, depId, label) => {
    if (taskId === depId) return warnings.push(`Dropped a self-dependency (${label}).`);
    const node = nodeById.get(taskId);
    if (node.dependsOn.includes(depId)) return warnings.push(`Skipped dependency that already exists (${label}).`);
    const cycle = findCyclePath(graph, taskId, depId);
    if (cycle) {
      const names = cycle.map((id) => nodeById.get(id).title).join(' → ');
      return warnings.push(`Dropped dependency that would create a cycle: ${names}`);
    }
    node.dependsOn.push(depId);
    return true;
  };

  for (const { raw: a, action } of creates) {
    if (!a.dependsOnRef) continue;
    const dep = resolve(a.dependsOnRef);
    if (!dep) {
      warnings.push(`Ignored unknown dependency "${labelOf(a.dependsOnRef)}" for "${a.title}".`);
      continue;
    }
    if (addEdge(action.tempId, dep, a.title) === true) action.dependsOnRefs.push(dep);
  }

  // 2) Status updates (one per task; the last mention wins) and links.
  const updates = new Map();
  const links = [];
  for (const a of raw) {
    if (a.type === 'UPDATE_TASK_STATUS') {
      const key = (a.taskRef || '').toUpperCase();
      const task = byRef.get(key);
      if (!task) {
        warnings.push(`Ignored a status update for unknown task "${labelOf(a.taskRef)}".`);
        continue;
      }
      if (!STATUSES.includes(a.newStatus)) {
        warnings.push(`Ignored invalid status "${a.newStatus}" for "${task.title}".`);
        continue;
      }
      if (a.newStatus === task.status) {
        warnings.push(`"${task.title}" is already ${a.newStatus}; skipped.`);
        continue;
      }
      updates.set(task.id, {
        type: 'UPDATE_TASK_STATUS',
        taskId: task.id,
        newStatus: a.newStatus,
        blockerNote: a.newStatus === 'BLOCKED' ? a.blockerNote || a.rationale || 'Reported blocked in meeting' : '',
        rationale: a.rationale,
      });
    } else if (a.type === 'ADD_DEPENDENCY') {
      const taskId = resolve(a.taskRef);
      const depId = resolve(a.dependsOnRef);
      if (!taskId || !depId) {
        warnings.push('Dropped a dependency that referenced an unknown task.');
        continue;
      }
      if (addEdge(taskId, depId, `${a.taskRef} → ${a.dependsOnRef}`) === true) {
        links.push({ type: 'ADD_DEPENDENCY', taskRef: taskId, dependsOnRef: depId, rationale: a.rationale });
      }
    }
  }

  return {
    summary: plan.summary,
    actions: [...updates.values(), ...creates.map((c) => c.action), ...links],
    warnings,
  };
}
