import { Request, Response } from 'express';
import { Op } from 'sequelize';
import Route, { RouteStatus } from '../models/Route';
import RouteStop, { StopStatus, ComplaintType } from '../models/RouteStop';
import Truck, { TruckStatus } from '../models/Truck';
import Report from '../models/Report';
import ReportComment from '../models/ReportComment';
import User from '../models/User';
import { AuthRequest } from '../middleware/auth';
import {
  ZONES,
  ZoneName,
  isValidZone,
  isSuburbInZone,
  isWithinPortMoresby,
  getZoneForSuburb,
  isWorkingDayForZone,
  getWorkingDaysForZone,
} from '../constants/portMoresbyZones';

// ============================================
// HELPER: Default Route Times (8:00 AM - 4:00 PM)
// ============================================
const getDefaultRouteTimes = (dateString: string) => {
  const date = new Date(dateString);

  const start = new Date(date);
  start.setHours(8, 0, 0, 0);

  const end = new Date(date);
  end.setHours(16, 0, 0, 0);

  return { defaultStart: start, defaultEnd: end };
};

// ============================================
// HELPER: Validate a stop's location and suburb
// ============================================
const validateStopData = (
  suburb: string,
  latitude: number,
  longitude: number
): { valid: boolean; message?: string } => {
  if (isNaN(latitude) || isNaN(longitude)) {
    return { valid: false, message: 'Latitude and longitude must be valid numbers' };
  }

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
// HELPER: Standard error response
// ============================================
const handleError = (res: Response, error: any, fallbackMessage: string) => {
  console.error(fallbackMessage, error);
  res.status(500).json({
    error: fallbackMessage,
    message:
      process.env.NODE_ENV === 'development'
        ? error.message
        : 'Something went wrong',
  });
};

// ============================================
// HELPER: Update truck status based on route progress
// ============================================
const updateTruckStatusFromRoute = async (
  routeId: string,
  completedCount: number,
  handledCount: number
) => {
  try {
    const route = await Route.findByPk(routeId);
    if (!route) {
      console.log(`⚠️ No route found with ID ${routeId}`);
      return;
    }

    const truck = await Truck.findByPk(route.truckId);
    if (!truck) {
      console.log(`⚠️ No truck found for route ${routeId} (truckId: ${route.truckId})`);
      return;
    }

    const totalStops = route.totalStops || 0;

    truck.completion =
      totalStops > 0 ? Math.round((completedCount / totalStops) * 100) : 0;

    const allStopsHandled = handledCount >= totalStops;

    const currentStatus = String(truck.status).toLowerCase();
    const canAutoUpdate =
      currentStatus === 'available' || currentStatus === 'on-route';

    console.log(
      `🚛 Truck ${truck.truckId}: status="${currentStatus}", completion=${truck.completion}%, handled=${handledCount}/${totalStops}`
    );

    if (canAutoUpdate) {
      if (allStopsHandled) {
        truck.status = 'available' as TruckStatus;
        console.log(`✅ Set ${truck.truckId} → AVAILABLE (all stops handled)`);
      } else if (handledCount > 0) {
        truck.status = 'on-route' as TruckStatus;
        console.log(`✅ Set ${truck.truckId} → ON_ROUTE`);
      }
    } else {
      console.log(
        `⏸️ Skipped auto-update for ${truck.truckId} (status is ${currentStatus}, preserved)`
      );
    }

    await truck.save();
  } catch (error: any) {
    console.error('Error updating truck status:', error);
  }
};

// ============================================
// CREATE ROUTE
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
      stops,
    } = req.body;

    if (!truckId || !zone || !suburb || !scheduledDate) {
      return res.status(400).json({
        error: 'Missing required fields',
        message: 'truckId, zone, suburb, and scheduledDate are required',
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
        message: `"${suburb}" is not in ${zone}. Valid suburbs: ${ZONES[
          zone as ZoneName
        ].suburbs.join(', ')}`,
      });
    }

    const scheduledDateObj = new Date(scheduledDate);

    if (!isWorkingDayForZone(scheduledDateObj, zone)) {
      const dayName = scheduledDateObj.toLocaleDateString('en-US', {
        weekday: 'long',
      });
      const workingDays = getWorkingDaysForZone(zone);
      return res.status(400).json({
        error: 'Not a collection day',
        message: `${zone} does not collect on ${dayName}s. Collection days: ${workingDays.join(', ')}`,
      });
    }

    const truck = await Truck.findByPk(truckId);
    if (!truck) {
      return res.status(404).json({
        error: 'Truck not found',
        message: 'The specified truck does not exist',
      });
    }

    const { defaultStart, defaultEnd } = getDefaultRouteTimes(scheduledDate);

    const finalStart = scheduledStart ? new Date(scheduledStart) : defaultStart;
    const finalEnd = scheduledEnd ? new Date(scheduledEnd) : defaultEnd;

    const finalDuration =
      estimatedDuration ||
      Math.round((finalEnd.getTime() - finalStart.getTime()) / (1000 * 60));

    if (stops && Array.isArray(stops)) {
      for (let i = 0; i < stops.length; i++) {
        const stop = stops[i];
        if (
          !stop.address ||
          !stop.suburb ||
          stop.latitude === undefined ||
          stop.longitude === undefined
        ) {
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

    const route = await Route.create({
      truckId,
      zone,
      suburb,
      scheduledDate: new Date(scheduledDate),
      scheduledStart: finalStart,
      scheduledEnd: finalEnd,
      estimatedDuration: finalDuration,
      status: RouteStatus.PENDING,
      totalStops: stops ? stops.length : 0,
      completedStops: 0,
      notes: notes || null,
    });

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
    handleError(res, error, 'Failed to create route');
  }
};

// ============================================
// GET TODAY'S ROUTE (for driver)
// ✅ IMPROVEMENT 3: Attaches reportComments AND reportPhotos to complaint stops
// ============================================
export const getTodaysRoute = async (req: AuthRequest, res: Response) => {
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

    const today = new Date();

    if (!isWorkingDayForZone(today, truck.zone)) {
      const dayName = today.toLocaleDateString('en-US', { weekday: 'long' });
      const workingDays = getWorkingDaysForZone(truck.zone);
      return res.status(404).json({
        error: 'Not a collection day',
        message: `${truck.zone} does not collect on ${dayName}s. Collection days: ${workingDays.join(', ')}`,
      });
    }

    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const includeArray: any[] = [
      {
        model: Truck,
        as: 'truck',
        include: [
          { model: User, as: 'driver', attributes: ['id', 'name', 'email'] },
        ],
      },
      {
        model: RouteStop,
        as: 'stops',
        separate: true,
        order: [['sequence', 'ASC']],
      },
    ];

    let route = await Route.findOne({
      where: {
        truckId: truck.id,
        scheduledDate: {
          [Op.gte]: today,
          [Op.lt]: tomorrow,
        },
      },
      include: includeArray,
    });

    if (!route) {
      console.log(
        `No route scheduled for today for truck ${truck.truckId}. Fetching latest route...`
      );

      route = await Route.findOne({
        where: { truckId: truck.id },
        order: [['scheduledDate', 'DESC']],
        include: includeArray,
      });

      if (!route) {
        return res.status(404).json({
          error: 'No route scheduled',
          message: 'You do not have any routes scheduled',
        });
      }
    }

    // ✅ Attach comments + photos to complaint stops
    const routeJson = route.toJSON() as any;
    const complaintStops = (routeJson.stops || []).filter(
      (s: any) => s.isComplaintStop && s.reportId
    );

    if (complaintStops.length > 0) {
      const reportIds = complaintStops.map((s: any) => s.reportId);

      // Fetch public comments
      const comments = await ReportComment.findAll({
        where: {
          reportId: { [Op.in]: reportIds },
          isInternal: false,
        },
        include: [
          {
            model: User,
            as: 'author',
            attributes: ['id', 'name', 'role'],
          },
        ],
        order: [['createdAt', 'ASC']],
      });

      // Group comments by reportId
      const commentsByReport: Record<string, any[]> = {};
      comments.forEach((c: any) => {
        const cj = c.toJSON();
        if (!commentsByReport[cj.reportId]) commentsByReport[cj.reportId] = [];
        commentsByReport[cj.reportId].push({
          id: cj.id,
          content: cj.content,
          createdAt: cj.createdAt,
          authorName: cj.author?.name || 'Admin',
          authorRole: cj.author?.role || 'admin',
        });
      });

      // ✅ Fetch photos + adminResponse from linked reports
      const reports = await Report.findAll({
        where: { id: { [Op.in]: reportIds } },
        attributes: ['id', 'photos', 'adminResponse', 'adminRespondedAt'],
      });

      const reportsById: Record<string, any> = {};
      reports.forEach((r: any) => {
        const rj = r.toJSON();
        reportsById[rj.id] = {
          photos: rj.photos || [],
          adminResponse: rj.adminResponse || null,
          adminRespondedAt: rj.adminRespondedAt || null,
        };
      });

      // Attach everything to complaint stops
      routeJson.stops = routeJson.stops.map((s: any) => {
        if (s.isComplaintStop && s.reportId) {
          const reportData = reportsById[s.reportId] || {};
          return {
            ...s,
            reportComments: commentsByReport[s.reportId] || [],
            reportPhotos: reportData.photos || [],
            reportAdminResponse: reportData.adminResponse || null,
            reportAdminRespondedAt: reportData.adminRespondedAt || null,
          };
        }
        return s;
      });
    }

    res.json({ route: routeJson });
  } catch (error: any) {
    handleError(res, error, "Failed to fetch today's route");
  }
};

