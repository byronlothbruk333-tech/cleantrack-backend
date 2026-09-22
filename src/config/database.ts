import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';
import path from 'path';

// Load .env FIRST, before anything else
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const DATABASE_URL = process.env.DATABASE_URL;

// Debug: print what we found
console.log('🔧 DATABASE_URL is:', DATABASE_URL ? '✅ loaded' : '❌ undefined');

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL is not set in your .env file!');
  console.error('Current working directory:', process.cwd());
  process.exit(1);
}

const sequelize = new Sequelize(DATABASE_URL, {
  dialect: 'postgres',
  logging: process.env.NODE_ENV === 'development' ? console.log : false,
  pool: {
    max: 5,
    min: 0,
    acquire: 60000,
    idle: 10000,
  },
  dialectOptions: {
    ssl: {
      require: true,
      rejectUnauthorized: false,
    },
  },
});

export default sequelize;