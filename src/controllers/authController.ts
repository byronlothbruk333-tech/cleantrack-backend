import { Request, Response } from 'express';
import jwt, { SignOptions } from 'jsonwebtoken';
import crypto from 'crypto';
import User, { UserRole, UserStatus } from '../models/User';
import RefreshToken from '../models/RefreshToken';
import { AuthRequest } from '../middleware/auth';
import { verifyGoogleToken } from '../services/googleAuth';

// ============================================
// HELPER: Generate Access Token (short-lived: 15 min)
// ============================================
const generateAccessToken = (user: User): string => {
  const payload = {
    id: user.id,
    email: user.email,
    role: user.role,
  };

  const options: SignOptions = {
    expiresIn: '15m',
  };

  return jwt.sign(payload, process.env.JWT_SECRET!, options);
};

// ============================================
// HELPER: Generate Refresh Token (long-lived: 30 days)
// ============================================
const generateRefreshToken = async (user: User): Promise<string> => {
  const token = crypto.randomBytes(64).toString('hex');
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30);

  await RefreshToken.create({
    token,
    userId: user.id,
    expiresAt,
  });

  return token;
};

// ============================================
// REGISTER
// POST /api/auth/register
// ============================================
export const register = async (req: Request, res: Response) => {
  try {
    const { name, email, password, role } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        error: 'Missing required fields',
        message: 'name, email, and password are required',
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        error: 'Weak password',
        message: 'Password must be at least 6 characters',
      });
    }

    const allowedRoles = Object.values(UserRole);
    const userRole = role && allowedRoles.includes(role) ? role : UserRole.CITIZEN;

    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      return res.status(409).json({
        error: 'User already exists',
        message: 'An account with this email already exists',
      });
    }

    const user = await User.create({
      name,
      email,
      password,
      role: userRole,
      status: UserStatus.ACTIVE,
    });

    const accessToken = generateAccessToken(user);
    const refreshToken = await generateRefreshToken(user);

    res.status(201).json({
      message: 'User registered successfully',
      accessToken,
      refreshToken,
      user: user.toJSON(),
    });
  } catch (error: any) {
    console.error('Register error:', error);
    res.status(500).json({
      error: 'Registration failed',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong',
    });
  }
};

// ============================================
// LOGIN
// POST /api/auth/login
// ============================================
export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        error: 'Missing credentials',
        message: 'Email and password are required',
      });
    }

    const user = await User.findOne({ where: { email } });
    if (!user) {
      return res.status(401).json({
        error: 'Invalid credentials',
        message: 'Email or password is incorrect',
      });
    }

    // ============================================
    // SOFT-DELETED: check reactivation window
    // ============================================
    if (user.deleted) {
      const deletedAt = user.deletedAt ? new Date(user.deletedAt) : new Date();
      const daysSinceDeleted = Math.floor(
        (Date.now() - deletedAt.getTime()) / (1000 * 60 * 60 * 24)
      );
      const daysRemaining = Math.max(0, 30 - daysSinceDeleted);

      if (daysRemaining <= 0) {
        return res.status(410).json({
          error: 'Account permanently deleted',
          message:
            'Your account has passed the 30-day reactivation window. Please contact support.',
        });
      }

      return res.status(403).json({
        error: 'Account deleted',
        message: `This account was deleted. You can reactivate it within ${daysRemaining} day(s).`,
        requiresReactivation: true,
        daysRemaining,
      });
    }

    if (user.status === UserStatus.SUSPENDED) {
      return res.status(403).json({
        error: 'Account suspended',
        message: 'Your account has been suspended',
      });
    }

    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({
        error: 'Invalid credentials',
        message: 'Email or password is incorrect',
      });
    }

    const accessToken = generateAccessToken(user);
    const refreshToken = await generateRefreshToken(user);

    res.json({
      message: 'Login successful',
      accessToken,
      refreshToken,
      user: user.toJSON(),
    });
  } catch (error: any) {
    console.error('Login error:', error);
    res.status(500).json({
      error: 'Login failed',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong',
    });
  }
};

// ============================================
// GET ME
// GET /api/auth/me
// Requires: authenticate middleware
// ============================================
export const getMe = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    res.json({
      user: req.user.toJSON(),
    });
  } catch (error: any) {
    console.error('Get me error:', error);
    res.status(500).json({
      error: 'Failed to fetch user',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong',
    });
  }
};

// ============================================
// LOGOUT
// POST /api/auth/logout
// ============================================
export const logout = async (req: Request, res: Response) => {
  res.json({
    message: 'Logged out successfully',
    note: 'Please discard your tokens on the client side',
  });
};

