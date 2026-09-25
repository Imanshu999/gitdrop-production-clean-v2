export interface GitHubUser {
  login: string;
  id: number;
  name: string | null;
  avatar_url: string;
  html_url: string;
  bio: string | null;
  public_repos: number;
  total_private_repos?: number;
  followers: number;
  following: number;
  created_at: string;
}

export interface GitHubRepoSummary {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  private: boolean;
  html_url: string;
  default_branch: string;
  updated_at: string;
  stargazers_count: number;
  fork: boolean;
}

export type DeployStep =
  | 'idle'
  | 'validating'
  | 'extracting'
  | 'checking_repo'
  | 'creating_repo'
  | 'uploading_blobs'
  | 'uploading_files'
  | 'creating_tree'
  | 'creating_commit'
  | 'updating_ref'
  | 'complete'
  | 'error';

export interface DeployProgressEvent {
  step: DeployStep;
  message: string;
  percent: number;
  detail?: string;
  data?: {
    filesCount?: number;
    uploadedBlobs?: number;
    totalBlobs?: number;
    currentFile?: string;
    repoUrl?: string;
    commitSha?: string;
    commitUrl?: string;
    isNewRepo?: boolean;
    branch?: string;
    error?: string;
  };
}

export interface AuthStatus {
  authenticated: boolean;
  user?: GitHubUser;
  oauthConfigured: boolean;
  tokenType?: 'oauth' | 'pat';
  clientIdPrefix?: string;
}
