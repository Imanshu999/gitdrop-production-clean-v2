import express, { Request, Response } from 'express';
import crypto from 'node:crypto';
import cookieParser from 'cookie-parser';
import multer from 'multer';
import AdmZip from 'adm-zip';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import {
  getAuthenticatedUser,
  getUserRepos,
  deployZipToGitHub,
} from './src/server/github.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

// Allow browser requests only from the configured application origin.
app.use((req, res, next) => {
  const origin = req.headers.origin;
  const configuredOrigin = process.env.APP_URL?.trim().replace(/\/+$/, '');
  const allowedOrigins = new Set<string>([configuredOrigin || '']);
  if (process.env.NODE_ENV !== 'production') {
    allowedOrigins.add('http://localhost:3000');
    allowedOrigins.add('http://127.0.0.1:3000');
  }

  if (origin && allowedOrigins.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  }

  if (req.method === 'OPTIONS') {
    return res.sendStatus(origin && allowedOrigins.has(origin) ? 204 : 403);
  }

  next();
});

// Configure body parsers & cookies
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Multer memory storage for ZIP files up to 100MB
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB max
  fileFilter: (_req, file, cb) => {
    if (
      file.mimetype === 'application/zip' ||
      file.mimetype === 'application/x-zip-compressed' ||
      file.originalname.toLowerCase().endsWith('.zip')
    ) {
      cb(null, true);
    } else {
      cb(new Error('Only ZIP files (.zip) are supported.'));
    }
  },
});

function getGitHubCredentials() {
  return {
    clientId: process.env.GITHUB_CLIENT_ID?.trim() || '',
    clientSecret: process.env.GITHUB_CLIENT_SECRET?.trim() || '',
  };
}

/**
 * Helper to get GitHub token from request
 * Supports:
 * 1. Authorization: Bearer <token>
 * 2. github_token cookie
 */
function extractToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7).trim();
  }
  if (req.cookies && req.cookies.github_token) {
    return req.cookies.github_token;
  }
  return null;
}

/**
 * Helper to construct redirect URI based on host or APP_URL
 */
function getRedirectUri(req: Request): string {
  const configuredUrl = process.env.APP_URL?.trim().replace(/\/+$/, '');
  if (configuredUrl) {
    return `${configuredUrl}/auth/callback`;
  }

  const host = req.get('host');
  if (!host) {
    return 'http://localhost:3000/auth/callback';
  }

  const protocol = req.get('x-forwarded-proto') || (req.secure ? 'https' : 'http');
  return `${protocol}://${host}/auth/callback`;
}

// ==========================================
// 1. GITHUB OAUTH & AUTHENTICATION ROUTES
// ==========================================

/**
 * Get OAuth Authorization URL
 */
app.get('/api/auth/url', (req: Request, res: Response) => {
  const { clientId } = getGitHubCredentials();
  if (!clientId) {
    return res.status(400).json({
      error: 'GITHUB_CLIENT_ID is not configured in environment variables.',
      configured: false,
    });
  }

  const redirectUri = getRedirectUri(req);
  const state = crypto.randomUUID();
  res.cookie('github_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 10 * 60 * 1000,
  });

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: 'repo,user',
    state,
  });

  const authUrl = `https://github.com/login/oauth/authorize?${params.toString()}`;
  res.json({
    url: authUrl,
    redirectUri,
    configured: true,
  });
});

/**
 * OAuth Callback Handler
 */