// ============================================
// GET ROUTE BY TRUCK ID
// ============================================
export const getRouteByTruckId = async (req: AuthRequest, res: Response) => {
  try {
    const { truckId } = req.params;

    const truck = await Truck.findOne({
      where: { truckId: truckId },
    });

    if (!truck) {
      return res.status(404).json({
        error: 'Truck not found',
        message: `No truck found with ID ${truckId}`,
      });
    }

    const route = await Route.findOne({
      where: { truckId: truck.id },
      order: [['scheduledDate', 'DESC']],
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
      return res.status(404).json({
        error: 'No route found',
        message: `No route found for truck ${truckId}`,
      });
    }

    res.json({ route });
  } catch (error: any) {
    handleError(res, error, 'Failed to fetch route');
  }
};

// ============================================
// GET ROUTE BY DRIVER ID
// ============================================
export const getRouteByDriverId = async (req: AuthRequest, res: Response) => {
  try {
    const { driverId } = req.params;

    const truck = await Truck.findOne({ where: { driverId } });

    if (!truck) {
      return res.status(404).json({
        error: 'No truck assigned',
        message: `Driver ${driverId} has no truck assigned`,
      });
    }

    const route = await Route.findOne({
      where: { truckId: truck.id },
      order: [['scheduledDate', 'DESC']],
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
      return res.status(404).json({
        error: 'No route found',
        message: `No route found for driver ${driverId}`,
      });
    }

    res.json({ route });
  } catch (error: any) {
    handleError(res, error, 'Failed to fetch route by driver');
  }
};

// ============================================
// GET ALL ROUTES
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
        {
          model: RouteStop,
          as: 'stops',
          separate: true,
          order: [['sequence', 'ASC']],
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
    handleError(res, error, 'Failed to fetch routes');
  }
};

// ============================================
// GET ROUTE BY ID
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
    handleError(res, error, 'Failed to fetch route');
  }
};

