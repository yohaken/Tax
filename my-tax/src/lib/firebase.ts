import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  type User,
} from "firebase/auth";
import { ALLOWED_EMAIL } from "./types";

/** Client config — shared MyNote Firebase (same as TaxTag / P-Note) */
const firebaseConfig = {
  apiKey:
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY ||
    "AIzaSyAswz15_kbwp0owNI0R2_6x8YoNHmZfeeI",
  authDomain:
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ||
    "mynote-f1bbc.firebaseapp.com",
  projectId:
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "mynote-f1bbc",
  storageBucket:
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||
    "mynote-f1bbc.firebasestorage.app",
  messagingSenderId:
    process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "570843838870",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "",
};

export function isFirebaseConfigured() {
  return Boolean(
    firebaseConfig.apiKey &&
      firebaseConfig.authDomain &&
      firebaseConfig.projectId,
  );
}

let app: FirebaseApp | undefined;

export function getFirebaseApp() {
  if (!isFirebaseConfigured()) return null;
  if (!app) {
    app = getApps()[0] || initializeApp(firebaseConfig);
  }
  return app;
}

export function getFirebaseAuth() {
  const firebaseApp = getFirebaseApp();
  if (!firebaseApp) return null;
  return getAuth(firebaseApp);
}

export async function signInWithGooglePersonal() {
  const auth = getFirebaseAuth();
  if (!auth) throw new Error("Firebase ยังไม่ได้ตั้งค่า");

  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  const result = await signInWithPopup(auth, provider);
  const email = (result.user.email || "").toLowerCase();

  if (email !== ALLOWED_EMAIL.toLowerCase()) {
    await signOut(auth);
    throw new Error(`ใช้ได้เฉพาะ ${ALLOWED_EMAIL} เท่านั้น`);
  }

  return result.user;
}

export async function signOutPersonal() {
  const auth = getFirebaseAuth();
  if (!auth) return;
  await signOut(auth);
}

export function watchAuth(callback: (user: User | null) => void) {
  const auth = getFirebaseAuth();
  if (!auth) {
    callback(null);
    return () => {};
  }
  return onAuthStateChanged(auth, (user) => {
    if (user && (user.email || "").toLowerCase() !== ALLOWED_EMAIL.toLowerCase()) {
      signOut(auth).finally(() => callback(null));
      return;
    }
    callback(user);
  });
}

export { ALLOWED_EMAIL };
