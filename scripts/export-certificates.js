#!/usr/bin/env node
/**
 * Export certificates from the OLD Firebase project (vince-project-88c41)
 * and save as JSON for import into the new portal.
 *
 * Usage: node export-certificates.js > output.json
 *        (or specify output file: node export-certificates.js --out=certificates.json)
 */

const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");
const { program } = require("commander");

program
  .option("-o, --out <file>", "Output JSON file path", "./certificates-export.json")
  .option("--pretty", "Pretty-print JSON", false)
  .parse(process.argv);

const opts = program.opts();

// --- Old Firebase project credentials (from reference HTML) ---
const OLD_PROJECT_CONFIG = {
  apiKey: "AIzaSyBOHfP3BGJGfnJq4FvLIgg-7pO77QCfOYI",
  authDomain: "vince-project-88c41.firebaseapp.com",
  projectId: "vince-project-88c41",
  storageBucket: "vince-project-88c41.firebasestorage.app",
  messagingSenderId: "45601787434",
  appId: "1:45601787434:web:4acd3585f8de6b0c163d53",
};

// --- Service account for the old project (needs private key) ---
// If you don't have the service account key, use the browser SDK approach below.
// For server-side export, we need a service account.

const SERVICE_ACCOUNT = {
  type: "service_account",
  project_id: "vince-project-88c41",
  // NOTE: You need the real private_key JSON here.
  // Get it from: Firebase Console → Settings → Service accounts → Generate new private key
  private_key: process.env.OLD_FIREBASE_PRIVATE_KEY,
  client_email: "firebase-adminsdk@vince-project-88c41.iam.gserviceaccount.com",
  // ... other fields
};

async function main() {
  // Fallback: if no service account, we warn
  if (!process.env.OLD_FIREBASE_PRIVATE_KEY) {
    console.warn(
      "[WARN] No OLD_FIREBASE_PRIVATE_KEY env var set.\n" +
      "  To export certificates from the old project, set:\n" +
      "    export OLD_FIREBASE_PRIVATE_KEY='<your-private-key>'\n" +
      "  where the private key is from vince-project-88c41 Firebase Console."
    );
    console.error("Cannot connect — missing credentials");
    process.exit(1);
  }

  // Initialize the old Firebase Admin
  const oldApp = admin.initializeApp({
    credential: admin.credential.cert({
      projectId: "vince-project-88c41",
      clientEmail: "firebase-adminsdk@vince-project-88c41.iam.gserviceaccount.com",
      privateKey: process.env.OLD_FIREBASE_PRIVATE_KEY,
    }),
    projectId: "vince-project-88c41",
  });

  const db = oldApp.firestore();
  const snapshot = await db.collection("certificates").get();

  if (snapshot.empty) {
    console.log("[]");
    console.error("[INFO] No certificates found in vince-project-88c41.firebaseio.com");
    process.exit(0);
  }

  const certificates = snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));

  const output = certificates.map((c) => ({
    // Map to match the current portal's schema
    title: c.title || c.certificateNumber || "Unknown",
    recipientName: c.participantName || c.recipientName || c.participant || "",
    recipientEmail: c.email || c.recipientEmail || "",
    issuedBy: c.issuedBy || c.trainer || c.company || "",
    issueDate: c.dateIssued || c.issueDate || "",
    expiryDate: c.dateValidUntil || c.expiryDate || c.validUntil || "",
    certificateNumber: c.certificateNumber || c.certNumber || "",
    trainingType: c.trainingType || c.type || "",
    category: c.category || (c.type === "ISO" ? "iso" : "training"),
    standard: c.standard || "",
    fileUrl: c.pdfUrl || c.fileUrl || "",
    qrCodeUrl: c.qrCodeUrl || "",
    notes: c.notes || c.description || "",
    status: c.status || (new Date(c.expiryDate || c.dateValidUntil) < new Date() ? "expired" : "active"),
    // Preserve original fields
    _originalId: doc.id,
    _originalFields: Object.keys(doc.data()).filter((k) => !["id", "createdAt", "updatedAt"].includes(k)),
  }));

  const json = opts.pretty ? JSON.stringify(certificates, null, 2) : JSON.stringify(certificates);

  if (opts.out) {
    fs.writeFileSync(opts.out, json, "utf-8");
    console.log(`✅ Exported ${certificates.length} certificates to ${opts.out}`);
  } else {
    console.log(json);
  }

  await oldApp.delete();
}

main().catch((err) => {
  console.error("Export failed:", err);
  process.exit(1);
});