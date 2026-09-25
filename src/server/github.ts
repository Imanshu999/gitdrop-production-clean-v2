import AdmZip from 'adm-zip';

export interface GitHubApiOptions {
  token: string;
}

export interface DeployOptions {
  token: string;
  repoName: string;
  description?: string;
  isPrivate: boolean;
  commitMessage?: string;
  targetBranch?: string;
  smartMerge?: boolean;
  forcePush?: boolean;
  zipBuffer: Buffer;
  onProgress: (event: {
    step: string;
    message: string;
    percent: number;
    detail?: string;
    data?: Record<string, unknown>;
  }) => void;
}

export interface ZipExtractedFile {
  path: string;
  contentBase64: string;
  mode: string;
  size: number;
}

const GITHUB_API_BASE = 'https://api.github.com';

interface FetchWithRetryOptions extends RequestInit {
  retries?: number;
  backoffMs?: number;
  timeoutMs?: number;
}

/**
 * Robust fetch wrapper for GitHub API with automatic retry, exponential backoff,
 * rate limit detection, and request timeouts.
 */
export async function githubFetch(
  endpoint: string,
  token: string,
  options: FetchWithRetryOptions = {}
): Promise<Response> {
  const url = endpoint.startsWith('http') ? endpoint : `${GITHUB_API_BASE}${endpoint}`;
  const maxRetries = options.retries ?? 3;
  const initialBackoff = options.backoffMs ?? 500;
  const timeoutMs = options.timeoutMs ?? 35000;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const headers: Record<string, string> = {
      Accept: 'application/vnd.github.v3+json',
      Authorization: `Bearer ${token}`,
      'User-Agent': 'GitDrop-Deployer-App',
      'X-GitHub-Api-Version': '2022-11-28',
      ...((options.headers as Record<string, string>) || {}),
    };

    try {
      const response = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Transient server error (500, 502, 503, 504) or rate limit (429)
      if (
        (response.status >= 500 || response.status === 429) &&
        attempt < maxRetries
      ) {
        const retryAfter = response.headers.get('retry-after');
        const waitTime = retryAfter
          ? parseInt(retryAfter, 10) * 1000
          : initialBackoff * Math.pow(2, attempt) + Math.random() * 200;
        await new Promise((r) => setTimeout(r, waitTime));
        continue;
      }

      return response;
    } catch (err: unknown) {
      clearTimeout(timeoutId);
      const isAbort = err instanceof Error && err.name === 'AbortError';
      const msg = isAbort
        ? `Request timed out after ${timeoutMs}ms`
        : (err instanceof Error ? err.message : String(err));
      
      lastError = new Error(`GitHub API Network Error [${endpoint}]: ${msg}`);

      if (attempt < maxRetries) {
        const delay = initialBackoff * Math.pow(2, attempt) + Math.random() * 250;
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  throw lastError || new Error(`GitHub API request failed after ${maxRetries} retries`);
}

/**
 * Get authenticated user profile
 */
export async function getAuthenticatedUser(token: string) {
  const res = await githubFetch('/user', token);
  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new Error(
      errorBody.message || `GitHub Auth Failed with status ${res.status}. Check your token.`
    );
  }
  return res.json();
}

/**
 * Get authenticated user's repositories
 */
export async function getUserRepos(token: string, page = 1, perPage = 50) {
  const res = await githubFetch(
    `/user/repos?sort=updated&direction=desc&per_page=${perPage}&page=${page}&affiliation=owner`,
    token
  );
  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new Error(errorBody.message || `Failed to fetch repositories (${res.status})`);
  }
  return res.json();
}

/**
 * Check if a repo exists for this owner
 */
export async function getRepoInfo(token: string, owner: string, repo: string) {
  const res = await githubFetch(`/repos/${owner}/${repo}`, token);
  if (res.status === 404) {
    return null;
  }
  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new Error(errorBody.message || `Failed to check repo existence (${res.status})`);
  }
  return res.json();
}

/**
 * Create a new repository for the authenticated user
 */
