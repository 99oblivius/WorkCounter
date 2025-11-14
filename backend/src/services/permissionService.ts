/**
 * Permission Service
 * Centralized service for fetching user permissions and limits
 * Eliminates duplication between userPermissions.ts and stream.ts
 */

import { RoleService } from './roleService.js';
import { SettingsService } from './settingsService.js';

export interface UserPermissions {
  admin: {
    access: boolean;
    viewUsers: boolean;
    editUsers: boolean;
    manageRoles: boolean;
    deactivateUsers: boolean;
    deleteUsers: boolean;
    resetPasswords: boolean;
    viewSettings: boolean;
    editSettings: boolean;
    viewAuditLogs: boolean;
  };
  files: {
    upload: boolean;
    bypassSizeLimits: boolean;
    deleteOwn: boolean;
    viewAll: boolean;
  };
  attachments: {
    upload: boolean;
    deleteOwn: boolean;
  };
  works: {
    create: boolean;
    viewOwn: boolean;
    editOwn: boolean;
    deleteOwn: boolean;
    share: boolean;
    viewShared: boolean;
  };
  sessions: {
    create: boolean;
    editOwn: boolean;
    deleteOwn: boolean;
  };
  timeline: {
    create: boolean;
    editOwn: boolean;
    deleteOwn: boolean;
  };
}

export interface FileLimits {
  maxFileSize: number;
  maxImageSize: number;
  maxNoteImages: number;
  maxFileSizeFormatted: string;
  maxImageSizeFormatted: string;
}

export class PermissionService {
  /**
   * Get all permissions for a user
   * Fetches permissions in parallel for optimal performance
   */
  static async getUserPermissions(userId: number): Promise<UserPermissions> {
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
      canDeleteUsers,
      canResetPasswords,

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
      RoleService.userHasPermission(userId, 'admin.users.delete'),
      RoleService.userHasPermission(userId, 'admin.users.reset_password'),

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

    return {
      admin: {
        access: canAccessAdmin,
        viewUsers: canViewUsers,
        editUsers: canEditUsers,
        manageRoles: canManageRoles,
        deactivateUsers: canDeactivateUsers,
        deleteUsers: canDeleteUsers,
        resetPasswords: canResetPasswords,
        viewSettings: canViewSettings,
        editSettings: canEditSettings,
        viewAuditLogs: canViewAuditLogs,
      },
      files: {
        upload: canUploadFiles,
        bypassSizeLimits: canBypassFileSizeLimits,
        deleteOwn: canDeleteOwnFiles,
        viewAll: canViewAllFiles,
      },
      attachments: {
        upload: canUploadAttachments,
        deleteOwn: canDeleteOwnAttachments,
      },
      works: {
        create: canCreateWorks,
        viewOwn: canViewOwnWorks,
        editOwn: canEditOwnWorks,
        deleteOwn: canDeleteOwnWorks,
        share: canShareWorks,
        viewShared: canViewSharedWorks,
      },
      sessions: {
        create: canCreateSessions,
        editOwn: canEditOwnSessions,
        deleteOwn: canDeleteOwnSessions,
      },
      timeline: {
        create: canCreateTimeline,
        editOwn: canEditOwnTimeline,
        deleteOwn: canDeleteOwnTimeline,
      },
    };
  }

  /**
   * Get file upload limits for a user
   * Respects bypass permission for unlimited uploads
   */
  static async getFileLimits(userId: number): Promise<FileLimits> {
    const fileLimits = await SettingsService.getByCategory('files');
    const canBypass = await RoleService.userHasPermission(userId, 'files.bypass_size_limits');

    const maxFileSize = canBypass
      ? Number.MAX_SAFE_INTEGER
      : parseInt(fileLimits.max_file_size_bytes || '5368709120', 10); // 5GB default

    const maxImageSize = parseInt(fileLimits.max_image_size_bytes || '52428800', 10); // 50MB default
    const maxNoteImages = parseInt(fileLimits.max_note_images || '9', 10);

    return {
      maxFileSize,
      maxImageSize,
      maxNoteImages,
      maxFileSizeFormatted: this.formatBytes(maxFileSize),
      maxImageSizeFormatted: this.formatBytes(maxImageSize),
    };
  }

  /**
   * Get both permissions and limits in one call
   * Optimized for SSE stream initial snapshot
   */
  static async getUserPermissionsAndLimits(userId: number): Promise<{
    permissions: UserPermissions;
    limits: FileLimits;
  }> {
    const [permissions, limits] = await Promise.all([
      this.getUserPermissions(userId),
      this.getFileLimits(userId),
    ]);

    return { permissions, limits };
  }

  /**
   * Format bytes to human-readable string
   */
  private static formatBytes(bytes: number): string {
    if (bytes === Number.MAX_SAFE_INTEGER) return 'Unlimited';
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}
