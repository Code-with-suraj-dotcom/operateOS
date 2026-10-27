import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { asyncHandler, unauthorized } from '../utils/errors.js';

export const signToken = (userId) =>
  jwt.sign({ sub: String(userId) }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '1d',
  });

export const authenticate = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) throw unauthorized();

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    throw unauthorized('Invalid or expired token');
  }

  const user = await User.findById(payload.sub);
  if (!user) throw unauthorized('User no longer exists');
  req.user = user;
  next();
});
