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
  | 'Zone 9'
  | 'Zone 10';

export interface ZoneConfig {
  name: ZoneName;
  electorate: Electorate;
  suburbs: string[];
}

export const ZONES: Record<ZoneName, ZoneConfig> = {
  'Zone 1': {
    name: 'Zone 1',
    electorate: 'Moresby North-East',
    suburbs: ['Boroko', '5 Mile', '6 Mile'],
  },
  'Zone 2': {
    name: 'Zone 2',
    electorate: 'Moresby North-East',
    suburbs: ['Gordons', 'Gordons North', 'Erima'],
  },
  'Zone 3': {
    name: 'Zone 3',
    electorate: 'Moresby North-East',
    suburbs: ['7 Mile', '8 Mile', '9 Mile'],
  },
  'Zone 4': {
    name: 'Zone 4',
    electorate: 'Moresby North-East',
    suburbs: ['Bomana', '14 Mile PAU'],
  },
  'Zone 5': {
    name: 'Zone 5',
    electorate: 'Moresby North-West',
    suburbs: ['Gerehu', 'Morata', 'Waigani'],
  },
  'Zone 6': {
    name: 'Zone 6',
    electorate: 'Moresby North-West',
    suburbs: ['Tokarara', 'Hohola'],
  },
  'Zone 7': {
    name: 'Zone 7',
    electorate: 'Moresby South',
    suburbs: ['Konedobu', 'Koki', 'Badili'],
  },
  'Zone 8': {
    name: 'Zone 8',
    electorate: 'Moresby South',
    suburbs: ['Murray Barracks', 'Three Mile', '4 Mile'],
  },
  'Zone 9': {
    name: 'Zone 9',
    electorate: 'Moresby South',
    suburbs: ['Korobosea', 'Gabutu'],
  },
  'Zone 10': {
    name: 'Zone 10',
    electorate: 'Moresby South',
    suburbs: ['Sabama', 'Kila Kila', 'Taurama'],
  },
};

export const ZONE_NAMES: ZoneName[] = Object.keys(ZONES) as ZoneName[];

// ============================================
// ELECTROATE → ZONES MAPPING
// ============================================
export const ELECTORATE_ZONES: Record<Electorate, ZoneName[]> = {
  'Moresby North-East': ['Zone 1', 'Zone 2', 'Zone 3', 'Zone 4'],
  'Moresby North-West': ['Zone 5', 'Zone 6'],
  'Moresby South': ['Zone 7', 'Zone 8', 'Zone 9', 'Zone 10'],
};

// ============================================
// TRUCK → ZONE ASSIGNMENTS
// ============================================
// North-East: 4 trucks (T-001 to T-004)
// North-West: 3 trucks (T-005 to T-007)
// South: 3 trucks (T-008 to T-010)
//
// South distribution:
//   Truck 1 (T-008) → Zones 7 & 8
//   Truck 2 (T-009) → Zone 9
//   Truck 3 (T-010) → Zone 10

export const TRUCK_ZONE_ASSIGNMENTS = {
  'T-001': ['Zone 1'],
  'T-002': ['Zone 2'],
  'T-003': ['Zone 3'],
  'T-004': ['Zone 4'],
  'T-005': ['Zone 5'],
  'T-006': ['Zone 6'],
  'T-007': ['Zone 5', 'Zone 6'], // 3rd NW truck — shared
  'T-008': ['Zone 7', 'Zone 8'], // South truck 1
  'T-009': ['Zone 9'],           // South truck 2
  'T-010': ['Zone 10'],          // South truck 3
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