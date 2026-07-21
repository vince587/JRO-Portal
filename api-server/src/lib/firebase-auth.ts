import admin from "firebase-admin";
import { logger } from "./logger";

/**
 * Verify a user's email/password using the Firebase Auth REST API.
 *
 * The Firebase Admin SDK cannot verify a plaintext password, so we use the
 * public Identity Toolkit "signInWithPassword" endpoint with the project's
 * web API key. This is used for re-authentication before sensitive actions
 * (e.g. changing your own password).
 *
 * Set FIREBASE_API_KEY in the server environment to enable this.
 */
export async function verifyPassword(email: string, password: string): Promise<boolean> {
  const apiKey = process.env.FIREBASE_API_KEY;
  if (!apiKey) {
    logger.warn("FIREBASE_API_KEY not set — verifyPassword will always return false");
    return false;
  }
  try {
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, returnSecureToken: true }),
      }
    );
    return res.ok;
  } catch {
    return false;
  }
}

export function getFirebaseAuth(): admin.auth.Auth | null {
  try {
    return admin.auth();
  } catch {
    return null;
  }
}
