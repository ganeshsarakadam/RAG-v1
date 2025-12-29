import { retrievalService } from './retrieval.service';
import { generateAnswer } from '../utils/gemini';

export class RagService {
    async askQuestion(question: string, modelType: 'flash' | 'pro' = 'pro') {
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
        const systemInstruction = `
You are a knowledgeable assistant specializing in the Mahabharata.
Your goal is to provide a comprehensive, direct, and nuanced answer based *only* on the provided context.

Instructions:
1. **Analyze**: Read the context chunks and identify key information.
2. **Synthesize**: If the text contains conflicting descriptions (e.g., "kind" vs "wicked"), acknowledge the complexity and synthesize a holistic view.
3. **Answer**: Provide the final answer directly. Do not meta-explain (e.g., "The text says...", "The passage describes..."). Start with the answer immediately.
4. **Tone**: Informative, objective, and engaging.

---
**Example 1**
*Context*: "Duryodhana was driven by jealousy. However, he was also a generous friend to Karna, bestowing the kingdom of Anga upon him."
*User Question*: What was Duryodhana's nature?
*Assistant Answer*: Duryodhana was a complex figure defined effectively by his intense jealousy, yet he also possessed a capacity for deep generosity and loyalty towards his friends, as seen in his support for Karna.

**Example 2**
*Context*: "Arjuna sat down, despondent. Krishna then spoke the Gita to him. Arjuna then picked up his bow."
*User Question*: Did Arjuna fight?
*Assistant Answer*: Yes, after initially being despondent, Arjuna overcame his hesitation through Krishna's guidance and picked up his bow to fight.
`;

        // 3. Construct Prompt
        const prompt = `
Context:
${context}

User Question: ${question}

Answer:
    `;

        // 4. Generate Answer
        const answer = await generateAnswer(prompt, modelType, systemInstruction);

        return {
            answer,
            sources: chunks.map((chunk: any) => ({
                id: chunk.id,
                source: chunk.metadata?.source,
                similarity: chunk.similarity
            }))
        };
    }
    async askQuestionStream(question: string, modelType: 'flash' | 'pro' = 'pro') {
        const chunks = await retrievalService.queryKnowledge(question, 5);

        if (!chunks || chunks.length === 0) {
            return {
                stream: null,
                sources: []
            };
        }

        // ENHANCEMENT: Construct context with parent context when available
        const context = chunks.map((chunk: any) => {
            let contextText = chunk.content;

            // If child chunk with parent, include parent for broader context
            if (chunk.parent_content) {
                const parentPreview = chunk.parent_content.substring(0, 500);
                contextText = `[Parent Section Context: ${parentPreview}...]\n\n[Specific Passage: ${chunk.content}]`;
            }

            return contextText;
        }).join('\n\n---\n\n');

        const systemInstruction = `
You are a knowledgeable assistant specializing in the Mahabharata.
Your goal is to provide a comprehensive, direct, and nuanced answer based *only* on the provided context.

Instructions:
1. **Analyze**: Read the context chunks and identify key information.
2. **Synthesize**: If the text contains conflicting descriptions (e.g., "kind" vs "wicked"), acknowledge the complexity and synthesize a holistic view.
3. **Answer**: Provide the final answer directly. Do not meta-explain (e.g., "The text says...", "The passage describes..."). Start with the answer immediately.
4. **Tone**: Informative, objective, and engaging.
`;

        const prompt = `
Context:
${context}

User Question: ${question}

Answer:
    `;

        // Use generateAnswerStream from utils (we need to import it)
        const { generateAnswerStream } = require('../utils/gemini');
        const streamResult = await generateAnswerStream(prompt, modelType, systemInstruction);

        return {
            stream: streamResult.stream,
            sources: chunks.map((chunk: any) => ({
                id: chunk.id,
                source: chunk.metadata?.source,
                parva: chunk.metadata?.parva,
                chapter: chunk.metadata?.chapter,
                section_title: chunk.metadata?.section_title,
                speaker: chunk.metadata?.speaker,
                type: chunk.metadata?.type,
                similarity: chunk.similarity,
                has_parent: !!chunk.parent_content
            }))
        };
    }
}

export const ragService = new RagService();
