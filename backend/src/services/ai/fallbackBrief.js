// Deterministic brief parser used when Gemini is unavailable. Heuristic, but always produces
// a valid plan so the demo never crashes.

const KEYWORDS = {
  MARKETING: ['landing', 'announce', 'announcement', 'campaign', 'creative', 'creatives', 'social', 'press', 'newsletter', 'blog', 'seo', 'marketing', 'brand', 'ads', 'instagram', 'poster', 'posts', 'store listing', 'webinar', 'copy', 'promo'],
  ENGINEERING: ['api', 'backend', 'frontend', 'auth', 'login', 'log in', 'sign up', 'signup', 'registration', 'database', 'deploy', 'integration', 'integrate', 'payment', 'payments', 'service', 'infrastructure', 'build', 'implement', 'bug', 'performance', 'security', 'sdk', 'server', 'endpoint', 'migrate', 'refactor', 'cache'],
  PRODUCT: ['spec', 'requirement', 'requirements', 'criteria', 'onboarding', 'design', 'research', 'user story', 'roadmap', 'prd', 'survey', 'prototype', 'wireframe', 'ux', 'flow', 'interview', 'scope', 'prioritize'],
};

const CRITICAL = /\b(critical|blocker|asap|urgent|must[- ]have|p0)\b/i;
const HIGH = /\b(important|high priority|key|core|essential|p1)\b/i;
const LOW = /\b(nice[- ]to[- ]have|optional|later|low priority|stretch|p3)\b/i;

const AUTH = /\b(auth|login|sign[- ]?in|sso|oauth)\b/i;
const NEEDS_AUTH = /\b(payment\w*|checkout|profile|onboarding|account|integration|dashboard)\b/i;
const CUE = /\b(?:once|after|depends on|when|following|requires)\s+(?:the\s+)?([a-z][a-z0-9 -]{2,60})/i;
const STOP = new Set(['the', 'and', 'for', 'with', 'that', 'this', 'ship', 'ships', 'shipped', 'done', 'ready', 'is', 'are', 'are', 'its', 'has', 'have', 'been', 'launch']);

const stem = (w) => w.replace(/(ing|ion|ions|es|s)$/, '');
export const words = (s) =>
  s
    .toLowerCase()
    .replace(/log[- ]?in/g, 'login')
    .replace(/sign[- ]?up/g, 'signup')
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2 && !STOP.has(w))
    .map(stem);

export function classify(text) {
  const lower = ` ${text.toLowerCase()} `;
  const scores = Object.fromEntries(
    Object.entries(KEYWORDS).map(([cat, list]) => [cat, list.filter((k) => new RegExp(`\\b${k}\\b`).test(lower)).length])
  );
  const best = Math.max(...Object.values(scores));
  if (best === 0) return 'PRODUCT';
  // Tie-break order: ENGINEERING, MARKETING, PRODUCT.
  return ['ENGINEERING', 'MARKETING', 'PRODUCT'].find((c) => scores[c] === best);
}

export function priorityOf(text) {
  if (CRITICAL.test(text)) return 'CRITICAL';
  if (HIGH.test(text)) return 'HIGH';
  if (LOW.test(text)) return 'LOW';
  return 'MEDIUM';
}

function splitItems(content) {
  const lines = content
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const bullet = /^([-*•]|\d+[.)])\s+/;
  const bullets = lines.filter((l) => bullet.test(l)).map((l) => l.replace(bullet, ''));
  let items = bullets.length >= 2 ? bullets : lines.flatMap((l) => l.split(/(?<=[.!?])\s+/));
  items = items.map((s) => s.replace(/[.!?]+$/, '').trim()).filter((s) => s.length >= 8);
  return items.slice(0, 40);
}

export function toTitle(item) {
  const noParen = item.replace(/\([^)]*\)/g, '').trim();
  const parts = noParen.split(/[:;–—]| - /).map((x) => x.trim()).filter(Boolean);
  // "Nice to have: leaderboard page" -> use the part with the actual work in it.
  const first = parts[0].length < 20 && parts[1] ? parts[1] : parts[0];
  const t = first.length >= 8 ? first : item;
  return t.length > 90 ? `${t.slice(0, 87).trim()}…` : t.charAt(0).toUpperCase() + t.slice(1);
}

export function fallbackBriefPlan(content, projectName = 'this project') {
  const items = splitItems(content);
  const tasks = items.map((item, i) => ({
    tempId: `t${i + 1}`,
    title: toTitle(item),
    description: item,
    category: classify(item),
    priority: priorityOf(item),
  }));

  const dependencies = [];
  const authTask = tasks.find((t) => AUTH.test(t.title));
  const lastEngineering = [...tasks].reverse().find((t) => t.category === 'ENGINEERING');

  tasks.forEach((t, i) => {
    // 1) Explicit cue: "once X ...", "depends on X", "after X".
    const cue = items[i].match(CUE);
    if (cue) {
      const cueWords = new Set(words(cue[1]));
      let target = null;
      let bestOverlap = 0;
      for (const o of tasks) {
        if (o === t) continue;
        const overlap = words(o.title).filter((w) => cueWords.has(w)).length;
        if (overlap > bestOverlap) {
          bestOverlap = overlap;
          target = o;
        }
      }
      if (target) {
        dependencies.push({ taskTempId: t.tempId, dependsOnTempId: target.tempId });
        return;
      }
    }
    // 2) Things that need authentication come after the auth task.
    if (t === authTask) return;
    if (authTask && NEEDS_AUTH.test(t.title)) {
      dependencies.push({ taskTempId: t.tempId, dependsOnTempId: authTask.tempId });
      return;
    }
    // 3) Marketing work follows the last engineering task.
    if (t.category === 'MARKETING' && /\b(launch|campaign|landing|announce\w*|listing|publish\w*|promo\w*)\b/i.test(t.title) && lastEngineering && lastEngineering !== t) {
      dependencies.push({ taskTempId: t.tempId, dependsOnTempId: lastEngineering.tempId });
    }
  });

  return {
    summary: `Decomposed the brief into ${tasks.length} task(s) for ${projectName} using the built-in parser.`,
    tasks,
    dependencies,
  };
}
