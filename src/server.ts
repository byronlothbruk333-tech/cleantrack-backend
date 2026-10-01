// ============================================
// ✅ FORCE IPv4 DNS — MUST BE THE VERY FIRST IMPORT
// ============================================
import dns from 'dns';
dns.setDefaultResultOrder('ipv4first');

// ============================================
// ALL OTHER IMPORTS
// ============================================
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import dotenv from 'dotenv';
import sequelize from './config/database';
import './models/User';
import './models/RefreshToken';
import './models/Report';
import './models/ReportComment';
import './models/Truck';
import './models/Route';
import './models/RouteStop';
import authRoutes from './routes/authRoutes';
import reportRoutes from './routes/reportRoutes';
import truckRoutes from './routes/truckRoutes';
import kpiRoutes from './routes/kpiRoutes';
import scheduleRoutes from './routes/scheduleRoutes';
import routeRoutes from './routes/routeRoutes';
import uploadRoutes from './routes/uploadRoutes';
import userRoutes from './routes/userRoutes';
import { apiLimiter } from './middleware/rateLimiter';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// ============================================
// MIDDLEWARE
// ============================================
app.use(helmet());
app.use(
  cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
  })
);
app.use(compression());
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ============================================
// ✅ DISABLE CACHING FOR ALL API RESPONSES
// ============================================
app.use((req, res, next) => {
  res.setHeader(
    'Cache-Control',
    'no-store, no-cache, must-revalidate, proxy-revalidate'
  );
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
  next();
});

// ============================================
// ROUTES
// ============================================
app.use('/api', apiLimiter);

app.use('/api/auth', authRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/trucks', truckRoutes);
app.use('/api/kpis', kpiRoutes);
app.use('/api/schedules', scheduleRoutes);
app.use('/api/routes', routeRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/users', userRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    message: '🌍 CleanTrack Backend is running',
    version: '1.0.0',
  });
});

// API info
app.get('/api', (req, res) => {
  res.json({
    name: 'CleanTrack API',
    description: 'Smart Waste Management for Cleaner Cities',
    version: '1.0.0',
  });
});

// ============================================
// ERROR HANDLING
// ============================================
app.use(
  (
    err: any,
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    console.error(err.stack);
    res.status(500).json({
      error: 'Something went wrong!',
      message:
        process.env.NODE_ENV === 'development' ? err.message : undefined,
    });
  }
);

app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// ============================================
// START SERVER
// ============================================
const startServer = async () => {
  try {
    // ✅ WARM UP THE CONNECTION POOL BEFORE ACCEPTING REQUESTS
    // This forces Sequelize to open all pool connections eagerly,
    // so the first real request doesn't pay the SSL handshake cost.
    console.log('🔥 Warming up database connection pool...');
    const warmupStart = Date.now();

    await Promise.all([
      sequelize.query('SELECT 1'),
      sequelize.query('SELECT 1'),
      sequelize.query('SELECT 1'),
      sequelize.query('SELECT 1'),
      sequelize.query('SELECT 1'),
    ]);

    console.log(`✅ Pool warmed up in ${Date.now() - warmupStart}ms`);

    await sequelize.authenticate();
    console.log('✅ Database connection established successfully');

    await sequelize.sync();
    console.log('✅ Database models synced');

    console.log(`🔗 Connected to: ${process.env.SUPABASE_URL}`);

    app.listen(PORT, () => {
      console.log('');
      console.log('🌍 ================================================');
      console.log('🚀 CleanTrack Backend is running!');
      console.log(`📡 Server:       http://localhost:${PORT}`);
      console.log(`📊 Health:       http://localhost:${PORT}/api/health`);
      console.log(`🌐 API:          http://localhost:${PORT}/api`);
      console.log(`🔐 Auth:         http://localhost:${PORT}/api/auth`);
      console.log('🌍 ================================================');
      console.log('');
    });
  } catch (error) {
    console.error('❌ Server startup error:', error);
    process.exit(1);
  }
};

startServer();