export async function createRepo(
  token: string,
  name: string,
  description = '',
  isPrivate = false
) {
  const res = await githubFetch('/user/repos', token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      description,
      private: isPrivate,
      auto_init: true, // Seeds repository so default branch exists
      has_issues: true,
      has_projects: true,
      has_wiki: true,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Failed to create repository (${res.status})`);
  }

  return res.json();
}

/**
 * Extract and parse all files from the uploaded ZIP with full error tolerance.
 */
export function extractFilesFromZip(
  zipBuffer: Buffer,
  onWarn?: (msg: string) => void
): ZipExtractedFile[] {
  let zip: AdmZip;
  try {
    zip = new AdmZip(zipBuffer);
  } catch (err: unknown) {
    throw new Error(`Corrupted or invalid ZIP file: ${err instanceof Error ? err.message : String(err)}`);
  }

  const zipEntries = zip.getEntries();
  if (!zipEntries || zipEntries.length === 0) {
    throw new Error('The uploaded ZIP archive contains no files.');
  }

  // Filter out system and metadata files
  const validEntries = zipEntries.filter((entry) => {
    if (entry.isDirectory) return false;
    const name = entry.entryName;
    if (!name || name.trim() === '') return false;
    if (name.includes('__MACOSX/') || name.startsWith('__MACOSX')) return false;
    if (name.endsWith('.DS_Store') || name.endsWith('Thumbs.db')) return false;
    if (name.startsWith('.git/') || name.includes('/.git/') || name === '.git') return false;
    if (name.includes('.gitmodules')) return false;
    return true;
  });

  if (validEntries.length === 0) {
    throw new Error('The uploaded ZIP file does not contain any valid project files.');
  }

  // Detect common root folder
  let commonPrefix = '';
  const firstPath = validEntries[0].entryName.replace(/\\/g, '/');
  const slashIdx = firstPath.indexOf('/');
  if (slashIdx !== -1) {
    const candidate = firstPath.substring(0, slashIdx + 1);
    const allShare = validEntries.every((e) =>
      e.entryName.replace(/\\/g, '/').startsWith(candidate)
    );
    if (allShare) {
      commonPrefix = candidate;
    }
  }

  const extracted: ZipExtractedFile[] = [];

  for (const entry of validEntries) {
    try {
      let cleanPath = entry.entryName.replace(/\\/g, '/');
      if (commonPrefix && cleanPath.startsWith(commonPrefix)) {
        cleanPath = cleanPath.slice(commonPrefix.length);
      }
      
      cleanPath = cleanPath
        .replace(/^\/+/, '')
        .replace(/\/+/g, '/')
        .replace(/\/\.\//g, '/')
        .trim();

      if (
        !cleanPath ||
        cleanPath === '.' ||
        cleanPath === '..' ||
        cleanPath.startsWith('../') ||
        cleanPath.includes('/../')
      ) {
        continue;
      }

      if (cleanPath.length > 350) {
        onWarn?.(`Skipped path exceeding 350 characters: ${cleanPath.slice(0, 50)}...`);
        continue;
      }

      const data = entry.getData();
      if (!data) {
        onWarn?.(`Skipped unreadable entry: ${cleanPath}`);
        continue;
      }

      // Max 100MB per file
      if (data.length > 100 * 1024 * 1024) {
        onWarn?.(`Skipped file "${cleanPath}" exceeding 100MB limit (${(data.length / (1024 * 1024)).toFixed(1)} MB)`);
        continue;
      }

      const contentBase64 = data.toString('base64');
      const isExecutable =
        cleanPath.endsWith('.sh') ||
        cleanPath.endsWith('.bin') ||
        Boolean((entry.attr >>> 16) & 0o111);

      extracted.push({
        path: cleanPath,
        contentBase64,
        mode: isExecutable ? '100755' : '100644',
        size: data.length,
      });
    } catch (entryErr: unknown) {
      const msg = entryErr instanceof Error ? entryErr.message : String(entryErr);
      onWarn?.(`Skipped damaged entry "${entry.entryName}": ${msg}`);
    }
  }

  if (extracted.length === 0) {
    throw new Error('No valid extractable files could be processed from the ZIP archive.');
  }

  return extracted;
}

/**
 * Fetch a map of all existing file paths and their SHAs in the repository.
 * Uses recursive tree query if available, or returns empty map if repository is new/empty.
 */
async function getExistingFileShas(
  token: string,
  owner: string,
  repo: string,
  branch: string
): Promise<Map<string, string>> {
  const shaMap = new Map<string, string>();
  try {
    const treeRes = await githubFetch(
      `/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`,
      token,
      { retries: 1 }
    );

    if (treeRes.ok) {
      const data = await treeRes.json();
      if (Array.isArray(data.tree)) {
        for (const item of data.tree) {
          if (item.type === 'blob' && item.path && item.sha) {
            shaMap.set(item.path, item.sha);
          }
        }
      }
    }
  } catch {
    // If branch doesn't exist or repo is empty, return empty map
  }
  return shaMap;
}

/**
 * Upload or update a single file via the GitHub Contents API:
 * PUT /repos/{owner}/{repo}/contents/{path}
 * Handles SHA detection, missing files, and race-condition retries automatically.
 */
async function uploadOrUpdateFileViaContentsApi(
  token: string,
  owner: string,
  repo: string,
  branch: string,
  file: ZipExtractedFile,
  existingSha: string | undefined,
  commitMsg: string
): Promise<string> {
  const encodedPath = file.path.split('/').map(encodeURIComponent).join('/');
  const endpoint = `/repos/${owner}/${repo}/contents/${encodedPath}`;

  let currentSha = existingSha;
  let lastErr: Error | null = null;

  for (let attempt = 0; attempt < 3; attempt++) {
    const body: Record<string, unknown> = {
      message: `${commitMsg}: ${file.path}`,
      content: file.contentBase64,
      branch: branch,
    };

    if (currentSha) {
      body.sha = currentSha;
    }

    const res = await githubFetch(endpoint, token, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      retries: 1,
    });

    if (res.ok) {
      const resData = await res.json();
      return resData.content?.sha || resData.commit?.sha || 'ok';
    }

    // If 409 Conflict (e.g. SHA mismatch or branch lock), query the live file SHA and retry
    if (res.status === 409 || res.status === 422) {
      await new Promise((r) => setTimeout(r, 300 + attempt * 200 + Math.random() * 150));
      try {
        const getRes = await githubFetch(`${endpoint}?ref=${branch}`, token, { retries: 1 });
        if (getRes.ok) {
          const getData = await getRes.json();
          if (getData && getData.sha) {
            currentSha = getData.sha;
            continue;
          }
        } else if (getRes.status === 404) {
          // File does not exist yet, clear sha
          currentSha = undefined;
          continue;
        }
      } catch {
        // continue retry loop
      }
    }

    const errData = await res.json().catch(() => ({}));
    lastErr = new Error(errData.message || res.statusText);
    await new Promise((r) => setTimeout(r, 400));
  }

  throw lastErr || new Error(`Failed to upload ${file.path}`);
}

/**
 * Foolproof Deploy Engine using GitHub REST Contents API:
 * - Directly creates or updates files via PUT /contents/{path}
 * - Automatically handles missing files, empty repositories, and existing projects
 * - No complex Git trees, no blobs, and no base-tree 'Not Found' conflicts
 * - Updates live terminal output for every single file deployed
 */
export async function deployZipToGitHub(options: DeployOptions) {
  const {
    token,
    repoName,
    description = '',
    isPrivate,
    commitMessage,
    targetBranch = 'main',
    zipBuffer,
    onProgress,
  } = options;

  onProgress({
    step: 'validating',
    message: 'Validating GitHub credentials and token permissions...',
    percent: 5,
  });

  // 1. Get authenticated user
  const user = await getAuthenticatedUser(token);
  const owner = user.login;

  onProgress({
    step: 'extracting',
    message: 'Extracting and preparing project archive files...',
    percent: 12,
  });

  // 2. Extract files
  const files = extractFilesFromZip(zipBuffer, (warnMsg) => {
    onProgress({
      step: 'extracting',
      message: `Warning: ${warnMsg}`,
      percent: 15,
    });
  });

  const totalBytes = files.reduce((acc, f) => acc + f.size, 0);

  onProgress({
    step: 'extracting',
    message: `Extracted ${files.length} project files (${(totalBytes / 1024).toFixed(1)} KB)`,
    percent: 18,
    data: { filesCount: files.length, totalBytes },
  });

  // 3. Check or create repository
  onProgress({
    step: 'checking_repo',
    message: `Connecting to repository "${owner}/${repoName}"...`,
    percent: 22,
  });

  let repoInfo = await getRepoInfo(token, owner, repoName);
  let isNewRepo = false;

  if (!repoInfo) {
    isNewRepo = true;
    onProgress({
      step: 'creating_repo',
      message: `Creating repository "${repoName}" (${isPrivate ? 'private' : 'public'})...`,
      percent: 26,
    });

    repoInfo = await createRepo(token, repoName, description, isPrivate);

    onProgress({
      step: 'creating_repo',
      message: `Repository "${owner}/${repoName}" ready!`,
      percent: 30,
      data: { isNewRepo: true, repoUrl: repoInfo.html_url },
    });

    await new Promise((r) => setTimeout(r, 1000));
  } else {
    onProgress({
      step: 'checking_repo',
      message: `Repository "${owner}/${repoName}" found. Starting Contents API deploy pipeline...`,
      percent: 28,
      data: { isNewRepo: false, repoUrl: repoInfo.html_url },
    });
  }

  const branch = targetBranch || repoInfo.default_branch || 'main';

  // 4. Fetch existing file SHA map if repository already has files
  onProgress({
    step: 'checking_repo',
    message: `Syncing existing file indexes for branch "${branch}"...`,
    percent: 32,
  });

  const existingFileShas = await getExistingFileShas(token, owner, repoName, branch);
  onProgress({
    step: 'checking_repo',
    message: existingFileShas.size > 0
      ? `Detected ${existingFileShas.size} existing files. Smart overwriting modified files...`
      : 'Initial branch state detected. Creating files cleanly...',
    percent: 35,
  });

  // 5. Deploy files using GitHub Contents API with controlled worker concurrency
  onProgress({
    step: 'uploading_files',
    message: `Deploying ${files.length} project files via GitHub Contents API...`,
    percent: 36,
    data: { totalBlobs: files.length, uploadedBlobs: 0 },
  });

  const baseCommitMsg = commitMessage?.trim() || (isNewRepo ? 'Initial deploy' : 'Update project files');
  let completedCount = 0;
  let skippedCount = 0;
  let fileIndex = 0;
  const concurrency = 2; // 2 concurrent workers prevent GitHub ref lock contention

  async function worker() {
    while (fileIndex < files.length) {
      const idx = fileIndex++;
      const file = files[idx];
      const existingSha = existingFileShas.get(file.path);

      try {
        await uploadOrUpdateFileViaContentsApi(
          token,
          owner,
          repoName,
          branch,
          file,
          existingSha,
          baseCommitMsg
        );

        completedCount++;
        const currentPercent = Math.min(98, Math.round(36 + (completedCount / files.length) * 60));

        onProgress({
          step: 'uploading_files',
          message: `[${completedCount}/${files.length}] Pushed: ${file.path}`,
          percent: currentPercent,
          data: {
            uploadedBlobs: completedCount,
            totalBlobs: files.length,
            currentFile: file.path,
          },
        });
      } catch (err: unknown) {
        skippedCount++;
        const errMsg = err instanceof Error ? err.message : String(err);
        onProgress({
          step: 'uploading_files',
          message: `Warning: Skipped "${file.path}" (${errMsg})`,
          percent: Math.min(98, Math.round(36 + (completedCount / files.length) * 60)),
        });
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, files.length) }, () => worker());
  await Promise.all(workers);

  if (completedCount === 0) {
    throw new Error('All project files failed to upload via GitHub Contents API. Please check token permissions.');
  }

  // 6. Ensure default branch is set if different
  if (repoInfo.default_branch && repoInfo.default_branch !== branch) {
    await githubFetch(`/repos/${owner}/${repoName}`, token, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ default_branch: branch }),
    }).catch(() => {});
  }

  const repoHtmlUrl = repoInfo.html_url || `https://github.com/${owner}/${repoName}`;
  const branchHtmlUrl = `${repoHtmlUrl}/tree/${branch}`;

  onProgress({
    step: 'complete',
    message: isNewRepo
      ? `🚀 All ${completedCount} files deployed successfully to new repository!`
      : `🚀 All ${completedCount} files deployed and synchronized directly to GitHub!`,
    percent: 100,
    data: {
      repoUrl: repoHtmlUrl,
      commitUrl: branchHtmlUrl,
      isNewRepo,
      branch,
      filesCount: completedCount,
      skippedCount,
      totalBytes,
    },
  });

  return {
    repoUrl: repoHtmlUrl,
    commitUrl: branchHtmlUrl,
    isNewRepo,
    branch,
    filesCount: completedCount,
    skippedCount,
    totalBytes,
  };
}
