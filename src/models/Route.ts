import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';
import Truck from './Truck';
import { ZoneName } from '../constants/portMoresbyZones';

// ============================================
// ENUMS
// ============================================
export enum RouteStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in-progress',
  COMPLETED = 'completed',
  DELAYED = 'delayed',
}

// ============================================
// ATTRIBUTES
// ============================================
interface RouteAttributes {
  id: string;
  truckId: string;
  zone: ZoneName;
  suburb: string;
  scheduledDate: Date;
  scheduledStart: Date;
  scheduledEnd: Date;
  estimatedDuration: number; // minutes
  status: RouteStatus;
  totalStops: number;
  completedStops: number;
  notes?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

interface RouteCreationAttributes
  extends Optional<
    RouteAttributes,
    | 'id'
    | 'status'
    | 'totalStops'
    | 'completedStops'
    | 'notes'
    | 'createdAt'
    | 'updatedAt'
  > {}

// ============================================
// MODEL
// ============================================
class Route
  extends Model<RouteAttributes, RouteCreationAttributes>
  implements RouteAttributes
{
  public id!: string;
  public truckId!: string;
  public zone!: ZoneName;
  public suburb!: string;
  public scheduledDate!: Date;
  public scheduledStart!: Date;
  public scheduledEnd!: Date;
  public estimatedDuration!: number;
  public status!: RouteStatus;
  public totalStops!: number;
  public completedStops!: number;
  public notes?: string | null;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

// ============================================
// INITIALIZATION
// ============================================
Route.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    truckId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'trucks',
        key: 'id',
      },
      onDelete: 'CASCADE',
    },
    zone: {
      type: DataTypes.STRING(20),
      allowNull: false,
    },
    suburb: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    scheduledDate: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    scheduledStart: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    scheduledEnd: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    estimatedDuration: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 480, // 8 hours default
    },
    status: {
      type: DataTypes.ENUM(...Object.values(RouteStatus)),
      allowNull: false,
      defaultValue: RouteStatus.PENDING,
    },
    totalStops: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    completedStops: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'routes',
    timestamps: true,
    indexes: [
      { fields: ['truckId'] },
      { fields: ['zone'] },
      { fields: ['scheduledDate'] },
      { fields: ['status'] },
    ],
  }
);

// ============================================
// ASSOCIATIONS
// ============================================
Truck.hasMany(Route, {
  foreignKey: 'truckId',
  as: 'routes',
  onDelete: 'CASCADE',
});

Route.belongsTo(Truck, {
  foreignKey: 'truckId',
  as: 'truck',
});

export default Route;