import express from 'express';
import cors from 'cors';
import { apiRoutes } from './routes/api.routes';

const app = express();

// Middleware
app.use(cors());

// SNS sends messages as text/plain, so we need to parse them as JSON
app.use(express.text({ type: 'text/plain' }));
app.use((req, res, next) => {
    // If body is a string (from text/plain), try to parse it as JSON
    if (typeof req.body === 'string') {
        try {
            req.body = JSON.parse(req.body);
        } catch (e) {
            // Not JSON, leave as string
        }
    }
    next();
});

app.use(express.json());

// Routes
app.use('/api', apiRoutes);

// Health Check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

export default app;
