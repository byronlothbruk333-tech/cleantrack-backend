import { Request, Response } from 'express';
import User, { UserRole } from '../models/User';

// ============================================
// GET ALL DRIVERS
// GET /api/users/drivers
// Requires: authenticate + authorize(admin, management)
// ============================================
export const getDrivers = async (req: Request, res: Response) => {
  try {
    const drivers = await User.findAll({
      where: {
        role: UserRole.DRIVER,
        deleted: false,
      },
      attributes: ['id', 'name', 'email', 'phone', 'zone'],
      order: [['name', 'ASC']],
    });

    res.json({
      count: drivers.length,
      drivers,
    });
  } catch (error: unknown) {
    console.error('Get drivers error:', error);
    res.status(500).json({
      error: 'Failed to fetch drivers',
      message: 'Something went wrong',
    });
  }
};

// ============================================
// GET ALL USERS (admin)
// GET /api/users
// ============================================
export const getAllUsers = async (req: Request, res: Response) => {
  try {
    const { role } = req.query;

    const where: any = { deleted: false };
    if (role) where.role = role;

    const users = await User.findAll({
      where,
      attributes: ['id', 'name', 'email', 'role', 'phone', 'zone', 'status'],
      order: [['name', 'ASC']],
    });

    res.json({
      count: users.length,
      users,
    });
  } catch (error: unknown) {
    console.error('Get users error:', error);
    res.status(500).json({
      error: 'Failed to fetch users',
      message: 'Something went wrong',
    });
  }
};