import { Request, Response } from 'express';
import { Op } from 'sequelize';
import Route, { RouteStatus } from '../models/Route';
import RouteStop, { StopStatus, ComplaintType } from '../models/RouteStop';
import Truck from '../models/Truck';
import Report from '../models/Report';
import User from '../models/User';
import { AuthRequest } from '../middleware/auth';
import {
  ZONES,
  ZoneName,
  isValidZone,
  isSuburbInZone,
  isWithinPortMoresby,
  getZoneForSuburb,
} from '../constants/portMoresbyZones';

// ============================================
// HELPER: Validate a stop's location and suburb
// ============================================
const validateStopData = (
  suburb: string,
  latitude: number,
  longitude: number
): { valid: boolean; message?: string } => {
  if (!isWithinPortMoresby(latitude, longitude)) {
    return {
      valid: false,
      message: `Location (${latitude}, ${longitude}) is outside the Port Moresby service area`,
    };
  }

  const zone = getZoneForSuburb(suburb);
  if (!zone) {
    return {
      valid: false,
      message: `Suburb "${suburb}" is not in our service area`,
    };
  }

  return { valid: true };
};

// ============================================
// CREATE ROUTE
// POST /api/routes
// Requires: admin/management
// ============================================
export const createRoute = async (req: AuthRequest, res: Response) => {
  try {
    const {
      truckId,
      zone,
      suburb,
      scheduledDate,
      scheduledStart,
      scheduledEnd,
      estimatedDuration,
      notes,
      stops, // Array of stop objects
    } = req.body;

    // ============================================
    // VALIDATION
    // ============================================
    if (!truckId || !zone || !suburb || !scheduledDate || !scheduledStart || !scheduledEnd) {
      return res.status(400).json({
        error: 'Missing required fields',
        message: 'truckId, zone, suburb, scheduledDate, scheduledStart, and scheduledEnd are required',
      });
    }

    if (!isValidZone(zone)) {
      return res.status(400).json({
        error: 'Invalid zone',
        message: `zone must be one of: ${Object.keys(ZONES).join(', ')}`,
      });
    }

    if (!isSuburbInZone(suburb, zone as ZoneName)) {
      return res.status(400).json({
        error: 'Invalid suburb',
        message: `"${suburb}" is not in ${zone}. Valid suburbs: ${ZONES[zone as ZoneName].suburbs.join(', ')}`,
      });
    }

    // Validate truck exists
    const truck = await Truck.findByPk(truckId);
    if (!truck) {
      return res.status(404).json({
        error: 'Truck not found',
        message: 'The specified truck does not exist',
      });
    }

    // Validate stops if provided
    if (stops && Array.isArray(stops)) {
      for (let i = 0; i < stops.length; i++) {
        const stop = stops[i];
        if (!stop.address || !stop.suburb || stop.latitude === undefined || stop.longitude === undefined) {
          return res.status(400).json({
            error: `Stop ${i + 1} missing fields`,
            message: 'Each stop requires address, suburb, latitude, and longitude',
          });
        }

        const validation = validateStopData(
          stop.suburb,
          parseFloat(stop.latitude),
          parseFloat(stop.longitude)
        );
        if (!validation.valid) {
          return res.status(400).json({
            error: `Stop ${i + 1} invalid`,
            message: validation.message,
          });
        }
      }
    }

    // ============================================
    // CREATE ROUTE
    // ============================================
    const route = await Route.create({
      truckId,
      zone,
      suburb,
      scheduledDate: new Date(scheduledDate),
      scheduledStart: new Date(scheduledStart),
      scheduledEnd: new Date(scheduledEnd),
      estimatedDuration: estimatedDuration || 480,
      status: RouteStatus.PENDING,
      totalStops: stops ? stops.length : 0,
      completedStops: 0,
      notes: notes || null,
    });

    // ============================================
    // CREATE STOPS (if provided)
    // ============================================
    if (stops && Array.isArray(stops) && stops.length > 0) {
      const stopRecords = stops.map((stop: any, index: number) => ({
        routeId: route.id,
        sequence: stop.sequence || index + 1,
        address: stop.address,
        suburb: stop.suburb,
        latitude: parseFloat(stop.latitude),
        longitude: parseFloat(stop.longitude),
        status: StopStatus.PENDING,
        isComplaintStop: stop.isComplaintStop || false,
        complaintType: stop.complaintType || null,
        reportId: stop.reportId || null,
        notes: stop.notes || null,
      }));

      await RouteStop.bulkCreate(stopRecords);
    }

    // Reload route with stops
    const fullRoute = await Route.findByPk(route.id, {
      include: [
        {
          model: Truck,
          as: 'truck',
          include: [{ model: User, as: 'driver', attributes: ['id', 'name', 'email'] }],
        },
        {
          model: RouteStop,
          as: 'stops',
          separate: true,
          order: [['sequence', 'ASC']],
        },
      ],
    });

    res.status(201).json({
      message: 'Route created successfully',
      route: fullRoute,
    });
  } catch (error: any) {
    console.error('Create route error:', error);
    res.status(500).json({
      error: 'Failed to create route',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong',
    });
  }
};

