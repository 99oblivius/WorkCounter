import { Router } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { requireAuth } from '../middleware/auth.js';
import { uploadImages } from '../middleware/upload.js';
import { TimelineEntryModel } from '../models/TimelineEntry.js';
import { TimeSessionModel } from '../models/TimeSession.js';
import { imageProcessor } from '../services/imageProcessor.js';
import { minioService } from '../services/minioService.js';
import '../types/index.js';

const router = Router();

const createEntrySchema = z.object({
  timeSessionId: z.number().int().positive(),
  workId: z.number().int().positive(),
  timestamp: z.string().datetime(),
  label: z.string().min(1).optional(), // Optional - allow image-only notes
  activityType: z.string().optional(),
});

const updateEntrySchema = z.object({
  timestamp: z.string().datetime().optional(),
  label: z.string().min(1).nullable().optional(),
  activityType: z.string().nullable().optional(),
});

router.use(requireAuth);

router.get('/session/:sessionId', async (req, res, next) => {
  try {
    const userId = req.session.user!.userId;
    const sessionId = parseInt(req.params.sessionId, 10);

    const entries = await TimelineEntryModel.findBySessionId(sessionId, userId);
    res.json(entries);
  } catch (error) {
    next(error);
  }
});

router.get('/work/:workId', async (req, res, next) => {
  try {
    const userId = req.session.user!.userId;
    const workId = parseInt(req.params.workId, 10);

    const entries = await TimelineEntryModel.findByWorkId(workId, userId);
    res.json(entries);
  } catch (error) {
    next(error);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const userId = req.session.user!.userId;
    const id = parseInt(req.params.id, 10);

    const entry = await TimelineEntryModel.findById(id, userId);

    if (!entry) {
      return res.status(404).json({ error: 'Timeline entry not found' });
    }

    res.json(entry);
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const userId = req.session.user!.userId;
    const data = createEntrySchema.parse(req.body);

    const session = await TimeSessionModel.findById(data.timeSessionId, userId);
    if (!session) {
      return res.status(404).json({ error: 'Time session not found' });
    }

    const entry = await TimelineEntryModel.create({
      timeSessionId: data.timeSessionId,
      workId: data.workId,
      userId,
      timestamp: new Date(data.timestamp),
      label: data.label,
      activityType: data.activityType,
    });

    res.status(201).json(entry);
  } catch (error) {
    next(error);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const userId = req.session.user!.userId;
    const id = parseInt(req.params.id, 10);
    const data = updateEntrySchema.parse(req.body);

    const entry = await TimelineEntryModel.update(id, userId, {
      timestamp: data.timestamp ? new Date(data.timestamp) : undefined,
      label: data.label === null ? undefined : data.label,
      activity_type: data.activityType,
    });

    if (!entry) {
      return res.status(404).json({ error: 'Timeline entry not found' });
    }

    res.json(entry);
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const userId = req.session.user!.userId;
    const id = parseInt(req.params.id, 10);

    // Get entry to delete associated images
    const entry = await TimelineEntryModel.findById(id, userId);
    if (entry && entry.image_urls && entry.image_urls.length > 0) {
      // Delete images from MinIO
      await minioService.deleteFiles(entry.image_urls);
    }

    const deleted = await TimelineEntryModel.delete(id, userId);

    if (!deleted) {
      return res.status(404).json({ error: 'Timeline entry not found' });
    }

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

// Upload images to an existing timeline entry
router.post('/:id/images', uploadImages, async (req, res, next) => {
  try {
    const userId = req.session.user!.userId;
    const id = parseInt(req.params.id, 10);

    // Check if entry exists and belongs to user
    const entry = await TimelineEntryModel.findById(id, userId);
    if (!entry) {
      return res.status(404).json({ error: 'Timeline entry not found' });
    }

    // Check if files were uploaded
    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No images provided' });
    }

    // Check total images count (existing + new)
    const existingCount = entry.image_urls?.length || 0;
    if (existingCount + files.length > 9) {
      return res.status(400).json({
        error: `Maximum 9 images allowed. You already have ${existingCount} image(s).`
      });
    }

    // Process and upload images in bulk
    const imageUrls: string[] = [];

    for (const file of files) {
      // Validate image
      const isValid = await imageProcessor.validateImage(file.buffer);
      if (!isValid) {
        return res.status(400).json({ error: `Invalid image file: ${file.originalname}` });
      }

      // Process image (convert to WebP, resize if needed)
      const processedBuffer = await imageProcessor.processImage(file.buffer);

      // Generate unique filename
      const filename = `${uuidv4()}.webp`;
      const imageKey = minioService.generateImageKey(userId, id, filename);

      // Upload to MinIO
      await minioService.uploadFile(imageKey, processedBuffer, 'image/webp');

      imageUrls.push(imageKey);
    }

    // Update entry with new image URLs
    const updatedImageUrls = [...(entry.image_urls || []), ...imageUrls];
    const updatedEntry = await TimelineEntryModel.update(id, userId, {
      image_urls: updatedImageUrls,
    });

    res.json(updatedEntry);
  } catch (error) {
    next(error);
  }
});

// Delete a specific image from a timeline entry
router.delete('/:id/images/:imageKey(*)', async (req, res, next) => {
  try {
    const userId = req.session.user!.userId;
    const id = parseInt(req.params.id, 10);
    const imageKey = req.params.imageKey;

    // Check if entry exists and belongs to user
    const entry = await TimelineEntryModel.findById(id, userId);
    if (!entry) {
      return res.status(404).json({ error: 'Timeline entry not found' });
    }

    // Check if image exists in entry
    if (!entry.image_urls || !entry.image_urls.includes(imageKey)) {
      return res.status(404).json({ error: 'Image not found in this entry' });
    }

    // Delete image from MinIO
    await minioService.deleteFile(imageKey);

    // Update entry to remove image URL
    const updatedImageUrls = entry.image_urls.filter(url => url !== imageKey);
    const updatedEntry = await TimelineEntryModel.update(id, userId, {
      image_urls: updatedImageUrls.length > 0 ? updatedImageUrls : null,
    });

    res.json(updatedEntry);
  } catch (error) {
    next(error);
  }
});

// Serve an image from MinIO
router.get('/images/:imageKey(*)', requireAuth, async (req, res, next) => {
  try {
    const imageKey = req.params.imageKey;

    // Extract userId from image key (format: userId/entryId/filename.webp)
    const parts = imageKey.split('/');
    if (parts.length < 3) {
      return res.status(400).json({ error: 'Invalid image key' });
    }

    const imageUserId = parseInt(parts[0], 10);
    const requestUserId = req.session.user!.userId;

    // Ensure user can only access their own images
    if (imageUserId !== requestUserId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get image from MinIO
    const { buffer, contentType } = await minioService.getFile(imageKey);

    // Set cache headers for better performance
    res.set({
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=31536000', // 1 year
    });

    res.send(buffer);
  } catch (error) {
    next(error);
  }
});

export default router;
