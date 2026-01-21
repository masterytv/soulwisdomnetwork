
import admin from 'firebase-admin';
import { getApps } from 'firebase-admin/app';
import * as fs from 'fs';
import * as path from 'path';

if (!getApps().length) {
    const serviceAccount = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'serviceAccountKey.json'), 'utf-8'));
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}
const db = admin.firestore();

async function checkDb() {
    console.log("🕵️ Checking Firestore 'feed_items'...");
    const snapshot = await db.collection('feed_items').orderBy('createdAt', 'desc').limit(5).get();

    if (snapshot.empty) {
        console.log("❌ No items found in 'feed_items'.");
    } else {
        console.log(`✅ Found ${snapshot.size} items:`);
        snapshot.forEach(doc => {
            const data = doc.data();
            console.log(`- [${data.status}] ${data.title} (Score: ${data.ai_score})`);
        });
    }
}

checkDb();