// ============================================
// GET TODAY'S ROUTE (for driver)
// GET /api/routes/today
// Requires: driver
// ============================================
export const getTodaysRoute = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    // Find the truck assigned to this driver
    const truck = await Truck.findOne({
      where: { driverId: req.user.id },
    });

    if (!truck) {
      return res.status(404).json({
        error: 'No truck assigned',
        message: 'You do not have a truck assigned',
      });
    }

    // Get today's date range (start of day to end of day)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Find today's route for this truck
    const route = await Route.findOne({
      where: {
        truckId: truck.id,
        scheduledDate: {
          [Op.gte]: today,
          [Op.lt]: tomorrow,
        },
      },
      include: [
        {
          model: Truck,
          as: 'truck',
        },
        {
          model: RouteStop,
          as: 'stops',
          separate: true,
          order: [['sequence', 'ASC']],
        },
      ],
    });

    if (!route) {
      return res.status(404).json({
        error: 'No route scheduled',
        message: 'You do not have a route scheduled for today',
      });
    }

    res.json({ route });
  } catch (error: any) {
    console.error('Get today route error:', error);
    res.status(500).json({
      error: 'Failed to fetch today\'s route',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong',
    });
  }
};

// ============================================
// GET ALL ROUTES
// GET /api/routes
// Requires: admin/management
// ============================================
export const getAllRoutes = async (req: AuthRequest, res: Response) => {
  try {
    const { status, zone, date, limit = '50', offset = '0' } = req.query;

    const where: any = {};
    if (status) where.status = status;
    if (zone) where.zone = zone;
    if (date) {
      const d = new Date(date as string);
      d.setHours(0, 0, 0, 0);
      const nextDay = new Date(d);
      nextDay.setDate(nextDay.getDate() + 1);
      where.scheduledDate = { [Op.gte]: d, [Op.lt]: nextDay };
    }

    const { count, rows: routes } = await Route.findAndCountAll({
      where,
      include: [
        {
          model: Truck,
          as: 'truck',
          include: [{ model: User, as: 'driver', attributes: ['id', 'name', 'email'] }],
        },
      ],
      order: [['scheduledDate', 'DESC']],
      limit: parseInt(limit as string),
      offset: parseInt(offset as string),
    });

    res.json({
      total: count,
      limit: parseInt(limit as string),
      offset: parseInt(offset as string),
      routes,
    });
  } catch (error: any) {
    console.error('Get all routes error:', error);
    res.status(500).json({
      error: 'Failed to fetch routes',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong',
    });
  }
};

