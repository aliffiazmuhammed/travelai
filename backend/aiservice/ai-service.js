import { GoogleGenerativeAI } from "@google/generative-ai";
import 'dotenv/config';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export const main = async (promptText) => {
    try {
        // Use gemini-1.5-pro or gemini-1.5-flash if 2.5 is not available, but keeping 2.5 as requested
        // Note: If gemini-2.5-pro fails, we might need to fallback.
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });

        const result = await model.generateContent(promptText);
        const response = await result.response;
        return response.text();
    } catch (error) {
        console.error("Error generating content:", error);
        throw new Error("Failed to generate itinerary");
    }
};


