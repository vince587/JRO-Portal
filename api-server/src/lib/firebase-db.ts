import admin from "firebase-admin";
import { logger } from "./logger";

function getFirestore() {
  if (!admin.apps.length) {
    const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    const projectId = process.env.FIREBASE_PROJECT_ID;
    if (!serviceAccountKey || !projectId) {
      throw new Error(
        "FIREBASE_SERVICE_ACCOUNT_KEY and FIREBASE_PROJECT_ID must be set in .env"
      );
    }
    try {
      admin.initializeApp({
        credential: admin.credential.cert(JSON.parse(serviceAccountKey)),
        projectId,
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET || `${projectId}.firebasestorage.app`,
      });
      logger.info("Firebase Admin initialized for Firestore");
    } catch (e) {
      logger.warn({ err: e }, "Firebase Admin not configured");
      throw e;
    }
  }
  // Always reuse the default app — never create a second instance
  return admin.app().firestore();
}

export function getStorageBucket() {
  if (!admin.apps.length) {
    getFirestore();
  }
  // Always pass an explicit bucket name. The default app may have been
  // initialized elsewhere (e.g. auth.ts) without a `storageBucket` option,
  // in which case `.bucket()` with no argument throws "Bucket name not
  // specified or invalid" and every upload fails with a 500.
  const bucketName =
    process.env.FIREBASE_STORAGE_BUCKET ||
    `${process.env.FIREBASE_PROJECT_ID}.firebasestorage.app`;
  return admin.app().storage().bucket(bucketName);
}

