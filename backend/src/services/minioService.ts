import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand, HeadBucketCommand, CreateBucketCommand } from '@aws-sdk/client-s3';
import { env } from '../config/env.js';
import { Readable } from 'stream';

class MinIOService {
  private client: S3Client;
  private bucket: string;
  private initialized: boolean = false;

  constructor() {
    this.bucket = env.MINIO_BUCKET;

    this.client = new S3Client({
      endpoint: `http://${env.MINIO_ENDPOINT}:${env.MINIO_PORT}`,
      region: 'us-east-1', // MinIO doesn't care about region, but SDK requires it
      credentials: {
        accessKeyId: env.MINIO_ACCESS_KEY,
        secretAccessKey: env.MINIO_SECRET_KEY,
      },
      forcePathStyle: true, // Required for MinIO
    });
  }

  /**
   * Initialize MinIO service by ensuring bucket exists
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Check if bucket exists
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
      console.log(`MinIO bucket "${this.bucket}" exists`);
    } catch (error: any) {
      if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
        // Bucket doesn't exist, create it
        try {
          await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
          console.log(`MinIO bucket "${this.bucket}" created successfully`);
        } catch (createError) {
          console.error('Failed to create MinIO bucket:', createError);
          throw createError;
        }
      } else {
        console.error('Failed to check MinIO bucket:', error);
        throw error;
      }
    }

    this.initialized = true;
  }

  /**
   * Upload a file to MinIO
   * @param key - Object key (path) in MinIO
   * @param buffer - File buffer
   * @param contentType - MIME type
   * @returns Object key
   */
  async uploadFile(key: string, buffer: Buffer, contentType: string = 'image/webp'): Promise<string> {
    await this.initialize();

    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: buffer,
          ContentType: contentType,
        })
      );

      return key;
    } catch (error) {
      console.error('MinIO upload error:', error);
      throw new Error('Failed to upload image to storage');
    }
  }

  /**
   * Delete a file from MinIO
   * @param key - Object key (path) in MinIO
   */
  async deleteFile(key: string): Promise<void> {
    await this.initialize();

    try {
      await this.client.send(
        new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: key,
        })
      );
    } catch (error) {
      console.error('MinIO delete error:', error);
      throw new Error('Failed to delete image from storage');
    }
  }

  /**
   * Get a file from MinIO
   * @param key - Object key (path) in MinIO
   * @returns File buffer and content type
   */
  async getFile(key: string): Promise<{ buffer: Buffer; contentType: string }> {
    await this.initialize();

    try {
      const response = await this.client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
        })
      );

      // Convert stream to buffer
      const stream = response.Body as Readable;
      const chunks: Buffer[] = [];

      for await (const chunk of stream) {
        chunks.push(Buffer.from(chunk));
      }

      const buffer = Buffer.concat(chunks);
      const contentType = response.ContentType || 'image/webp';

      return { buffer, contentType };
    } catch (error) {
      console.error('MinIO get error:', error);
      throw new Error('Failed to retrieve image from storage');
    }
  }

  /**
   * Stream a file from MinIO (for large file downloads)
   * @param key - Object key (path) in MinIO
   * @returns Readable stream, content type, and content length
   */
  async streamFile(key: string): Promise<{ stream: Readable; contentType: string; contentLength: number }> {
    await this.initialize();

    try {
      const response = await this.client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
        })
      );

      const stream = response.Body as Readable;
      const contentType = response.ContentType || 'application/octet-stream';
      const contentLength = response.ContentLength || 0;

      return { stream, contentType, contentLength };
    } catch (error: any) {
      console.error('MinIO stream error:', error);
      // Check if file not found
      if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
        const notFoundError: any = new Error('File not found in storage');
        notFoundError.statusCode = 404;
        throw notFoundError;
      }
      throw new Error('Failed to retrieve file from storage');
    }
  }

  /**
   * Generate object key for an image
   * @param userId - User ID
   * @param entryId - Timeline entry ID
   * @param filename - Original filename
   * @returns Object key
   */
  generateImageKey(userId: number, entryId: number, filename: string): string {
    return `${userId}/${entryId}/${filename}`;
  }

  /**
   * Delete multiple files from MinIO
   * @param keys - Array of object keys
   */
  async deleteFiles(keys: string[]): Promise<void> {
    await this.initialize();

    const deletePromises = keys.map(key => this.deleteFile(key));
    await Promise.all(deletePromises);
  }

  /**
   * Get the S3 client instance (for tus integration)
   */
  getClient(): S3Client {
    return this.client;
  }

  /**
   * Get the bucket name (for tus integration)
   */
  getBucket(): string {
    return this.bucket;
  }
}

// Export singleton instance
export const minioService = new MinIOService();
