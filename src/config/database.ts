import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';
import path from 'path';
import dns from 'dns';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const DATABASE_URL = process.env.DATABASE_URL;

console.log('🔧 DATABASE_URL is:', DATABASE_URL ? '✅ loaded' : '❌ undefined');

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL is not set in your .env file!');
  console.error('Current working directory:', process.cwd());
  process.exit(1);
}

// ============================================
// ✅ PRE-RESOLVE THE DATABASE HOSTNAME
// This avoids intermittent DNS failures when multiple
// parallel queries try to resolve the same hostname.
// ============================================
const resolveDbHost = async (url: string): Promise<string> => {
  try {
    const hostname = new URL(url).hostname;

    return new Promise((resolve) => {
      dns.lookup(hostname, { family: 4 }, (err, address) => {
        if (err || !address) {
          console.warn(
            `⚠️ Could not pre-resolve ${hostname}, falling back to hostname`
          );
          resolve(url);
        } else {
          console.log(`✅ Pre-resolved ${hostname} → ${address}`);
          // Replace hostname in the URL with the resolved IP
          const ipUrl = url.replace(hostname, address);
          resolve(ipUrl);
        }
      });
    });
  } catch (err) {
    console.warn('⚠️ URL parse failed, using original:', err);
    return url;
  }
};

// ============================================
// CREATE SEQUELIZE INSTANCE
// ============================================
let sequelizeInstance: Sequelize;

const initSequelize = async (): Promise<Sequelize> => {
  const resolvedUrl = await resolveDbHost(DATABASE_URL);

  // For SSL, we still need the original hostname for SNI
  const originalHostname = new URL(DATABASE_URL).hostname;

  sequelizeInstance = new Sequelize(resolvedUrl, {
    dialect: 'postgres',
    logging: process.env.NODE_ENV === 'development' ? console.log : false,

    pool: {
      max: 10,
      min: 2,
      acquire: 30000,
      idle: 30000,
      evict: 1000,
    },

    dialectOptions: {
      ssl: {
        require: true,
        rejectUnauthorized: false,
        servername: originalHostname, // ✅ Important for SSL SNI
      },
      keepAlive: true,
      keepAliveInitialDelayMillis: 10000,
    },

    retry: {
      match: [
        /ETIMEDOUT/,
        /EHOSTUNREACH/,
        /ECONNRESET/,
        /ECONNREFUSED/,
        /ENOTFOUND/, // ✅ Add this
        /SequelizeConnectionError/,
        /SequelizeConnectionRefusedError/,
        /SequelizeHostNotFoundError/,
        /SequelizeHostNotReachableError/,
        /SequelizeInvalidConnectionError/,
        /SequelizeConnectionTimedOutError/,
      ],
      max: 5, // Increased from 3
    },
  });

  return sequelizeInstance;
};

// Synchronously export a lazily-initialized instance
// by re-resolving on first use.
const sequelize = new Sequelize(DATABASE_URL, {
  dialect: 'postgres',
  logging: process.env.NODE_ENV === 'development' ? console.log : false,

  pool: {
    max: 10,
    min: 2,
    acquire: 30000,
    idle: 30000,
    evict: 1000,
  },

  dialectOptions: {
    ssl: {
      require: true,
      rejectUnauthorized: false,
    },
    keepAlive: true,
    keepAliveInitialDelayMillis: 10000,
  },

  retry: {
    match: [
      /ETIMEDOUT/,
      /EHOSTUNREACH/,
      /ECONNRESET/,
      /ECONNREFUSED/,
      /ENOTFOUND/,
      /SequelizeConnectionError/,
      /SequelizeConnectionRefusedError/,
      /SequelizeHostNotFoundError/,
      /SequelizeHostNotReachableError/,
      /SequelizeInvalidConnectionError/,
      /SequelizeConnectionTimedOutError/,
    ],
    max: 5,
  },
});

export { initSequelize };
export default sequelize;