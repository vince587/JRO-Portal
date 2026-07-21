import admin from "firebase-admin";
import crypto from "crypto";
import fs from "fs";

const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
admin.initializeApp({ credential: admin.credential.cert(sa), projectId: "software-jmcs" });
const db = admin.firestore();

async function main() {
  // find an admin or jmcs user
  const snap = await db.collection("users").where("isActive", "==", true).limit(20).get();
  const users = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  const adminUser = users.find(u => (u.role === "admin" || (u.roles||[]).includes("admin") || u.canAccessJmcs));
  console.log("candidate users:", users.map(u => ({ username: u.username, role: u.role, canAccessJmcs: u.canAccessJmcs, uid: u.uid })));
  if (!adminUser) { console.log("NO admin user found"); process.exit(0); }
  const uid = adminUser.uid || adminUser.id;
  const username = adminUser.username;
  console.log("Using user:", username, uid);

  // login to get a real cookie (login route does not verify password)
  const loginRes = await fetch("http://localhost:5000/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password: "x" }),
  });
  const setCookie = loginRes.headers.get("set-cookie");
  console.log("login status:", loginRes.status, "set-cookie:", setCookie);
  if (!setCookie) { console.log("no cookie"); process.exit(0); }
  const header = setCookie.split(";")[0]; // jmcs_auth=s:...

  // 1. create material
  const createRes = await fetch("http://localhost:5000/api/library", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Cookie": header },
    body: JSON.stringify({ title: "TEST_UPLOAD_MATERIAL", section: "internal", department: "JMCS", access: "open" }),
  });
  const createText = await createRes.text();
  console.log("create status:", createRes.status, createText.slice(0,300));
  if (!createRes.ok) process.exit(0);
  const mat = JSON.parse(createText);
  console.log("created material id:", mat.id);

  // 2. upload a file
  const fileBuf = Buffer.from("hello pdf content");
  const fd = new FormData();
  fd.append("file", new Blob([fileBuf], { type: "application/pdf" }), "test.pdf");
  const upRes = await fetch(`http://localhost:5000/api/library/${mat.id}/attachments`, {
    method: "POST",
    headers: { "Cookie": header },
    body: fd,
  });
  console.log("upload status:", upRes.status, await upRes.text().then(t=>t.slice(0,400)));
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
