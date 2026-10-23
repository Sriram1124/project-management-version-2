import { Request } from 'express';

export interface ServiceUserClaims {
  id: string;
  name: string;
  email: string;
  role: string;
  is_active: boolean;
  organization_id: string;
  roles: Array<{
    role: {
      name: string;
      permissions: Array<{ permission: { name: string } }>;
    };
  }>;
  user_permissions: Array<{
    permission: { id: string; name: string };
  }>;
}

export interface AuthenticatedServiceRequest extends Request {
  user?: {
    userId: string;
    role: string;
    organization_id: string;
    isService: boolean;
  };
  fullUser?: ServiceUserClaims;
  _authDuration?: number;
}

