import { classify, priorityOf, toTitle, words } from './fallbackBrief.js';

// Deterministic transcript parser used when Gemini is unavailable.
// Produces the same raw plan shape the LLM does, so it goes through the same validation.

const DEP_CUE = /\b(depends on|dependent on|blocked by|cannot start until|can't start until|can not start until|waiting on|waiting for|needs|until|after)\b/i;
const UNBLOCKED = /\b(unblocked|no longer blocked|blocker (?:is )?(?:resolved|cleared|gone))\b/i;
const DONE = /\b(done|finished|completed|complete|shipped|merged|delivered|signed off|wrapped up)\b/i;
const BLOCKED = /\b(blocked|stuck|can'?t proceed|cannot proceed|can'?t start|cannot start|held up|on hold|delayed|waiting on|waiting for)\b/i;
const PROGRESS = /\b(working on|started|starting|kicked off|picked up|in progress|underway|begun|begin)\b/i;
const ACTION = /\b(we need to|need to|needs to|should|let'?s|action item|todo|to do|someone (?:should|needs)|add an?|don'?t forget|have to|must)\b/i;
const ACTION_PREFIX = /^(?:we|i|you|they)?\s*(?:also\s+)?(?:need to|needs to|should|have to|must|let'?s|don'?t forget to|action item:?|todo:?)\s+/i;

const SPEAKER = /^[A-Z][A-Za-z.'-]*(?: [A-Z][A-Za-z.'-]*)?:\s+/;

function clausesOf(content) {
  return content
    .split(/\r?\n/)
    .map((l) => l.trim().replace(SPEAKER, ''))
    .filter(Boolean)
    .flatMap((l) => l.split(/(?<=[.!?])\s+/))
    .flatMap((s) => s.split(/;|\bbut\b|\bthough\b|\balthough\b|\bwhile\b|,?\s*\band (?=(?:i|we|they|he|she)\b)/i))
    .map((s) => s.replace(/[.!?]+$/, '').trim())
    .filter((s) => s.length >= 6);
}

function bestTask(clause, tasks) {
  const cw = new Set(words(clause));
  let best = null;
  let bestScore = 0;
  for (const t of tasks) {
    const tw = words(t.title);
    if (!tw.length) continue;
    const score = tw.filter((w) => cw.has(w)).length / tw.length;
    if (score >= 0.5 && (score > bestScore || (score === bestScore && best && t.title.length > best.title.length))) {
      best = t;
      bestScore = score;
    }
  }
  return best;
}

export function fallbackTranscriptPlan(content, ctxTasks) {
  const actions = [];
  const clip = (s) => `Meeting: "${s.length > 160 ? `${s.slice(0, 157)}…` : s}"`;

  for (const clause of clausesOf(content)) {
    // 1) "X depends on Y" / "X cannot start until Y ..." with two different known tasks.
    const cue = clause.match(DEP_CUE);
    if (cue) {
      const left = clause.slice(0, cue.index);
      const right = clause.slice(cue.index + cue[0].length);
      const tl = bestTask(left, ctxTasks);
      const tr = bestTask(right, ctxTasks);
      if (tl && tr && tl !== tr) {
        actions.push({ type: 'ADD_DEPENDENCY', taskRef: tl.ref, dependsOnRef: tr.ref, rationale: clip(clause) });
        continue;
      }
    }

    // 2) Status change for a known task.
    const task = bestTask(clause, ctxTasks);
    if (task) {
      let status = null;
      if (UNBLOCKED.test(clause)) status = 'IN_PROGRESS';
      else if (DONE.test(clause)) status = 'DONE';
      else if (BLOCKED.test(clause)) status = 'BLOCKED';
      else if (PROGRESS.test(clause)) status = 'IN_PROGRESS';
      if (status) {
        actions.push({
          type: 'UPDATE_TASK_STATUS',
          taskRef: task.ref,
          newStatus: status,
          blockerNote: status === 'BLOCKED' ? clause : '',
          rationale: clip(clause),
        });
        continue;
      }
    }

    // 3) A new action item.
    if (ACTION.test(clause)) {
      const title = toTitle(clause.replace(ACTION_PREFIX, '').replace(/\btask\b/i, '').replace(/\s+/g, ' ').trim());
      actions.push({
        type: 'CREATE_TASK',
        title,
        description: clause,
        category: classify(clause),
        priority: priorityOf(clause),
        rationale: clip(clause),
      });
    }
  }

  return {
    summary: `Found ${actions.length} action(s) in the meeting notes using the built-in parser.`,
    actions,
  };
}
