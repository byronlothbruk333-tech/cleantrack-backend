import { Request, Response } from 'express';
import {
  COLLECTION_SCHEDULES,
  getAllSuburbs,
  getScheduleForSuburb,
  getNextCollection,
  getAllSchedules,
} from '../constants/collectionSchedules';
import { ZONES, ZoneName, isValidZone } from '../constants/portMoresbyZones';

// ============================================
// GET ALL SUBURBS (for dropdown)
// GET /api/schedules/suburbs
// Public — no auth required
// ============================================
export const getSuburbs = async (req: Request, res: Response) => {
  try {
    const suburbs = getAllSuburbs();

    // Also send a mapping of suburb → zone so UI can show zone
    const suburbZones: Record<string, string> = {};
    Object.entries(ZONES).forEach(([zoneName, zoneConfig]) => {
      zoneConfig.suburbs.forEach((suburb) => {
        suburbZones[suburb] = zoneName;
      });
    });

    res.json({
      count: suburbs.length,
      suburbs,
      suburbZones,
    });
  } catch (error: unknown) {
    console.error('Get suburbs error:', error);
    res.status(500).json({
      error: 'Failed to fetch suburbs',
      message: 'Something went wrong',
    });
  }
};

// ============================================
// GET SCHEDULE FOR A SUBURB
// GET /api/schedules/suburb/:suburb
// Public — no auth required
// ============================================
export const getSuburbSchedule = async (req: Request, res: Response) => {
  try {
    const { suburb } = req.params;

    const schedule = getScheduleForSuburb(suburb);

    if (!schedule) {
      return res.status(404).json({
        error: 'Suburb not found',
        message: `"${suburb}" is not in our service area`,
      });
    }

    const nextCollection = getNextCollection(schedule.days);

    res.json({
      ...schedule,
      nextCollection,
    });
  } catch (error: unknown) {
    console.error('Get suburb schedule error:', error);
    res.status(500).json({
      error: 'Failed to fetch schedule',
      message: 'Something went wrong',
    });
  }
};

// ============================================
// GET SCHEDULE FOR A ZONE
// GET /api/schedules/zone/:zone
// Public — no auth required
// ============================================
export const getZoneSchedule = async (req: Request, res: Response) => {
  try {
    const { zone } = req.params;

    if (!isValidZone(zone)) {
      return res.status(404).json({
        error: 'Zone not found',
        message: `"${zone}" is not a valid zone`,
      });
    }

    const schedule = COLLECTION_SCHEDULES[zone as ZoneName];
    const nextCollection = getNextCollection(schedule.days);

    res.json({
      ...schedule,
      nextCollection,
      suburbs: ZONES[zone as ZoneName].suburbs,
    });
  } catch (error: unknown) {
    console.error('Get zone schedule error:', error);
    res.status(500).json({
      error: 'Failed to fetch schedule',
      message: 'Something went wrong',
    });
  }
};

// ============================================
// GET ALL SCHEDULES
// GET /api/schedules
// Public — no auth required
// ============================================
export const getAllZonesSchedules = async (req: Request, res: Response) => {
  try {
    const schedules = getAllSchedules();

    // Add nextCollection and suburbs to each
    const enriched = schedules.map((schedule) => ({
      ...schedule,
      nextCollection: getNextCollection(schedule.days),
      suburbs: ZONES[schedule.zone].suburbs,
    }));

    res.json({
      count: enriched.length,
      schedules: enriched,
    });
  } catch (error: unknown) {
    console.error('Get all schedules error:', error);
    res.status(500).json({
      error: 'Failed to fetch schedules',
      message: 'Something went wrong',
    });
  }
};