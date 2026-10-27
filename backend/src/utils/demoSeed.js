import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import Workspace from '../models/Workspace.js';
import Project from '../models/Project.js';
import Task from '../models/Task.js';
import ContextDoc from '../models/ContextDoc.js';
import AgentProposal from '../models/AgentProposal.js';
import { recomputeProject } from '../services/projectHealth.js';
import { signToken } from '../middleware/auth.js';

export const DEMO_PASSWORD = 'demo1234';

const DEMO_USERS = [
  { role: 'ADMIN', name: 'Alex Admin', email: 'admin@demo.operateos.app' },
  { role: 'LEAD', name: 'Lena Lead', email: 'lead@demo.operateos.app' },
  { role: 'MEMBER', name: 'Mo Member', email: 'member@demo.operateos.app' },
];

async function ensureDemoUsers() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const out = [];
  for (const u of DEMO_USERS) {
    let user = await User.findOne({ email: u.email });
    if (!user) user = await User.create({ name: u.name, email: u.email, passwordHash });
    out.push({ role: u.role, user });
  }
  return out;
}

export const SAMPLE_BRIEF = `Launch plan for the v2 mobile app.
- Write acceptance criteria for the launch release
- Build the notification service so users get launch alerts
- Design the push notification opt-in flow (depends on the notification service)
- Prepare launch creatives and the announcement email
- Publish an app store listing once notifications ship`;

/**
 * Creates a fresh demo workspace with the Blueprint scenario. Risk flags and health
 * are computed by the dependency engine; one PENDING AI proposal is left for review.
 */
export async function seedDemoWorkspace() {
  const users = await ensureDemoUsers();
  const [admin, lead, member] = users.map((u) => u.user);

  const workspace = await Workspace.create({
    name: 'Demo Workspace',
    owner: admin._id,
    isDemo: true,
    members: users.map((u) => ({ user: u.user._id, role: u.role })),
  });

  const project = await Project.create({
    workspace: workspace._id,
    name: 'Mobile Launch',
    description: 'Launch of the mobile app: auth, payments, onboarding and marketing.',
    createdBy: admin._id,
  });

  const base = { project: project._id, workspace: workspace._id };
  const mk = (data) => Task.create({ ...base, ...data });

  const criteria = await mk({ title: 'Acceptance criteria', category: 'PRODUCT', status: 'DONE', priority: 'HIGH', assignee: lead._id });
  const auth = await mk({
    title: 'Auth service', category: 'ENGINEERING', status: 'BLOCKED', priority: 'CRITICAL', assignee: member._id,
    blockerNote: 'Waiting on OAuth provider credentials.',
  });
  await mk({ title: 'Payments API', category: 'ENGINEERING', status: 'TODO', priority: 'HIGH', assignee: member._id, dependsOn: [auth._id] });
  await mk({ title: 'Mobile onboarding', category: 'PRODUCT', status: 'TODO', priority: 'MEDIUM', assignee: lead._id, dependsOn: [auth._id] });
  const integration = await mk({ title: 'App integration', category: 'ENGINEERING', status: 'TODO', priority: 'HIGH', dependsOn: [auth._id] });
  await mk({ title: 'Landing page', category: 'MARKETING', status: 'IN_PROGRESS', priority: 'MEDIUM', dependsOn: [integration._id] });
  await mk({ title: 'Launch creatives', category: 'MARKETING', status: 'IN_PROGRESS', priority: 'LOW', assignee: lead._id, dependsOn: [criteria._id] });

  const actor = { workspace: workspace._id, actorType: 'HUMAN', actorUser: admin._id };
  await recomputeProject(project._id, actor);

  // One pending AI proposal, ready to inspect (built by the same normalizer as real proposals).
  const doc = await ContextDoc.create({
    project: project._id, workspace: workspace._id, type: 'BRIEF', title: 'Notifications launch brief',
    content: SAMPLE_BRIEF, author: lead._id,
  });
  await AgentProposal.create({
    project: project._id, workspace: workspace._id, sourceDoc: doc._id, triggerType: 'BRIEF',
    summary: 'Proposed 3 new tasks and 1 status update from the notifications brief.',
    source: 'FALLBACK', model: 'fallback-parser', promptVersion: 'brief-v1', submittedBy: lead._id,
    proposedActions: [
      { type: 'CREATE_TASK', tempId: 't1', title: 'Build the notification service', description: 'Build the notification service so users get launch alerts', category: 'ENGINEERING', priority: 'HIGH', dependsOnRefs: [String(auth._id)], rationale: 'Needs authenticated users.' },
      { type: 'CREATE_TASK', tempId: 't2', title: 'Design the push notification opt-in flow', description: 'Design the opt-in flow for push notifications', category: 'PRODUCT', priority: 'MEDIUM', dependsOnRefs: ['t1'], rationale: 'Depends on the notification service.' },
      { type: 'CREATE_TASK', tempId: 't3', title: 'Publish the app store listing', description: 'Publish the app store listing once notifications ship', category: 'MARKETING', priority: 'MEDIUM', dependsOnRefs: ['t1'], rationale: 'Ships after notifications.' },
      { type: 'UPDATE_TASK_STATUS', taskId: String(integration._id), newStatus: 'IN_PROGRESS', blockerNote: '', rationale: 'Brief says integration work has started.' },
    ],
  });

  return {
    workspace,
    project,
    sessions: users.map((u) => ({ role: u.role, token: signToken(u.user._id), user: u.user.toSafeJSON() })),
  };
}
