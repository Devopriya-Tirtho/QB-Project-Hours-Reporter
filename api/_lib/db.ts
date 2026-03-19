import { initializeApp } from 'firebase/app';
import { 
  getFirestore, 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  deleteDoc, 
  query, 
  orderBy, 
  limit,
  Firestore
} from 'firebase/firestore';
import fs from 'fs';
import path from 'path';

let firebaseConfig: any = {};
try {
  const p = path.join(process.cwd(), 'firebase-applet-config.json');
  if (fs.existsSync(p)) {
    firebaseConfig = JSON.parse(fs.readFileSync(p, 'utf-8'));
  }
} catch (err) {
  console.error('Failed to load firebase-applet-config.json', err);
}

const config = {
  apiKey: process.env.FIREBASE_API_KEY || firebaseConfig.apiKey,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN || firebaseConfig.authDomain,
  projectId: process.env.FIREBASE_PROJECT_ID || firebaseConfig.projectId,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET || firebaseConfig.storageBucket,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || firebaseConfig.messagingSenderId,
  appId: process.env.FIREBASE_APP_ID || firebaseConfig.appId,
};

const databaseId = process.env.FIRESTORE_DATABASE_ID || firebaseConfig.firestoreDatabaseId;

const app = initializeApp(config);
const clientDb = databaseId ? getFirestore(app, databaseId) : getFirestore(app);

// Wrapper to mimic firebase-admin API
class AdminCompatibleDb {
  collection(collectionPath: string) {
    return new CollectionWrapper(clientDb, collectionPath);
  }
}

class CollectionWrapper {
  private db: Firestore;
  private path: string;
  private queryConstraints: any[];

  constructor(db: Firestore, path: string, queryConstraints: any[] = []) {
    this.db = db;
    this.path = path;
    this.queryConstraints = queryConstraints;
  }

  doc(docId: string) {
    return new DocumentWrapper(this.db, this.path, docId);
  }

  orderBy(field: string, direction: 'asc' | 'desc' = 'asc') {
    return new CollectionWrapper(this.db, this.path, [...this.queryConstraints, orderBy(field, direction)]);
  }

  limit(n: number) {
    return new CollectionWrapper(this.db, this.path, [...this.queryConstraints, limit(n)]);
  }

  async get() {
    try {
      const q = query(collection(this.db, this.path), ...this.queryConstraints);
      const snapshot = await getDocs(q);
      return {
        empty: snapshot.empty,
        docs: snapshot.docs.map(d => ({
          id: d.id,
          data: () => d.data()
        }))
      };
    } catch (err: any) {
      console.error(`Firestore GET error on ${this.path}:`, err.message);
      throw err;
    }
  }
}

class DocumentWrapper {
  private db: Firestore;
  private collectionPath: string;
  private docId: string;

  constructor(db: Firestore, collectionPath: string, docId: string) {
    this.db = db;
    this.collectionPath = collectionPath;
    this.docId = docId;
  }

  async get() {
    const d = await getDoc(doc(this.db, this.collectionPath, this.docId));
    return {
      exists: d.exists(),
      data: () => d.data(),
      id: d.id
    };
  }

  async set(data: any) {
    await setDoc(doc(this.db, this.collectionPath, this.docId), data, { merge: true });
  }

  async delete() {
    await deleteDoc(doc(this.db, this.collectionPath, this.docId));
  }
}

const db = new AdminCompatibleDb();
console.log(`Firebase Client SDK (Admin Wrapper) initialized. Project: ${config.projectId}, Database: ${databaseId || 'default'}`);

export default db;
