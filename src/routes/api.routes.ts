import { Router } from 'express';
import { ingestDocument } from '../controllers/ingest.controller';
import { queryKnowledge } from '../controllers/query.controller';

import { ask } from '../controllers/rag.controller';

const router = Router();

router.post('/ingest', ingestDocument);
router.post('/query', queryKnowledge);
router.post('/ask', ask);

export const apiRoutes = router;