// ============================================
// GOOGLE OAUTH
// POST /api/auth/google
// ============================================
export const googleAuth = async (req: Request, res: Response) => {
  try {
    const { idToken } = req.body;

    if (!idToken) {
      return res.status(400).json({
        error: 'Missing token',
        message: 'Google ID token is required',
      });
    }

    let googleUser;
    try {
      googleUser = await verifyGoogleToken(idToken);
    } catch (err: any) {
      return res.status(401).json({
        error: 'Invalid Google token',
        message: err.message || 'The Google token could not be verified',
      });
    }

    let user = await User.findOne({ where: { email: googleUser.email } });

    if (!user) {
      const randomPassword = Math.random().toString(36).slice(-16);
      user = await User.create({
        name: googleUser.name,
        email: googleUser.email,
        password: randomPassword,
        googleId: googleUser.googleId,
        avatar: googleUser.picture || null,
        role: UserRole.CITIZEN,
        status: UserStatus.ACTIVE,
      });
    } else {
      // ============================================
      // REACTIVATION: check window if soft-deleted
      // ============================================
      if (user.deleted) {
        const deletedAt = user.deletedAt ? new Date(user.deletedAt) : new Date();
        const daysSinceDeleted = Math.floor(
          (Date.now() - deletedAt.getTime()) / (1000 * 60 * 60 * 24)
        );

        if (daysSinceDeleted > 30) {
          return res.status(410).json({
            error: 'Reactivation window expired',
            message:
              'The 30-day reactivation window has passed. Please contact support.',
          });
        }

        user.deleted = false;
        user.deletedAt = null;
      }

      if (!user.googleId) {
        user.googleId = googleUser.googleId;
      }

      if (!user.avatar && googleUser.picture) {
        user.avatar = googleUser.picture;
      }

      await user.save();
    }

    if (user.status === UserStatus.SUSPENDED) {
      return res.status(403).json({
        error: 'Account suspended',
        message: 'Your account has been suspended. Contact support.',
      });
    }

    const accessToken = generateAccessToken(user);
    const refreshToken = await generateRefreshToken(user);

    res.json({
      message: 'Google login successful',
      accessToken,
      refreshToken,
      user: user.toJSON(),
    });
  } catch (error: any) {
    console.error('Google auth error:', error);
    res.status(500).json({
      error: 'Google authentication failed',
      message:
        process.env.NODE_ENV === 'development'
          ? error.message
          : 'Something went wrong',
    });
  }
};

// ============================================
// CHANGE PASSWORD
// POST /api/auth/change-password
// Only ADMIN and MANAGEMENT can self-change their password.
// ============================================
export const changePassword = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    if (
      req.user.role !== UserRole.ADMIN &&
      req.user.role !== UserRole.MANAGEMENT
    ) {
      return res.status(403).json({
        error: 'Not allowed',
        message:
          'Password changes are restricted. Citizens use Google sign-in. ' +
          'Drivers receive passwords from the administrator.',
      });
    }

    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        error: 'Missing fields',
        message: 'currentPassword and newPassword are required',
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        error: 'Weak password',
        message: 'New password must be at least 6 characters',
      });
    }

    const isValid = await req.user.comparePassword(currentPassword);
    if (!isValid) {
      return res.status(401).json({
        error: 'Invalid password',
        message: 'Current password is incorrect',
      });
    }

    if (currentPassword === newPassword) {
      return res.status(400).json({
        error: 'Password unchanged',
        message: 'New password must be different from current password',
      });
    }

    req.user.password = newPassword;
    await req.user.save();

    res.json({
      message: 'Password changed successfully',
    });
  } catch (error: any) {
    console.error('Change password error:', error);
    res.status(500).json({
      error: 'Failed to change password',
      message:
        process.env.NODE_ENV === 'development'
          ? error.message
          : 'Something went wrong',
    });
  }
};

// ============================================
// REFRESH ACCESS TOKEN
// POST /api/auth/refresh
// ============================================
export const refresh = async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        error: 'Missing refresh token',
        message: 'refreshToken is required',
      });
    }

    const storedToken = await RefreshToken.findOne({
      where: { token: refreshToken },
      include: [{ model: User, as: 'user' }],
    });

    if (!storedToken) {
      return res.status(401).json({
        error: 'Invalid refresh token',
        message: 'The refresh token does not exist',
      });
    }

    if (!storedToken.isActive()) {
      return res.status(401).json({
        error: 'Invalid refresh token',
        message: storedToken.revoked
          ? 'This refresh token has been revoked'
          : 'This refresh token has expired',
      });
    }

    const user = (storedToken as any).user as User;

    if (!user || user.deleted || user.status === UserStatus.SUSPENDED) {
      return res.status(403).json({
        error: 'Account not accessible',
        message: 'This account is no longer active',
      });
    }

    const newAccessToken = generateAccessToken(user);
    const newRefreshToken = await generateRefreshToken(user);

    storedToken.revoked = true;
    storedToken.replacedByToken = newRefreshToken;
    await storedToken.save();

    res.json({
      message: 'Token refreshed successfully',
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    });
  } catch (error: any) {
    console.error('Refresh error:', error);
    res.status(500).json({
      error: 'Refresh failed',
      message:
        process.env.NODE_ENV === 'development'
          ? error.message
          : 'Something went wrong',
    });
  }
};

// ============================================
// REACTIVATE ACCOUNT
// POST /api/auth/reactivate
// Restores a soft-deleted account within 30 days
// ============================================
export const reactivate = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        error: 'Missing credentials',
        message: 'Email and password are required',
      });
    }

    const user = await User.findOne({ where: { email } });
    if (!user) {
      return res.status(401).json({
        error: 'Invalid credentials',
        message: 'Email or password is incorrect',
      });
    }

    if (!user.deleted) {
      return res.status(400).json({
        error: 'Account active',
        message: 'This account is already active. Please log in normally.',
      });
    }

    const deletedAt = user.deletedAt ? new Date(user.deletedAt) : new Date();
    const daysSinceDeleted = Math.floor(
      (Date.now() - deletedAt.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (daysSinceDeleted > 30) {
      return res.status(410).json({
        error: 'Reactivation window expired',
        message:
          'The 30-day reactivation window has passed. Please contact support.',
      });
    }

    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({
        error: 'Invalid credentials',
        message: 'Email or password is incorrect',
      });
    }

    // Reactivate
    user.deleted = false;
    user.deletedAt = null;
    await user.save();

    const accessToken = generateAccessToken(user);
    const refreshToken = await generateRefreshToken(user);

    res.json({
      message: 'Account reactivated successfully',
      accessToken,
      refreshToken,
      user: user.toJSON(),
    });
  } catch (error: any) {
    console.error('Reactivate error:', error);
    res.status(500).json({
      error: 'Reactivation failed',
      message:
        process.env.NODE_ENV === 'development'
          ? error.message
          : 'Something went wrong',
    });
  }
};