import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from '../config/env';

const genAI = new GoogleGenerativeAI(config.geminiApiKey);
// Embedding model
const embeddingModel = genAI.getGenerativeModel({ model: "text-embedding-004" });
// Generative models
const flashModel = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
const proModel = genAI.getGenerativeModel({ model: "gemini-3-pro-preview" });

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

export const generateAnswer = async (prompt: string, modelType: 'flash' | 'pro' = 'pro', systemInstruction?: string): Promise<string> => {
    try {
        const modelName = modelType === 'flash' ? "gemini-2.0-flash" : "gemini-3-pro-preview";
        const model = genAI.getGenerativeModel({
            model: modelName,
            systemInstruction
        });
        const result = await model.generateContent(prompt);
        const response = await result.response;
        return response.text();
    } catch (error) {
        console.error('Error generating answer with Gemini:', error);
        throw error;
    }
};

export const generateAnswerStream = async (prompt: string, modelType: 'flash' | 'pro' = 'pro', systemInstruction?: string) => {
    try {
        const modelName = modelType === 'flash' ? "gemini-2.0-flash" : "gemini-3-pro-preview";
        const model = genAI.getGenerativeModel({
            model: modelName,
            systemInstruction
        });
        const result = await model.generateContentStream(prompt);
        return result;
    } catch (error) {
        console.error('Error generating answer stream with Gemini:', error);
        throw error;
    }
};

export const rerankResults = async (query: string, documents: { id: string; content: string }[], topN: number = 5): Promise<string[]> => {
    try {
        const prompt = `
You are a helpful assistant that assesses the relevance of search results to a user query.
Query: "${query}"

Here are the search results:
${documents.map((doc, index) => `[${index}] (ID: ${doc.id}) ${doc.content.substring(0, 300)}...`).join('\n')}

Please evaluate these results and return the **IDs** of the top ${topN} most relevant documents, ordered by relevance (most relevant first).
Return ONLY a JSON array of strings, for example: ["id1", "id2"].
Do not explain.
`;
        const result = await flashModel.generateContent(prompt);
        const response = await result.response;
        const text = response.text().trim();
        // Clean up markdown code blocks if present
        const jsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(jsonStr);
    } catch (error) {
        console.error('Error reranking with Gemini:', error);
        return documents.slice(0, topN).map(d => d.id); // Fallback: return top N original
    }
};
