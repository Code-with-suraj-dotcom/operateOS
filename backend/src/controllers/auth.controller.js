import bcrypt from 'bcryptjs';
import { z } from 'zod';
import User from '../models/User.js';
import { signToken } from '../middleware/auth.js';
import { badRequest, conflict, forbidden, unauthorized } from '../utils/errors.js';

export const registerSchema = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().email(),
  password: z.string().min(8).max(128),
});

export const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

export const updateProfileSchema = z.object({ name: z.string().trim().min(1).max(80) });

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(128),
});

export async function register(req, res) {
  const { name, email, password } = req.body;
  if (await User.exists({ email: email.toLowerCase() })) throw conflict('Email already registered');
  const passwordHash = await bcrypt.hash(password, 12);
  const user = await User.create({ name, email, passwordHash });
  res.status(201).json({ token: signToken(user._id), user: user.toSafeJSON() });
}

export async function login(req, res) {
  const { email, password } = req.body;
  const user = await User.findOne({ email: email.toLowerCase() }).select('+passwordHash');
  const ok = user && (await bcrypt.compare(password, user.passwordHash));
  if (!ok) throw unauthorized('Invalid email or password');
  res.json({ token: signToken(user._id), user: user.toSafeJSON() });
}

export function me(req, res) {
  res.json({ user: req.user.toSafeJSON() });
}

export async function updateProfile(req, res) {
  req.user.name = req.body.name;
  await req.user.save();
  res.json({ user: req.user.toSafeJSON() });
}

export async function changePassword(req, res) {
  // Demo accounts are shared by every evaluator, so their password must stay fixed.
  if (req.user.email.endsWith('@demo.operateos.app')) throw forbidden('Demo accounts cannot change their password');
  const { currentPassword, newPassword } = req.body;
  const user = await User.findById(req.user._id).select('+passwordHash');
  if (!(await bcrypt.compare(currentPassword, user.passwordHash))) throw badRequest('Current password is incorrect');
  if (currentPassword === newPassword) throw badRequest('New password must be different');
  user.passwordHash = await bcrypt.hash(newPassword, 12);
  await user.save();
  res.json({ ok: true });
}
