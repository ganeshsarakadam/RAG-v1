import { DataSource } from 'typeorm';
import { config } from './env';
import { DocumentChunk } from '../entities/DocumentChunk';
import { DocumentChunkRecursive } from '../entities/DocumentChunkRecursive';

export const AppDataSource = new DataSource({
    type: 'postgres',
    host: config.db.host,
    port: config.db.port,
    username: config.db.username,
    password: config.db.password,
    database: config.db.database,
    synchronize: true, // Use migrations in production!
    logging: false,
    ssl: config.env === 'production' ? { rejectUnauthorized: false } : false,
    entities: [DocumentChunk, DocumentChunkRecursive],
    subscribers: [],
    migrations: [],
});

export const initializeDatabase = async () => {
    try {
        await AppDataSource.initialize();
        console.log('📦 Database connected successfully');

        // Enable pgvector extension
        await AppDataSource.query('CREATE EXTENSION IF NOT EXISTS vector');
    } catch (error) {
        console.error('❌ Database connection failed:', error);
        process.exit(1);
    }
};
