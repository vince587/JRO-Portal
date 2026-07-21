#!/usr/bin/env node
/**
 * 🚀 Bulk import certificates from a JSON file
 *
 * Run this inside the `api-server/` directory or use `npm run import:certificates`.
 *
 * Usage:
 *   node scripts/import-json.js --file=./certificates-export.json
 *
 * The JSON file should be an array of certificate objects (exported from old Firebase).
 * It will be mapped to the current portal's CertificateDoc schema.
 */

const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");

// Detect script location — run from api-server/ dir
const scriptDir = __dirname;
const apiServerDir = path.resolve(scriptDir, "..");

// --- Load the api-server service account ---
const SA_PATH = path.join(apiServerDir, "service-account.json");
if (!fs.existsSync(SA_PATH)) {
  console.error(`❌ Missing: ${SA_PATH}`);
  console.error("  This script must be run from the api-server/ directory.");
  console.error("  Usage: cd api-server && node ../scripts/import-json.js --file=./data.json");
  process.exit(1);
}

const sa = JSON.parse(fs.readFileSync(SA_PATH, "utf-8"));
const projectId = sa.project_id || "software-jmcs";

admin.initializeApp({
  credential: admin.credential.cert(sa),
  projectId,
});

const db = admin.firestore();

async function main() {
  const args = process.argv.slice(2);
  const fileArg = args.find((a) => a.startsWith("--file="))?.replace("--file=", "");
  const filePath = fileArg || "./certificates-import.json";

  if (!fs.existsSync(filePath)) {
    console.error(`❌ File not found: ${filePath}`);
    console.error("  Put your JSON file in the api-server/ directory and pass --file=./filename.json");
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  const certs = Array.isArray(raw) ? raw : [raw];

  if (certs.length === 0) {
    console.error("⚠️  No certificates found in the JSON file");
    process.exit(0);
  }

  console.log(`⏳ Importing ${certs.length} certificates...\n`);

  const now = new Date();
  const isoNow = now.toISOString();

  let imported = 0;
  let errors = [];

  for (const cert of certs) {
    try {
      // Map old field names → current CertificateDoc schema
      const doc = {
        title: cert.title || cert.certificateNumber || `${cert.recipientName || cert.participantName || "Unknown"} — ${new Date().toLocaleDateString()}`,
        recipientName: cert.recipientName || cert.participantName || cert.participant || "",
        recipientEmail: cert.recipientEmail || cert.email || "",
        issuedBy: cert.issuedBy || cert.trainer || cert.company || "",
        issueDate: cert.dateIssued || cert.issueDate || now.toISOString().split("T")[0],
        expiryDate: cert.dateValidUntil || cert.expiryDate || cert.validUntil || "",
        certificateNumber: cert.certificateNumber || cert.certNumber || "",
        trainingType: cert.trainingType || cert.type || "",
        category: (cert.category || "").toLowerCase() || "training",
        standard: cert.standard || "",
        fileUrl: cert.fileUrl || cert.pdfUrl || "",
        qrCodeUrl: cert.qrCodeUrl || "",
        notes: cert.notes || cert.description || "",
        status: cert.status || "active",
        createdById: "system-import",
        createdByName: "Bulk Import",
        createdAt: isoNow,
        updatedAt: isoNow,
      };

      await db.collection("certificates").add(doc);
      imported++;
      process.stdout.write(`\r  ✅ ${imported}/${certs.length}`);
    } catch (err) {
      errors.push({ title: cert.title, error: err.message });
    }
  }

  console.log("\n\n📊 Done!");
  console.log(`   ✅ Imported: ${imported}`);
  console.log(`   ❌ Errors:   ${errors.length}`);
  console.log(`   📂 Location: software-jmcs/certificates`);

  if (errors.length > 0) {
    console.log("\nErrors:");
    errors.forEach((e) => console.log(`   - ${e.title}: ${e.error}`));
  }
}

main();