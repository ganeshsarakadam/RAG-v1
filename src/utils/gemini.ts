import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from '../config/env';

const genAI = new GoogleGenerativeAI(config.geminiApiKey);
// Embedding model
const embeddingModel = genAI.getGenerativeModel({ model: "text-embedding-004" });
// Generative model
const generativeModel = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

export const generateEmbedding = async (text: string): Promise<number[]> => {
    try {
        const cleanText = text.replace(/\n/g, " ");
        const result = await embeddingModel.embedContent(cleanText);
        return result.embedding.values;
    } catch (error) {
        console.error('Error generating embedding with Gemini:', error);
        throw error;
    }
};

export const generateAnswer = async (prompt: string): Promise<string> => {
    try {
        const result = await generativeModel.generateContent(prompt);
        const response = await result.response;
        return response.text();
    } catch (error) {
        console.error('Error generating answer with Gemini:', error);
        throw error;
    }
};
