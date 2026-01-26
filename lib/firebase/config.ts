import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// EXTREME DIAGNOSTICS (Top-level)
if (typeof window !== "undefined") {
    console.log("%c🚀 [DEPLOY_DEBUG] VER 1.1 LOADED", "color: yellow; background: black; font-size: 20px;");
    console.log("📍 API Key Check (Direct Env):", process.env.NEXT_PUBLIC_FIREBASE_API_KEY?.substring(0, 10) + "...");
}

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

// Connectivity check (safe for client)
if (typeof window !== "undefined") {
    console.log("🔍 Firebase Configuration Check:");
    console.log(`- API Key present: ${!!firebaseConfig.apiKey} (Len: ${firebaseConfig.apiKey?.length || 0})`);
    console.log(`- Project ID: ${firebaseConfig.projectId}`);

    // Check for common bundling issues
    if (firebaseConfig.apiKey === "undefined") {
        console.error("❌ ERROR: API Key is the literal string 'undefined'!");
    } else if (!firebaseConfig.apiKey) {
        console.warn("❌ Firebase API Key is missing in bundle.");
    } else {
        console.log("✅ Firebase initialized successfully.");
    }
}

export { app, auth, db };
