import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';
import User from './User';

// ============================================
// ENUMS
// ============================================
export enum TruckStatus {
  AVAILABLE = 'available',
  ON_ROUTE = 'on-route',
  MAINTENANCE = 'maintenance',
  OFFLINE = 'offline',
}

// ============================================
// ATTRIBUTES INTERFACE
// ============================================
interface TruckAttributes {
  id: string;
  truckId: string;
  registrationNumber: string;
  driverId?: string | null;
  zone: string;
  status: TruckStatus;
  completion: number;
  capacity: number;
  latitude?: number | null;
  longitude?: number | null;
  lastMaintenance: Date;
  nextMaintenance: Date;
  lastUpdate: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

interface TruckCreationAttributes
  extends Optional<
    TruckAttributes,
    | 'id'
    | 'driverId'
    | 'status'
    | 'completion'
    | 'latitude'
    | 'longitude'
    | 'lastUpdate'
    | 'createdAt'
    | 'updatedAt'
  > {}

// ============================================
// MODEL CLASS
// ============================================
class Truck
  extends Model<TruckAttributes, TruckCreationAttributes>
  implements TruckAttributes
{
  public id!: string;
  public truckId!: string;
  public registrationNumber!: string;
  public driverId?: string | null;
  public zone!: string;
  public status!: TruckStatus;
  public completion!: number;
  public capacity!: number;
  public latitude?: number | null;
  public longitude?: number | null;
  public lastMaintenance!: Date;
  public nextMaintenance!: Date;
  public lastUpdate!: Date;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

// ============================================
// MODEL INITIALIZATION
// ============================================
Truck.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    truckId: {
      type: DataTypes.STRING(20),
      allowNull: false,
      unique: true,
    },
    registrationNumber: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true,
    },
    driverId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id',
      },
      onDelete: 'SET NULL',
    },
    zone: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM(...Object.values(TruckStatus)),
      allowNull: false,
      defaultValue: TruckStatus.OFFLINE,
    },
    completion: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      validate: {
        min: 0,
        max: 100,
      },
    },
    capacity: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 100,
      validate: {
        min: 1,
      },
    },
    latitude: {
      type: DataTypes.DECIMAL(10, 8),
      allowNull: true,
    },
    longitude: {
      type: DataTypes.DECIMAL(11, 8),
      allowNull: true,
    },
    lastMaintenance: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    nextMaintenance: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    lastUpdate: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'trucks',
    timestamps: true,
    indexes: [
      { fields: ['truckId'] },
      { fields: ['registrationNumber'] },
      { fields: ['driverId'] },
      { fields: ['zone'] },
      { fields: ['status'] },
    ],
  }
);

// ============================================
// ASSOCIATIONS
// ============================================
User.hasOne(Truck, {
  foreignKey: 'driverId',
  as: 'truck',
  onDelete: 'SET NULL',
});

Truck.belongsTo(User, {
  foreignKey: 'driverId',
  as: 'driver',
});

export default Truck;