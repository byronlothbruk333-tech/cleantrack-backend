import { Request, Response } from 'express';
import Truck, { TruckStatus } from '../models/Truck';
import User, { UserRole } from '../models/User';
import { AuthRequest } from '../middleware/auth';

// ============================================
// CREATE TRUCK
// POST /api/trucks
// Requires: admin/management
// ============================================
export const createTruck = async (req: AuthRequest, res: Response) => {
  try {
    const {
      truckId,
      registrationNumber,
      driverId,
      zone,
      status,
      capacity,
      latitude,
      longitude,
      lastMaintenance,
      nextMaintenance,
    } = req.body;

    // Validate required fields
    if (!truckId || !registrationNumber || !zone || !lastMaintenance || !nextMaintenance) {
      return res.status(400).json({
        error: 'Missing required fields',
        message: 'truckId, registrationNumber, zone, lastMaintenance, and nextMaintenance are required',
      });
    }

    // Check for duplicate truckId
    const existingTruckId = await Truck.findOne({ where: { truckId } });
    if (existingTruckId) {
      return res.status(409).json({
        error: 'Truck ID already exists',
        message: `A truck with ID "${truckId}" already exists`,
      });
    }

    // Check for duplicate registration
    const existingReg = await Truck.findOne({ where: { registrationNumber } });
    if (existingReg) {
      return res.status(409).json({
        error: 'Registration already exists',
        message: `A truck with registration "${registrationNumber}" already exists`,
      });
    }

    // Validate driver if provided
    if (driverId) {
      const driver = await User.findByPk(driverId);
      if (!driver) {
        return res.status(404).json({
          error: 'Driver not found',
          message: 'The specified driver does not exist',
        });
      }
      if (driver.role !== UserRole.DRIVER) {
        return res.status(400).json({
          error: 'Invalid driver',
          message: 'The specified user is not a driver',
        });
      }
    }

    const truck = await Truck.create({
      truckId,
      registrationNumber,
      driverId: driverId || null,
      zone,
      status: status || TruckStatus.OFFLINE,
      capacity: capacity || 100,
      latitude: latitude || null,
      longitude: longitude || null,
      lastMaintenance: new Date(lastMaintenance),
      nextMaintenance: new Date(nextMaintenance),
      lastUpdate: new Date(),
    });

    res.status(201).json({
      message: 'Truck created successfully',
      truck,
    });
  } catch (error: any) {
    console.error('Create truck error:', error);
    res.status(500).json({
      error: 'Failed to create truck',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong',
    });
  }
};

// ============================================
// GET ALL TRUCKS
// GET /api/trucks
// Requires: authenticate (any role)
// ============================================
export const getAllTrucks = async (req: AuthRequest, res: Response) => {
  try {
    const { status, zone } = req.query;

    const where: any = {};
    if (status) where.status = status;
    if (zone) where.zone = zone;

    const trucks = await Truck.findAll({
      where,
      include: [
        {
          model: User,
          as: 'driver',
          attributes: ['id', 'name', 'email', 'phone'],
        },
      ],
      order: [['truckId', 'ASC']],
    });

    res.json({
      count: trucks.length,
      trucks,
    });
  } catch (error: any) {
    console.error('Get all trucks error:', error);
    res.status(500).json({
      error: 'Failed to fetch trucks',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong',
    });
  }
};

// ============================================
// GET TRUCK BY ID
// GET /api/trucks/:id
// Requires: authenticate
// ============================================
export const getTruckById = async (req: AuthRequest, res: Response) => {
  try {
    const truck = await Truck.findByPk(req.params.id, {
      include: [
        {
          model: User,
          as: 'driver',
          attributes: ['id', 'name', 'email', 'phone'],
        },
      ],
    });

    if (!truck) {
      return res.status(404).json({ error: 'Truck not found' });
    }

    res.json({ truck });
  } catch (error: any) {
    console.error('Get truck error:', error);
    res.status(500).json({
      error: 'Failed to fetch truck',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong',
    });
  }
};

// ============================================
// GET MY TRUCK (for drivers)
// GET /api/trucks/my
// Requires: authenticate (driver)
// ============================================
export const getMyTruck = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const truck = await Truck.findOne({
      where: { driverId: req.user.id },
    });

    if (!truck) {
      return res.status(404).json({
        error: 'No truck assigned',
        message: 'You do not have a truck assigned',
      });
    }

    res.json({ truck });
  } catch (error: any) {
    console.error('Get my truck error:', error);
    res.status(500).json({
      error: 'Failed to fetch truck',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong',
    });
  }
};

