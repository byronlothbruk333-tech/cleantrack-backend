import rateLimit from 'express-rate-limit';

// ============================================
// GENERAL API RATE LIMITER
// Applies to all API endpoints as a safety net
// ============================================
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300, // 300 requests per 15 minutes per IP
  message: {
    error: 'Too many requests',
    message: 'Too many requests from this IP. Please try again later.',
  },
  standardHeaders: true, // Return rate limit info in headers
  legacyHeaders: false, // Disable older X-RateLimit-* headers
});

// ============================================
// AUTH RATE LIMITER (Strict)
// For login/register — prevents brute-force
// ============================================
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 attempts per 15 minutes per IP
  message: {
    error: 'Too many authentication attempts',
    message: 'Too many login/register attempts. Please try again in 15 minutes.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // Don't count successful logins
});

// ============================================
// PASSWORD RESET RATE LIMITER (Very Strict)
// For future password reset endpoint
// ============================================
export const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // 3 attempts per hour
  message: {
    error: 'Too many password reset attempts',
    message: 'Please wait before requesting another password reset.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});