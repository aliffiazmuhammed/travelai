import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';

export const signup = async (email: string, password: string) => {
  const normalizedEmail = email.trim().toLowerCase();
  const existingUser = await User.findOne({ email: normalizedEmail });
  if (existingUser) {
    throw new AppError('An account with this email already exists. Please sign in instead.', 400);
  }

  const hashedPassword = await bcrypt.hash(password, 12);
  const user = new User({ email: normalizedEmail, password: hashedPassword });
  await user.save();

  const token = jwt.sign({ userId: user._id }, env.JWT_SECRET, { expiresIn: '1h' });

  return { user: { _id: user._id, email: user.email }, token };
};

export const signin = async (email: string, password: string) => {
  const normalizedEmail = email.trim().toLowerCase();
  const user = await User.findOne({ email: normalizedEmail });
  if (!user) {
    throw new AppError('Incorrect email or password. Please check your credentials and try again.', 401);
  }

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    throw new AppError('Incorrect email or password. Please check your credentials and try again.', 401);
  }

  const token = jwt.sign({ userId: user._id }, env.JWT_SECRET, { expiresIn: '1h' });

  return { user: { _id: user._id, email: user.email }, token };
};

export const getUserById = async (userId: string) => {
  const user = await User.findById(userId).select('-password');
  if (!user) {
    throw new AppError('User profile not found.', 404);
  }
  return user;
};
