import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import multer from "multer";
import path from "path";
import { requirePermission, requireAnyPermission, requireAuth, hasRole } from "../middlewares/auth";
import {
  getDoc, createDoc, updateDoc, getStorageBucket,
  type ContractDoc, type ProjectDoc, type CertificateDoc, type EmployeeDoc, type HrisDocumentDoc,
} from "../lib/firebase-db";
import { emitChange } from "./sse";

const router: IRouter = Router();

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [".pdf", ".doc", ".docx", ".xls", ".xlsx", ".csv", ".jpg", ".jpeg", ".png", ".txt"];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error("File type not allowed"));
  },
});

function handleUpload(req: Request, res: Response, next: NextFunction) {
  upload.single("file")(req, res, (err: unknown) => {
    if (err) {
      const e = err as Error & { code?: string };
      let message = "Upload failed";
      if (e.code === "LIMIT_FILE_SIZE") message = "File is too large (max 10MB)";
      else if (e.message === "File type not allowed") message = "File type not allowed. Use PDF, DOC, DOCX, XLS, XLSX, CSV, JPG, PNG, or TXT";
      res.status(400).json({ error: message });
      return;
    }
    next();
  });
}

/**
 * Persist an uploaded file to Firebase Storage (cloud bucket) so it survives
 * external/Cloud Run deployments where the local filesystem is ephemeral.
 * Returns a server-signed (rule-independent) download URL plus the full
 * storage path so it can be re-signed later.
 */
const SIGNED_URL_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

