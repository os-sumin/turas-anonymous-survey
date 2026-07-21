import { cert, getApp, getApps, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

let cached: Firestore | null = null;

function getAdminApp(): App {
  if (getApps().length > 0) return getApp();

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  // Vercel 환경변수에 넣을 때 개행이 \n 문자열로 들어오므로 복원 필요
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error("Firebase 환경변수가 설정되지 않았습니다. (FIREBASE_PROJECT_ID / CLIENT_EMAIL / PRIVATE_KEY)");
  }

  return initializeApp({
    credential: cert({ projectId, clientEmail, privateKey })
  });
}

export function getDb(): Firestore {
  if (cached) return cached;
  const db = getFirestore(getAdminApp());
  try {
    db.settings({ ignoreUndefinedProperties: true });
  } catch {
    // 이미 초기화된 경우 무시
  }
  cached = db;
  return db;
}

export function isFirebaseConfigured(): boolean {
  return Boolean(
    process.env.FIREBASE_PROJECT_ID &&
      process.env.FIREBASE_CLIENT_EMAIL &&
      process.env.FIREBASE_PRIVATE_KEY
  );
}
