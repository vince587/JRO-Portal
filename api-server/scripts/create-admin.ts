// scripts/create-admin.ts
// Create a Firebase Auth user (or reuse existing) and ensure their Firestore 'users' doc
// has role: "admin". Uses api-server/service-account.json (full admin privileges).
//
// Usage:
//   npm run create-admin -- <email> <password> [fullName] [department]
//   node --experimental-strip-types scripts/create-admin.ts <email> <password> [fullName] [department]
//
// Examples:
//   npm run create-admin -- vince@jro-jmcs.com 'Secret123!' "Vince R."
//   npm run create-admin -- admin@software-jmcs.com 'ChangeMe123!' "Admin" "JMCS"

import admin from "firebase-admin";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const serviceAccountPath = resolve(__dirname, "..", "service-account.json");

interface UserDoc {
  uid: string;
  username: string;
  email: string;
  fullName: string | null;
  role: string;
  department: string | null;
  isActive: boolean;
  canAccessSis: boolean;
  canAccessJmcs: boolean;
  canEditCalendar: boolean;
  canEditTrainingProposal: boolean;
  canManageContracts: boolean;
  photoUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

function die(msg: string): never {
  console.error(`\n✗ ${msg}\n`);
  process.exit(1);
}

const [, , emailArg, passwordArg, fullNameArg, departmentArg] = process.argv;

if (!emailArg || !passwordArg) {
  console.error("Usage: npm run create-admin -- <email> <password> [fullName] [department]");
  console.error('Example: npm run create-admin -- admin@software-jmcs.com "ChangeMe123!" "Admin"');
  process.exit(1);
}

if (passwordArg.length < 6) {
  die("Password must be at least 6 characters (Firebase Auth minimum).");
}

let serviceAccount: admin.ServiceAccount;
try {
  serviceAccount = JSON.parse(readFileSync(serviceAccountPath, "utf8"));
} catch (err) {
  die(
    `Could not read ${serviceAccountPath}.\n` +
      "Make sure api-server/service-account.json exists and contains a valid service account JSON.\n" +
      `Underlying error: ${(err as Error).message}`,
  );
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const auth = admin.auth();
const db = admin.firestore();

async function ensureAuthUser(email: string, password: string, displayName?: string): Promise<string> {
  try {
    const existing = await auth.getUserByEmail(email);
    console.log(`• Firebase Auth user already exists: ${existing.uid}`);
    await auth.updateUser(existing.uid, { password });
    console.log(`  ↳ password refreshed`);
    return existing.uid;
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (code === "auth/user-not-found") {
      const created = await auth.createUser({
        email,
        password,
        displayName: displayName || email.split("@")[0],
      });
      console.log(`• Created Firebase Auth user: ${created.uid}`);
      return created.uid;
    }
    throw err;
  }
}

async function ensureFirestoreUserDoc(
  uid: string,
  email: string,
  fullName: string | null,
  department: string | null,
): Promise<{ created: boolean; prevRole: string | null }> {
  const ref = db.collection("users").doc(uid);
  const snap = await ref.get();
  const now = new Date().toISOString();
  const username = email.split("@")[0];

  if (!snap.exists) {
    const newDoc: UserDoc = {
      uid,
      username,
      email,
      fullName,
      role: "admin",
      department,
      isActive: true,
      canAccessSis: true,
      canAccessJmcs: true,
      canEditCalendar: true,
      canEditTrainingProposal: true,
      canManageContracts: true,
      photoUrl: null,
      createdAt: now,
      updatedAt: now,
    };
    await ref.set(newDoc);
    return { created: true, prevRole: null };
  }

  const before = snap.data() as Partial<UserDoc>;
  const prevRole = (before.role as string | undefined) ?? null;
  const update: Partial<UserDoc> = {
    role: "admin",
    updatedAt: now,
    email,
    uid,
    username: before.username || username,
    isActive: before.isActive ?? true,
    fullName: before.fullName ?? fullName,
    department: before.department ?? department,
    canAccessSis: before.canAccessSis ?? true,
    canAccessJmcs: before.canAccessJmcs ?? true,
    canEditCalendar: before.canEditCalendar ?? true,
    canEditTrainingProposal: before.canEditTrainingProposal ?? true,
    canManageContracts: before.canManageContracts ?? true,
    photoUrl: before.photoUrl ?? null,
  };
  await ref.update(update);
  return { created: false, prevRole };
}

async function main(): Promise<void> {
  console.log(`\nCreating admin: ${emailArg}\n`);
  const uid = await ensureAuthUser(emailArg, passwordArg, fullNameArg);
  const { created, prevRole } = await ensureFirestoreUserDoc(
    uid,
    emailArg,
    fullNameArg ?? null,
    departmentArg ?? null,
  );

  console.log("");
  if (created) {
    console.log(`✓ Firestore users/${uid} created with role: admin`);
  } else {
    console.log(
      `✓ Firestore users/${uid} updated: role ${prevRole ?? "?"} -> admin`,
    );
  }
  console.log(`\nDone. ${emailArg} can now sign in to the portal as admin.\n`);
  process.exit(0);
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  const code = (err as { code?: string }).code;
  die(`Failed: ${code ? `${code}: ` : ""}${message}`);
});