app.get(['/auth/callback', '/auth/callback/'], async (req: Request, res: Response) => {
  const code = req.query.code as string;
  const state = req.query.state as string;
  const expectedState = req.cookies?.github_oauth_state;
  const { clientId, clientSecret } = getGitHubCredentials();
  const redirectUri = getRedirectUri(req);

  res.clearCookie('github_oauth_state', {
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    httpOnly: true,
  });

  if (!code || !state || !expectedState || state !== expectedState) {
    return res.status(400).send(`
      <html>
        <body style="background:#090d16;color:#f87171;font-family:monospace;padding:24px;">
          <h3>Authentication Error</h3>
          <p>No authorization code received from GitHub.</p>
          <script>setTimeout(() => window.close(), 3000);</script>
        </body>
      </html>
    `);
  }

  if (!clientId || !clientSecret) {
    return res.status(500).send(`
      <html>
        <body style="background:#090d16;color:#f87171;font-family:monospace;padding:24px;">
          <h3>Server Configuration Error</h3>
          <p>GITHUB_CLIENT_ID or GITHUB_CLIENT_SECRET not configured.</p>
        </body>
      </html>
    `);
  }

  try {
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
      }),
    });

    const tokenData = await tokenRes.json();

    if (tokenData.error || !tokenData.access_token) {
      throw new Error(tokenData.error_description || tokenData.error || 'Failed to exchange token');
    }

    const accessToken = tokenData.access_token;

    // Set secure cookie for iframe compatibility
    res.cookie('github_token', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    });

    // Notify the originating window and close the popup
    res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>GitHub Authorized</title>
          <style>
            body {
              background: #080b11;
              color: #10b981;
              font-family: 'JetBrains Mono', monospace, sans-serif;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              height: 100vh;
              margin: 0;
              text-align: center;
            }
            .spinner {
              width: 36px;
              height: 36px;
              border: 3px solid rgba(16, 185, 129, 0.2);
              border-top-color: #10b981;
              border-radius: 50%;
              animation: spin 0.8s linear infinite;
              margin-bottom: 16px;
            }
            @keyframes spin { to { transform: rotate(360deg); } }
          </style>
        </head>
        <body>
          <div class="spinner"></div>
          <h2 style="margin:0 0 8px 0;">Authentication Successful</h2>
          <p style="color:#94a3b8;font-size:14px;margin:0;">Returning credentials to GitDrop...</p>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS' }, window.location.origin);
              setTimeout(() => window.close(), 400);
            } else {
              window.location.href = '/';
            }
          </script>
        </body>
      </html>
    `);
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    res.status(500).send(`
      <html>
        <body style="background:#090d16;color:#f87171;font-family:monospace;padding:24px;">
          <h3>OAuth Authorization Failed</h3>
          <p>${escapeHtml(errorMsg)}</p>
          <button onclick="window.close()" style="background:#1e293b;color:white;border:1px solid #475569;padding:8px 16px;cursor:pointer;border-radius:4px;">Close</button>
        </body>
      </html>
    `);
  }
});

/**
 * Set Personal Access Token or manual token
 */
app.post('/api/auth/token', async (req: Request, res: Response) => {
  const { token } = req.body;
  if (!token || typeof token !== 'string') {
    return res.status(400).json({ error: 'Token is required' });
  }

  const cleanToken = token.trim();
  try {
    const user = await getAuthenticatedUser(cleanToken);

    res.cookie('github_token', cleanToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });

    res.json({
      success: true,
      user,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Invalid GitHub token';
    res.status(401).json({ error: errorMsg });
  }
});

/**
 * Check authentication status and current user
 */
app.get('/api/auth/status', async (req: Request, res: Response) => {
  const token = extractToken(req);
  const { clientId, clientSecret } = getGitHubCredentials();
  const oauthConfigured = Boolean(clientId && clientSecret);

  if (!token) {
    return res.json({
      authenticated: false,
      oauthConfigured,
      appUrl: process.env.APP_URL || '',
      redirectUri: getRedirectUri(req),
    });
  }

  try {
    const user = await getAuthenticatedUser(token);
    return res.json({
      authenticated: true,
      user,
      oauthConfigured,
      appUrl: process.env.APP_URL || '',
      redirectUri: getRedirectUri(req),
    });
  } catch {
    // If token invalid, clear cookie
    res.clearCookie('github_token');
    return res.json({
      authenticated: false,
      oauthConfigured,
      appUrl: process.env.APP_URL || '',
      redirectUri: getRedirectUri(req),
    });
  }
});

/**
 * Log out
 */
app.post('/api/auth/logout', (_req: Request, res: Response) => {
  res.clearCookie('github_token', {
    secure: true,
    sameSite: 'none',
    httpOnly: true,
  });
  res.json({ success: true });
});

// ==========================================
// 2. GITHUB RESOURCE ROUTES
// ==========================================

/**
 * Get authenticated user's repositories
 */
app.get('/api/github/repos', async (req: Request, res: Response) => {
  const token = extractToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized: No GitHub token provided' });
  }

  try {
    const repos = await getUserRepos(token);
    res.json({ repos });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to fetch repositories';
    res.status(500).json({ error: msg });
  }
});

// ==========================================
// 3. ZIP UPLOAD & DEPLOYMENT ROUTE (NDJSON STREAM)
// ==========================================

/**
 * Generate starter sample ZIP for quick user testing
 */
app.get('/api/sample-zip', (_req: Request, res: Response) => {
  try {
    const zip = new AdmZip();
    
    const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>GitDrop Demo App</title>
  <style>
    body {
      background: #080d16;
      color: #10b981;
      font-family: 'Courier New', monospace;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100vh;
      margin: 0;
    }
    .box {
      border: 1px solid rgba(16, 185, 129, 0.4);
      padding: 30px;
      border-radius: 12px;
      background: #0d1527;
      text-align: center;
      box-shadow: 0 0 30px rgba(16, 185, 129, 0.2);
    }
    h1 { color: #34d399; margin: 0 0 10px 0; }
    p { color: #94a3b8; font-size: 14px; }
  </style>
</head>
<body>
  <div class="box">
    <h1>🚀 GitDrop Deployment Verified!</h1>
    <p>This project was uploaded as a ZIP and pushed directly via GitHub Git Database API.</p>
    <p>Timestamp: ${new Date().toISOString()}</p>
  </div>
</body>
</html>`;

    const readme = `# GitDrop Sample Project

This repository was automatically provisioned and deployed via **GitDrop** (ZIP to GitHub Deployer).

## Structure
- \`index.html\`: Sample interactive single-page app
- \`README.md\`: Project documentation
- \`app.js\`: Sample script

Deployed at: ${new Date().toISOString()}
`;

    const js = `console.log("GitDrop application loaded successfully!");\n`;

    zip.addFile('index.html', Buffer.from(html, 'utf-8'));
    zip.addFile('README.md', Buffer.from(readme, 'utf-8'));
    zip.addFile('app.js', Buffer.from(js, 'utf-8'));

    const zipBuffer = zip.toBuffer();
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="gitdrop-starter-sample.zip"');
    res.send(zipBuffer);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to generate sample zip';
    res.status(500).json({ error: msg });
  }
});