// ============================================
// UPDATE ROUTE STATUS
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
    handleError(res, error, 'Failed to update route status');
  }
};

// ============================================
// DELETE ROUTE
// ============================================
export const deleteRoute = async (req: AuthRequest, res: Response) => {
  try {
    const route = await Route.findByPk(req.params.id);
    if (!route) {
      return res.status(404).json({ error: 'Route not found' });
    }

    await RouteStop.destroy({ where: { routeId: route.id } });
    await route.destroy();

    res.json({ message: 'Route deleted successfully' });
  } catch (error: any) {
    handleError(res, error, 'Failed to delete route');
  }
};

// ============================================
// GET ROUTE STATS
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
    handleError(res, error, 'Failed to fetch route stats');
  }
};

// ============================================
// COMPLETE A STOP
// ============================================
export const completeStop = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const { beforePhoto, afterPhoto, notes } = req.body;

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

    const isAdmin = req.user.role === 'admin' || req.user.role === 'management';
    const isOwnRoute = route.truck?.driverId === req.user.id;

    if (!isAdmin && !isOwnRoute) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You can only complete stops on your own route',
      });
    }

    if (stop.status === StopStatus.COMPLETED) {
      return res.status(400).json({
        error: 'Already completed',
        message: 'This stop has already been completed',
      });
    }

    if (stop.isComplaintStop) {
      if (!beforePhoto || !afterPhoto) {
        return res.status(400).json({
          error: 'Photos required',
          message: 'Complaint stops require both before and after photos',
        });
      }
    }

    stop.status = StopStatus.COMPLETED;
    stop.completedAt = new Date();

    if (beforePhoto !== undefined) stop.beforePhoto = beforePhoto;
    if (afterPhoto !== undefined) stop.afterPhoto = afterPhoto;
    if (notes !== undefined) stop.notes = notes;

    await stop.save();

    const completedCount = await RouteStop.count({
      where: {
        routeId: route.id,
        status: StopStatus.COMPLETED,
      },
    });

    const handledCount = await RouteStop.count({
      where: {
        routeId: route.id,
        status: { [Op.in]: [StopStatus.COMPLETED, StopStatus.SKIPPED] },
      },
    });

    route.completedStops = completedCount;

    if (!route.actualStart && handledCount > 0) {
      route.actualStart = new Date();
      console.log(
        `⏱️ Route ${route.id} actualStart recorded: ${route.actualStart.toISOString()}`
      );
    }

    const allStopsHandled = handledCount >= route.totalStops;

    if (allStopsHandled) {
      route.status = RouteStatus.COMPLETED;
      if (!route.actualEnd) {
        route.actualEnd = new Date();
        console.log(
          `⏱️ Route ${route.id} actualEnd recorded: ${route.actualEnd.toISOString()}`
        );
      }
    } else if (route.status === RouteStatus.PENDING) {
      route.status = RouteStatus.IN_PROGRESS;
    }

    await route.save();

    await updateTruckStatusFromRoute(route.id, completedCount, handledCount);

    // ✅ IMPROVEMENT 4 + #4: Handle complaint stop completion + removal
    if (stop.isComplaintStop && stop.reportId) {
      const report = await Report.findByPk(stop.reportId);
      if (report && report.status !== 'resolved') {
        report.status = 'resolved' as any;
        report.resolvedAt = new Date();
        await report.save();
      }

      // Remove the complaint stop from the route (they don't persist)
      await stop.destroy();

      // Recalculate route stats after removal
      const newCompletedCount = await RouteStop.count({
        where: { routeId: route.id, status: StopStatus.COMPLETED },
      });
      const newHandledCount = await RouteStop.count({
        where: {
          routeId: route.id,
          status: { [Op.in]: [StopStatus.COMPLETED, StopStatus.SKIPPED] },
        },
      });

      route.totalStops = Math.max(0, route.totalStops - 1);
      route.completedStops = newCompletedCount;

      if (route.totalStops === 0 || newHandledCount >= route.totalStops) {
        route.status = RouteStatus.COMPLETED;
        if (!route.actualEnd) route.actualEnd = new Date();
      }

      await route.save();

      return res.json({
        message: 'Complaint stop completed and removed from route',
        stop: null,
        routeProgress: {
          completedStops: route.completedStops,
          totalStops: route.totalStops,
          progressPercent:
            route.totalStops > 0
              ? Math.round((newCompletedCount / route.totalStops) * 100)
              : 100,
          routeStatus: route.status,
        },
      });
    }

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
    handleError(res, error, 'Failed to complete stop');
  }
};

