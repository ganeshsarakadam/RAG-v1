import { Request, Response } from 'express';
import { ingestionService } from '../services/ingestion.service';

export const ingestDocument = async (req: Request, res: Response) => {
    try {
        const { content, metadata } = req.body;

        if (!content) {
            res.status(400).json({ error: 'Content is required' });
            return;
        }

        const result = await ingestionService.ingestDocument(content, metadata);
        res.json(result);
    } catch (error) {
        console.error('Ingestion error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
