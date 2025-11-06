// User role-based permissions (global)
export interface UserPermissions {
  permissions: {
    admin: {
      access: boolean;
      viewUsers: boolean;
      editUsers: boolean;
      manageRoles: boolean;
      deactivateUsers: boolean;
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
  };
  limits: {
    maxFileSize: number;
    maxImageSize: number;
    maxNoteImages: number;
    maxFileSizeFormatted: string;
    maxImageSizeFormatted: string;
  };
}

// Work-specific permission levels
export type WorkPermissionLevel = 'viewer' | 'editor' | 'manager';

export interface WorkShare {
  username: string;
  email: string;
  sharedAt: Date | string;
  permissionLevel: WorkPermissionLevel;
  canEdit?: boolean; // Legacy
}

export const PERMISSION_LEVELS: Record<WorkPermissionLevel, {
  name: string;
  description: string[];
}> = {
  viewer: {
    name: 'Viewer',
    description: [
      '✓ View work and all content',
      '• Cannot create or modify'
    ]
  },
  editor: {
    name: 'Editor',
    description: [
      '✓ All viewer permissions',
      '✓ Create sessions & notes',
      '✓ Edit/delete own content',
      '• Cannot modify others\' work'
    ]
  },
  manager: {
    name: 'Manager',
    description: [
      '✓ All editor permissions',
      '✓ Edit/delete any content',
      '✓ Full collaboration access'
    ]
  }
};
