import sharp from 'sharp';

interface ProcessImageOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
}

class ImageProcessor {
  private readonly defaultOptions: ProcessImageOptions = {
    maxWidth: 1920,
    maxHeight: 1920,
    quality: 75, // Low compression as requested
  };

  /**
   * Process an image: resize if needed and convert to WebP
   * @param buffer - Input image buffer
   * @param options - Processing options
   * @returns Processed image buffer (WebP format)
   */
  async processImage(buffer: Buffer, options: ProcessImageOptions = {}): Promise<Buffer> {
    const opts = { ...this.defaultOptions, ...options };

    try {
      // Get image metadata
      const metadata = await sharp(buffer).metadata();

      // Determine if resize is needed
      const needsResize =
        (metadata.width && metadata.width > opts.maxWidth!) ||
        (metadata.height && metadata.height > opts.maxHeight!);

      let pipeline = sharp(buffer);

      // Resize if necessary (maintain aspect ratio)
      if (needsResize) {
        pipeline = pipeline.resize(opts.maxWidth, opts.maxHeight, {
          fit: 'inside',
          withoutEnlargement: true,
        });
      }

      // Convert to WebP with specified quality
      const processedBuffer = await pipeline
        .webp({ quality: opts.quality })
        .toBuffer();

      return processedBuffer;
    } catch (error) {
      console.error('Image processing error:', error);
      throw new Error('Failed to process image');
    }
  }

  /**
   * Process multiple images in bulk
   * @param buffers - Array of image buffers
   * @param options - Processing options
   * @returns Array of processed image buffers
   */
  async processImages(buffers: Buffer[], options: ProcessImageOptions = {}): Promise<Buffer[]> {
    const processPromises = buffers.map(buffer => this.processImage(buffer, options));
    return Promise.all(processPromises);
  }

  /**
   * Validate image buffer
   * @param buffer - Image buffer to validate
   * @returns True if valid image
   */
  async validateImage(buffer: Buffer): Promise<boolean> {
    try {
      const metadata = await sharp(buffer).metadata();

      // Check if it's a valid image format
      const validFormats = ['jpeg', 'jpg', 'png', 'gif', 'webp'];
      if (!metadata.format || !validFormats.includes(metadata.format)) {
        return false;
      }

      // Check minimum dimensions (at least 1x1)
      if (!metadata.width || !metadata.height || metadata.width < 1 || metadata.height < 1) {
        return false;
      }

      return true;
    } catch (error) {
      console.error('Image validation error:', error);
      return false;
    }
  }

  /**
   * Get image metadata
   * @param buffer - Image buffer
   * @returns Image metadata
   */
  async getMetadata(buffer: Buffer): Promise<sharp.Metadata> {
    try {
      return await sharp(buffer).metadata();
    } catch (error) {
      console.error('Failed to get image metadata:', error);
      throw new Error('Failed to read image metadata');
    }
  }
}

// Export singleton instance
export const imageProcessor = new ImageProcessor();
