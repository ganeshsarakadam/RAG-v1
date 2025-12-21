import { Request, Response } from 'express';
import { ragService } from '../services/rag.service';

export const ask = async (req: Request, res: Response) => {
    try {
        const { question } = req.body;

        if (!question) {
            res.status(400).json({ error: 'Question is required' });
            return; // Ensure void return
        }

        const result = await ragService.askQuestion(question);
        res.json(result);
    } catch (error) {
        console.error('RAG Error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};