// ============================================
// SKIP A STOP
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

    if (stop.status === StopStatus.SKIPPED) {
      return res.status(400).json({
        error: 'Already skipped',
        message: 'This stop has already been skipped',
      });
    }

    stop.status = StopStatus.SKIPPED;
    stop.skippedReason = reason.trim();
    stop.completedAt = new Date();

    await stop.save();

    const completedCount = await RouteStop.count({
      where: {
        routeId: route.id,
        status: StopStatus.COMPLETED,
      },
    });

    const handledCount = await RouteStop.count({
      where: {
        routeId: route.id,
        status: { [Op.in]: [StopStatus.COMPLETED, StopStatus.SKIPPED] },
      },
    });

    if (!route.actualStart && handledCount > 0) {
      route.actualStart = new Date();
      console.log(
        `⏱️ Route ${route.id} actualStart recorded (via skip): ${route.actualStart.toISOString()}`
      );
    }

    const allStopsHandled = handledCount >= route.totalStops;

    if (allStopsHandled) {
      route.status = RouteStatus.COMPLETED;
      if (!route.actualEnd) {
        route.actualEnd = new Date();
        console.log(
          `⏱️ Route ${route.id} actualEnd recorded (via skip): ${route.actualEnd.toISOString()}`
        );
      }
    } else if (route.status === RouteStatus.PENDING) {
      route.status = RouteStatus.IN_PROGRESS;
    }

    await route.save();

    await updateTruckStatusFromRoute(route.id, completedCount, handledCount);

    res.json({
      message: 'Stop skipped successfully',
      stop,
    });
  } catch (error: any) {
    handleError(res, error, 'Failed to skip stop');
  }
};

