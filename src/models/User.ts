import { DataTypes, Model, Optional } from 'sequelize';
import bcrypt from 'bcryptjs';
import sequelize from '../config/database';

// ============================================
// USER ROLE & STATUS ENUMS
// ============================================
export enum UserRole {
  CITIZEN = 'citizen',
  DRIVER = 'driver',
  ADMIN = 'admin',
  MANAGEMENT = 'management',
}

export enum UserStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  SUSPENDED = 'suspended',
}

// ============================================
// USER ATTRIBUTES INTERFACE
// ============================================
interface UserAttributes {
  id: string;
  name: string;
  email: string;
  password: string;
  role: UserRole;
  status: UserStatus;
  googleId?: string | null;
  avatar?: string | null;
  phone?: string | null;
  address?: string | null;
  zone?: string | null;
  emailNotifications: boolean;
  smsNotifications: boolean;
  deleted: boolean;
  deletedAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

interface UserCreationAttributes
  extends Optional<
    UserAttributes,
    | 'id'
    | 'status'
    | 'googleId'
    | 'avatar'
    | 'phone'
    | 'address'
    | 'zone'
    | 'emailNotifications'
    | 'smsNotifications'
    | 'deleted'
    | 'deletedAt'
    | 'createdAt'
    | 'updatedAt'
  > {}

// ============================================
// USER MODEL CLASS
// ============================================
class User
  extends Model<UserAttributes, UserCreationAttributes>
  implements UserAttributes
{
  public id!: string;
  public name!: string;
  public email!: string;
  public password!: string;
  public role!: UserRole;
  public status!: UserStatus;
  public googleId?: string | null;
  public avatar?: string | null;
  public phone?: string | null;
  public address?: string | null;
  public zone?: string | null;
  public emailNotifications!: boolean;
  public smsNotifications!: boolean;
  public deleted!: boolean;
  public deletedAt?: Date | null;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;

  // ============================================
  // INSTANCE METHODS
  // ============================================
  public async comparePassword(candidatePassword: string): Promise<boolean> {
    return bcrypt.compare(candidatePassword, this.password);
  }

  public toJSON(): object {
    const values = { ...this.get() } as any;
    delete values.password;
    return values;
  }
}

// ============================================
// MODEL INITIALIZATION
// ============================================
User.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    email: {
      type: DataTypes.STRING(150),
      allowNull: false,
      unique: true,
      validate: {
        isEmail: true,
      },
    },
    password: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    role: {
      type: DataTypes.ENUM(...Object.values(UserRole)),
      allowNull: false,
      defaultValue: UserRole.CITIZEN,
    },
    status: {
      type: DataTypes.ENUM(...Object.values(UserStatus)),
      allowNull: false,
      defaultValue: UserStatus.ACTIVE,
    },
    googleId: {
      type: DataTypes.STRING(100),
      allowNull: true,
      unique: true,
    },
    avatar: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    phone: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },
    address: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    zone: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    emailNotifications: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    smsNotifications: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    deleted: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    deletedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'users',
    timestamps: true,
    hooks: {
      beforeCreate: async (user: User) => {
        if (user.password) {
          user.password = await bcrypt.hash(user.password, 10);
        }
      },
      beforeUpdate: async (user: User) => {
        if (user.changed('password')) {
          user.password = await bcrypt.hash(user.password, 10);
        }
      },
    },
  }
);

export default User;