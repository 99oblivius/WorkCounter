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
