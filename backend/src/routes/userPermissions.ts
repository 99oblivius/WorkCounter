import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { RoleService } from '../services/roleService.js';
import { SettingsService } from '../services/settingsService.js';
import type { AuthenticatedRequest } from '../middleware/rbac.js';

const router = Router();

router.use(requireAuth);

/**
 * Get current user's permissions and limits
 * This provides all permission checks and file size limits for the frontend
 */
router.get('/me', async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userId = req.user.userId;

    // Get all permissions for user
    const [
      // Admin permissions
      canAccessAdmin,
      canViewUsers,
      canEditUsers,
      canManageRoles,
      canDeactivateUsers,
      canViewSettings,
      canEditSettings,
      canViewAuditLogs,

      // File permissions
      canUploadFiles,
      canBypassFileSizeLimits,
      canDeleteOwnFiles,
      canViewAllFiles,

      // Attachment permissions
      canUploadAttachments,
      canDeleteOwnAttachments,

      // Work permissions
      canCreateWorks,
      canViewOwnWorks,
      canEditOwnWorks,
      canDeleteOwnWorks,
      canShareWorks,
      canViewSharedWorks,

      // Session permissions
      canCreateSessions,
      canEditOwnSessions,
      canDeleteOwnSessions,

      // Timeline permissions
      canCreateTimeline,
      canEditOwnTimeline,
      canDeleteOwnTimeline,
    ] = await Promise.all([
      // Admin
      RoleService.userHasPermission(userId, 'admin.access'),
      RoleService.userHasPermission(userId, 'admin.users.view'),
      RoleService.userHasPermission(userId, 'admin.users.edit'),
      RoleService.userHasPermission(userId, 'admin.users.roles'),
      RoleService.userHasPermission(userId, 'admin.users.deactivate'),
      RoleService.userHasPermission(userId, 'admin.settings.view'),
      RoleService.userHasPermission(userId, 'admin.settings.edit'),
      RoleService.userHasPermission(userId, 'admin.audit.view'),

      // Files
      RoleService.userHasPermission(userId, 'files.upload'),
      RoleService.userHasPermission(userId, 'files.bypass_size_limits'),
      RoleService.userHasPermission(userId, 'files.delete_own'),
      RoleService.userHasPermission(userId, 'files.view_all'),

      // Attachments
      RoleService.userHasPermission(userId, 'attachments.upload'),
      RoleService.userHasPermission(userId, 'attachments.delete_own'),

      // Works
      RoleService.userHasPermission(userId, 'works.create'),
      RoleService.userHasPermission(userId, 'works.view_own'),
      RoleService.userHasPermission(userId, 'works.edit_own'),
      RoleService.userHasPermission(userId, 'works.delete_own'),
      RoleService.userHasPermission(userId, 'works.share'),
      RoleService.userHasPermission(userId, 'works.view_shared'),

      // Sessions
      RoleService.userHasPermission(userId, 'sessions.create_own'),
      RoleService.userHasPermission(userId, 'sessions.edit_own'),
      RoleService.userHasPermission(userId, 'sessions.delete_own'),

      // Timeline
      RoleService.userHasPermission(userId, 'timeline.create_own'),
      RoleService.userHasPermission(userId, 'timeline.edit_own'),
      RoleService.userHasPermission(userId, 'timeline.delete_own'),
    ]);

    // Get file size limits from settings
    const fileLimits = await SettingsService.getByCategory('files');

    const maxFileSize = canBypassFileSizeLimits
      ? Number.MAX_SAFE_INTEGER // No limit
      : parseInt(fileLimits.max_file_size_bytes || '5368709120', 10); // 5GB default

    const maxImageSize = parseInt(fileLimits.max_image_size_bytes || '52428800', 10); // 50MB default
    const maxNoteImages = parseInt(fileLimits.max_note_images || '9', 10);

    res.json({
      permissions: {
        // Admin
        admin: {
          access: canAccessAdmin,
          viewUsers: canViewUsers,
          editUsers: canEditUsers,
          manageRoles: canManageRoles,
          deactivateUsers: canDeactivateUsers,
          viewSettings: canViewSettings,
          editSettings: canEditSettings,
          viewAuditLogs: canViewAuditLogs,
        },

        // Files
        files: {
          upload: canUploadFiles,
          bypassSizeLimits: canBypassFileSizeLimits,
          deleteOwn: canDeleteOwnFiles,
          viewAll: canViewAllFiles,
        },

        // Attachments
        attachments: {
          upload: canUploadAttachments,
          deleteOwn: canDeleteOwnAttachments,
        },

        // Works
        works: {
          create: canCreateWorks,
          viewOwn: canViewOwnWorks,
          editOwn: canEditOwnWorks,
          deleteOwn: canDeleteOwnWorks,
          share: canShareWorks,
          viewShared: canViewSharedWorks,
        },

        // Sessions
        sessions: {
          create: canCreateSessions,
          editOwn: canEditOwnSessions,
          deleteOwn: canDeleteOwnSessions,
        },

        // Timeline
        timeline: {
          create: canCreateTimeline,
          editOwn: canEditOwnTimeline,
          deleteOwn: canDeleteOwnTimeline,
        },
      },

      limits: {
        maxFileSize,
        maxImageSize,
        maxNoteImages,
        maxFileSizeFormatted: formatBytes(maxFileSize),
        maxImageSizeFormatted: formatBytes(maxImageSize),
      },
    });
  } catch (error) {
    console.error('Error fetching user permissions:', error);
    res.status(500).json({ error: 'Failed to fetch permissions' });
  }
});

function formatBytes(bytes: number): string {
  if (bytes === Number.MAX_SAFE_INTEGER) return 'Unlimited';
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export default router;
