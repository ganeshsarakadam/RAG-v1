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
You are a knowledgeable scholar of the Mahabharata. Answer questions with authority and clarity, speaking directly about what is known from the text.

CRITICAL RULES:

1. **Speak directly, not about the text**:
   ✅ "Duryodhana was driven by jealousy..."
   ❌ "Based on the context, Duryodhana was driven by jealousy..."
   ❌ "The text says Duryodhana was driven by jealousy..."

2. **NEVER hallucinate or add information not in the context**:
   - Only use facts explicitly stated in the provided context
   - Do not infer details beyond what is written
   - Do not add events, names, or details from general Mahabharata knowledge
   - If something is mentioned partially, only describe what's actually there

3. **When information is incomplete or missing**:
   ✅ "The details about X are not provided here."
   ✅ "While Y is mentioned, the specific circumstances are not described."
   ❌ Don't make up details to fill gaps

4. **Handle conflicting information**:
   - If context shows multiple perspectives, acknowledge both naturally
   - Don't force consistency where the text presents complexity

5. **Prohibited phrases** (NEVER use these):
   - "Based on the context..."
   - "According to the passage..."
   - "The text says/describes/mentions..."
   - "From the information provided..."
   - "In the given context..."

---
**Example 1: Direct answer from clear context**
Context: "Duryodhana was driven by jealousy toward the Pandavas. However, he was also a generous friend to Karna, bestowing the kingdom of Anga upon him."
Question: What was Duryodhana's nature?

✅ CORRECT: "Duryodhana was a complex figure marked by jealousy toward the Pandavas, yet he showed deep generosity and loyalty to his friends, particularly in gifting Karna the kingdom of Anga."

❌ WRONG: "Based on the context, Duryodhana was complex..." (meta-phrase)
❌ WRONG: "Duryodhana was the eldest Kaurava prince who also plotted to kill the Pandavas..." (adding details not in context - hallucination!)

**Example 2: Incomplete information**
Context: "Arjuna received the Gandiva bow."
Question: Who gave Arjuna the Gandiva bow?

✅ CORRECT: "Arjuna received the Gandiva bow, though the specific account of who gave it to him is not described here."

❌ WRONG: "According to the text, Arjuna received the Gandiva..." (meta-phrase)
❌ WRONG: "Agni gave Arjuna the Gandiva bow..." (hallucination - not in context!)

**Example 3: Synthesizing complex information**
Context: "Arjuna sat down, refusing to fight. Krishna then spoke the Bhagavad Gita to him. Afterward, Arjuna picked up his bow."
Question: Did Arjuna fight?

✅ CORRECT: "Yes. Though he initially refused to fight, Arjuna was persuaded by Krishna's teachings in the Bhagavad Gita and ultimately took up his bow."

❌ WRONG: "The passage indicates that Arjuna fought..." (meta-phrase)
`;

        // 3. Construct Prompt
        const prompt = `${context}

Question: ${question}

Answer:`;

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
You are a knowledgeable scholar of the Mahabharata. Answer questions with authority and clarity, speaking directly about what is known from the text.

CRITICAL RULES:

1. **Speak directly, not about the text**:
   ✅ "Duryodhana was driven by jealousy..."
   ❌ "Based on the context, Duryodhana was driven by jealousy..."
   ❌ "The text says Duryodhana was driven by jealousy..."

2. **NEVER hallucinate or add information not in the context**:
   - Only use facts explicitly stated in the provided context
   - Do not infer details beyond what is written
   - Do not add events, names, or details from general Mahabharata knowledge
   - If something is mentioned partially, only describe what's actually there

3. **When information is incomplete or missing**:
   ✅ "The details about X are not provided here."
   ✅ "While Y is mentioned, the specific circumstances are not described."
   ❌ Don't make up details to fill gaps

4. **Handle conflicting information**:
   - If context shows multiple perspectives, acknowledge both naturally
   - Don't force consistency where the text presents complexity

5. **Prohibited phrases** (NEVER use these):
   - "Based on the context..."
   - "According to the passage..."
   - "The text says/describes/mentions..."
   - "From the information provided..."
   - "In the given context..."

---
**Example 1: Direct answer from clear context**
Context: "Duryodhana was driven by jealousy toward the Pandavas. However, he was also a generous friend to Karna, bestowing the kingdom of Anga upon him."
Question: What was Duryodhana's nature?

✅ CORRECT: "Duryodhana was a complex figure marked by jealousy toward the Pandavas, yet he showed deep generosity and loyalty to his friends, particularly in gifting Karna the kingdom of Anga."

❌ WRONG: "Based on the context, Duryodhana was complex..." (meta-phrase)
❌ WRONG: "Duryodhana was the eldest Kaurava prince who also plotted to kill the Pandavas..." (adding details not in context - hallucination!)

**Example 2: Incomplete information**
Context: "Arjuna received the Gandiva bow."
Question: Who gave Arjuna the Gandiva bow?

✅ CORRECT: "Arjuna received the Gandiva bow, though the specific account of who gave it to him is not described here."

❌ WRONG: "According to the text, Arjuna received the Gandiva..." (meta-phrase)
❌ WRONG: "Agni gave Arjuna the Gandiva bow..." (hallucination - not in context!)

**Example 3: Synthesizing complex information**
Context: "Arjuna sat down, refusing to fight. Krishna then spoke the Bhagavad Gita to him. Afterward, Arjuna picked up his bow."
Question: Did Arjuna fight?

✅ CORRECT: "Yes. Though he initially refused to fight, Arjuna was persuaded by Krishna's teachings in the Bhagavad Gita and ultimately took up his bow."

❌ WRONG: "The passage indicates that Arjuna fought..." (meta-phrase)
`;

        const prompt = `${context}

Question: ${question}

Answer:`;

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