// ============================================
// GET ROUTE BY ID
// GET /api/routes/:id
// Requires: authenticated (any role)
// ============================================
export const getRouteById = async (req: AuthRequest, res: Response) => {
  try {
    const route = await Route.findByPk(req.params.id, {
      include: [
        {
          model: Truck,
          as: 'truck',
          include: [{ model: User, as: 'driver', attributes: ['id', 'name', 'email'] }],
        },
        {
          model: RouteStop,
          as: 'stops',
          separate: true,
          order: [['sequence', 'ASC']],
        },
      ],
    });

    if (!route) {
      return res.status(404).json({ error: 'Route not found' });
    }

    res.json({ route });
  } catch (error: any) {
    console.error('Get route error:', error);
    res.status(500).json({
      error: 'Failed to fetch route',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong',
    });
  }
};

// ============================================
// UPDATE ROUTE STATUS
// PATCH /api/routes/:id/status
// Requires: driver (own route) or admin
// ============================================
export const updateRouteStatus = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ error: 'status is required' });
    }

    const allowedStatuses = Object.values(RouteStatus);
    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        error: 'Invalid status',
        message: `status must be one of: ${allowedStatuses.join(', ')}`,
      });
    }

    const route = await Route.findByPk(req.params.id, {
      include: [{ model: Truck, as: 'truck' }],
    });

    if (!route) {
      return res.status(404).json({ error: 'Route not found' });
    }

    const isAdmin = req.user.role === 'admin' || req.user.role === 'management';
    const isOwnRoute = (route as any).truck?.driverId === req.user.id;

    if (!isAdmin && !isOwnRoute) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You can only update your own routes',
      });
    }

    route.status = status;
    await route.save();

    res.json({
      message: 'Route status updated successfully',
      route,
    });
  } catch (error: any) {
    console.error('Update route status error:', error);
    res.status(500).json({
      error: 'Failed to update route status',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong',
    });
  }
};

// ============================================
// DELETE ROUTE
// DELETE /api/routes/:id
// Requires: admin/management
// ============================================
export const deleteRoute = async (req: AuthRequest, res: Response) => {
  try {
    const route = await Route.findByPk(req.params.id);
    if (!route) {
      return res.status(404).json({ error: 'Route not found' });
    }

    await route.destroy();

    res.json({ message: 'Route deleted successfully' });
  } catch (error: any) {
    console.error('Delete route error:', error);
    res.status(500).json({
      error: 'Failed to delete route',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong',
    });
  }
};

