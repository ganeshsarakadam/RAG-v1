import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'stream';
import dotenv from 'dotenv';

dotenv.config();

const REGION = process.env.AWS_REGION || 'us-east-1';
const S3_BUCKET_NAME = process.env.S3_BUCKET_NAME || '';

// Initialize S3 Client
export const s3Client = new S3Client({ region: REGION });

/**
 * Convert stream to buffer
 */
export const streamToBuffer = async (stream: Readable): Promise<Buffer> => {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        stream.on('error', (err) => reject(err));
        stream.on('end', () => resolve(Buffer.concat(chunks)));
    });
};

/**
 * Upload a file to S3
 * @param buffer - File buffer to upload
 * @param folder - Folder path in S3 (e.g., 'documents/mahabharata')
 * @param fileName - Name of the file
 * @returns S3 key of uploaded file
 */
export const uploadToS3 = async (
    buffer: Buffer,
    folder: string,
    fileName: string
): Promise<string> => {
    if (!S3_BUCKET_NAME) {
        throw new Error('S3_BUCKET_NAME is not configured in environment variables');
    }

    // Construct S3 key (path)
    const s3Key = folder ? `${folder}/${fileName}` : fileName;

    console.log(`📤 Uploading to S3: ${S3_BUCKET_NAME}/${s3Key}`);

    const command = new PutObjectCommand({
        Bucket: S3_BUCKET_NAME,
        Key: s3Key,
        Body: buffer,
        ContentType: 'application/pdf',
    });

    await s3Client.send(command);

    console.log(`✅ Upload successful: s3://${S3_BUCKET_NAME}/${s3Key}`);

    return s3Key;
};

/**
 * Download a file from S3
 * @param s3Key - S3 key (path) of the file
 * @returns File buffer
 */
export const downloadFromS3 = async (s3Key: string): Promise<Buffer> => {
    if (!S3_BUCKET_NAME) {
        throw new Error('S3_BUCKET_NAME is not configured in environment variables');
    }

    console.log(`📥 Downloading from S3: ${S3_BUCKET_NAME}/${s3Key}`);

    const command = new GetObjectCommand({
        Bucket: S3_BUCKET_NAME,
        Key: s3Key,
    });

    const response = await s3Client.send(command);

    if (!response.Body) {
        throw new Error('S3 object body is empty');
    }

    const buffer = await streamToBuffer(response.Body as Readable);

    console.log(`✅ Download successful: ${buffer.length} bytes`);

    return buffer;
};

/**
 * Get S3 URI for a key
 */
export const getS3Uri = (s3Key: string): string => {
    return `s3://${S3_BUCKET_NAME}/${s3Key}`;
};

/**
 * Get bucket name
 */
export const getBucketName = (): string => {
    return S3_BUCKET_NAME;
};
