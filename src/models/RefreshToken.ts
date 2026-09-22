import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';
import User from './User';

interface RefreshTokenAttributes {
  id: string;
  token: string;
  userId: string;
  expiresAt: Date;
  revoked: boolean;
  replacedByToken?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

interface RefreshTokenCreationAttributes
  extends Optional<RefreshTokenAttributes, 'id' | 'revoked' | 'replacedByToken' | 'createdAt' | 'updatedAt'> {}

class RefreshToken
  extends Model<RefreshTokenAttributes, RefreshTokenCreationAttributes>
  implements RefreshTokenAttributes
{
  public id!: string;
  public token!: string;
  public userId!: string;
  public expiresAt!: Date;
  public revoked!: boolean;
  public replacedByToken?: string | null;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;

  public isExpired(): boolean {
    return new Date() > this.expiresAt;
  }

  public isActive(): boolean {
    return !this.revoked && !this.isExpired();
  }
}

RefreshToken.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    token: {
      type: DataTypes.STRING(500),
      allowNull: false,
      unique: true,
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
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    revoked: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    replacedByToken: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'refresh_tokens',
    timestamps: true,
  }
);

// Associations
User.hasMany(RefreshToken, { foreignKey: 'userId', as: 'refreshTokens', onDelete: 'CASCADE' });
RefreshToken.belongsTo(User, { foreignKey: 'userId', as: 'user' });

export default RefreshToken;