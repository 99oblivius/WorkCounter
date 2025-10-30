import { Request, Response, NextFunction } from 'express';
import { Issuer, Client, TokenSet } from 'openid-client';
import { env } from '../config/env.js';
import { UserModel } from '../models/User.js';
import '../types/index.js';

let oidcClient: Client;

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function initializeOIDC(maxRetries = 10, initialDelay = 2000) {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Attempting to initialize OIDC client (attempt ${attempt}/${maxRetries})...`);

      const issuer = await Issuer.discover(`${env.AUTHENTIK_URL}/application/o/workcounter/.well-known/openid-configuration`);

      oidcClient = new issuer.Client({
        client_id: env.AUTHENTIK_CLIENT_ID,
        client_secret: env.AUTHENTIK_CLIENT_SECRET,
        redirect_uris: [`${env.BACKEND_URL}/api/auth/callback`],
        response_types: ['code'],
      });

      console.log('OIDC client initialized successfully');
      return;
    } catch (error) {
      lastError = error as Error;
      console.warn(`Failed to initialize OIDC client (attempt ${attempt}/${maxRetries}):`, error);

      if (attempt < maxRetries) {
        const delay = initialDelay * Math.pow(1.5, attempt - 1);
        console.log(`Waiting ${delay}ms before retry...`);
        await sleep(delay);
      }
    }
  }

  console.error('Failed to initialize OIDC client after all retries:', lastError);
  throw lastError;
}

export function getOIDCClient(): Client {
  if (!oidcClient) {
    throw new Error('OIDC client not initialized');
  }
  return oidcClient;
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

export async function handleAuthCallback(
  code: string,
  redirectUri: string
): Promise<{ userId: number; authentikId: string; email: string; username: string }> {
  const client = getOIDCClient();

  const tokenSet: TokenSet = await client.callback(redirectUri, { code });
  const userinfo = await client.userinfo(tokenSet);

  const authentikId = userinfo.sub;
  const email = userinfo.email as string;
  const username = (userinfo.preferred_username as string) || email;

  let user = await UserModel.findByAuthentikId(authentikId);

  if (!user) {
    user = await UserModel.create({
      authentikId,
      email,
      username,
    });
  } else if (user.email !== email || user.username !== username) {
    user = await UserModel.update(user.id, { email, username });
  }

  return {
    userId: user.id,
    authentikId: user.authentik_id,
    email: user.email,
    username: user.username,
  };
}
