import { Router } from 'express';
import multer from 'multer';
import { uploadDocument } from '../controllers/upload.controller';
import { ingestDocument } from '../controllers/ingest.controller';
import { queryKnowledge } from '../controllers/query.controller';
import { ask } from '../controllers/rag.controller';
import { handleS3Upload } from '../controllers/webhook.controller';

const router = Router();

// Configure multer for file uploads (store in memory)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 50 * 1024 * 1024 // 50MB limit
    }
});

// Upload endpoint - accepts file upload and stores in S3
router.post('/upload', upload.single('file'), uploadDocument);

// Ingest endpoint - processes document from S3
router.post('/ingest', ingestDocument);

// Webhook endpoint - receives S3 event notifications for automatic ingestion
router.post('/webhook/s3-upload', handleS3Upload);

// Query and RAG endpoints
router.post('/query', queryKnowledge);
router.post('/ask', ask);

export const apiRoutes = router;
