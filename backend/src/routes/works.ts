import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { requireWorkAccess } from '../middleware/authorization.js';
import { WorkModel } from '../models/Work.js';
import { TimelineEntryModel } from '../models/TimelineEntry.js';
import { FileStorageModel } from '../models/FileStorage.js';
import { minioService } from '../services/minioService.js';
import { WorkAccessService } from '../services/workAccessService.js';
import { sseService } from '../services/sseService.js';
import '../types/index.js';

const router = Router();

// SECURITY: Comprehensive input validation with max lengths
const createWorkSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().max(10000).optional(),  // SECURITY FIX: Added max length
  clientName: z.string().max(255).optional(),
  hourlyRate: z.number().positive().max(999999.99).optional(),  // SECURITY FIX: Max value
  tags: z.array(z.string().max(100)).max(20).optional(),  // SECURITY FIX: Max tag length and count
});

const updateWorkSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().max(10000).optional(),  // SECURITY FIX: Added max length
  clientName: z.string().max(255).optional(),
  hourlyRate: z.number().positive().max(999999.99).optional(),  // SECURITY FIX: Max value
  status: z.enum(['active', 'archived', 'completed']).optional(),
  tags: z.array(z.string().max(100)).max(20).optional(),  // SECURITY FIX: Max tag length and count
});

router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    const userId = req.session.user!.userId;
    const { status, search } = req.query;

    let works;
    if (search && typeof search === 'string') {
      works = await WorkModel.search(userId, search);
    } else {
      works = await WorkModel.findByUserId(userId, status as string | undefined);
    }

    res.json(works);
  } catch (error) {
    next(error);
  }
});

router.get('/:id', requireWorkAccess('view'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);

    // Authorization already checked by requireWorkAccess middleware
    const work = await WorkModel.findByIdWithAccess(id);

    if (!work) {
      return res.status(404).json({ error: 'Work not found' });
    }

    res.json(work);
  } catch (error) {
    next(error);
  }
});

// Get work permissions for current user
router.get('/:id/permissions', requireWorkAccess('view'), async (req, res, next) => {
  try {
    const userId = req.session.user!.userId;
    const workId = parseInt(req.params.id, 10);

    const permissions = await WorkAccessService.checkAccess(userId, workId);

    res.json({
      permissionLevel: permissions.permissionLevel,
      canView: permissions.canView,
      canCreate: permissions.canCreate,
      canEditOthers: permissions.canEditOthers,
      canDeleteOthers: permissions.canDeleteOthers,
      canEdit: permissions.canEdit,
      canDelete: permissions.canDelete,
      isOwner: permissions.isOwner,
      isShared: permissions.isShared
    });
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const userId = req.session.user!.userId;
    const data = createWorkSchema.parse(req.body);

    const work = await WorkModel.create({
      userId,
      ...data,
    });

    res.status(201).json(work);
  } catch (error) {
    next(error);
  }
});

router.patch('/:id', requireWorkAccess('edit'), async (req, res, next) => {
  try {
    const userId = req.session.user!.userId;
    const id = parseInt(req.params.id, 10);
    const data = updateWorkSchema.parse(req.body);

    // Get work access to check if user is owner
    const workAccess = (req as any).workAccess;

    // Only owners can update works (even with edit access, sharees can't modify work metadata)
    if (!workAccess.isOwner) {
      return res.status(403).json({ error: 'Only the work owner can update work details' });
    }

    // Convert camelCase to snake_case for database
    const updateData: any = {};
    if (data.title !== undefined) updateData.title = data.title;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.clientName !== undefined) updateData.client_name = data.clientName;
    if (data.hourlyRate !== undefined) updateData.hourly_rate = data.hourlyRate;
    if (data.status !== undefined) updateData.status = data.status;
    if (data.tags !== undefined) updateData.tags = data.tags;

    const work = await WorkModel.update(id, userId, updateData);

    if (!work) {
      return res.status(404).json({ error: 'Work not found' });
    }

    // Emit SSE event for real-time updates
    await sseService.emitWorkUpdate(id, 'work:update', work);

    res.json(work);
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', requireWorkAccess('delete'), async (req, res, next) => {
  try {
    const userId = req.session.user!.userId;
    const id = parseInt(req.params.id, 10);

    console.log(`Deleting work ${id} for user ${userId}`);

    // Get all timeline entries for this work to clean up images
    const entries = await TimelineEntryModel.findByWorkId(id, userId);
    console.log(`Found ${entries.length} timeline entries for work ${id}`);

    // Collect all image keys from all entries
    const imageKeys: string[] = [];
    entries.forEach(entry => {
      if (entry.image_urls && entry.image_urls.length > 0) {
        console.log(`Entry ${entry.id} has ${entry.image_urls.length} images:`, entry.image_urls);
        imageKeys.push(...entry.image_urls);
      }
    });

    console.log(`Total timeline images to delete: ${imageKeys.length}`);

    // Delete all timeline images from MinIO
    if (imageKeys.length > 0) {
      console.log(`Starting deletion of ${imageKeys.length} timeline images from MinIO...`);
      await minioService.deleteFiles(imageKeys);
      console.log(`Cleaned up ${imageKeys.length} timeline image(s) from deleted work ${id}`);
    } else {
      console.log(`No timeline images to clean up for work ${id}`);
    }

    // Get all file storage files for this work to clean up
    const files = await FileStorageModel.findForWorkDeletion(id, userId);
    console.log(`Found ${files.length} file storage files for work ${id}`);

    // Collect storage keys from completed files
    const fileKeys: string[] = files
      .filter(f => f.upload_status === 'completed')
      .map(f => f.storage_key);

    console.log(`Total storage files to delete: ${fileKeys.length}`);

    // Delete all storage files from MinIO
    if (fileKeys.length > 0) {
      console.log(`Starting deletion of ${fileKeys.length} storage files from MinIO...`);
      await minioService.deleteFiles(fileKeys);
      console.log(`Cleaned up ${fileKeys.length} storage file(s) from deleted work ${id}`);
    } else {
      console.log(`No storage files to clean up for work ${id}`);
    }

    // Delete the work (cascade will delete sessions, timeline entries, and file_storage records)
    const deleted = await WorkModel.delete(id, userId);

    if (!deleted) {
      return res.status(404).json({ error: 'Work not found' });
    }

    console.log(`Work ${id} deleted successfully`);
    res.status(204).send();
  } catch (error) {
    console.error(`Error deleting work ${req.params.id}:`, error);
    next(error);
  }
});

export default router;
