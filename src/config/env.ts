import dotenv from 'dotenv';

dotenv.config({ override: true });

export const config = {
    port: process.env.PORT || 3000,
    env: process.env.NODE_ENV || 'development',
    db: {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432', 10),
        username: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || 'mahabharata',
        database: process.env.DB_NAME || 'knowledge_db',
    },
    geminiApiKey: process.env.GEMINI_API_KEY || '',
};
