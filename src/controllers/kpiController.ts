import { Request, Response } from 'express';
import { Op, QueryTypes } from 'sequelize';
import sequelize from '../config/database';
import Report, { ReportStatus } from '../models/Report';
import Truck, { TruckStatus } from '../models/Truck';
import User, { UserRole } from '../models/User';
import Route from '../models/Route';
import RouteStop, { StopStatus } from '../models/RouteStop';
import { AuthRequest } from '../middleware/auth';
import { getWorkingDaysForZone } from '../constants/portMoresbyZones';

// ============================================
// GET DASHBOARD DATA (COMBINED)
// GET /api/kpis/dashboard
// ============================================
export const getDashboardData = async (req: AuthRequest, res: Response) => {
  try {
    const overallStart = Date.now();

    const [kpisResult, fleetResult, routesResult] = await Promise.all([
      // ---- KPIs ----
      (async () => {
        const start = Date.now();

        const [reportStats, truckStats, userCounts, fleetCompletion] =
          await Promise.all([
            sequelize.query(
              `
              SELECT
                COUNT(*)::int AS total_reports,
                COUNT(CASE WHEN status = 'resolved' THEN 1 END)::int AS resolved_reports,
                COUNT(CASE WHEN status = 'pending' THEN 1 END)::int AS pending_reports,
                COUNT(CASE WHEN status = 'in-progress' THEN 1 END)::int AS in_progress_reports
              FROM reports
              WHERE archived = false
              `,
              { type: QueryTypes.SELECT }
            ),
            sequelize.query(
              `
              WITH truck_completion AS (
                SELECT
                  t.id,
                  t.status,
                  CASE
                    WHEN COUNT(st.id) = 0 THEN 0
                    ELSE ROUND(
                      COUNT(CASE WHEN st.status = 'completed' THEN 1 END)::numeric
                      / COUNT(st.id)::numeric * 100
                    )
                  END AS truck_pct
                FROM trucks t
                LEFT JOIN routes r ON r."truckId" = t.id
                LEFT JOIN route_stops st ON st."routeId" = r.id
                GROUP BY t.id, t.status
              )
              SELECT
                COUNT(*)::int AS total_trucks,
                COUNT(CASE WHEN status = 'on-route' THEN 1 END)::int AS active_trucks,
                COUNT(CASE WHEN status = 'available' THEN 1 END)::int AS available_trucks,
                COALESCE(AVG(truck_pct), 0)::int AS avg_truck_completion
              FROM truck_completion
              `,
              { type: QueryTypes.SELECT }
            ),
            sequelize.query(
              `
              SELECT
                COUNT(CASE WHEN role = 'citizen' AND deleted = false THEN 1 END)::int AS total_citizens,
                COUNT(CASE WHEN role = 'driver' AND deleted = false THEN 1 END)::int AS total_drivers
              FROM users
              `,
              { type: QueryTypes.SELECT }
            ),
            sequelize.query(
              `
              SELECT
                CASE
                  WHEN COUNT(st.id) = 0 THEN 0
                  ELSE ROUND(
                    COUNT(CASE WHEN st.status = 'completed' THEN 1 END)::numeric
                    / COUNT(st.id)::numeric * 100
                  )
                END::int AS completion_rate
              FROM route_stops st
              `,
              { type: QueryTypes.SELECT }
            ),
          ]);

        const rs = (reportStats as any[])[0] || {};
        const ts = (truckStats as any[])[0] || {};
        const uc = (userCounts as any[])[0] || {};
        const fc = (fleetCompletion as any[])[0] || {};

        const result = {
          completionRate: fc.completion_rate || 0,
          fuelEfficiency: 92,
          punctuality: 78,
          citizenSatisfaction: 84,
          totalReports: rs.total_reports || 0,
          resolvedReports: rs.resolved_reports || 0,
          pendingReports: rs.pending_reports || 0,
          inProgressReports: rs.in_progress_reports || 0,
          totalCollections: rs.resolved_reports || 0,
          totalTrucks: ts.total_trucks || 0,
          activeTrucks: ts.active_trucks || 0,
          availableTrucks: ts.available_trucks || 0,
          totalCitizens: uc.total_citizens || 0,
          totalDrivers: uc.total_drivers || 0,
          avgTruckCompletion: ts.avg_truck_completion || 0,
        };

        console.log(`⏱️ [dashboard] KPIs: ${Date.now() - start}ms`);
        return result;
      })(),

      // ---- FLEET STATUS ----
      (async () => {
        const start = Date.now();

        const trucksWithCounts: any[] = await sequelize.query(
          `
          SELECT
            t.id,
            t."truckId",
            t."registrationNumber",
            t.zone,
            t.status,
            t."truckType",
            t.capacity,
            t."lastUpdate",
            t."driverId",
            u.name  AS "driverName",
            u.email AS "driverEmail",
            COALESCE(rs.total_stops, 0)::int AS "totalStops",
            COALESCE(rs.completed_stops, 0)::int AS "completedStops"
          FROM trucks t
          LEFT JOIN users u ON u.id = t."driverId"
          LEFT JOIN (
            SELECT
              r."truckId",
              COUNT(st.id)::int AS total_stops,
              COUNT(CASE WHEN st.status = 'completed' THEN 1 END)::int AS completed_stops
            FROM routes r
            LEFT JOIN route_stops st ON st."routeId" = r.id
            GROUP BY r."truckId"
          ) rs ON rs."truckId" = t.id
          ORDER BY t."truckId" ASC
          `,
          { type: QueryTypes.SELECT }
        );

        const result = trucksWithCounts.map((row) => {
          const totalStops = row.totalStops || 0;
          const completedStops = row.completedStops || 0;

          const realCompletion =
            totalStops > 0
              ? Math.round((completedStops / totalStops) * 100)
              : 0;

          return {
            id: row.id,
            truckId: row.truckId,
            registrationNumber: row.registrationNumber,
            driver: row.driverId
              ? {
                  id: row.driverId,
                  name: row.driverName,
                  email: row.driverEmail,
                }
              : null,
            driverName: row.driverName || 'Unassigned',
            zone: row.zone,
            status: row.status,
            truckType: row.truckType || 'collection',
            completion: realCompletion,
            totalStops,
            completedStops,
            capacity: row.capacity,
            workingDays: getWorkingDaysForZone(row.zone),
            lastUpdate: row.lastUpdate,
          };
        });

        console.log(`⏱️ [dashboard] Fleet: ${Date.now() - start}ms`);
        return result;
      })(),

      // ---- ROUTE PERFORMANCE ----
      (async () => {
        const start = Date.now();

        const routeStats: any[] = await sequelize.query(
          `
          SELECT
            r.id,
            r.zone,
            r.suburb,
            r.status,
            r."scheduledStart",
            r."scheduledEnd",
            r."actualStart",
            r."actualEnd",
            t."truckId",
            u.name AS "driverName",
            COALESCE(COUNT(st.id), 0)::int AS total_stops,
            COALESCE(COUNT(CASE WHEN st.status = 'completed' THEN 1 END), 0)::int AS completed_stops
          FROM routes r
          LEFT JOIN trucks t ON t.id = r."truckId"
          LEFT JOIN users u ON u.id = t."driverId"
          LEFT JOIN route_stops st ON st."routeId" = r.id
          GROUP BY r.id, t."truckId", u.name
          ORDER BY r."scheduledDate" DESC
          `,
          { type: QueryTypes.SELECT }
        );

        const formattedRoutes = routeStats.map((r) => {
          const totalStops = r.total_stops || 0;
          const completedStops = r.completed_stops || 0;

          let duration = '0 hrs';
          let durationType: 'scheduled' | 'actual' = 'scheduled';

          if (r.actualStart && r.actualEnd) {
            const startTime = new Date(r.actualStart).getTime();
            const endTime = new Date(r.actualEnd).getTime();
            const diffHours = (endTime - startTime) / (1000 * 60 * 60);
            duration = `${diffHours.toFixed(1)} hrs`;
            durationType = 'actual';
          } else if (r.scheduledStart && r.scheduledEnd) {
            const startTime = new Date(r.scheduledStart).getTime();
            const endTime = new Date(r.scheduledEnd).getTime();
            const diffHours = (endTime - startTime) / (1000 * 60 * 60);
            duration = `${diffHours.toFixed(1)} hrs`;
          }

          const efficiency =
            totalStops > 0
              ? Math.round((completedStops / totalStops) * 100)
              : 0;

          return {
            id: r.id,
            route: `${r.zone} - ${r.suburb}`,
            driver: r.driverName || 'Unassigned',
            truckId: r.truckId || 'N/A',
            duration,
            durationType,
            stops: totalStops,
            completed: completedStops,
            efficiency,
            status: r.status,
          };
        });

        const totalRoutes = formattedRoutes.length;
        const completedRoutes = formattedRoutes.filter(
          (r) => r.status === 'completed'
        ).length;
        const avgEfficiency =
          totalRoutes > 0
            ? Math.round(
                formattedRoutes.reduce((sum, r) => sum + r.efficiency, 0) /
                  totalRoutes
              )
            : 0;

        const routesWithActualDuration = formattedRoutes.filter(
          (r) => r.durationType === 'actual'
        );

        const avgDuration =
          routesWithActualDuration.length > 0
            ? routesWithActualDuration.reduce(
                (sum, r) => sum + parseFloat(r.duration),
                0
              ) / routesWithActualDuration.length
            : 0;

        const result = {
          routes: formattedRoutes,
          stats: {
            totalRoutes,
            completedRoutes,
            avgEfficiency,
            avgDuration: Math.round(avgDuration * 10) / 10,
          },
        };

        console.log(`⏱️ [dashboard] Routes: ${Date.now() - start}ms`);
        return result;
      })(),
    ]);

    const totalTime = Date.now() - overallStart;
    console.log(`⏱️ [dashboard] TOTAL: ${totalTime}ms`);

    res.json({
      kpis: kpisResult,
      fleet: fleetResult,
      routes: routesResult.routes,
      stats: routesResult.stats,
      fetchedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Get dashboard data error:', error);
    res.status(500).json({
      error: 'Failed to fetch dashboard data',
      message:
        process.env.NODE_ENV === 'development'
          ? error.message
          : 'Something went wrong',
    });
  }
};

// ============================================
// GET KPI OVERVIEW
// GET /api/kpis
// ============================================
export const getKPIs = async (req: AuthRequest, res: Response) => {
  try {
    const [reportStats, truckStats, userCounts, fleetCompletion] =
      await Promise.all([
        sequelize.query(
          `
          SELECT
            COUNT(*)::int AS total_reports,
            COUNT(CASE WHEN status = 'resolved' THEN 1 END)::int AS resolved_reports,
            COUNT(CASE WHEN status = 'pending' THEN 1 END)::int AS pending_reports,
            COUNT(CASE WHEN status = 'in-progress' THEN 1 END)::int AS in_progress_reports
          FROM reports
          WHERE archived = false
          `,
          { type: QueryTypes.SELECT }
        ),
        sequelize.query(
          `
          WITH truck_completion AS (
            SELECT
              t.id,
              t.status,
              CASE
                WHEN COUNT(st.id) = 0 THEN 0
                ELSE ROUND(
                  COUNT(CASE WHEN st.status = 'completed' THEN 1 END)::numeric
                  / COUNT(st.id)::numeric * 100
                )
              END AS truck_pct
            FROM trucks t
            LEFT JOIN routes r ON r."truckId" = t.id
            LEFT JOIN route_stops st ON st."routeId" = r.id
            GROUP BY t.id, t.status
          )
          SELECT
            COUNT(*)::int AS total_trucks,
            COUNT(CASE WHEN status = 'on-route' THEN 1 END)::int AS active_trucks,
            COUNT(CASE WHEN status = 'available' THEN 1 END)::int AS available_trucks,
            COALESCE(AVG(truck_pct), 0)::int AS avg_truck_completion
          FROM truck_completion
          `,
          { type: QueryTypes.SELECT }
        ),
        sequelize.query(
          `
          SELECT
            COUNT(CASE WHEN role = 'citizen' AND deleted = false THEN 1 END)::int AS total_citizens,
            COUNT(CASE WHEN role = 'driver' AND deleted = false THEN 1 END)::int AS total_drivers
          FROM users
          `,
          { type: QueryTypes.SELECT }
        ),
        sequelize.query(
          `
          SELECT
            CASE
              WHEN COUNT(st.id) = 0 THEN 0
              ELSE ROUND(
                COUNT(CASE WHEN st.status = 'completed' THEN 1 END)::numeric
                / COUNT(st.id)::numeric * 100
              )
            END::int AS completion_rate
          FROM route_stops st
          `,
          { type: QueryTypes.SELECT }
        ),
      ]);

    const rs = (reportStats as any[])[0] || {};
    const ts = (truckStats as any[])[0] || {};
    const uc = (userCounts as any[])[0] || {};
    const fc = (fleetCompletion as any[])[0] || {};

    const kpis = {
      completionRate: fc.completion_rate || 0,
      fuelEfficiency: 92,
      punctuality: 78,
      citizenSatisfaction: 84,
      totalReports: rs.total_reports || 0,
      resolvedReports: rs.resolved_reports || 0,
      pendingReports: rs.pending_reports || 0,
      inProgressReports: rs.in_progress_reports || 0,
      totalCollections: rs.resolved_reports || 0,
      totalTrucks: ts.total_trucks || 0,
      activeTrucks: ts.active_trucks || 0,
      availableTrucks: ts.available_trucks || 0,
      totalCitizens: uc.total_citizens || 0,
      totalDrivers: uc.total_drivers || 0,
      avgTruckCompletion: ts.avg_truck_completion || 0,
    };

    res.json({ kpis });
  } catch (error: any) {
    console.error('Get KPIs error:', error);
    res.status(500).json({
      error: 'Failed to fetch KPIs',
      message:
        process.env.NODE_ENV === 'development'
          ? error.message
          : 'Something went wrong',
    });
  }
};

// ============================================
// GET FLEET STATUS
// GET /api/kpis/fleet
// ============================================
export const getFleetStatus = async (req: AuthRequest, res: Response) => {
  try {
    const trucksWithCounts: any[] = await sequelize.query(
      `
      SELECT
        t.id,
        t."truckId",
        t."registrationNumber",
        t.zone,
        t.status,
        t."truckType",
        t.capacity,
        t."lastUpdate",
        t."driverId",
        u.name  AS "driverName",
        u.email AS "driverEmail",
        COALESCE(rs.total_stops, 0)::int AS "totalStops",
        COALESCE(rs.completed_stops, 0)::int AS "completedStops"
      FROM trucks t
      LEFT JOIN users u ON u.id = t."driverId"
      LEFT JOIN (
        SELECT
          r."truckId",
          COUNT(st.id)::int AS total_stops,
          COUNT(CASE WHEN st.status = 'completed' THEN 1 END)::int AS completed_stops
        FROM routes r
        LEFT JOIN route_stops st ON st."routeId" = r.id
        GROUP BY r."truckId"
      ) rs ON rs."truckId" = t.id
      ORDER BY t."truckId" ASC
      `,
      { type: QueryTypes.SELECT }
    );

    const fleet = trucksWithCounts.map((row) => {
      const totalStops = row.totalStops || 0;
      const completedStops = row.completedStops || 0;

      const realCompletion =
        totalStops > 0
          ? Math.round((completedStops / totalStops) * 100)
          : 0;

      return {
        id: row.id,
        truckId: row.truckId,
        registrationNumber: row.registrationNumber,
        driver: row.driverId
          ? {
              id: row.driverId,
              name: row.driverName,
              email: row.driverEmail,
            }
          : null,
        driverName: row.driverName || 'Unassigned',
        zone: row.zone,
        status: row.status,
        truckType: row.truckType || 'collection',
        completion: realCompletion,
        totalStops,
        completedStops,
        capacity: row.capacity,
        workingDays: getWorkingDaysForZone(row.zone),
        lastUpdate: row.lastUpdate,
      };
    });

    res.json({ fleet });
  } catch (error: any) {
    console.error('Get fleet status error:', error);
    res.status(500).json({
      error: 'Failed to fetch fleet',
      message:
        process.env.NODE_ENV === 'development'
          ? error.message
          : 'Something went wrong',
    });
  }
};

// ============================================
// GET ROUTE PERFORMANCE
// GET /api/kpis/routes
// ============================================
export const getRoutePerformance = async (req: AuthRequest, res: Response) => {
  try {
    const routeStats: any[] = await sequelize.query(
      `
      SELECT
        r.id,
        r.zone,
        r.suburb,
        r.status,
        r."scheduledStart",
        r."scheduledEnd",
        r."actualStart",
        r."actualEnd",
        t."truckId",
        u.name AS "driverName",
        COALESCE(COUNT(st.id), 0)::int AS total_stops,
        COALESCE(COUNT(CASE WHEN st.status = 'completed' THEN 1 END), 0)::int AS completed_stops
      FROM routes r
      LEFT JOIN trucks t ON t.id = r."truckId"
      LEFT JOIN users u ON u.id = t."driverId"
      LEFT JOIN route_stops st ON st."routeId" = r.id
      GROUP BY r.id, t."truckId", u.name
      ORDER BY r."scheduledDate" DESC
      `,
      { type: QueryTypes.SELECT }
    );

    const formattedRoutes = routeStats.map((r) => {
      const totalStops = r.total_stops || 0;
      const completedStops = r.completed_stops || 0;

      let duration = '0 hrs';
      let durationType: 'scheduled' | 'actual' = 'scheduled';

      if (r.actualStart && r.actualEnd) {
        const startTime = new Date(r.actualStart).getTime();
        const endTime = new Date(r.actualEnd).getTime();
        const diffHours = (endTime - startTime) / (1000 * 60 * 60);
        duration = `${diffHours.toFixed(1)} hrs`;
        durationType = 'actual';
      } else if (r.scheduledStart && r.scheduledEnd) {
        const startTime = new Date(r.scheduledStart).getTime();
        const endTime = new Date(r.scheduledEnd).getTime();
        const diffHours = (endTime - startTime) / (1000 * 60 * 60);
        duration = `${diffHours.toFixed(1)} hrs`;
      }

      const efficiency =
        totalStops > 0 ? Math.round((completedStops / totalStops) * 100) : 0;

      return {
        id: r.id,
        route: `${r.zone} - ${r.suburb}`,
        driver: r.driverName || 'Unassigned',
        truckId: r.truckId || 'N/A',
        duration,
        durationType,
        stops: totalStops,
        completed: completedStops,
        efficiency,
        status: r.status,
      };
    });

    const totalRoutes = formattedRoutes.length;
    const completedRoutes = formattedRoutes.filter(
      (r) => r.status === 'completed'
    ).length;
    const avgEfficiency =
      totalRoutes > 0
        ? Math.round(
            formattedRoutes.reduce((sum, r) => sum + r.efficiency, 0) /
              totalRoutes
          )
        : 0;

    const routesWithActualDuration = formattedRoutes.filter(
      (r) => r.durationType === 'actual'
    );

    const avgDuration =
      routesWithActualDuration.length > 0
        ? routesWithActualDuration.reduce(
            (sum, r) => sum + parseFloat(r.duration),
            0
          ) / routesWithActualDuration.length
        : 0;

    res.json({
      routes: formattedRoutes,
      stats: {
        totalRoutes,
        completedRoutes,
        avgEfficiency,
        avgDuration: Math.round(avgDuration * 10) / 10,
      },
    });
  } catch (error: any) {
    console.error('Get route performance error:', error);
    res.status(500).json({
      error: 'Failed to fetch route performance',
      message:
        process.env.NODE_ENV === 'development'
          ? error.message
          : 'Something went wrong',
    });
  }
};

// ============================================
// RESET CURRENT WEEK STATE
// POST /api/kpis/reset-week
// Requires: admin/management
//
// Since routes are PERMANENT (fixed by zone + day), this does NOT delete
// routes. Instead, it resets all route progress and stop statuses so the
// same routes can be re-run for the next week.
//
// ✅ REVISED: Reports are ARCHIVED (not deleted). This hides them from the
// Admin Complaint tab while preserving them in the Citizen's "My Reports".
// ============================================
export const resetWeekData = async (req: AuthRequest, res: Response) => {
  try {
    console.log('🔄 Resetting all routes + stops for a fresh week...');

    // 1. Reset all stops back to pending
    const stopResult: unknown = await sequelize.query(
      `
      UPDATE route_stops
      SET
        status = 'pending',
        "completedAt" = NULL,
        "skippedReason" = NULL,
        "beforePhoto" = NULL,
        "afterPhoto" = NULL,
        notes = NULL
      `,
      { type: QueryTypes.UPDATE }
    );
    let resetStops = 0;
    if (Array.isArray(stopResult) && typeof stopResult[1] === 'number') {
      resetStops = stopResult[1];
    }

    // 2. Reset all routes back to pending
    const routeResult: unknown = await sequelize.query(
      `
      UPDATE routes
      SET
        status = 'pending',
        "completedStops" = 0,
        "actualStart" = NULL,
        "actualEnd" = NULL
      `,
      { type: QueryTypes.UPDATE }
    );
    let resetRoutes = 0;
    if (Array.isArray(routeResult) && typeof routeResult[1] === 'number') {
      resetRoutes = routeResult[1];
    }

    // 3. Reset all trucks (completion = 0, status = available)
    const truckResult: unknown = await sequelize.query(
      `
      UPDATE trucks
      SET
        completion = 0,
        status = CASE
          WHEN status IN ('maintenance', 'offline') THEN status
          ELSE 'available'
        END,
        "lastUpdate" = NOW()
      `,
      { type: QueryTypes.UPDATE }
    );
    let resetTrucks = 0;
    if (Array.isArray(truckResult) && typeof truckResult[1] === 'number') {
      resetTrucks = truckResult[1];
    }

    // ✅ REVISED: Archive complaint records from this week (do NOT delete)
    // Archived reports are hidden from the Admin Complaint tab but still
    // visible in the Citizen's "My Reports" page for their own tracking.
    const complaintResult: unknown = await sequelize.query(
      `
      UPDATE reports
      SET archived = true
      WHERE "createdAt" >= NOW() - INTERVAL '7 days'
        AND archived = false
      `,
      { type: QueryTypes.UPDATE }
    );
    let archivedComplaints = 0;
    if (
      Array.isArray(complaintResult) &&
      typeof complaintResult[1] === 'number'
    ) {
      archivedComplaints = complaintResult[1];
    }

    console.log(
      `✅ Reset complete: ${resetStops} stops, ${resetRoutes} routes, ${resetTrucks} trucks, ${archivedComplaints} complaints archived`
    );

    res.json({
      message: 'Week has been reset successfully',
      resetAt: new Date().toISOString(),
      reset: {
        stops: resetStops,
        routes: resetRoutes,
        trucks: resetTrucks,
        complaints: archivedComplaints,
      },
    });
  } catch (error: any) {
    console.error('Reset week error:', error);
    res.status(500).json({
      error: 'Failed to reset week data',
      message:
        process.env.NODE_ENV === 'development'
          ? error.message
          : 'Something went wrong',
    });
  }
};