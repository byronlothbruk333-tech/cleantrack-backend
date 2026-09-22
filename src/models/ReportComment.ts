import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';
import User from './User';
import Report from './Report';

// ============================================
// ATTRIBUTES
// ============================================
interface ReportCommentAttributes {
  id: string;
  reportId: string;
  userId: string;
  content: string;
  isInternal: boolean; // true = admin-only note, false = visible to citizen
  createdAt?: Date;
  updatedAt?: Date;
}

interface ReportCommentCreationAttributes
  extends Optional<
    ReportCommentAttributes,
    'id' | 'isInternal' | 'createdAt' | 'updatedAt'
  > {}

// ============================================
// MODEL CLASS
// ============================================
class ReportComment
  extends Model<ReportCommentAttributes, ReportCommentCreationAttributes>
  implements ReportCommentAttributes
{
  public id!: string;
  public reportId!: string;
  public userId!: string;
  public content!: string;
  public isInternal!: boolean;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

// ============================================
// INITIALIZATION
// ============================================
ReportComment.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    reportId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'reports',
        key: 'id',
      },
      onDelete: 'CASCADE',
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id',
      },
      onDelete: 'CASCADE',
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    isInternal: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
  },
  {
    sequelize,
    tableName: 'report_comments',
    timestamps: true,
    indexes: [
      { fields: ['reportId'] },
      { fields: ['userId'] },
    ],
  }
);

// ============================================
// ASSOCIATIONS
// ============================================
Report.hasMany(ReportComment, {
  foreignKey: 'reportId',
  as: 'comments',
  onDelete: 'CASCADE',
});

ReportComment.belongsTo(Report, {
  foreignKey: 'reportId',
  as: 'report',
});

User.hasMany(ReportComment, {
  foreignKey: 'userId',
  as: 'comments',
});

ReportComment.belongsTo(User, {
  foreignKey: 'userId',
  as: 'author',
});

export default ReportComment;