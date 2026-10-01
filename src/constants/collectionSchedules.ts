import { ZoneName, ZONES } from './portMoresbyZones';

// ============================================
// TYPES
// ============================================
export type DayOfWeek =
  | 'Monday'
  | 'Tuesday'
  | 'Wednesday'
  | 'Thursday'
  | 'Friday'
  | 'Saturday'
  | 'Sunday';

export interface Schedule {
  zone: ZoneName;
  electorate: string;
  days: DayOfWeek[];
  timeWindow: {
    start: string; // "08:00"
    end: string;   // "15:00"
  };
  notes: string;
}

// ============================================
// COLLECTION SCHEDULES BY ZONE
// ============================================
export const COLLECTION_SCHEDULES: Record<ZoneName, Schedule> = {
  'Zone 1': {
    zone: 'Zone 1',
    electorate: 'Moresby North-East',
    days: ['Monday', 'Wednesday', 'Friday'],
    timeWindow: { start: '08:00', end: '15:00' },
    notes: 'Please place bins out by 8:00 AM.',
  },
  'Zone 2': {
    zone: 'Zone 2',
    electorate: 'Moresby North-East',
    days: ['Monday', 'Wednesday', 'Friday'],
    timeWindow: { start: '08:00', end: '15:00' },
    notes: 'Please place bins out by 8:00 AM.',
  },
  'Zone 3': {
    zone: 'Zone 3',
    electorate: 'Moresby North-East',
    days: ['Tuesday', 'Thursday', 'Saturday'],
    timeWindow: { start: '08:00', end: '15:00' },
    notes: 'Please place bins out by 8:00 AM.',
  },
  'Zone 4': {
    zone: 'Zone 4',
    electorate: 'Moresby North-West',
    days: ['Monday', 'Wednesday', 'Friday'],
    timeWindow: { start: '08:00', end: '15:00' },
    notes: 'Please place bins out by 8:00 AM.',
  },
  'Zone 5': {
    zone: 'Zone 5',
    electorate: 'Moresby North-West',
    days: ['Tuesday', 'Thursday', 'Saturday'],
    timeWindow: { start: '08:00', end: '15:00' },
    notes: 'Please place bins out by 8:00 AM.',
  },
  'Zone 6': {
    zone: 'Zone 6',
    electorate: 'Moresby South',
    days: ['Monday', 'Wednesday', 'Friday'],
    timeWindow: { start: '08:00', end: '15:00' },
    notes: 'Please place bins out by 8:00 AM.',
  },
  'Zone 7': {
    zone: 'Zone 7',
    electorate: 'Moresby South',
    days: ['Monday', 'Wednesday', 'Friday'],
    timeWindow: { start: '08:00', end: '15:00' },
    notes: 'Please place bins out by 8:00 AM.',
  },
  'Zone 8': {
    zone: 'Zone 8',
    electorate: 'Moresby South',
    days: ['Tuesday', 'Thursday', 'Saturday'],
    timeWindow: { start: '08:00', end: '15:00' },
    notes: 'Please place bins out by 8:00 AM.',
  },
  'Zone 9': {
    zone: 'Zone 9',
    electorate: 'Moresby South',
    days: ['Tuesday', 'Thursday', 'Saturday'],
    timeWindow: { start: '08:00', end: '15:00' },
    notes: 'Please place bins out by 8:00 AM.',
  },
};

// ============================================
// HELPERS
// ============================================
export const getAllSuburbs = (): string[] => {
  const suburbs: string[] = [];
  Object.values(ZONES).forEach((zone) => {
    zone.suburbs.forEach((suburb) => {
      if (!suburbs.includes(suburb)) suburbs.push(suburb);
    });
  });
  return suburbs.sort();
};

export const getScheduleForSuburb = (
  suburb: string
): (Schedule & { suburb: string }) | null => {
  for (const [zoneName, zoneConfig] of Object.entries(ZONES)) {
    if (zoneConfig.suburbs.includes(suburb)) {
      const schedule = COLLECTION_SCHEDULES[zoneName as ZoneName];
      return { ...schedule, suburb };
    }
  }
  return null;
};

export const getNextCollection = (days: DayOfWeek[]): string => {
  const PNG_OFFSET_HOURS = 10;

  const nowUTC = new Date();
  const nowPNG = new Date(
    nowUTC.getTime() + PNG_OFFSET_HOURS * 60 * 60 * 1000
  );

  const dayNames = [
    'Sunday',
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
  ];

  for (let i = 0; i < 8; i++) {
    const checkPNG = new Date(nowPNG);
    checkPNG.setUTCDate(nowPNG.getUTCDate() + i);

    const dayName = dayNames[checkPNG.getUTCDay()];

    if (days.includes(dayName as DayOfWeek)) {
      const year = checkPNG.getUTCFullYear();
      const month = String(checkPNG.getUTCMonth() + 1).padStart(2, '0');
      const day = String(checkPNG.getUTCDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
  }

  const year = nowPNG.getUTCFullYear();
  const month = String(nowPNG.getUTCMonth() + 1).padStart(2, '0');
  const day = String(nowPNG.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const getAllSchedules = (): Schedule[] => {
  return Object.values(COLLECTION_SCHEDULES);
};