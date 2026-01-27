
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import OpenAI from 'openai';

dotenv.config({ path: '.env.local' });

// --- Configuration ---
const TRUSTED_CHANNELS_PATH = path.join(process.cwd(), 'agent', 'data', 'trusted_channels.json');
const BLOCKED_CHANNELS_PATH = path.join(process.cwd(), 'agent', 'data', 'blocked_channels.json');

// --- Types ---
type Video = {
    id: string;
    title: string;
    channelName: string;
    description: string;
    publishedAt: string;
};

type VideoEvaluation = {
    video: Video;
    score: number;
    verdict: 'KEEP' | 'DISCARD';
    reasoning: string;
    summary?: string;
    isTrusted?: boolean; // Flag to indicate if from trusted channel
};

// --- Helper Functions ---
function loadList(filePath: string): string[] {
    try {
        const data = fs.readFileSync(filePath, 'utf-8');
        return JSON.parse(data);
    } catch (error) {
        console.warn(`Could not load list from ${filePath}, returning empty.`);
        return [];
    }
}

// --- The "Eyes": Real YouTube Search ---
async function searchYoutube(query: string): Promise<Video[]> {
    const apiKey = process.env.YOUTUBE_API_KEY;
    if (!apiKey) {
        console.error("❌ ERROR: YOUTUBE_API_KEY not found in environment variables.");
        console.error("   Please add it to your .env.local file.");
        process.exit(1);
    }

    // Calculate timestamp for 24 hours ago (RFC 3339 format)
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const publishedAfter = yesterday.toISOString();

    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&type=video&order=date&publishedAfter=${publishedAfter}&maxResults=15&key=${apiKey}`;

    try {
        const response = await fetch(url);
        const data = await response.json();

        if (data.error) {
            throw new Error(data.error.message);
        }

        // Map the raw API response to our clean Video type
        // Check if items exists
        if (!data.items) {
            return [];
        }

        return data.items.map((item: any) => ({
            id: item.id.videoId,
            title: item.snippet.title,
            channelName: item.snippet.channelTitle,
            description: item.snippet.description,
            publishedAt: item.snippet.publishedAt
        }));

    } catch (error) {
        console.error("❌ YouTube API Error:", error);
        return [];
    }
}

// --- The "Brain": Credibility Evaluator (OpenAI Version) ---
async function evaluateVideo(video: Video, trusted: string[], blocked: string[]): Promise<VideoEvaluation> {
    console.log(`🧠 Analyzing: "${video.title}" (${video.channelName})`);

    // 1. FAST CHECK: Is channel on a list?
    if (trusted.includes(video.channelName)) {
        console.log(`  ✅ Trusted Channel detected. Auto-approving.`);
        // Note: Even for trusted channels, we might want to run AI for the Summary generation later.
        // For now, let's fast pass but we miss the summary. 
        // BETTER STRATEGY: Run AI even for Trusted, but give it a starting boost.
        // But for cost saving, we'll implement that later. For now, basic trusted pass.
        return { video, score: 95, verdict: 'KEEP', reasoning: 'Channel is on the Trusted List', summary: 'Trusted Channel Content.', isTrusted: true };
    }

    if (blocked.includes(video.channelName)) {
        console.log(`  ⛔ Blocked Channel detected. Auto-discarding.`);
        return { video, score: 10, verdict: 'DISCARD', reasoning: 'Channel is on the Blocked List' };
    }

    // 2. SLOW CHECK: Ask OpenAI (GPT-4o)

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        console.error("  ❌ Missing OPENAI_API_KEY. Skipping.");
        return { video, score: 0, verdict: 'DISCARD', reasoning: 'Missing configuration' };
    }

    try {
        const openai = new OpenAI({ apiKey });

        // Read the System Prompt
        const promptPath = path.join(process.cwd(), 'agent', 'prompts', 'content_evaluator.md');
        const systemPrompt = fs.readFileSync(promptPath, 'utf-8');

        // Construct the User Message
        const userMessage = `
        Analyze this video metadata:
        
        Title: ${video.title}
        Channel: ${video.channelName}
        Description: ${video.description}
        Published: ${video.publishedAt}
        
        Return ONLY valid JSON.
        `;

        // Call the Model
        const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userMessage }
            ],
            response_format: { type: "json_object" }
        });

        const content = completion.choices[0].message.content;
        if (!content) throw new Error("Empty response from OpenAI");

        const analysis = JSON.parse(content);

        console.log(`  🤖 verdict: ${analysis.verdict} (Score: ${analysis.credibility_score})`);

        return {
            video,
            score: analysis.credibility_score,
            verdict: analysis.verdict,
            reasoning: analysis.reasoning,
            summary: analysis.summary
        };

    } catch (error) {
        console.error("  ❌ AI Analysis Failed:", error);
        return { video, score: 0, verdict: 'DISCARD', reasoning: error instanceof Error ? error.message : 'Unknown Error' };
    }
}

// --- The "Hands": Database Saver ---
import admin from 'firebase-admin';
import { getApps } from 'firebase-admin/app';

// Initialize Firebase Admin (Only once)
// Initialize Firebase Admin (Only once)
if (!getApps().length) {
    let serviceAccount: any;

    // Try loading from Env Var first (for CI/CD/Production)
    if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
        console.log("🔑 Loading Service Account from Environment Variable...");
        serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    }
    // Fallback to local file (for local dev)
    else {
        try {
            const keyPath = path.join(process.cwd(), 'serviceAccountKey.json');
            if (fs.existsSync(keyPath)) {
                console.log("🔑 Loading Service Account from Local File...");
                serviceAccount = JSON.parse(fs.readFileSync(keyPath, 'utf-8'));
            } else {
                throw new Error("No serviceAccountKey.json found and FIREBASE_SERVICE_ACCOUNT_JSON not set.");
            }
        } catch (error) {
            console.error("❌ CRITICAL: Could not load Firebase Credentials.");
            process.exit(1);
        }
    }

    // Initialize with the resolved credentials
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}
const db = admin.firestore();

async function saveToDatabase(evaluation: VideoEvaluation) {
    console.log(`  💾 Saving to Firestore: ${evaluation.video.title}`);

    try {
        const feedRef = db.collection('feed_items');

        // check uniqueness by video ID to avoid duplicates
        const snapshot = await feedRef.where('videoId', '==', evaluation.video.id).get();
        if (!snapshot.empty) {
            console.log(`  ⚠️ Video already exists in DB. Skipping.`);
            return;
        }

        // Determine status based on whether it's from a trusted channel
        const status = evaluation.isTrusted ? 'approved' : 'pending_review';
        const docData: any = {
            videoId: evaluation.video.id,
            title: evaluation.video.title,
            url: `https://www.youtube.com/watch?v=${evaluation.video.id}`,
            description: evaluation.video.description,
            channel: evaluation.video.channelName,
            publishedAt: evaluation.video.publishedAt,

            // AI Data
            ai_score: evaluation.score,
            ai_verdict: evaluation.verdict,
            ai_reasoning: evaluation.reasoning,
            ai_summary: evaluation.summary || "No summary available.",

            // System Data
            status: status,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        };

        // If auto-approved (trusted channel), add approvedAt timestamp
        if (evaluation.isTrusted) {
            docData.approvedAt = admin.firestore.FieldValue.serverTimestamp();
            console.log(`  ✅ Auto-approved (Trusted Channel)`);
        }

        await feedRef.add(docData);

        console.log(`  ✅ Saved successfully!`);

    } catch (error) {
        console.error("  ❌ Failed to save to DB:", error);
    }
}