export interface UserDoc {
  id?: string;
  uid: string;
  username: string;
  email: string;
  fullName: string | null;
  role: string;
  roles?: string[];
  department: string | null;
  isActive: boolean;
  canAccessSis: boolean;
  canAccessJmcs: boolean;
  canEditCalendar: boolean;
  canEditTrainingProposal: boolean;
  canManageContracts: boolean;
  canManageCertificates: boolean;
  canAccessProjects: boolean;
  canAccessAdmin: boolean;
  canAccessDevelopers?: boolean;
  photoUrl: string | null;
  mustChangePassword?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ContractDoc {
  id?: string;
  title: string;
  type: string;
  serviceType: string | null;
  status: string;
  contractNumber: string;
  clientName: string;
  startDate: string;
  endDate: string;
  value: number;
  description: string | null;
  assignedTo: string | null;
  contactPerson?: string | null;
  designation?: string | null;
  contactNumber?: string | null;
  contactEmail?: string | null;
  salesInCharge?: string | null;
  translatedToSales?: boolean;
  createdById: string | null;
  createdByName: string | null;
  createdByPhotoUrl: string | null;
  documentName: string | null;
  documentStoredAs: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CertificateDoc {
  id?: string;
  title: string;
  company: string | null;
  recipientName: string;
  recipientEmail: string | null;
  issuedBy: string;
  issueDate: string;
  expiryDate: string;
  certificateNumber: string | null;
  trainingType: string | null;
  category: string;
  standard: string | null;
  fileUrl: string | null;
  qrCodeUrl: string | null;
  notes: string | null;
  result: string | null;
  hours: string | null;
  trainingDate: string | null;
  createdById: string | null;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectDoc {
  id?: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  startDate: string;
  endDate: string | null;
  budget: number | null;
  projectManager: string | null;
  clientName: string | null;
  progress: number;
  createdAt: string;
  updatedAt: string;
}

export interface EventDoc {
  id?: string;
  title: string;
  description: string | null;
  startDate: string;
  endDate: string | null;
  allDay: boolean;
  eventType: string;
  location: string | null;
  relatedTo: string | null;
  status?: string | null;
  recurrenceRule: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LibraryAttachment {
  id: string;
  filename: string;
  storedAs: string;
  url: string;
  size: number;
  mime: string;
  type: string;
  uploadedAt: string;
}

export interface LibraryFolderDoc {
  id?: string;
  name: string;
  section: "internal" | "external";
  parentId?: string | null;
  access?: "open" | "restricted" | "disabled" | null;
  email?: string | null;
  accessEmails?: string[];
  participantLink?: string | null;
  accessCode?: string | null;
  expiresAt?: string | null;
  expiryNotifiedAt?: string | null;
  createdBy?: string | null;
  createdAt: string;
  updatedAt?: string;
}

export interface LibraryDoc {
  id?: string;
  title: string;
  description: string | null;
  section: "internal" | "external";
  department?: "JMCS" | "SIS" | "Both" | null;
  category?: string | null;
  url?: string | null;
  access?: "open" | "restricted" | "disabled" | null;
  email?: string | null;
  accessEmails?: string[];
  participantLink?: string | null;
  accessCode?: string | null;
  folderId?: string | null;
  expiresAt?: string | null;
  expiryNotifiedAt?: string | null;
  attachments?: LibraryAttachment[];
  createdById?: string | null;
  createdByName?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TaskDoc {
  id?: string;
  projectId: string;
  title: string;
  description: string | null;
  status: string;
  assignee: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LeadDoc {
  id?: string;
  companyName: string;
  contactPerson: string;
  position: string | null;
  email: string | null;
  phone: string | null;
  serviceInterest: string | null;
  status: string;
  notes: string | null;
  type: string | null;
  createdById: string;
  createdByName: string | null;
  createdByPhotoUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EmployeeDoc {
  id?: string;
  userId: string;
  employeeId: string;
  email: string;
  username: string;
  position: string;
  dateHired: string;
  employmentStatus: string;
  contactNumber: string;
  address: string;
  emergencyContact: string;
  emergencyContactNumber: string;
  educationalAttainment: string;
  sssNumber: string;
  tinNumber: string;
  philhealthNumber: string;
  pagibigNumber: string;
  createdAt: string;
  updatedAt: string;
}

export interface ActivityDoc {
  id?: string;
  type: string;
  description: string;
  entityId: string | null;
  timestamp: string;
}

export interface HrisDocumentDoc {
  id?: string;
  employeeRef: string;
  employeeId: string;
  filename: string;
  storedAs: string;
  fileUrl: string | null;
  size: number;
  type: string;
  uploadedBy: string;
  uploadedAt: string;
}

export interface NotificationDoc {
  id?: string;
  userId: string;
  type: string;
  title: string;
  description: string;
  entityId: string;
  severity: "info" | "warning" | "danger";
  link: string;
  read: boolean;
  createdAt: string;
}

export interface AttendanceDoc {
  id?: string;
  userId: string;
  userFullName: string;
  employeeId: string;
  date: string;
  clockIn: string;
  clockOut: string | null;
  clockInLocation: { lat: number; lng: number } | null;
  clockOutLocation: { lat: number; lng: number } | null;
  hoursWorked: number;
  status: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TimesheetDoc {
  id?: string;
  userId: string;
  userFullName: string;
  employeeId: string;
  periodStart: string;
  periodEnd: string;
  totalHours: number;
  status: string;
  approverComment: string;
  submittedAt: string;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

function convertTimestamps(doc: FirebaseFirestore.DocumentSnapshot) {
  const data = doc.data();
  if (!data) return null;
  const converted: Record<string, unknown> = { id: doc.id };
  for (const [key, val] of Object.entries(data)) {
    if (val && typeof val === "object" && typeof val.toDate === "function") {
      converted[key] = val.toDate().toISOString();
    } else {
      converted[key] = val;
    }
  }
  return converted;
}

export async function getDoc<T>(collection: string, id: string): Promise<T | null> {
  const db = getFirestore();
  const doc = await db.collection(collection).doc(id).get();
  if (!doc.exists) return null;
  return convertTimestamps(doc) as unknown as T;
}

export async function getAll<T>(collection: string, orderByField?: string, orderDir?: "asc" | "desc"): Promise<T[]> {
  const db = getFirestore();
  let query: FirebaseFirestore.Query = db.collection(collection);
  if (orderByField) {
    query = query.orderBy(orderByField, orderDir || "asc");
  }
  const snapshot = await query.get();
  return snapshot.docs.map(d => convertTimestamps(d) as unknown as T);
}

export async function queryWhere<T>(
  collection: string,
  field: string,
  op: FirebaseFirestore.WhereFilterOp,
  value: unknown,
  orderByField?: string,
  orderDir?: "asc" | "desc",
): Promise<T[]> {
  const db = getFirestore();
  let query: FirebaseFirestore.Query = db.collection(collection).where(field, op, value);
  if (orderByField) {
    query = query.orderBy(orderByField, orderDir || "asc");
  }
  const snapshot = await query.get();
  return snapshot.docs.map(d => convertTimestamps(d) as unknown as T);
}

export async function createDoc<T extends object>(collection: string, data: T, docId?: string): Promise<T & { id: string }> {
  const db = getFirestore();
  let docRef: FirebaseFirestore.DocumentReference;
  if (docId) {
    docRef = db.collection(collection).doc(docId);
    await docRef.set(data as FirebaseFirestore.DocumentData);
  } else {
    docRef = await db.collection(collection).add(data as FirebaseFirestore.DocumentData);
  }
  return { id: docRef.id, ...data } as unknown as T & { id: string };
}

export async function getDocByField<T>(collection: string, field: string, value: unknown): Promise<T | null> {
  const results = await queryWhere<T>(collection, field, "==", value);
  return results[0] ?? null;
}

export async function updateDoc<T extends object>(collection: string, id: string, data: Partial<T>): Promise<void> {
  const db = getFirestore();
  await db.collection(collection).doc(id).update(data as FirebaseFirestore.UpdateData<FirebaseFirestore.DocumentData>);
}

export async function deleteDoc(collection: string, id: string): Promise<void> {
  const db = getFirestore();
  await db.collection(collection).doc(id).delete();
}