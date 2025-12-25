import { Request, Response } from 'express';
import { ragService } from '../services/rag.service';

export const ask = async (req: Request, res: Response) => {
    try {
        const { question, mode } = req.body;

        if (!question) {
            res.status(400).json({ error: 'Question is required' });
            return; // Ensure void return
        }

        const modelType = mode === 'quick' ? 'flash' : 'pro';
        const result = await ragService.askQuestion(question, modelType);
        res.json(result);
    } catch (error) {
        console.error('RAG Error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};