// ============================================
// GET ROUTE STATS
// GET /api/routes/stats
// Requires: admin/management
// ============================================
export const getRouteStats = async (req: AuthRequest, res: Response) => {
  try {
    const routes = await Route.findAll({
      attributes: ['status'],
    });

    const stats = {
      total: routes.length,
      pending: routes.filter((r) => r.status === RouteStatus.PENDING).length,
      inProgress: routes.filter((r) => r.status === RouteStatus.IN_PROGRESS).length,
      completed: routes.filter((r) => r.status === RouteStatus.COMPLETED).length,
      delayed: routes.filter((r) => r.status === RouteStatus.DELAYED).length,
    };

    res.json({ stats });
  } catch (error: any) {
    console.error('Get route stats error:', error);
    res.status(500).json({
      error: 'Failed to fetch route stats',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong',
    });
  }
};
// ============================================
// COMPLETE A STOP
// PATCH /api/routes/:routeId/stops/:stopId/complete
// Requires: driver (own route) or admin
// ============================================
export const completeStop = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const { beforePhoto, afterPhoto, notes } = req.body;

    // Find the stop with its route and truck
    const stop = await RouteStop.findByPk(req.params.stopId, {
      include: [
        {
          model: Route,
          as: 'route',
          include: [{ model: Truck, as: 'truck' }],
        },
      ],
    });

    if (!stop) {
      return res.status(404).json({ error: 'Stop not found' });
    }

    const route = (stop as any).route;
    if (route.id !== req.params.routeId) {
      return res.status(400).json({
        error: 'Stop does not belong to this route',
      });
    }

    // Permission check
    const isAdmin = req.user.role === 'admin' || req.user.role === 'management';
    const isOwnRoute = route.truck?.driverId === req.user.id;

    if (!isAdmin && !isOwnRoute) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You can only complete stops on your own route',
      });
    }

    // ============================================
    // VALIDATION: Complaint stops require photos
    // ============================================
    if (stop.isComplaintStop) {
      if (!beforePhoto || !afterPhoto) {
        return res.status(400).json({
          error: 'Photos required',
          message: 'Complaint stops require both before and after photos',
        });
      }
    }

    // ============================================
    // UPDATE STOP
    // ============================================
    stop.status = StopStatus.COMPLETED;
    stop.completedAt = new Date();

    if (beforePhoto !== undefined) stop.beforePhoto = beforePhoto;
    if (afterPhoto !== undefined) stop.afterPhoto = afterPhoto;
    if (notes !== undefined) stop.notes = notes;

    await stop.save();

    // ============================================
    // UPDATE ROUTE PROGRESS
    // ============================================
    const completedCount = await RouteStop.count({
      where: {
        routeId: route.id,
        status: StopStatus.COMPLETED,
      },
    });

    route.completedStops = completedCount;

    // Auto-complete route if all stops are done
    if (completedCount >= route.totalStops) {
      route.status = RouteStatus.COMPLETED;
    } else if (route.status === RouteStatus.PENDING) {
      route.status = RouteStatus.IN_PROGRESS;
    }

    await route.save();

    // ============================================
    // IF COMPLAINT STOP — UPDATE LINKED REPORT
    // ============================================
    if (stop.isComplaintStop && stop.reportId) {
      const report = await Report.findByPk(stop.reportId);
      if (report && report.status !== 'resolved') {
        report.status = 'resolved' as any;
        report.resolvedAt = new Date();
        await report.save();
      }
    }

    // Reload stop
    const updatedStop = await RouteStop.findByPk(stop.id);

    res.json({
      message: 'Stop completed successfully',
      stop: updatedStop,
      routeProgress: {
        completedStops: route.completedStops,
        totalStops: route.totalStops,
        progressPercent:
          route.totalStops > 0
            ? Math.round((completedCount / route.totalStops) * 100)
            : 0,
        routeStatus: route.status,
      },
    });
  } catch (error: any) {
    console.error('Complete stop error:', error);
    res.status(500).json({
      error: 'Failed to complete stop',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong',
    });
  }
};

// ============================================
// SKIP A STOP
// PATCH /api/routes/:routeId/stops/:stopId/skip
// Requires: driver (own route) or admin
// ============================================
export const skipStop = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const { reason } = req.body;

    if (!reason || !reason.trim()) {
      return res.status(400).json({
        error: 'Reason required',
        message: 'A reason is required to skip a stop',
      });
    }

    const stop = await RouteStop.findByPk(req.params.stopId, {
      include: [
        {
          model: Route,
          as: 'route',
          include: [{ model: Truck, as: 'truck' }],
        },
      ],
    });

    if (!stop) {
      return res.status(404).json({ error: 'Stop not found' });
    }

    const route = (stop as any).route;
    if (route.id !== req.params.routeId) {
      return res.status(400).json({
        error: 'Stop does not belong to this route',
      });
    }

    // Permission check
    const isAdmin = req.user.role === 'admin' || req.user.role === 'management';
    const isOwnRoute = route.truck?.driverId === req.user.id;

    if (!isAdmin && !isOwnRoute) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You can only skip stops on your own route',
      });
    }

    if (stop.status === StopStatus.COMPLETED) {
      return res.status(400).json({
        error: 'Cannot skip',
        message: 'This stop is already completed',
      });
    }

    stop.status = StopStatus.SKIPPED;
    stop.skippedReason = reason.trim();
    stop.completedAt = new Date(); // Mark when it was handled

    await stop.save();

    // Update route progress
    const handledCount = await RouteStop.count({
      where: {
        routeId: route.id,
        status: { [Op.in]: [StopStatus.COMPLETED, StopStatus.SKIPPED] },
      },
    });

    if (handledCount >= route.totalStops) {
      route.status = RouteStatus.COMPLETED;
    } else if (route.status === RouteStatus.PENDING) {
      route.status = RouteStatus.IN_PROGRESS;
    }

    await route.save();

    res.json({
      message: 'Stop skipped successfully',
      stop,
    });
  } catch (error: any) {
    console.error('Skip stop error:', error);
    res.status(500).json({
      error: 'Failed to skip stop',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong',
    });
  }
};

