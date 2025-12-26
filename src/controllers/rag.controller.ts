import { Request, Response } from 'express';
import { ragService } from '../services/rag.service';

export const ask = async (req: Request, res: Response) => {
    try {
        const { question, mode } = req.body;

        if (!question) {
            res.status(400).json({ error: 'Question is required' });
            return;
        }

        const modelType = mode === 'quick' ? 'flash' : 'pro';

        // Use the new stream method
        const { stream, sources } = await ragService.askQuestionStream(question, modelType);

        if (!stream) {
            res.json({ answer: "I'm sorry, I couldn't find any relevant information.", sources: [] });
            return;
        }

        // Set Headers for Streaming
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Transfer-Encoding', 'chunked');
        res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
        res.setHeader('Cache-Control', 'no-cache');
        res.flushHeaders(); // Send headers immediately

        // Iterate over the stream
        for await (const chunk of stream) {
            const chunkText = chunk.text();
            res.write(chunkText);
        }

        // Append Sources formatted as Markdown
        if (sources && sources.length > 0) {
            res.write('\n\n---\n\n**Sources:**\n');
            sources.forEach((source: any) => {
                const similarityPercent = (source.similarity * 100).toFixed(1);
                const location = source.parva ? `${source.parva}, Ch ${source.chapter}` : 'Unknown Location';
                res.write(`*   [${location}](source:${source.id}) (Confidence: ${similarityPercent}%)\n`);
            });
        }

        res.end();

    } catch (error) {
        console.error('RAG Error:', error);
        // If headers aren't sent yet, send 500. If streaming started, we can't do much but end.
        if (!res.headersSent) {
            res.status(500).json({ error: 'Internal Server Error' });
        } else {
            res.end();
        }
    }
};
