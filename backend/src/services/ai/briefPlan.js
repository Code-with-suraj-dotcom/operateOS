import { z } from 'zod';
import { CATEGORIES, PRIORITIES } from '../../models/Task.js';
import { findCyclePath } from '../graph/engine.js';

export const MAX_TASKS = 40;

// What we ask the LLM (and the fallback) to produce.
export const briefPlanSchema = z.object({
  summary: z.string().default(''),
  tasks: z.array(
    z.object({
      tempId: z.string().min(1),
      title: z.string().min(1),
      description: z.string().default(''),
      category: z.enum(CATEGORIES),
      priority: z.enum(PRIORITIES),
    })
  ),
  dependencies: z
    .array(z.object({ taskTempId: z.string(), dependsOnTempId: z.string() }))
    .default([]),
});

// Gemini responseSchema (OpenAPI subset).
export const briefResponseSchema = {
  type: 'OBJECT',
  properties: {
    summary: { type: 'STRING' },
    tasks: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          tempId: { type: 'STRING' },
          title: { type: 'STRING' },
          description: { type: 'STRING' },
          category: { type: 'STRING', enum: CATEGORIES },
          priority: { type: 'STRING', enum: PRIORITIES },
        },
        required: ['tempId', 'title', 'description', 'category', 'priority'],
      },
    },
    dependencies: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { taskTempId: { type: 'STRING' }, dependsOnTempId: { type: 'STRING' } },
        required: ['taskTempId', 'dependsOnTempId'],
      },
    },
  },
  required: ['summary', 'tasks', 'dependencies'],
};

/**
 * Cleans a validated plan: unique tempIds, max tasks, drops dangling/self/duplicate edges
 * and any edge that would close a cycle. Returns CREATE_TASK actions + warnings.
 */
export function normalizeBriefPlan(plan) {
  const warnings = [];
  let tasks = plan.tasks;
  if (tasks.length > MAX_TASKS) {
    warnings.push(`AI produced ${tasks.length} tasks; only the first ${MAX_TASKS} were kept.`);
    tasks = tasks.slice(0, MAX_TASKS);
  }

  // Re-key tempIds so they are unique; remember original -> final for dependency mapping.
  const idMap = new Map();
  const nodes = tasks.map((t, i) => {
    const finalId = `t${i + 1}`;
    if (!idMap.has(t.tempId)) idMap.set(t.tempId, finalId);
    return { id: finalId, title: t.title.trim(), dependsOn: [], src: t };
  });
  const byId = new Map(nodes.map((n) => [n.id, n]));

  for (const edge of plan.dependencies) {
    const task = idMap.get(edge.taskTempId);
    const dep = idMap.get(edge.dependsOnTempId);
    if (!task || !dep || task === dep) {
      warnings.push('Dropped a dependency that referenced an unknown or identical task.');
      continue;
    }
    const node = byId.get(task);
    if (node.dependsOn.includes(dep)) continue;
    const cycle = findCyclePath(nodes, task, dep);
    if (cycle) {
      const names = cycle.map((id) => byId.get(id).title).join(' → ');
      warnings.push(`Dropped dependency that would create a cycle: ${names}`);
      continue;
    }
    node.dependsOn.push(dep);
  }

  const actions = nodes.map((n) => ({
    type: 'CREATE_TASK',
    tempId: n.id,
    title: n.title.slice(0, 200),
    description: (n.src.description || '').trim(),
    category: n.src.category,
    priority: n.src.priority,
    dependsOnRefs: n.dependsOn,
    rationale: '',
  }));

  return { summary: plan.summary, actions, warnings };
}
