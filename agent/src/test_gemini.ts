
import { GoogleGenerativeAI } from '@google/generative-ai';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function listModels() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.log("No API Key found");
        return;
    }

    console.log("Testing API Key...");
    try {
        const genAI = new GoogleGenerativeAI(apiKey);
        // There isn't a direct "listModels" in the high-level SDK easily exposed in all versions, 
        // but we can try a basic generation on 'gemini-pro' to see if it hits.

        const model = genAI.getGenerativeModel({ model: "gemini-pro" });
        const result = await model.generateContent("Hello?");
        console.log("Success with gemini-pro! Response:", result.response.text());
    } catch (error: any) {
        console.error("Error with gemini-pro:", error.message);

        try {
            console.log("Trying gemini-1.5-flash...");
            const genAI = new GoogleGenerativeAI(apiKey);
            const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
            const result = await model.generateContent("Hello?");
            console.log("Success with gemini-1.5-flash!", result.response.text());
        } catch (err: any) {
            console.error("Error with gemini-1.5-flash:", err.message);
        }
    }
}

listModels();
