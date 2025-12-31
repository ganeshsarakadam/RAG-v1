import { Request, Response } from 'express';
import { uploadToS3, getS3Uri } from '../utils/s3';

export const uploadDocument = async (req: Request, res: Response) => {
    try {
        // Check if file was uploaded
        if (!req.file) {
            res.status(400).json({
                error: 'File is required. Please upload a file using the "file" field.'
            });
            return;
        }

        // Validate file type
        if (req.file.mimetype !== 'application/pdf') {
            res.status(400).json({
                error: 'Only PDF files are supported'
            });
            return;
        }

        // Get folder from request body (default to 'documents')
        const folder = req.body.folder || 'documents';
        const fileName = req.body.fileName || req.file.originalname;

        console.log(`📄 Uploading file: ${fileName} to folder: ${folder}`);
        console.log(`   Size: ${req.file.size} bytes`);

        // Upload to S3
        const s3Key = await uploadToS3(req.file.buffer, folder, fileName);
        const s3Uri = getS3Uri(s3Key);

        res.json({
            success: true,
            message: 'File uploaded successfully to S3',
            data: {
                s3Key,
                s3Uri,
                folder,
                fileName,
                size: req.file.size,
                uploadedAt: new Date().toISOString()
            }
        });
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({
            error: 'Upload failed',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
};
