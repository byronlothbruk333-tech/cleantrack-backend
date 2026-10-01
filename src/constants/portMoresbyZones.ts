// ============================================
// PORT MORESBY — ELECTORATES, ZONES, SUBURBS
// ============================================

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
  'Zone 2': ['monday', 'wednesday', 'friday'],
  'Zone 3': ['tuesday', 'thursday', 'saturday'],
  'Zone 4': ['monday', 'wednesday', 'friday'],
  'Zone 5': ['tuesday', 'thursday', 'saturday'],
  'Zone 6': ['monday', 'wednesday', 'friday'],
  'Zone 7': ['monday', 'wednesday', 'friday'],
  'Zone 8': ['tuesday', 'thursday', 'saturday'],
  'Zone 9': ['tuesday', 'thursday', 'saturday'],
};

// ============================================
// HELPER: Get working days for a given zone
// ============================================
export const getWorkingDaysForZone = (zone: string): DayOfWeek[] => {
  return ZONE_SCHEDULES[zone as ZoneName] || [];
};

// ============================================
// HELPER: Check if a date is a working day for a zone
// ============================================
export const isWorkingDayForZone = (date: Date, zone: string): boolean => {
  const workingDays = getWorkingDaysForZone(zone);
  if (workingDays.length === 0) return false;

  const dayNames: DayOfWeek[] = [
    'sunday',
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
  ];
  const dayOfWeek = dayNames[date.getDay()];

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