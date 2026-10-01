import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';
import User from './User';

// ============================================
// ENUMS
// ============================================
export enum IssueType {
  MISSED_COLLECTION = 'missed-collection',
  ILLEGAL_DUMPING = 'illegal-dumping',
  OVERFLOWING_BIN = 'overflowing-bin',
  OTHER = 'other',
}

export enum ReportStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in-progress',
  RESOLVED = 'resolved',
  REJECTED = 'rejected',
}

export enum Priority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

// ============================================
// ATTRIBUTES INTERFACE
// ============================================
interface ReportAttributes {
  id: string;
  citizenId: string;
  issueType: IssueType;
  description: string;
  address: string;
  zone?: string | null; // ADDED
  latitude?: number | null;
  longitude?: number | null;
  photos: string[];
  status: ReportStatus;
  priority: Priority;
  assignedTo?: string | null;
  resolvedAt?: Date | null;
  contactName?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

interface ReportCreationAttributes
  extends Optional<
    ReportAttributes,
    | 'id'
    | 'zone' // ADDED
    | 'latitude'
    | 'longitude'
    | 'photos'
    | 'status'
    | 'priority'
    | 'assignedTo'
    | 'resolvedAt'
    | 'contactName'
    | 'contactPhone'
    | 'contactEmail'
    | 'createdAt'
    | 'updatedAt'
  > {}

// ============================================
// MODEL CLASS
// ============================================
class Report
  extends Model<ReportAttributes, ReportCreationAttributes>
  implements ReportAttributes
{
  public id!: string;
  public citizenId!: string;
  public issueType!: IssueType;
  public description!: string;
  public address!: string;
  public zone?: string | null; // ADDED
  public latitude?: number | null;
  public longitude?: number | null;
  public photos!: string[];
  public status!: ReportStatus;
  public priority!: Priority;
  public assignedTo?: string | null;
  public resolvedAt?: Date | null;
  public contactName?: string | null;
  public contactPhone?: string | null;
  public contactEmail?: string | null;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

// ============================================
// MODEL INITIALIZATION
// ============================================
Report.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    citizenId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'users', key: 'id' },
      onDelete: 'CASCADE',
    },
    issueType: {
      type: DataTypes.ENUM(...Object.values(IssueType)),
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    address: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    // ADDED
    zone: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    latitude: {
      type: DataTypes.DECIMAL(10, 8),
      allowNull: true,
    },
    longitude: {
      type: DataTypes.DECIMAL(11, 8),
      allowNull: true,
    },
    photos: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      allowNull: false,
      defaultValue: [],
    },
    status: {
      type: DataTypes.ENUM(...Object.values(ReportStatus)),
      allowNull: false,
      defaultValue: ReportStatus.PENDING,
    },
    priority: {
      type: DataTypes.ENUM(...Object.values(Priority)),
      allowNull: false,
      defaultValue: Priority.MEDIUM,
    },
    assignedTo: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'users', key: 'id' },
      onDelete: 'SET NULL',
    },
    resolvedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    contactName: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    contactPhone: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },
    contactEmail: {
      type: DataTypes.STRING(150),
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'reports',
    timestamps: true,
    indexes: [
      { fields: ['citizenId'] },
      { fields: ['status'] },
      { fields: ['priority'] },
      { fields: ['issueType'] },
      { fields: ['zone'] }, // ADDED for faster zone filtering
      { fields: ['createdAt'] },
    ],
  }
);

// ============================================
// ASSOCIATIONS
// ============================================
User.hasMany(Report, {
  foreignKey: 'citizenId',
  as: 'reports',
  onDelete: 'CASCADE',
});

Report.belongsTo(User, {
  foreignKey: 'citizenId',
  as: 'citizen',
});

Report.belongsTo(User, {
  foreignKey: 'assignedTo',
  as: 'assignedPerson',
});

export default Report;