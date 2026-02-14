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
        const result = await ragService.askQuestionStream(question, modelType);
        const { stream, sources, fallbackAnswer } = result as any;

        if (!stream) {
            // Handle low-quality retrieval or no results
            const answer = fallbackAnswer || "I'm sorry, I couldn't find any relevant information.";
            res.json({ answer, sources: sources || [] });
            return;
        }

        // Set Headers for Streaming
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Transfer-Encoding', 'chunked');
        res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
        res.setHeader('Cache-Control', 'no-cache');
        res.flushHeaders(); // Send headers immediately

        // Iterate over the stream
        // GenerateContentStreamResult has .stream property that is async iterable
        for await (const chunk of stream.stream) {
            const chunkText = chunk.text();
            res.write(chunkText);
        }

        // Append Sources formatted as Markdown
        if (sources && sources.length > 0) {
            // Filter out sources with invalid similarity scores
            const validSources = sources.filter((source: any) => {
                const similarity = source.similarity;
                return typeof similarity === 'number' && !isNaN(similarity) && similarity > 0;
            });

            if (validSources.length > 0) {
                res.write('\n\n---\n\n**Sources:**\n');
                validSources.forEach((source: any) => {
                    const similarityPercent = (source.similarity * 100).toFixed(0);

                    // Build location string
                    const parts: string[] = [];
                    if (source.parva) parts.push(source.parva);
                    if (source.chapter) parts.push(`Chapter ${source.chapter}`);
                    if (source.section_title) parts.push(source.section_title);

                    const location = parts.length > 0 ? parts.join(' - ') : 'Mahabharata';

                    // Add speaker if available
                    const speaker = source.speaker ? ` (${source.speaker})` : '';

                    // Add page number if available
                    let pageInfo = '';
                    if (source.page) {
                        pageInfo = source.pageEnd && source.pageEnd !== source.page
                            ? ` [pp. ${source.page}-${source.pageEnd}]`
                            : ` [p. ${source.page}]`;
                    }

                    res.write(`*   ${location}${speaker}${pageInfo} — ${similarityPercent}% match\n`);
                });
            }
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
