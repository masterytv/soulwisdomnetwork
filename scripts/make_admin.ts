import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
// import { UserProfile } from '../types/user';

// Inline type to avoid ts-node ESM resolution issues
interface UserProfile {
    uid: string;
    email: string | null;
    displayName: string | null;
    photoURL: string | null;
    role: 'admin' | 'user';
    bio?: string;
    createdAt: any;
}

dotenv.config({ path: '.env.local' });

// --- Firebase Admin Setup ---
const serviceAccountPath = path.join(process.cwd(), 'serviceAccountKey.json');
let serviceAccount;

if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
} else if (fs.existsSync(serviceAccountPath)) {
    serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
} else {
    console.error("❌ No serviceAccountKey.json found or FIREBASE_SERVICE_ACCOUNT_JSON set.");
    process.exit(1);
}

if (!getApps().length) {
    initializeApp({
        credential: cert(serviceAccount),
    });
}
const db = getFirestore();

// --- Main Logic ---
async function main() {
    const targetEmail = process.argv[2];

    if (!targetEmail) {
        console.error("Usage: ts-node scripts/make_admin.ts <email>");
        process.exit(1);
    }

    console.log(`🔍 Searching for user with email: ${targetEmail}`);

    try {
        const usersRef = db.collection('users');
        const snapshot = await usersRef.where('email', '==', targetEmail).limit(1).get();

        if (snapshot.empty) {
            console.error("❌ User not found in Firestore.");
            console.log("   (Make sure they have logged in at least once)");
            process.exit(1);
        }

        const userDoc = snapshot.docs[0];
        const currentData = userDoc.data() as UserProfile;

        console.log(`👤 Found user: ${currentData.displayName || 'No Name'} (UID: ${userDoc.id})`);
        console.log(`   Current Role: ${currentData.role || 'undefined'}`);

        await userDoc.ref.update({
            role: 'admin'
        });

        console.log(`✅ SUCCESS! updated role to 'admin'.`);

    } catch (error) {
        console.error("❌ Error updating user:", error);
    }
}

main();