/**
 * Upload ZIP and deploy to GitHub with real-time NDJSON event streaming
 */
app.post('/api/deploy', upload.single('zipFile'), async (req: Request, res: Response) => {
  const token = extractToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Please authenticate with GitHub first.' });
  }

  if (!req.file || !req.file.buffer) {
    return res.status(400).json({ error: 'No ZIP file uploaded.' });
  }

  const {
    repoName,
    description = '',
    isPrivate = 'false',
    commitMessage = '',
    targetBranch = 'main',
    smartMerge = 'true',
    forcePush = 'true',
  } = req.body;

  if (!repoName || typeof repoName !== 'string' || !repoName.trim()) {
    return res.status(400).json({ error: 'Repository name is required.' });
  }

  const cleanRepoName = repoName.trim().replace(/\s+/g, '-');
  const privateRepo = isPrivate === 'true' || isPrivate === true;
  const useSmartMerge = smartMerge === 'true' || smartMerge === true;
  const useForcePush = forcePush !== 'false' && forcePush !== false;

  // Set headers for newline-delimited JSON stream
  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
  res.setHeader('Transfer-Encoding', 'chunked');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');

  const sendEvent = (eventData: Record<string, unknown>) => {
    try {
      res.write(JSON.stringify({ timestamp: new Date().toISOString(), ...eventData }) + '\n');
    } catch {
      // client disconnected
    }
  };

  try {
    sendEvent({
      step: 'validating',
      message: `Received upload "${req.file.originalname}" (${(req.file.size / 1024).toFixed(1)} KB)`,
      percent: 3,
    });

    const result = await deployZipToGitHub({
      token,
      repoName: cleanRepoName,
      description: description.trim(),
      isPrivate: privateRepo,
      commitMessage: commitMessage.trim(),
      targetBranch: targetBranch.trim() || 'main',
      smartMerge: useSmartMerge,
      forcePush: useForcePush,
      zipBuffer: req.file.buffer,
      onProgress: (event) => {
        sendEvent(event);
      },
    });

    sendEvent({
      step: 'complete',
      message: 'Deployment complete!',
      percent: 100,
      data: result,
    });

    res.end();
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    sendEvent({
      step: 'error',
      message: `Error: ${errorMsg}`,
      percent: 100,
      data: { error: errorMsg },
    });
    res.end();
  }
});

// ==========================================
// 4. VITE DEV SERVER OR STATIC PROD SERVING
// ==========================================

async function startServer() {
  const isProduction = process.env.NODE_ENV === 'production';

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Serve static files from dist
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  if (!process.env.VERCEL) {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`GitDrop server running at http://0.0.0.0:${PORT}`);
      if (process.env.APP_URL) {
        console.log(`🔗 Public App URL: ${process.env.APP_URL}`);
      }
    });
  }
}

if (!process.env.VERCEL) {
  startServer().catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}

export default app;
