import { Response, NextFunction } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendNotFound, sendForbidden } from '../utils/apiResponse.js';
import { WorkAccessService } from '../services/workAccessService.js';
import { AuthenticatedRequest } from './rbac.js';

/**
 * Middleware factory to require ownership or permission to modify a resource
 *
 * Eliminates 8+ duplicated permission check blocks across routes
 *
 * This middleware:
 * 1. Fetches the resource (timeline entry, session, file, etc.)
 * 2. Checks if user can modify it via WorkAccessService.canModifyResource()
 * 3. Attaches the resource to req.resourceData for use in route handler
 * 4. Returns 403 if user lacks permission
 *
 * Usage:
 *   router.delete(
 *     '/:id',
 *     requireOwnership('timeline', TimelineEntryModel.findById),
 *     asyncHandler(async (req, res) => {
 *       const entry = req.resourceData; // Already fetched and validated
 *       await TimelineEntryModel.delete(entry.id);
 *     })
 *   );
 */

export interface ResourceWithWorkAccess {
  id: number;
  work_id: number;
  user_id: number;
  [key: string]: any;
}

export interface RequestWithResource extends AuthenticatedRequest {
  resourceData?: ResourceWithWorkAccess;
}

/**
 * Create middleware to require ownership or manager-level access
 *
 * @param resourceType - Human-readable resource type for error messages (e.g., 'timeline entry', 'file')
 * @param fetchResource - Function to fetch the resource by ID
 * @param action - Action being performed ('edit' or 'delete')
 */
export function requireOwnership<T extends ResourceWithWorkAccess>(
  resourceType: string,
  fetchResource: (id: number) => Promise<T | null>,
  action: 'edit' | 'delete' = 'edit'
) {
  return asyncHandler(async (req: RequestWithResource, res: Response, next: NextFunction) => {
    const userId = req.user!.userId;
    const resourceId = parseInt(req.params.id, 10);

    // Validate ID
    if (isNaN(resourceId)) {
      return sendNotFound(res, `${resourceType} not found`);
    }

    // Fetch resource
    const resource = await fetchResource(resourceId);

    if (!resource) {
      return sendNotFound(res, `${resourceType} not found`);
    }

    // Check if user can modify this resource
    const canModify = await WorkAccessService.canModifyResource(
      userId,
      resource.work_id,
      resource.user_id,
      action
    );

    if (!canModify) {
      return sendForbidden(res, `Cannot ${action} this ${resourceType}`);
    }

    // Attach resource to request for use in route handler
    req.resourceData = resource;

    next();
  });
}

/**
 * Simplified version that only checks if resource belongs to the current user
 * No work-level permission checking
 *
 * Usage:
 *   router.delete('/:id', requireOwnResource('setting', UserSettingsModel.findById), ...)
 */
export function requireOwnResource<T extends { id: number; user_id: number }>(
  resourceType: string,
  fetchResource: (id: number, userId: number) => Promise<T | null>
) {
  return asyncHandler(async (req: RequestWithResource, res: Response, next: NextFunction) => {
    const userId = req.user!.userId;
    const resourceId = parseInt(req.params.id, 10);

    if (isNaN(resourceId)) {
      return sendNotFound(res, `${resourceType} not found`);
    }

    // Fetch resource with user ID check
    const resource = await fetchResource(resourceId, userId);

    if (!resource) {
      return sendNotFound(res, `${resourceType} not found`);
    }

    // Attach to request
    req.resourceData = resource as any;

    next();
  });
}
