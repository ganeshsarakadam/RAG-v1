import { Request, Response } from 'express';
import { retrievalService } from '../services/retrieval.service';

export const queryKnowledge = async (req: Request, res: Response) => {
    try {
        const { query } = req.body;
        console.log('Query:', query);

        if (!query) {
            res.status(400).json({ error: 'Query text is required' });
            return;
        }

        const results = await retrievalService.queryKnowledge(query);
        console.log('Results:', results);
        res.json({ results });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};
