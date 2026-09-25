# GitDrop — ZIP to GitHub Deployer

GitDrop is a standalone developer tool for uploading a project ZIP archive to GitHub. It can create a repository or update an existing repository while streaming deployment progress to the browser.

## Features

- GitHub OAuth authentication or Personal Access Token authentication
- Create new repositories or update existing repositories
- ZIP archive extraction with path and size validation
- Real-time deployment progress
- Public or private repository support
- Vite + React frontend with an Express backend

## Requirements

- Node.js 20+
- A GitHub account
- Optional: a GitHub OAuth App for the OAuth login flow

## Configuration

Copy `.env.example` to `.env` and provide the required values:

```bash
cp .env.example .env
```

For OAuth, configure:

- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`
- `APP_URL`

Never commit `.env` or any credentials to source control.

## Development

```bash
npm install
npm run dev
```

The development server runs on `http://localhost:3000` by default.

## Production

```bash
npm run build
NODE_ENV=production npm start
```

For OAuth, configure the GitHub OAuth callback as:

```text
https://your-domain.example/auth/callback
```

Set `APP_URL` to the same public origin.

## Security notes

- GitHub credentials are server-side environment variables only.
- GitHub access tokens are stored in an HTTP-only cookie and are not returned to the browser as JSON.
- ZIP uploads are limited to 100 MB.
- `.env` files should remain outside version control.
