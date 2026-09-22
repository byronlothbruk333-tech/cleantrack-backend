import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';
import Route from './Route';
import Report from './Report';

// ============================================
// ENUMS
// ============================================
export enum StopStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  SKIPPED = 'skipped',
}

export enum ComplaintType {
  MISSED_COLLECTION = 'missed-collection',
  ILLEGAL_DUMPING = 'illegal-dumping',
  OVERFLOWING_BIN = 'overflowing-bin',
  OTHER = 'other',
}

// ============================================
// ATTRIBUTES
// ============================================
interface RouteStopAttributes {
  id: string;
  routeId: string;
  sequence: number;
  address: string;
  suburb: string;
  latitude: number;
  longitude: number;
  status: StopStatus;
  completedAt?: Date | null;
  skippedReason?: string | null;
  notes?: string | null;
  isComplaintStop: boolean;
  complaintType?: ComplaintType | null;
  reportId?: string | null;
  beforePhoto?: string | null;
  afterPhoto?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

interface RouteStopCreationAttributes
  extends Optional<
    RouteStopAttributes,
    | 'id'
    | 'status'
    | 'completedAt'
    | 'skippedReason'
    | 'notes'
    | 'isComplaintStop'
    | 'complaintType'
    | 'reportId'
    | 'beforePhoto'
    | 'afterPhoto'
    | 'createdAt'
    | 'updatedAt'
  > {}

// ============================================
// MODEL
// ============================================
class RouteStop
  extends Model<RouteStopAttributes, RouteStopCreationAttributes>
  implements RouteStopAttributes
{
  public id!: string;
  public routeId!: string;
  public sequence!: number;
  public address!: string;
  public suburb!: string;
  public latitude!: number;
  public longitude!: number;
  public status!: StopStatus;
  public completedAt?: Date | null;
  public skippedReason?: string | null;
  public notes?: string | null;
  public isComplaintStop!: boolean;
  public complaintType?: ComplaintType | null;
  public reportId?: string | null;
  public beforePhoto?: string | null;
  public afterPhoto?: string | null;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

// ============================================
// INITIALIZATION
// ============================================
RouteStop.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    routeId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'routes',
        key: 'id',
      },
      onDelete: 'CASCADE',
    },
    sequence: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
    },
    address: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    suburb: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    latitude: {
      type: DataTypes.DECIMAL(10, 8),
      allowNull: false,
    },
    longitude: {
      type: DataTypes.DECIMAL(11, 8),
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM(...Object.values(StopStatus)),
      allowNull: false,
      defaultValue: StopStatus.PENDING,
    },
    completedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    skippedReason: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    isComplaintStop: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    complaintType: {
      type: DataTypes.ENUM(...Object.values(ComplaintType)),
      allowNull: true,
    },
    reportId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'reports',
        key: 'id',
      },
      onDelete: 'SET NULL',
    },
    beforePhoto: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    afterPhoto: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'route_stops',
    timestamps: true,
    indexes: [
      { fields: ['routeId'] },
      { fields: ['status'] },
      { fields: ['reportId'] },
      { fields: ['sequence'] },
    ],
  }
);

// ============================================
// ASSOCIATIONS
// ============================================
Route.hasMany(RouteStop, {
  foreignKey: 'routeId',
  as: 'stops',
  onDelete: 'CASCADE',
});

RouteStop.belongsTo(Route, {
  foreignKey: 'routeId',
  as: 'route',
});

Report.hasOne(RouteStop, {
  foreignKey: 'reportId',
  as: 'routeStop',
  onDelete: 'SET NULL',
});

RouteStop.belongsTo(Report, {
  foreignKey: 'reportId',
  as: 'report',
});

export default RouteStop;