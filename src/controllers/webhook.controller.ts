import { Request, Response } from 'express';
import { ingestionService } from '../services/ingestion.service';
import { downloadFromS3 } from '../utils/s3';
import { parseS3Path, isValidS3Structure } from '../utils/s3-path-parser';

/**
 * S3 Event Notification webhook handler
 * Receives SNS notifications when files are uploaded to S3
 * Automatically triggers ingestion for PDFs in the correct folder structure
 */
export const handleS3Upload = async (req: Request, res: Response) => {
    try {
        console.log('🔔 Received S3 webhook notification');

        // SNS sends different message types
        const messageType = req.headers['x-amz-sns-message-type'];

        // Handle SNS subscription confirmation
        if (messageType === 'SubscriptionConfirmation') {
            console.log('📝 SNS Subscription Confirmation received');
            const subscribeURL = req.body.SubscribeURL;

            if (subscribeURL) {
                console.log(`   Auto-confirming subscription: ${subscribeURL}`);

                // Automatically confirm the subscription
                try {
                    const https = require('https');
                    const confirmRes = await fetch(subscribeURL);
                    const confirmText = await confirmRes.text();

                    console.log('✅ Subscription confirmed automatically');
                    res.json({
                        message: 'Subscription confirmed',
                        subscribeURL
                    });
                } catch (error) {
                    console.error('❌ Failed to auto-confirm subscription:', error);
                    console.log(`   Manual confirmation needed: ${subscribeURL}`);
                    res.json({
                        message: 'Auto-confirmation failed, please confirm manually',
                        subscribeURL,
                        error: error instanceof Error ? error.message : 'Unknown error'
                    });
                }
            } else {
                res.status(400).json({ error: 'Missing SubscribeURL' });
            }
            return;
        }

        // Handle SNS notification
        if (messageType === 'Notification') {
            const snsMessage = req.body;

            // Parse the S3 event from SNS message
            let s3Event;
            try {
                s3Event = JSON.parse(snsMessage.Message);
            } catch (err) {
                console.error('❌ Failed to parse SNS Message:', err);
                res.status(400).json({ error: 'Invalid SNS message format' });
                return;
            }

            console.log(`📦 S3 Event received with ${s3Event.Records?.length || 0} records`);

            // Process all S3 records
            const results = [];
            for (const record of s3Event.Records || []) {
                const eventName = record.eventName;
                const s3Key = decodeURIComponent(record.s3?.object?.key?.replace(/\+/g, ' ') || '');
                const bucketName = record.s3?.bucket?.name;

                console.log(`\n📄 Processing S3 Event:`);
                console.log(`   Event: ${eventName}`);
                console.log(`   Bucket: ${bucketName}`);
                console.log(`   Key: ${s3Key}`);

                // Only process ObjectCreated events
                if (!eventName?.startsWith('ObjectCreated:')) {
                    console.log(`   ⏭️  Skipping non-create event: ${eventName}`);
                    results.push({ s3Key, status: 'skipped', reason: 'not a create event' });
                    continue;
                }

                // Only process PDF files
                if (!s3Key.toLowerCase().endsWith('.pdf')) {
                    console.log(`   ⏭️  Skipping non-PDF file`);
                    results.push({ s3Key, status: 'skipped', reason: 'not a PDF' });
                    continue;
                }

                // Validate folder structure
                if (!isValidS3Structure(s3Key)) {
                    console.log(`   ⚠️  Invalid folder structure. Expected: religion/textSource/file.pdf`);
                    results.push({ s3Key, status: 'skipped', reason: 'invalid folder structure' });
                    continue;
                }

                // Parse S3 path
                const pathInfo = parseS3Path(s3Key);
                console.log(`   Religion: ${pathInfo.religion}`);
                console.log(`   Text Source: ${pathInfo.textSource}`);

                // Trigger ingestion asynchronously (don't wait for completion)
                console.log(`   🚀 Triggering automatic ingestion...`);

                // Start ingestion in background
                ingestS3Document(s3Key, pathInfo.religion, pathInfo.textSource)
                    .then(() => console.log(`✅ Ingestion completed for ${s3Key}`))
                    .catch(err => console.error(`❌ Ingestion failed for ${s3Key}:`, err));

                results.push({
                    s3Key,
                    status: 'triggered',
                    religion: pathInfo.religion,
                    textSource: pathInfo.textSource
                });
            }

            res.json({
                success: true,
                message: 'S3 events processed',
                results
            });
            return;
        }

        // Unknown message type
        res.status(400).json({ error: 'Unknown SNS message type' });

    } catch (error) {
        console.error('❌ Webhook error:', error);
        res.status(500).json({
            error: 'Webhook processing failed',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
};

/**
 * Background ingestion function
 * Downloads PDF from S3 and ingests it
 */
async function ingestS3Document(
    s3Key: string,
    religion: string | null,
    textSource: string | null
): Promise<void> {
    try {
        console.log(`\n📥 Downloading ${s3Key} from S3...`);
        const pdfBuffer = await downloadFromS3(s3Key);

        console.log(`🔄 Starting ingestion...`);
        const result = await ingestionService.ingestDocument(
            pdfBuffer,
            `s3://${s3Key}`,
            religion,
            textSource,
            {
                childChunkSize: 1000,
                childOverlap: 200,
                clearExisting: false
            }
        );

        console.log(`✅ Ingestion successful:`, result.stats);
    } catch (error) {
        console.error(`❌ Ingestion failed for ${s3Key}:`, error);
        throw error;
    }
}
