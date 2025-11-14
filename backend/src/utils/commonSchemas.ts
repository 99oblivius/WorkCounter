/**
 * Common Zod Schemas
 * Reusable validation schemas to ensure consistency across routes
 */

import { z } from 'zod';

/**
 * Route parameter schemas
 */
export const idParamSchema = z.object({
  id: z.coerce.number().int().positive({
    message: 'ID must be a positive integer'
  })
});

export const workIdParamSchema = z.object({
  workId: z.coerce.number().int().positive({
    message: 'Work ID must be a positive integer'
  })
});

export const fileIdParamSchema = z.object({
  fileId: z.coerce.number().int().positive({
    message: 'File ID must be a positive integer'
  })
});

export const userIdParamSchema = z.object({
  userId: z.coerce.number().int().positive({
    message: 'User ID must be a positive integer'
  })
});

export const sessionIdParamSchema = z.object({
  sessionId: z.coerce.number().int().positive({
    message: 'Session ID must be a positive integer'
  })
});

/**
 * Pagination schema with sensible defaults and max limits (offset-based)
 */
export const paginationSchema = z.object({
  limit: z.coerce.number().int().positive().max(100, {
    message: 'Limit cannot exceed 100'
  }).default(50),
  offset: z.coerce.number().int().nonnegative().default(0)
});

/**
 * Cursor-based pagination schema for infinite scrolling
 * Uses cursor (last item ID) instead of offset to prevent duplicates when data changes
 */
export const cursorPaginationSchema = z.object({
  limit: z.coerce.number().int().positive().max(100, {
    message: 'Limit cannot exceed 100'
  }).default(20),
  cursor: z.coerce.number().int().positive().optional()
});

/**
 * Date range schema for filtering
 */
export const dateRangeSchema = z.object({
  startDate: z.string().datetime({
    message: 'Start date must be a valid ISO 8601 datetime'
  }).optional(),
  endDate: z.string().datetime({
    message: 'End date must be a valid ISO 8601 datetime'
  }).optional()
});

/**
 * Search query schema
 */
export const searchSchema = z.object({
  search: z.string().max(500, {
    message: 'Search query too long (max 500 characters)'
  }).optional()
});

/**
 * Work status enum (for both filtering and creation)
 */
export const workStatusEnum = z.enum(['active', 'archived', 'completed']);

/**
 * Status filter schema (common across multiple resources)
 */
export const statusFilterSchema = z.object({
  status: z.enum(['active', 'archived', 'completed', 'all']).optional()
});

/**
 * Permission level enum for work sharing
 */
export const permissionLevelEnum = z.enum(['viewer', 'editor', 'manager']);

/**
 * Color enum for categorization (sessions, tags, etc.)
 */
export const colorEnum = z.enum([
  'red',
  'orange',
  'yellow',
  'green',
  'blue',
  'purple',
  'pink',
  'gray'
]);

/**
 * Activity type enum for timeline entries
 */
export const activityTypeEnum = z.enum([
  'meeting',
  'coding',
  'review',
  'testing',
  'documentation',
  'planning',
  'break',
  'research'
]);

/**
 * Generic ID schema for query parameters
 */
export const optionalIdSchema = z.coerce.number().int().positive().optional();

/**
 * Reusable field schemas
 */
export const titleSchema = z.string().min(1, 'Title is required').max(255, 'Title too long');
export const descriptionSchema = z.string().max(10000, 'Description too long').optional();
export const labelSchema = z.string().max(2000, 'Label too long');

/**
 * Setting key validation
 */
export const settingKeySchema = z.enum([
  'theme',
  'accentColor',
  'language',
  'timezone',
  'dateFormat',
  'timeFormat',
  'notifications'
]);

/**
 * Helper to validate and parse with better error messages
 */
export function validateSchema<T extends z.ZodTypeAny>(
  schema: T,
  data: unknown,
  location: 'body' | 'query' | 'params' = 'body'
): z.infer<T> {
  const result = schema.safeParse(data);

  if (!result.success) {
    const error = new Error(`Validation failed for ${location}`);
    (error as any).zodError = result.error;
    (error as any).details = result.error.errors;
    throw error;
  }

  return result.data;
}
