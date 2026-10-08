// ============================================
// PORT MORESBY — ELECTORATES, ZONES, SUBURBS
// ============================================

// ✅ The app targets a single timezone (Port Moresby, UTC+10).
//    All server-side date checks must use this timezone, not the
//    server's local time (Vercel runs in UTC → would report the
//    wrong day for ~10 hours every day).
export const APP_TIMEZONE = 'Pacific/Port_Moresby';

// ============================================
// ELECTORATES
// ============================================
export type Electorate =
  | 'Moresby North-East'
  | 'Moresby North-West'
  | 'Moresby South';

export const ELECTORATES: Electorate[] = [
  'Moresby North-East',
  'Moresby North-West',
  'Moresby South',
];

// ============================================
// ZONES
// ============================================
export type ZoneName =
  | 'Zone 1'
  | 'Zone 2'
  | 'Zone 3'
  | 'Zone 4'
  | 'Zone 5'
  | 'Zone 6'
  | 'Zone 7'
  | 'Zone 8'
  | 'Zone 9';

export interface ZoneConfig {
  name: ZoneName;
  electorate: Electorate;
  suburbs: string[];
}

export const ZONES: Record<ZoneName, ZoneConfig> = {
  'Zone 1': {
    name: 'Zone 1',
    electorate: 'Moresby North-East',
    suburbs: ['5 Mile', '6 Mile', 'Boroko'],
  },
  'Zone 2': {
    name: 'Zone 2',
    electorate: 'Moresby North-East',
    suburbs: ['Erima', 'Gordons'],
  },
  'Zone 3': {
    name: 'Zone 3',
    electorate: 'Moresby North-East',
    suburbs: ['7 Mile', '8 Mile', '9 Mile', 'Bomana'],
  },
  'Zone 4': {
    name: 'Zone 4',
    electorate: 'Moresby North-West',
    suburbs: ['Gerehu', 'Morata', 'Waigani'],
  },
  'Zone 5': {
    name: 'Zone 5',
    electorate: 'Moresby North-West',
    suburbs: ['Hohola', 'Tokarara'],
  },
  'Zone 6': {
    name: 'Zone 6',
    electorate: 'Moresby South',
    suburbs: ['Badili', 'Koki', 'Konedobu'],
  },
  'Zone 7': {
    name: 'Zone 7',
    electorate: 'Moresby South',
    suburbs: ['4 Mile', 'Murray Barracks', '3 Mile'],
  },
  'Zone 8': {
    name: 'Zone 8',
    electorate: 'Moresby South',
    suburbs: ['Gabutu', 'Korobosea'],
  },
  'Zone 9': {
    name: 'Zone 9',
    electorate: 'Moresby South',
    suburbs: ['Sabama', 'Taurama'],
  },
};

export const ZONE_NAMES: ZoneName[] = Object.keys(ZONES) as ZoneName[];

// ============================================
// ELECTORATE → ZONES MAPPING
// ============================================
export const ELECTORATE_ZONES: Record<Electorate, ZoneName[]> = {
  'Moresby North-East': ['Zone 1', 'Zone 2', 'Zone 3'],
  'Moresby North-West': ['Zone 4', 'Zone 5'],
  'Moresby South': ['Zone 6', 'Zone 7', 'Zone 8', 'Zone 9'],
};

// ============================================
// COLLECTION SCHEDULE BY ZONE
// ============================================
export type DayOfWeek =
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday';

export const ZONE_SCHEDULES: Record<ZoneName, DayOfWeek[]> = {
  'Zone 1': ['monday', 'wednesday', 'friday'],
  'Zone 2': ['tuesday', 'thursday', 'saturday'],  // ✅ swapped
  'Zone 3': ['monday', 'wednesday', 'friday'],    // ✅ swapped
  'Zone 4': ['monday', 'wednesday', 'friday'],
  'Zone 5': ['tuesday', 'thursday', 'saturday'],
  'Zone 6': ['monday', 'wednesday', 'friday'],
  'Zone 7': ['monday', 'wednesday', 'friday'],
  'Zone 8': ['tuesday', 'thursday', 'saturday'],
  'Zone 9': ['tuesday', 'thursday', 'saturday'],
};

const DAY_NAMES: DayOfWeek[] = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
];

