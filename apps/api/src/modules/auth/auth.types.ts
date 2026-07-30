import type { AuthenticatedUser } from '@yukimi/shared';

declare global {
  namespace Express {
    interface Request {
      currentUser?: AuthenticatedUser;
      currentAccessToken?: string;
    }
  }
}

export {};
