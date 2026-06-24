import fs from "node:fs";
import admin from "firebase-admin";
import { config } from "../config.js";

let firebaseReady = false;

function initFirebase() {
  if (firebaseReady || admin.apps.length) {
    firebaseReady = true;
    return;
  }
  const credPath = config.firebaseCredentials;
  if (!credPath || !fs.existsSync(credPath)) return;
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(fs.readFileSync(credPath, "utf8")))
  });
  firebaseReady = true;
}

export function requireApiKey(req, res, next) {
  const key = req.get("X-Portal-Api-Key") || "";
  if (!config.apiKey || key !== config.apiKey) {
    res.status(401).json({ ok: false, erro: "API key inválida" });
    return;
  }
  next();
}

export async function requireFirebaseUser(req, res, next) {
  initFirebase();
  if (!firebaseReady) {
    res.status(503).json({ ok: false, erro: "Autenticação Firebase não configurada no servidor" });
    return;
  }
  const header = req.get("Authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) {
    res.status(401).json({ ok: false, erro: "Token ausente" });
    return;
  }
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.user = { email: decoded.email, uid: decoded.uid };
    next();
  } catch (_) {
    res.status(401).json({ ok: false, erro: "Token inválido" });
  }
}
