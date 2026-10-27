// Pure graph module: no I/O. Tasks are plain objects { id, title, status, priority, dependsOn: [id] }.
// Edge direction: if B.dependsOn contains A, then A is upstream of B (A -> B).

const PRIORITY_RANK = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };

export function buildDownstream(tasks) {
  const down = new Map(tasks.map((t) => [t.id, []]));
  for (const t of tasks) {
    for (const dep of t.dependsOn) {
      if (down.has(dep)) down.get(dep).push(t.id);
    }
  }
  return down;
}

/**
 * DFS cycle check for adding the edge "taskId depends on dependsOnId".
 * Returns null when safe, otherwise the cycle as an array of ids that starts and ends
 * with the same id, following "blocks" direction (e.g. [A, B, A]).
 */
export function findCyclePath(tasks, taskId, dependsOnId) {
  if (taskId === dependsOnId) return [taskId, taskId];
  const down = buildDownstream(tasks);
  // Adding dependsOn -> task closes a cycle iff task already reaches dependsOn downstream.
  const stack = [[taskId, [taskId]]];
  const seen = new Set();
  while (stack.length) {
    const [node, path] = stack.pop();
    if (node === dependsOnId) return [...path, taskId];
    if (seen.has(node)) continue;
    seen.add(node);
    for (const next of down.get(node) || []) stack.push([next, [...path, next]]);
  }
  return null;
}

/**
 * Multi-source BFS from every BLOCKED task through downstream edges.
 * Returns Map(id -> { isAtRisk, riskReason }) for every task.
 * DONE tasks are never at risk and stop propagation; BLOCKED tasks are never "at risk".
 */
export function computeRisk(tasks) {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const down = buildDownstream(tasks);
  const blockers = new Map(); // id -> Set(blocker titles)

  for (const root of tasks.filter((t) => t.status === 'BLOCKED')) {
    const queue = [root.id];
    const visited = new Set([root.id]);
    while (queue.length) {
      const cur = queue.shift();
      for (const next of down.get(cur) || []) {
        if (visited.has(next)) continue;
        visited.add(next);
        const node = byId.get(next);
        if (node.status === 'DONE') continue;
        if (!blockers.has(next)) blockers.set(next, new Set());
        blockers.get(next).add(root.title);
        queue.push(next);
      }
    }
  }

  const result = new Map();
  for (const t of tasks) {
    const names = blockers.get(t.id);
    if (names && t.status !== 'BLOCKED' && t.status !== 'DONE') {
      const list = [...names];
      const shown = list.slice(0, 3).join(', ');
      const more = list.length > 3 ? ` +${list.length - 3} more` : '';
      result.set(t.id, { isAtRisk: true, riskReason: `Blocked upstream by: ${shown}${more}` });
    } else {
      result.set(t.id, { isAtRisk: false, riskReason: '' });
    }
  }
  return result;
}

/** `tasks` must already carry the computed isAtRisk flag. */
export function computeHealth(tasks) {
  const N = tasks.length;
  if (N === 0) return { score: 100, status: 'ON_TRACK', N: 0, B: 0, R: 0, C: 0 };

  const B = tasks.filter((t) => t.status === 'BLOCKED').length;
  const R = tasks.filter((t) => t.status !== 'BLOCKED' && t.status !== 'DONE' && t.isAtRisk).length;
  const C = tasks.filter((t) => t.status === 'DONE').length;

  const penalty = ((B * 1.0 + R * 0.5) / N) * 100;
  const score = Math.max(0, Math.round(100 - penalty));

  let status;
  if (score < 50 || B / N >= 0.35) status = 'CRITICAL';
  else if (score < 80 || B >= 1 || R >= 1) status = 'AT_RISK';
  else status = 'ON_TRACK';

  return { score, status, N, B, R, C };
}

/** The blocked task with the most (transitive, not-done) downstream dependents. */
export function findCriticalPath(tasks) {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const down = buildDownstream(tasks);
  let best = null;

  for (const root of tasks.filter((t) => t.status === 'BLOCKED')) {
    const visited = new Set([root.id]);
    const queue = [root.id];
    let count = 0;
    while (queue.length) {
      const cur = queue.shift();
      for (const next of down.get(cur) || []) {
        if (visited.has(next)) continue;
        visited.add(next);
        if (byId.get(next).status === 'DONE') continue;
        count++;
        queue.push(next);
      }
    }
    const better =
      !best ||
      count > best.downstreamCount ||
      (count === best.downstreamCount && (PRIORITY_RANK[root.priority] || 0) > (PRIORITY_RANK[best.task.priority] || 0));
    if (better) best = { task: root, downstreamCount: count };
  }
  return best;
}

/** Deterministic executive summary (never depends on the LLM being available). */
export function buildSummary(health, critical) {
  if (health.N === 0) return 'No tasks yet';
  if (!critical) {
    return health.R > 0
      ? `${health.score}% — ${health.R} task(s) flagged at risk.`
      : `${health.score}% — No blocked tasks. ${health.C} of ${health.N} tasks done.`;
  }
  const n = critical.downstreamCount;
  return `${health.score}% — ${critical.task.title} is blocked and affects ${n} dependent task${n === 1 ? '' : 's'}. ${critical.task.title} is the critical path this week.`;
}