// ============================================
// UPDATE STOP NOTES
// PATCH /api/routes/:routeId/stops/:stopId/notes
// Requires: driver (own route) or admin
// ============================================
export const updateStopNotes = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const { notes } = req.body;

    const stop = await RouteStop.findByPk(req.params.stopId, {
      include: [
        {
          model: Route,
          as: 'route',
          include: [{ model: Truck, as: 'truck' }],
        },
      ],
    });

    if (!stop) {
      return res.status(404).json({ error: 'Stop not found' });
    }

    const route = (stop as any).route;
    if (route.id !== req.params.routeId) {
      return res.status(400).json({
        error: 'Stop does not belong to this route',
      });
    }

    // Permission check
    const isAdmin = req.user.role === 'admin' || req.user.role === 'management';
    const isOwnRoute = route.truck?.driverId === req.user.id;

    if (!isAdmin && !isOwnRoute) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You can only update notes on your own route',
      });
    }

    stop.notes = notes || null;
    await stop.save();

    res.json({
      message: 'Stop notes updated',
      stop,
    });
  } catch (error: any) {
    console.error('Update stop notes error:', error);
    res.status(500).json({
      error: 'Failed to update notes',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong',
    });
  }
};

// ============================================
// ADD STOPS TO EXISTING ROUTE
// POST /api/routes/:id/stops
// Requires: admin/management
// ============================================
export const addStopsToRoute = async (req: AuthRequest, res: Response) => {
  try {
    const { stops } = req.body;

    if (!stops || !Array.isArray(stops) || stops.length === 0) {
      return res.status(400).json({
        error: 'Missing stops',
        message: 'stops must be a non-empty array',
      });
    }

    const route = await Route.findByPk(req.params.id);
    if (!route) {
      return res.status(404).json({ error: 'Route not found' });
    }

    // Validate each stop
    for (let i = 0; i < stops.length; i++) {
      const stop = stops[i];
      if (!stop.address || !stop.suburb || stop.latitude === undefined || stop.longitude === undefined) {
        return res.status(400).json({
          error: `Stop ${i + 1} missing fields`,
          message: 'Each stop requires address, suburb, latitude, and longitude',
        });
      }

      const validation = validateStopData(
        stop.suburb,
        parseFloat(stop.latitude),
        parseFloat(stop.longitude)
      );
      if (!validation.valid) {
        return res.status(400).json({
          error: `Stop ${i + 1} invalid`,
          message: validation.message,
        });
      }
    }

    // Get current max sequence
    const maxSeq = await RouteStop.max('sequence', {
      where: { routeId: route.id },
    }) as number | null;

    const startSeq = (maxSeq || 0) + 1;

    const stopRecords = stops.map((stop: any, index: number) => ({
      routeId: route.id,
      sequence: stop.sequence || startSeq + index,
      address: stop.address,
      suburb: stop.suburb,
      latitude: parseFloat(stop.latitude),
      longitude: parseFloat(stop.longitude),
      status: StopStatus.PENDING,
      isComplaintStop: stop.isComplaintStop || false,
      complaintType: stop.complaintType || null,
      reportId: stop.reportId || null,
      notes: stop.notes || null,
    }));

    await RouteStop.bulkCreate(stopRecords);

    // Update route totalStops
    route.totalStops += stops.length;
    await route.save();

    // Reload route
    const fullRoute = await Route.findByPk(route.id, {
      include: [
        {
          model: RouteStop,
          as: 'stops',
          separate: true,
          order: [['sequence', 'ASC']],
        },
      ],
    });

    res.json({
      message: `${stops.length} stop(s) added to route`,
      route: fullRoute,
    });
  } catch (error: any) {
    console.error('Add stops error:', error);
    res.status(500).json({
      error: 'Failed to add stops',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong',
    });
  }
};

