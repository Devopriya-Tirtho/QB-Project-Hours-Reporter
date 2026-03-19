import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
let firebaseConfig: any = {};
try {
  firebaseConfig = require('../firebase-applet-config.json');
} catch (e) {
  console.error('Failed to load firebase-applet-config.json via require', e);
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const configPath = path.join(__dirname, '../firebase-applet-config.json');
    if (fs.existsSync(configPath)) {
      firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    }
  } catch (err) {
    console.error('Failed to load firebase-applet-config.json via fs', err);
  }
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

const app = initializeApp(firebaseConfig);

const databaseId = process.env.FIRESTORE_DATABASE_ID || firebaseConfig.firestoreDatabaseId;

const db = databaseId 
  ? getFirestore(app, databaseId) 
  : getFirestore(app);

export default db;
