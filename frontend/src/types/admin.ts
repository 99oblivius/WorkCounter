export interface Role {
  id: number;
  name: string;
  displayName: string;
  description?: string;
  isSystem: boolean;
  permissions?: Permission[];
}

export interface Permission {
  id: number;
  name: string;
  displayName: string;
  description?: string;
  category: string;
}

export interface UserWithRoles {
  id: number;
  username: string;
  email: string;
  is_active: boolean;
  last_login_at?: string;
  created_at: string;
  roles?: Role[];
}

export interface SystemSetting {
  id: number;
  key: string;
  value: string;
  valueType: 'string' | 'number' | 'boolean' | 'json';
  category: string;
  description?: string;
  isPublic: boolean;
  minValue?: number;
  maxValue?: number;
  defaultValue?: string;
}

export interface AuditLog {
  id: number;
  user_id?: number;
  username?: string;
  action: string;
  resource_type?: string;
  resource_id?: number;
  details?: any;
  ip_address?: string;
  user_agent?: string;
  status: 'success' | 'failure' | 'warning';
  created_at: string;
}

export interface WorkShare {
  username: string;
  email: string;
  sharedAt: string;
  canEdit: boolean;
}

export interface SharedWork {
  workId: number;
  workTitle: string;
  ownerUsername: string;
  sharedAt: string;
  canEdit: boolean;
}

export interface WorkAccessInfo {
  isOwner: boolean;
  isShared: boolean;
  canEdit: boolean;
  canDelete: boolean;
}
