import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';

let firebaseConfig: any = {};
try {
  const cwdConfigPath = path.join(process.cwd(), 'firebase-applet-config.json');
  if (fs.existsSync(cwdConfigPath)) {
    firebaseConfig = JSON.parse(fs.readFileSync(cwdConfigPath, 'utf-8'));
  } else {
    // Try one level up just in case
    const parentConfigPath = path.join(process.cwd(), '../firebase-applet-config.json');
    if (fs.existsSync(parentConfigPath)) {
      firebaseConfig = JSON.parse(fs.readFileSync(parentConfigPath, 'utf-8'));
    }
  }
} catch (err) {
  console.error('Failed to load firebase-applet-config.json via fs', err);
}

// Fallback to env vars if config file is missing
const projectId = process.env.FIREBASE_PROJECT_ID || firebaseConfig.projectId || (process.env.FIREBASE_CLIENT_EMAIL ? process.env.FIREBASE_CLIENT_EMAIL.split('@')[1].split('.')[0] : 'dummy-project-id');

if (!admin.apps.length) {
  try {
    if (process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: projectId,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        }),
      });
    } else {
      admin.initializeApp({
        projectId: projectId,
      });
    }
  } catch (error) {
    console.error('Firebase Admin Initialization Error:', error);
    // Fallback initialize to prevent complete crash
    if (!admin.apps.length) {
      admin.initializeApp({ projectId: 'dummy-project-id' });
    }
  }
}

const db = admin.firestore();
if (process.env.FIRESTORE_DATABASE_ID || firebaseConfig.firestoreDatabaseId) {
  try {
    db.settings({ databaseId: process.env.FIRESTORE_DATABASE_ID || firebaseConfig.firestoreDatabaseId });
  } catch (e) {
    console.warn('Could not set databaseId, it might already be initialized or not supported in this admin SDK version.', e);
  }
}

export default db;