// --- The "Deep Harvest" Loop ---
const SEARCH_KEYWORDS = [
    'Consciousness Research',
    'UFO UAP Disclosure',
    'Near Death Experience Research',
    'Remote Viewing Science',
    'Afterlife Communication Evidence'
];

async function runAgent() {
    console.log("🤖 Agent 'Content Scout' Starting [Deep Harvest Mode]...");

    // 1. Load Memory (From Firestore now)
    console.log("🧠 Loading Memory from Database...");

    // We fetch all known channels to build our lists
    const channelsSnap = await db.collection('channels').get();
    const trusted: string[] = [];
    const blocked: string[] = [];

    channelsSnap.forEach(doc => {
        const data = doc.data();
        if (data.status === 'trusted') trusted.push(data.name);
        if (data.status === 'blocked') blocked.push(data.name);
    });

    console.log(`📚 Memory Sync: ${trusted.length} Trusted / ${blocked.length} Blocked`);

    // 2. The Harvest
    const TARGET_VIDEOS = 10;
    const keptVideos: VideoEvaluation[] = [];
    const seenVideoIds = new Set<string>();

    // Strategy 1: Check Trusted Channels First (Simulated via specific search for now)
    // In a production system, we'd iterate the channel IDs directly. 
    // Here we'll just prioritize them in our search results or add a specific query if the list is small.

    // Strategy 2: Cycle Keywords until we fill the quota
    for (const keyword of SEARCH_KEYWORDS) {
        if (keptVideos.length >= TARGET_VIDEOS) break;

        console.log(`\n🔎 Harvesting: "${keyword}"...`);
        const videos = await searchYoutube(keyword);
        console.log(`   Found ${videos.length} candidates.`);

        for (const video of videos) {
            if (keptVideos.length >= TARGET_VIDEOS) break;
            if (seenVideoIds.has(video.id)) continue;
            seenVideoIds.add(video.id);

            const evaluation = await evaluateVideo(video, trusted, blocked);

            if (evaluation.verdict === 'KEEP') {
                keptVideos.push(evaluation);
                await saveToDatabase(evaluation); // Save immediately
            }
        }
    }

    // Report
    console.log(`\n📋 FINAL HARVEST REPORT:`);
    console.log(`------------------`);
    if (keptVideos.length === 0) {
        console.log("❌ Failed to find high-quality videos today.");
    } else {
        console.log(`✅ Harvested ${keptVideos.length} High-Signal Videos:`);
        keptVideos.forEach(v => {
            console.log(`[${v.score}/100] ${v.video.title}`);
            if (v.summary) console.log(`         Summary: ${v.summary.substring(0, 100)}...`);
        });
    }
    console.log(`------------------`);
}

// Run the agent
runAgent();
