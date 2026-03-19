import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
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
if (!firebaseConfig.projectId && process.env.FIREBASE_PROJECT_ID) {
  firebaseConfig = {
    projectId: process.env.FIREBASE_PROJECT_ID,
    apiKey: process.env.FIREBASE_API_KEY,
    appId: process.env.FIREBASE_APP_ID,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN,
    firestoreDatabaseId: process.env.FIRESTORE_DATABASE_ID
  };
}

if (!firebaseConfig.projectId) {
  console.warn('Firebase configuration is missing. Please provide a valid firebase-applet-config.json or set FIREBASE_PROJECT_ID environment variable.');
  // Provide a dummy config so initializeApp doesn't crash the whole serverless function
  firebaseConfig = {
    projectId: 'dummy-project-id',
    apiKey: 'dummy-api-key',
    appId: 'dummy-app-id'
  };
}

const app = initializeApp(firebaseConfig);

const databaseId = process.env.FIRESTORE_DATABASE_ID || firebaseConfig.firestoreDatabaseId;

const db = databaseId 
  ? getFirestore(app, databaseId) 
  : getFirestore(app);

export default db;
