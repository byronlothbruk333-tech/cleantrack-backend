import { OAuth2Client } from 'google-auth-library';

// ============================================
// GOOGLE OAUTH CLIENT
// ============================================
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// ============================================
// VERIFIED GOOGLE USER INTERFACE
// ============================================
export interface VerifiedGoogleUser {
  googleId: string;
  email: string;
  emailVerified: boolean;
  name: string;
  picture?: string;
}

// ============================================
// VERIFY GOOGLE ID TOKEN
// Takes a Google ID token from the client
// Returns verified user info, or throws error
// ============================================
export const verifyGoogleToken = async (
  idToken: string
): Promise<VerifiedGoogleUser> => {
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();

    if (!payload) {
      throw new Error('Invalid Google token payload');
    }

    if (!payload.email) {
      throw new Error('Google account has no email');
    }

    return {
      googleId: payload.sub, // Google's unique user ID
      email: payload.email.toLowerCase(),
      emailVerified: payload.email_verified ?? false,
      name: payload.name || payload.email.split('@')[0],
      picture: payload.picture,
    };
  } catch (error: any) {
    console.error('Google token verification failed:', error.message);
    throw new Error('Invalid or expired Google token');
  }
};