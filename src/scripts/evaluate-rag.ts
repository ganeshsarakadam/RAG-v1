import { config } from '../config/env';
import { generateAnswer } from '../utils/gemini';

const TEST_CASES = [
    {
        question: "Who is Krishna?",
        ground_truth: "Krishna is a central character in the Mahabharata, a key figure who acts as a charioteer and guide to Arjuna, and delivers the Bhagavad Gita. He is an avatar of Vishnu."
    },
    {
        question: "Who is Dhritarashtra's wife?",
        ground_truth: "Dhritarashtra's wife is Gandhari."
    },
    {
        question: "What vow did Bhishma take?",
        ground_truth: "Bhishma took a vow of lifelong celibacy and service to the throne of Hastinapura, renouncing his claim to the kingdom."
    }
];

const evaluateAnswer = async (question: string, generated: string, truth: string) => {
    const prompt = `
    You are an impartial judge evaluation a RAG system.
    
    Question: ${question}
    Reference Answer: ${truth}
    Generated Answer: ${generated}

    Rate the Generated Answer on a scale of 1 to 5 based on accuracy and completeness compared to the Reference Answer.
    1 = Completely wrong
    5 = Perfect match in meaning
    
    Output ONLY the number (e.g. 4).
    `;
    try {
        const scoreStr = await generateAnswer(prompt);
        const score = parseInt(scoreStr.trim()) || 0;
        return score;
    } catch (e) { return 0; }
};

const runevaluation = async () => {
    console.log('🧪 Starting RAG Accuracy Evaluation (LLM-as-a-Judge)...\n');
    let totalScore = 0;

    for (const testCase of TEST_CASES) {
        console.log(`QT: "${testCase.question}"`);

        try {
            // 1. Get Answer
            const response = await fetch(`http://localhost:${config.port}/api/ask`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ question: testCase.question })
            });

            const data = await response.json();
            const generated = data.answer.trim();

            // 2. Evaluate
            const score = await evaluateAnswer(testCase.question, generated, testCase.ground_truth);
            totalScore += score;

            console.log(`🤖 Gen: ${generated.substring(0, 100)}...`);
            console.log(`✅ Reference: ${testCase.ground_truth}`);
            console.log(`⭐️ Accuracy Score: ${score}/5`);
            console.log('---------------------------------------------------\n');
        } catch (error: any) {
            console.error(`❌ Failed: ${error.message}`);
        }
    }

    const average = totalScore / TEST_CASES.length;
    console.log(`🏁 Final Evaluation Results:`);
    console.log(`📊 Average Accuracy: ${average.toFixed(1)} / 5.0`);
};

runevaluation();
