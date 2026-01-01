import { Request, Response } from 'express';
import { ingestionService } from '../services/ingestion.service';
import { downloadFromS3 } from '../utils/s3';
import { parseS3Path } from '../utils/s3-path-parser';

export const ingestDocument = async (req: Request, res: Response) => {
    try {
        const { s3Key, clearExisting, childChunkSize, childOverlap } = req.body;

        if (!s3Key) {
            res.status(400).json({
                error: 's3Key is required. Provide the S3 path of the document to ingest.'
            });
            return;
        }

        console.log(`📥 Starting ingestion for S3 document: ${s3Key}`);

        // Parse S3 path to extract religion and text source
        const pathInfo = parseS3Path(s3Key);
        console.log(`   Religion: ${pathInfo.religion || 'not specified'}`);
        console.log(`   Text Source: ${pathInfo.textSource || 'not specified'}`);
        console.log(`   File: ${pathInfo.fileName}`);

        // Download document from S3
        const pdfBuffer = await downloadFromS3(s3Key);

        // Parse options
        const options = {
            childChunkSize: childChunkSize ? parseInt(childChunkSize) : undefined,
            childOverlap: childOverlap ? parseInt(childOverlap) : undefined,
            clearExisting: clearExisting === true || clearExisting === 'true'
        };

        // Ingest the document
        const result = await ingestionService.ingestDocument(
            pdfBuffer,
            `s3://${s3Key}`, // Use S3 path as source identifier
            pathInfo.religion,
            pathInfo.textSource,
            pathInfo.docCategory,
            options
        );

        res.json(result);
    } catch (error) {
        console.error('Ingestion error:', error);
        res.status(500).json({
            error: 'Ingestion failed',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
};