async function saveToStorage(
  folder: string,
  originalname: string,
  buffer: Buffer,
  mimetype: string,
): Promise<{ url: string; storedAs: string }> {
  const bucket = getStorageBucket();
  const ext = path.extname(originalname).toLowerCase();
  const storedAs = `documents/${folder}/${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
  const file = bucket.file(storedAs);
  await file.save(buffer, {
    metadata: { contentType: mimetype, metadata: { originalName: originalname } },
  });
  const [url] = await file.getSignedUrl({ action: "read", expires: Date.now() + SIGNED_URL_TTL_MS });
  return { url, storedAs };
}

router.post("/upload/contract/:id", requireAnyPermission("canAccessJmcs", "canAccessSis"), handleUpload, async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  if (!req.file) { res.status(400).json({ error: "No file uploaded" }); return; }
  const contract = await getDoc<ContractDoc>("contracts", id);
  if (!contract) { res.status(404).json({ error: "Contract not found" }); return; }
  const currentUser = req.currentUser!;
  const typeAllowed = hasRole(currentUser, "admin", "ADMIN", "IT")
    || (contract.type === "SIS" && !!currentUser.canAccessSis)
    || (contract.type === "JMCS" && !!currentUser.canAccessJmcs);
  if (!typeAllowed) {
    res.status(403).json({ error: "sorry you dont have permission to upload to this contract" }); return;
  }
  const { url, storedAs } = await saveToStorage("contracts", req.file.originalname, req.file.buffer, req.file.mimetype);
  await updateDoc<ContractDoc>("contracts", id, {
    documentName: req.file.originalname,
    documentStoredAs: storedAs,
    updatedAt: new Date().toISOString(),
  });
  await createDoc("activity", {
    type: "contract",
    description: `File "${req.file.originalname}" uploaded to contract "${contract.title}"`,
    entityId: id,
    timestamp: new Date().toISOString(),
  });
  emitChange("contract", "updated", id);
  res.json({ filename: req.file.originalname, storedAs, url, size: req.file.size });
});

router.post("/upload/project/:id", requirePermission("canAccessJmcs"), handleUpload, async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  if (!req.file) { res.status(400).json({ error: "No file uploaded" }); return; }
  const project = await getDoc<ProjectDoc>("projects", id);
  if (!project) { res.status(404).json({ error: "Project not found" }); return; }
  const { url, storedAs } = await saveToStorage("projects", req.file.originalname, req.file.buffer, req.file.mimetype);
  await createDoc("activity", {
    type: "project",
    description: `File "${req.file.originalname}" uploaded to project "${project.title}"`,
    entityId: id,
    timestamp: new Date().toISOString(),
  });
  emitChange("project", "updated", id);
  res.json({ filename: req.file.originalname, storedAs, url, size: req.file.size });
});

router.post("/upload/hris/:id", requireAuth, handleUpload, async (req, res): Promise<void> => {
  const currentUser = req.currentUser!;
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  if (!req.file) { res.status(400).json({ error: "No file uploaded" }); return; }
  const employee = await getDoc<EmployeeDoc>("employees", id);
  if (!employee) { res.status(404).json({ error: "Employee not found" }); return; }
  if (!hasRole(currentUser, "admin", "ADMIN", "IT") && employee.userId !== currentUser.id) {
    res.status(403).json({ error: "Access denied" }); return;
  }
  const { url, storedAs } = await saveToStorage("hris", req.file.originalname, req.file.buffer, req.file.mimetype);
  const now = new Date().toISOString();
  const doc = await createDoc<HrisDocumentDoc>("hrisDocuments", {
    employeeRef: id,
    employeeId: employee.employeeId,
    filename: req.file.originalname,
    storedAs,
    fileUrl: url,
    size: req.file.size,
    type: path.extname(req.file.originalname).toLowerCase().replace(/^\./, ""),
    uploadedBy: currentUser.username || currentUser.id,
    uploadedAt: now,
  });
  await createDoc("activity", {
    type: "user",
    description: `HR document "${req.file.originalname}" uploaded for employee "${employee.employeeId}"`,
    entityId: id,
    timestamp: now,
  });
  emitChange("user", "updated", id);
  res.json({ id: doc.id, filename: req.file.originalname, storedAs, url, size: req.file.size });
});

router.post("/upload/bulk-certificates", requirePermission("canAccessJmcs"), handleUpload, async (req, res): Promise<void> => {
  if (!req.file) { res.status(400).json({ error: "No file uploaded" }); return; }
  const csvContent = req.file.buffer.toString("utf-8");
  const lines = csvContent.split("\n").filter(l => l.trim());
  if (lines.length < 2) { res.status(400).json({ error: "CSV must have a header row and at least one data row" }); return; }

  const headers = lines[0].split(",").map(h => h.trim().toLowerCase());
  const titleIdx = headers.indexOf("title");
  const recipientIdx = headers.indexOf("recipient") || headers.indexOf("recipientname") || headers.indexOf("recipient_name");
  const issuedByIdx = headers.indexOf("issuedby") || headers.indexOf("issued_by") || headers.indexOf("issuingauthority");
  const issueDateIdx = headers.indexOf("issuedate") || headers.indexOf("issue_date");
  const expiryDateIdx = headers.indexOf("expirydate") || headers.indexOf("expiry_date");
  const emailIdx = headers.indexOf("email") || headers.indexOf("recipientemail") || headers.indexOf("recipient_email");
  const certNumIdx = headers.indexOf("certificatenumber") || headers.indexOf("certificate_number");
  const trainingTypeIdx = headers.indexOf("trainingtype") || headers.indexOf("training_type");

  const imported: string[] = [];
  const errors: string[] = [];

  const now = new Date().toISOString();

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",").map(c => c.trim().replace(/^"|"$/g, ""));
    try {
      if (!cols[titleIdx] || !cols[recipientIdx] || !cols[issueDateIdx] || !cols[expiryDateIdx]) {
        errors.push(`Row ${i + 1}: missing required fields`); continue;
      }
      const cert = await createDoc("certificates", {
        title: cols[titleIdx],
        recipientName: cols[recipientIdx],
        issuedBy: cols[issuedByIdx] || "Imported",
        issueDate: cols[issueDateIdx],
        expiryDate: cols[expiryDateIdx],
        recipientEmail: cols[emailIdx] || null,
        certificateNumber: cols[certNumIdx] || null,
        trainingType: cols[trainingTypeIdx] || null,
        category: "training",
        standard: null,
        fileUrl: null,
        qrCodeUrl: null,
        notes: null,
        createdAt: now,
        updatedAt: now,
      });
      imported.push(cert.id!);
    } catch (e: any) {
      errors.push(`Row ${i + 1}: ${e.message}`);
    }
  }

  await createDoc("activity", {
    type: "certificate",
    description: `Bulk imported ${imported.length} certificates from CSV (${errors.length} errors)`,
    entityId: null,
    timestamp: now,
  });

  if (imported.length > 0) emitChange("certificate", "created");
  res.json({ imported: imported.length, errors, totalRows: lines.length - 1 });
});

export default router;
