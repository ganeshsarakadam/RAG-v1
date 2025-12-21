import 'reflect-metadata';
import app from './app';
import { config } from './config/env';
import { initializeDatabase } from './config/database';

initializeDatabase().then(() => {
    app.listen(config.port, () => {
        console.log(`Knowledge Service is running on port ${config.port} in ${config.env} mode`);
    });
});
