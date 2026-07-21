#!/usr/bin/env node
/**
 * Simple script to export certificates from an OLD Firebase project.
 *
 * 1. Get your OLD project's service account key (JSON):
 *    Go to: https://console.firebase.google.com/project/vince-project-88c41/settings/serviceaccounts/adminsdk
 *    Click "Generate new private key" → download the JSON file.
 *    Save it as "old-service-account.json" in this directory.
 *
 * 2. Run:
 *    node scripts/export-old.js
 *
 * 3. Output will be saved as "old-certificates.json"
 */

const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");

// --- STEP 1: Load your old service account ---
// Download from: Firebase Console → Settings → Service accounts → Generate new private key
const SERVICE_ACCOUNT_PATH = path.join(__dirname, "old-service-account.json");

if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
  console.error(`
  ❌ Missing: ${SERVICE_ACCOUNT_PATH}

  To get the service account key:
  1. Go to https://console.firebase.google.com
  2. Select project: vince-project-88c41
  3. Go to Project Settings → Service Accounts
  4. Click "Generate new private key"
  5. Download the JSON file and rename it to "old-service-account.json"
  6. Place it in the scripts/ folder

  Then run this script again.
  `);
  process.exit(1);
}

// --- STEP 2: Connect to Firebase ---
const sa = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, "utf-8"));

admin.initializeApp({
  credential: admin.credential.cert(sa),
  projectId: "vince-project-88c41",
});

const db = admin.firestore();

// --- STEP 3: Read all certificates ---
async function main() {
  console.log("⏳ Connecting to vince-project-88c41...");
  
  const snapshot = await db.collection("certificates").get();
  
  if (snapshot.empty) {
    console.log("✅ No certificates found — nothing to export.");
    fs.writeFileSync("old-certificates.json", "[]", "utf-8");
    process.exit(0);
  }

  const certs = snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      // Keep original Firestore ID as a reference
      id: doc.id,
      
      // Map old fields → new portal field names (adjust as needed)
      title: data.title || data.certificateNumber || "Certificate",
      recipientName: data.participantName || data.recipientName || data.participant || "",
      recipientEmail: data.email || data.recipientEmail || "",
      issuedBy: data.issuedBy || data.trainer || data.company || "",
      issueDate: data.dateIssued || data.issueDate || "",
      expiryDate: data.dateValidUntil || data.expiryDate || data.validUntil || "",
      certificateNumber: data.certificateNumber || data.certNumber || "",
      trainingType: data.trainingType || data.type || "",
      // Determine category: "iso" for ISO certificates, "training" for others
      category: data.category || (data.type?.includes("ISO") ? "iso" : "training"),
      standard: data.standard || "",
      fileUrl: data.pdfUrl || data.fileUrl || "",
      qrCodeUrl: data.qrCodeUrl || "",
      notes: data.notes || data.description || "",
      // Compute status based on expiry
      status: data.status || (new Date(data.expiryDate || data.dateValidUntil) < new Date() ? "expired" : "active"),
      
      // Keep ALL original fields for reference
      _originalFields: Object.keys(data),
    };
  });

  // Write as JSON
  const json = JSON.stringify(certs, null, 2);
  fs.writeFileSync("old-certificates.json", json, "utf-8");
  
  console.log(`✅ Exported ${certs.length} certificates to old-certificates.json`);
  console.log("📁 File: old-certificates.json");
  console.log("Fields mapped:", Object.keys(certs[0]).filter(k => !k.startsWith("_")).join(", "));

  // Show a sample of the first 3 records
  console.log("\n📋 Sample (first 3):");
  certs.slice(0, 3).forEach((c, i) => {
    console.log(`  ${i + 1}. ${c.title} → ${c.recipientName} (${c.category})`);
  });
}

main().catch((err) => {
  console.error("❌ Export failed:", err);
  process.exit(1);
});