// ============================================
// HELPER: Get the current day-of-week in Port Moresby
// ✅ Uses Intl API so it's correct regardless of server timezone.
//    On Vercel (UTC), a Friday 07:00 PNG call would otherwise return
//    "thursday" because UTC is still Thursday 21:00.
// ============================================
export const getDayOfWeekInPNG = (date: Date = new Date()): DayOfWeek => {
  // Intl.DateTimeFormat with timeZone gives us the correct wall-clock day
  // name for the target timezone — no matter where the server runs.
  const weekdayName = new Intl.DateTimeFormat('en-US', {
    timeZone: APP_TIMEZONE,
    weekday: 'long',
  })
    .format(date)
    .toLowerCase();

  return (DAY_NAMES.find((d) => d === weekdayName) ?? 'sunday') as DayOfWeek;
};

// ============================================
// HELPER: Get "today" in Port Moresby as a Date at midnight
// ✅ Returns a Date whose year/month/day reflect PNG wall-clock today,
//    with time set to 00:00:00.000.
//    Use this for date-range queries so `scheduledDate >= today` matches
//    routes stored for the current PNG day.
// ============================================
export const getTodayInPNG = (): Date => {
  // 1. Format "now" into PNG Y-M-D parts
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  // en-CA produces YYYY-MM-DD
  const ymd = fmt.format(new Date()); // e.g. "2026-10-09"

  // 2. Build a UTC Date at that Y-M-D, 00:00:00
  //    (we only care about the calendar day, so using UTC midnight keeps
  //    things consistent for `Op.gte` / `Op.lt` comparisons against
  //    `scheduledDate`, which is also stored as a date.)
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
};

// ============================================
// HELPER: Get working days for a given zone
// ============================================
export const getWorkingDaysForZone = (zone: string): DayOfWeek[] => {
  return ZONE_SCHEDULES[zone as ZoneName] || [];
};

// ============================================
// HELPER: Check if a date is a working day for a zone
// ✅ Now timezone-safe — computes the day name in PNG time
// ============================================
export const isWorkingDayForZone = (date: Date, zone: string): boolean => {
  const workingDays = getWorkingDaysForZone(zone);
  if (workingDays.length === 0) return false;

  const dayOfWeek = getDayOfWeekInPNG(date);
  return workingDays.includes(dayOfWeek);
};

// ============================================
// HELPER: Get friendly display of working days
// ============================================
export const getWorkingDaysLabel = (zone: string): string => {
  const days = getWorkingDaysForZone(zone);
  return days.map((d) => d.charAt(0).toUpperCase() + d.slice(1)).join(', ');
};

// ============================================
// TRUCK → ZONE ASSIGNMENTS (9 zones, 9 trucks)
// ============================================
export const TRUCK_ZONE_ASSIGNMENTS = {
  'T-001': ['Zone 1'],
  'T-002': ['Zone 2'],
  'T-003': ['Zone 3'],
  'T-004': ['Zone 4'],
  'T-005': ['Zone 5'],
  'T-006': ['Zone 6'],
  'T-007': ['Zone 7'],
  'T-008': ['Zone 8'],
  'T-009': ['Zone 9'],
};

// ============================================
// GEOGRAPHIC BOUNDS (Port Moresby only)
// ============================================
export const PORT_MORESBY_BOUNDS = {
  north: -9.35,
  south: -9.55,
  east: 147.28,
  west: 147.10,
};

// ============================================
// VALIDATION HELPERS
// ============================================
export const isValidElectorate = (value: string): value is Electorate => {
  return ELECTORATES.includes(value as Electorate);
};

export const isValidZone = (value: string): value is ZoneName => {
  return ZONE_NAMES.includes(value as ZoneName);
};

export const isSuburbInZone = (suburb: string, zone: ZoneName): boolean => {
  const zoneConfig = ZONES[zone];
  if (!zoneConfig) return false;
  return zoneConfig.suburbs.includes(suburb);
};

export const isWithinPortMoresby = (
  latitude: number,
  longitude: number
): boolean => {
  return (
    latitude >= PORT_MORESBY_BOUNDS.south &&
    latitude <= PORT_MORESBY_BOUNDS.north &&
    longitude >= PORT_MORESBY_BOUNDS.west &&
    longitude <= PORT_MORESBY_BOUNDS.east
  );
};

// ============================================
// CONVENIENCE EXPORTS
// ============================================
export const getAllSuburbs = (): string[] => {
  const all: string[] = [];
  Object.values(ZONES).forEach((zone) => {
    zone.suburbs.forEach((suburb) => {
      if (!all.includes(suburb)) all.push(suburb);
    });
  });
  return all;
};

export const getZoneForSuburb = (suburb: string): ZoneName | null => {
  for (const [zoneName, zoneConfig] of Object.entries(ZONES)) {
    if (zoneConfig.suburbs.includes(suburb)) {
      return zoneName as ZoneName;
    }
  }
  return null;
};