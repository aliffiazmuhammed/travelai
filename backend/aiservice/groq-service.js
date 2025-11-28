import Groq from "groq-sdk";
import 'dotenv/config';

const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY
});

export const main = async (promptText) => {
    const chatCompletion = await groq.chat.completions.create({
        messages: [
            {
                role: "user",
                content: promptText,
            },
        ],
        model: "meta-llama/llama-4-maverick-17b-128e-instruct",
    });

    return chatCompletion.choices[0].message.content;
};