// ============================================
// UPDATE TRUCK
// PUT /api/trucks/:id
// Requires: admin/management
// ============================================
export const updateTruck = async (req: AuthRequest, res: Response) => {
  try {
    const truck = await Truck.findByPk(req.params.id);
    if (!truck) {
      return res.status(404).json({ error: 'Truck not found' });
    }

    const {
      truckId,
      registrationNumber,
      driverId,
      zone,
      status,
      capacity,
      latitude,
      longitude,
      lastMaintenance,
      nextMaintenance,
    } = req.body;

    // Check duplicate truckId (if changed)
    if (truckId && truckId !== truck.truckId) {
      const existing = await Truck.findOne({ where: { truckId } });
      if (existing) {
        return res.status(409).json({
          error: 'Truck ID already exists',
          message: `A truck with ID "${truckId}" already exists`,
        });
      }
      truck.truckId = truckId;
    }

    // Check duplicate registration (if changed)
    if (registrationNumber && registrationNumber !== truck.registrationNumber) {
      const existing = await Truck.findOne({ where: { registrationNumber } });
      if (existing) {
        return res.status(409).json({
          error: 'Registration already exists',
          message: `A truck with registration "${registrationNumber}" already exists`,
        });
      }
      truck.registrationNumber = registrationNumber;
    }

    // Update driver (allow unassigning)
    if (driverId !== undefined) {
      if (driverId) {
        const driver = await User.findByPk(driverId);
        if (!driver) {
          return res.status(404).json({
            error: 'Driver not found',
            message: 'The specified driver does not exist',
          });
        }
        if (driver.role !== UserRole.DRIVER) {
          return res.status(400).json({
            error: 'Invalid driver',
            message: 'The specified user is not a driver',
          });
        }
      }
      truck.driverId = driverId || null;
    }

    if (zone !== undefined) truck.zone = zone;
    if (status !== undefined) truck.status = status;
    if (capacity !== undefined) truck.capacity = capacity;
    if (latitude !== undefined) truck.latitude = latitude;
    if (longitude !== undefined) truck.longitude = longitude;
    if (lastMaintenance !== undefined) truck.lastMaintenance = new Date(lastMaintenance);
    if (nextMaintenance !== undefined) truck.nextMaintenance = new Date(nextMaintenance);

    truck.lastUpdate = new Date();
    await truck.save();

    res.json({
      message: 'Truck updated successfully',
      truck,
    });
  } catch (error: any) {
    console.error('Update truck error:', error);
    res.status(500).json({
      error: 'Failed to update truck',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong',
    });
  }
};

// ============================================
// UPDATE TRUCK STATUS ONLY
// PATCH /api/trucks/:id/status
// Requires: driver (own truck) or admin
// ============================================
export const updateTruckStatus = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const { status, completion, latitude, longitude } = req.body;

    if (!status) {
      return res.status(400).json({
        error: 'Missing status',
        message: 'status is required',
      });
    }

    const allowedStatuses = Object.values(TruckStatus);
    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        error: 'Invalid status',
        message: `status must be one of: ${allowedStatuses.join(', ')}`,
      });
    }

    const truck = await Truck.findByPk(req.params.id);
    if (!truck) {
      return res.status(404).json({ error: 'Truck not found' });
    }

    // Permission check — driver can update only their own truck
    const isAdmin =
      req.user.role === UserRole.ADMIN || req.user.role === UserRole.MANAGEMENT;
    const isOwnTruck = truck.driverId === req.user.id;

    if (!isAdmin && !isOwnTruck) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You can only update your assigned truck',
      });
    }

    truck.status = status;
    if (completion !== undefined) truck.completion = completion;
    if (latitude !== undefined) truck.latitude = latitude;
    if (longitude !== undefined) truck.longitude = longitude;
    truck.lastUpdate = new Date();

    await truck.save();

    res.json({
      message: 'Truck status updated successfully',
      truck,
    });
  } catch (error: any) {
    console.error('Update truck status error:', error);
    res.status(500).json({
      error: 'Failed to update truck status',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong',
    });
  }
};

// ============================================
// DELETE TRUCK
// DELETE /api/trucks/:id
// Requires: admin/management
// ============================================
export const deleteTruck = async (req: AuthRequest, res: Response) => {
  try {
    const truck = await Truck.findByPk(req.params.id);
    if (!truck) {
      return res.status(404).json({ error: 'Truck not found' });
    }

    await truck.destroy();

    res.json({
      message: 'Truck deleted successfully',
    });
  } catch (error: any) {
    console.error('Delete truck error:', error);
    res.status(500).json({
      error: 'Failed to delete truck',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong',
    });
  }
};

// ============================================
// GET TRUCK STATS (for admin dashboard)
// GET /api/trucks/stats
// Requires: authenticate
// ============================================
export const getTruckStats = async (req: AuthRequest, res: Response) => {
  try {
    const trucks = await Truck.findAll({
      attributes: ['status'],
    });

    const stats = {
      total: trucks.length,
      available: trucks.filter((t) => t.status === TruckStatus.AVAILABLE).length,
      onRoute: trucks.filter((t) => t.status === TruckStatus.ON_ROUTE).length,
      maintenance: trucks.filter((t) => t.status === TruckStatus.MAINTENANCE).length,
      offline: trucks.filter((t) => t.status === TruckStatus.OFFLINE).length,
    };

    res.json({ stats });
  } catch (error: any) {
    console.error('Get truck stats error:', error);
    res.status(500).json({
      error: 'Failed to fetch stats',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong',
    });
  }
};