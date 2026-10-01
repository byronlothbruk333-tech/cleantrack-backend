import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';
import User from './User';

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
// ATTRIBUTES INTERFACE
// ============================================
interface RouteAttributes {
  id: string;
  truckId: string;
  zone: string;
  suburb: string;
  scheduledDate: Date;
  scheduledStart: Date;
  scheduledEnd: Date;
  actualStart?: Date | null;
  actualEnd?: Date | null;
  estimatedDuration: number;
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
    | 'actualStart'
    | 'actualEnd'
    | 'status'
    | 'completedStops'
    | 'notes'
    | 'createdAt'
    | 'updatedAt'
  > {}

// ============================================
// MODEL CLASS
// ============================================
class Route
  extends Model<RouteAttributes, RouteCreationAttributes>
  implements RouteAttributes
{
  public id!: string;
  public truckId!: string;
  public zone!: string;
  public suburb!: string;
  public scheduledDate!: Date;
  public scheduledStart!: Date;
  public scheduledEnd!: Date;
  public actualStart?: Date | null;
  public actualEnd?: Date | null;
  public estimatedDuration!: number;
  public status!: RouteStatus;
  public totalStops!: number;
  public completedStops!: number;
  public notes?: string | null;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

// ============================================
// MODEL INITIALIZATION
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
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    suburb: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    scheduledDate: {
      type: DataTypes.DATE,
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
    // ✅ NEW: Actual start time (set when first stop is completed)
    actualStart: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    // ✅ NEW: Actual end time (set when all stops are handled)
    actualEnd: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    estimatedDuration: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 480,
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
import Truck from './Truck';

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