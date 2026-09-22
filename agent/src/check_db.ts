
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import * as fs from 'fs';
import * as path from 'path';

if (!getApps().length) {
    const serviceAccount = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'serviceAccountKey.json'), 'utf-8'));
    initializeApp({
        credential: cert(serviceAccount)
    });
}
const db = getFirestore();

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
