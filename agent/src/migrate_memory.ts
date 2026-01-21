
import admin from 'firebase-admin';
import { getApps } from 'firebase-admin/app';
import * as fs from 'fs';
import * as path from 'path';

// Init Firebase
if (!getApps().length) {
    const serviceAccount = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'serviceAccountKey.json'), 'utf-8'));
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}
const db = admin.firestore();

const TRUSTED_PATH = path.join(process.cwd(), 'agent', 'data', 'trusted_channels.json');
const BLOCKED_PATH = path.join(process.cwd(), 'agent', 'data', 'blocked_channels.json');

async function migrate() {
    console.log("📦 Starting Migration to Firestore...");

    // 1. Trusted
    const trusted: string[] = JSON.parse(fs.readFileSync(TRUSTED_PATH, 'utf-8'));
    for (const name of trusted) {
        console.log(`  Processing Trusted: ${name}`);
        // We use the name as ID for simplicity in this prototype. 
        // In prod, channelId is better, but getting IDs for all these names takes API calls.
        const docId = name.replace(/\s+/g, '_').toLowerCase();

        await db.collection('channels').doc(docId).set({
            name: name,
            status: 'trusted',
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
    }

    // 2. Blocked
    const blocked: string[] = JSON.parse(fs.readFileSync(BLOCKED_PATH, 'utf-8'));
    for (const name of blocked) {
        console.log(`  Processing Blocked: ${name}`);
        const docId = name.replace(/\s+/g, '_').toLowerCase();

        await db.collection('channels').doc(docId).set({
            name: name,
            status: 'blocked',
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
    }

    console.log("✅ Migration Complete!");
}

migrate();
