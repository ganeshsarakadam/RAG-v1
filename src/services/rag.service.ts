import { retrievalService } from './retrieval.service';
import { generateAnswer } from '../utils/gemini';

export class RagService {
    async askQuestion(question: string) {
        // 1. Retrieve relevant chunks
        const chunks = await retrievalService.queryKnowledge(question, 5);

        if (!chunks || chunks.length === 0) {
            return {
                answer: "I'm sorry, I couldn't find any relevant information in the Knowledge Base.",
                sources: []
            };
        }

        // 2. Construct Context
        const context = chunks.map((chunk: any) => chunk.content).join('\n\n---\n\n');
        console.log('Context: ---->>>', context);

        // 3. Construct Prompt
        const prompt = `
You are a knowledgeable assistant specializing in the Mahabharata.
Answer the user's question using ONLY the provided context below.
If the answer cannot be found in the context, politely state that you don't know based on the available information.

Context:
${context}

User Question: ${question}

Answer:
    `;

        // 4. Generate Answer
        const answer = await generateAnswer(prompt);

        return {
            answer,
            sources: chunks.map((chunk: any) => ({
                id: chunk.id,
                source: chunk.metadata?.source,
                similarity: chunk.similarity
            }))
        };
    }
}

export const ragService = new RagService();