// ============================================
// DELETE A STOP
// DELETE /api/routes/:routeId/stops/:stopId
// Requires: admin/management
// ============================================
export const deleteStop = async (req: AuthRequest, res: Response) => {
  try {
    const stop = await RouteStop.findByPk(req.params.stopId);
    if (!stop) {
      return res.status(404).json({ error: 'Stop not found' });
    }

    if (stop.routeId !== req.params.routeId) {
      return res.status(400).json({
        error: 'Stop does not belong to this route',
      });
    }

    const routeId = stop.routeId;
    await stop.destroy();

    // Update route totalStops
    const route = await Route.findByPk(routeId);
    if (route) {
      route.totalStops = Math.max(0, route.totalStops - 1);
      await route.save();
    }

    res.json({ message: 'Stop deleted successfully' });
  } catch (error: any) {
    console.error('Delete stop error:', error);
    res.status(500).json({
      error: 'Failed to delete stop',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong',
    });
  }
};

// ============================================
// AUTO-CREATE ROUTE FROM COMPLAINTS
// POST /api/routes/from-complaints
// Requires: admin/management
// Creates a route with stops derived from pending complaints
// ============================================
export const createRouteFromComplaints = async (req: AuthRequest, res: Response) => {
  try {
    const { truckId, zone, scheduledDate, scheduledStart, scheduledEnd } = req.body;

    if (!truckId || !zone || !scheduledDate || !scheduledStart || !scheduledEnd) {
      return res.status(400).json({
        error: 'Missing required fields',
        message: 'truckId, zone, scheduledDate, scheduledStart, and scheduledEnd are required',
      });
    }

    if (!isValidZone(zone)) {
      return res.status(400).json({ error: 'Invalid zone' });
    }

    // Find pending reports in this zone's suburbs
    const zoneSuburbs = ZONES[zone as ZoneName].suburbs;
    const reports = await Report.findAll({
      where: {
        status: 'pending',
        address: {
          [Op.or]: zoneSuburbs.map((suburb) => ({
            [Op.like]: `%${suburb}%`,
          })),
        },
      },
      limit: 20,
    });

    if (reports.length === 0) {
      return res.status(404).json({
        error: 'No complaints found',
        message: `No pending complaints found in ${zone}`,
      });
    }

    // Create route
    const route = await Route.create({
      truckId,
      zone,
      suburb: zoneSuburbs[0],
      scheduledDate: new Date(scheduledDate),
      scheduledStart: new Date(scheduledStart),
      scheduledEnd: new Date(scheduledEnd),
      estimatedDuration: 480,
      status: RouteStatus.PENDING,
      totalStops: reports.length,
      completedStops: 0,
      notes: `Auto-generated from ${reports.length} complaint(s)`,
    });

    // Create stops from reports
    const stopRecords = reports.map((report, index) => ({
      routeId: route.id,
      sequence: index + 1,
      address: report.address,
      suburb: getZoneForSuburb(zoneSuburbs[0]) ? zoneSuburbs[0] : 'Unknown',
      latitude: parseFloat(report.latitude?.toString() || '-9.4438'),
      longitude: parseFloat(report.longitude?.toString() || '147.1803'),
      status: StopStatus.PENDING,
      isComplaintStop: true,
      complaintType: report.issueType as any,
      reportId: report.id,
    }));

    await RouteStop.bulkCreate(stopRecords);

    const fullRoute = await Route.findByPk(route.id, {
      include: [
        {
          model: RouteStop,
          as: 'stops',
          separate: true,
          order: [['sequence', 'ASC']],
        },
      ],
    });

    res.status(201).json({
      message: `Route created from ${reports.length} complaint(s)`,
      route: fullRoute,
    });
  } catch (error: any) {
    console.error('Create route from complaints error:', error);
    res.status(500).json({
      error: 'Failed to create route',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong',
    });
  }
};