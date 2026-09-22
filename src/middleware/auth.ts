import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import User, { UserRole, UserStatus } from '../models/User';

// ============================================
// JWT PAYLOAD INTERFACE
// ============================================
interface JwtPayload {
  id: string;
  email: string;
  role: UserRole;
  iat?: number;
  exp?: number;
}

// ============================================
// EXTENDED REQUEST INTERFACE
// ============================================
export interface AuthRequest extends Request {
  user?: User;
  token?: string;
}

// ============================================
// AUTHENTICATE MIDDLEWARE
// ============================================
export const authenticate = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ')
      ? authHeader.substring(7)
      : null;

    if (!token) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'No token provided',
      });
    }

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET!
    ) as JwtPayload;

    const user = await User.findByPk(decoded.id);

    if (!user) {
      return res.status(401).json({
        error: 'Invalid token',
        message: 'User no longer exists',
      });
    }

    if (user.status === UserStatus.SUSPENDED) {
      return res.status(403).json({
        error: 'Account suspended',
        message: 'Your account has been suspended. Contact support.',
      });
    }

    if (user.status === UserStatus.INACTIVE) {
      return res.status(403).json({
        error: 'Account inactive',
        message: 'Your account is inactive.',
      });
    }

    if (user.deleted) {
      return res.status(403).json({
        error: 'Account deleted',
        message: 'Your account has been scheduled for deletion.',
      });
    }

    req.user = user;
    req.token = token;

    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      return res.status(401).json({
        error: 'Invalid token',
        message: 'The token is malformed or invalid',
      });
    }

    if (error instanceof jwt.TokenExpiredError) {
      return res.status(401).json({
        error: 'Token expired',
        message: 'Please log in again',
      });
    }

    console.error('Auth middleware error:', error);
    return res.status(500).json({
      error: 'Authentication error',
      message: 'Something went wrong verifying your token',
    });
  }
};

// ============================================
// AUTHORIZE MIDDLEWARE
// ============================================
export const authorize = (...allowedRoles: UserRole[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'You must be logged in',
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: 'Insufficient permissions',
        message: `This action requires one of these roles: ${allowedRoles.join(', ')}`,
      });
    }

    next();
  };
};

// ============================================
// OPTIONAL AUTH MIDDLEWARE
// ============================================
export const optionalAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ')
      ? authHeader.substring(7)
      : null;

    if (!token) {
      return next();
    }

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET!
    ) as JwtPayload;

    const user = await User.findByPk(decoded.id);

    if (user && !user.deleted && user.status === UserStatus.ACTIVE) {
      req.user = user;
      req.token = token;
    }

    next();
  } catch (error) {
    next();
  }
};