// ============================================
// UPDATE STOP NOTES
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
    handleError(res, error, 'Failed to update notes');
  }
};

// ============================================
// ADD STOPS TO EXISTING ROUTE
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

    for (let i = 0; i < stops.length; i++) {
      const stop = stops[i];
      if (
        !stop.address ||
        !stop.suburb ||
        stop.latitude === undefined ||
        stop.longitude === undefined
      ) {
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

    const maxSeq = (await RouteStop.max('sequence', {
      where: { routeId: route.id },
    })) as number | null;

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

    route.totalStops += stops.length;
    await route.save();

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
    handleError(res, error, 'Failed to add stops');
  }
};

// ============================================
// DELETE A STOP
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

    const route = await Route.findByPk(routeId);
    if (route) {
      route.totalStops = Math.max(0, route.totalStops - 1);
      await route.save();
    }

    res.json({ message: 'Stop deleted successfully' });
  } catch (error: any) {
    handleError(res, error, 'Failed to delete stop');
  }
};

// ============================================
// AUTO-CREATE ROUTE FROM COMPLAINTS
// ============================================
export const createRouteFromComplaints = async (req: AuthRequest, res: Response) => {
  try {
    const { truckId, zone, scheduledDate, scheduledStart, scheduledEnd } = req.body;

    if (!truckId || !zone || !scheduledDate) {
      return res.status(400).json({
        error: 'Missing required fields',
        message: 'truckId, zone, and scheduledDate are required',
      });
    }

    if (!isValidZone(zone)) {
      return res.status(400).json({ error: 'Invalid zone' });
    }

    const scheduledDateObj = new Date(scheduledDate);

    if (!isWorkingDayForZone(scheduledDateObj, zone)) {
      const dayName = scheduledDateObj.toLocaleDateString('en-US', {
        weekday: 'long',
      });
      const workingDays = getWorkingDaysForZone(zone);
      return res.status(400).json({
        error: 'Not a collection day',
        message: `${zone} does not collect on ${dayName}s. Collection days: ${workingDays.join(', ')}`,
      });
    }

    const truck = await Truck.findByPk(truckId);
    if (!truck) {
      return res.status(404).json({ error: 'Truck not found' });
    }

    const { defaultStart, defaultEnd } = getDefaultRouteTimes(scheduledDate);

    const finalStart = scheduledStart ? new Date(scheduledStart) : defaultStart;
    const finalEnd = scheduledEnd ? new Date(scheduledEnd) : defaultEnd;

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

    const route = await Route.create({
      truckId,
      zone,
      suburb: zoneSuburbs[0],
      scheduledDate: new Date(scheduledDate),
      scheduledStart: finalStart,
      scheduledEnd: finalEnd,
      estimatedDuration: 480,
      status: RouteStatus.PENDING,
      totalStops: reports.length,
      completedStops: 0,
      notes: `Auto-generated from ${reports.length} complaint(s)`,
    });

    const stopRecords = reports.map((report, index) => {
      const reportSuburb =
        zoneSuburbs.find((suburb) =>
          report.address.toLowerCase().includes(suburb.toLowerCase())
        ) || zoneSuburbs[0];

      return {
        routeId: route.id,
        sequence: index + 1,
        address: report.address,
        suburb: reportSuburb,
        latitude: parseFloat(report.latitude?.toString() || '-9.4438'),
        longitude: parseFloat(report.longitude?.toString() || '147.1803'),
        status: StopStatus.PENDING,
        isComplaintStop: true,
        complaintType: report.issueType as any,
        reportId: report.id,
      };
    });

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
    handleError(res, error, 'Failed to create route from complaints');
  }
};

// ============================================
// MIGRATION: Fix existing route times
// ============================================
export const fixRouteTimes = async (req: AuthRequest, res: Response) => {
  try {
    const routes = await Route.findAll();

    let updatedCount = 0;

    for (const route of routes) {
      const date = new Date(route.scheduledDate);

      const start = new Date(date);
      start.setHours(8, 0, 0, 0);

      const end = new Date(date);
      end.setHours(16, 0, 0, 0);

      route.scheduledStart = start;
      route.scheduledEnd = end;
      await route.save();

      updatedCount++;
    }

    res.json({
      message: `Updated ${updatedCount} routes to 8:00 AM - 4:00 PM`,
    });
  } catch (error: any) {
    handleError(res, error, 'Failed to fix route times');
  }
};