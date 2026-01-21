import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

let firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Fallback for Firebase App Hosting environment
if (!firebaseConfig.apiKey && process.env.FIREBASE_WEBAPP_CONFIG) {
    try {
        const parsedConfig = JSON.parse(process.env.FIREBASE_WEBAPP_CONFIG);
        firebaseConfig = {
            apiKey: parsedConfig.apiKey,
            authDomain: parsedConfig.authDomain,
            projectId: parsedConfig.projectId,
            storageBucket: parsedConfig.storageBucket,
            messagingSenderId: parsedConfig.messagingSenderId,
            appId: parsedConfig.appId,
        };
    } catch (error) {
        console.error("Failed to parse FIREBASE_WEBAPP_CONFIG:", error);
    }
}

// Initialize Firebase
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);

export { app, auth, db };
