/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Header } from './components/Header.tsx';
import { AuthModal } from './components/AuthModal.tsx';
import { OAuthGuideModal } from './components/OAuthGuideModal.tsx';
import { ProjectForm } from './components/ProjectForm.tsx';
import { TerminalOutput } from './components/TerminalOutput.tsx';
import { GitHubUser, GitHubRepoSummary } from './types/index.ts';
import { 
  Github, 
  Terminal, 
  FolderGit2, 
  Cpu, 
  GitMerge, 
  Layers, 
  Sparkles, 
  ShieldCheck, 
  FileCode2, 
  Download, 
  ArrowRight,
  GitBranch,
  CheckCircle2,
  Lock
} from 'lucide-react';

export default function App() {
  const [user, setUser] = useState<GitHubUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [oauthConfigured, setOauthConfigured] = useState(false);
  const [appUrl, setAppUrl] = useState('');
  const [redirectUri, setRedirectUri] = useState('');

  // Repositories for authenticated user
  const [repos, setRepos] = useState<GitHubRepoSummary[]>([]);
  const [loadingRepos, setLoadingRepos] = useState(false);

  // Modals
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isOAuthGuideOpen, setIsOAuthGuideOpen] = useState(false);

  // Deployment state
  const [isDeploying, setIsDeploying] = useState(false);
  const [progressPercent, setProgressPercent] = useState(0);
  const [currentStep, setCurrentStep] = useState('idle');
  const [logs, setLogs] = useState<Array<{
    timestamp: string;
    step: string;
    message: string;
    percent: number;
    data?: any;
  }>>([]);
  const [resultData, setResultData] = useState<any | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  /**
   * Fetch current authentication status from backend
   */
  const fetchAuthStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/status');
      const data = await res.json();
      if (data.authenticated && data.user) {
        setUser(data.user);
      } else {
        setUser(null);
      }
      setOauthConfigured(Boolean(data.oauthConfigured));
      if (data.appUrl) setAppUrl(data.appUrl);
      if (data.redirectUri) setRedirectUri(data.redirectUri);
    } catch (err) {
      console.error('Failed to fetch auth status:', err);
    } finally {
      setAuthLoading(false);
    }
  }, []);

  /**
   * Fetch user's repositories
   */
  const fetchUserRepos = useCallback(async () => {
    if (!user) return;
    setLoadingRepos(true);
    try {
      const res = await fetch('/api/github/repos');
      if (res.ok) {
        const data = await res.json();
        setRepos(data.repos || []);
      }
    } catch (err) {
      console.error('Failed to fetch repos:', err);
    } finally {
      setLoadingRepos(false);
    }
  }, [user]);

  useEffect(() => {
    fetchAuthStatus();
  }, [fetchAuthStatus]);

  useEffect(() => {
    if (user) {
      fetchUserRepos();
    } else {
      setRepos([]);
    }
  }, [user, fetchUserRepos]);

  /**
   * Listen for the OAuth popup completion message.
   */
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const expectedOrigin = window.location.origin;
      if (event.origin !== expectedOrigin) {
        return;
      }
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        fetchAuthStatus();
        setIsAuthModalOpen(false);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [fetchAuthStatus]);

  /**
   * Handle user logout
   */
  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      setUser(null);
      setRepos([]);
      resetDeployment();
    } catch (err) {
      console.error('Failed to logout:', err);
    }
  };

  /**
   * Reset deployment state
   */
  const resetDeployment = () => {
    setLogs([]);
    setProgressPercent(0);
    setCurrentStep('idle');
    setResultData(null);
    setErrorMessage(null);
    setIsDeploying(false);
  };

  /**
   * Deploy ZIP via Streaming NDJSON endpoint
   */
  const handleDeploy = async (formData: FormData) => {
    setIsDeploying(true);
    setLogs([]);
    setProgressPercent(2);
    setCurrentStep('initializing');
    setResultData(null);
    setErrorMessage(null);

    const initialLog = {
      timestamp: new Date().toISOString(),
      step: 'init',
      message: 'Initializing GitDrop deployment pipeline...',
      percent: 2,
    };
    setLogs([initialLog]);

    try {
      const response = await fetch('/api/deploy', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok && !response.body) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Upload failed with status ${response.status}`);
      }

      if (!response.body) {
        throw new Error('Server did not return a response stream.');
      }

      // Read chunked NDJSON stream
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // keep trailing incomplete chunk

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line);
            setLogs((prev) => [...prev, event]);

            if (typeof event.percent === 'number') {
              setProgressPercent(event.percent);
            }
            if (event.step) {
              setCurrentStep(event.step);
            }
            if (event.step === 'complete' && event.data) {
              setResultData(event.data);
              // Refresh user repositories
              fetchUserRepos();
            }
            if (event.step === 'error') {
              setErrorMessage(event.message || 'Deployment error');
            }
          } catch {
            // ignore non-json line
          }
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Deployment failed';
      setErrorMessage(msg);
      setLogs((prev) => [
        ...prev,
        {
          timestamp: new Date().toISOString(),
          step: 'error',
          message: `Fatal pipeline exception: ${msg}`,
          percent: 100,
        },
      ]);
    } finally {
      setIsDeploying(false);
    }
  };

  /**
   * Helper to download a sample starter project ZIP from backend
   */
  const handleDownloadSampleZip = () => {
    const a = document.createElement('a');
    a.href = '/api/sample-zip';
    a.download = 'gitdrop-starter-sample.zip';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#07090e] text-slate-100 cyber-grid relative overflow-x-hidden">
      {/* Decorative ambient glowing backdrops */}
      <div className="fixed top-[-10%] left-[-10%] w-[500px] h-[500px] rounded-full bg-emerald-600/10 blur-[130px] pointer-events-none" />
      <div className="fixed bottom-[-10%] right-[-10%] w-[500px] h-[500px] rounded-full bg-cyan-600/10 blur-[130px] pointer-events-none" />

      {/* Top Navbar */}
      <Header
        user={user}
        onLogout={handleLogout}
        onOpenOAuthGuide={() => setIsOAuthGuideOpen(true)}
        onOpenAuthModal={() => setIsAuthModalOpen(true)}
        oauthConfigured={oauthConfigured}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 z-10">
        {!user ? (
          /* ========================================= */
          /* HERO VIEW (UNAUTHENTICATED)               */
          /* ========================================= */
          <div className="space-y-12 py-6 sm:py-12">
            {/* Hero Banner */}
            <div className="text-center max-w-3xl mx-auto space-y-6">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-mono shadow-[0_0_15px_rgba(16,185,129,0.2)]">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Next-Gen ZIP &rarr; GitHub Git Database Deployment</span>
              </div>

              <h1 className="text-3xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-white font-mono leading-tight">
                Turn any <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-300">ZIP File</span> into a live GitHub Repo.
              </h1>

              <p className="text-base sm:text-lg text-slate-400 leading-relaxed font-sans max-w-2xl mx-auto">
                No local git config or command-line friction required. Upload your archive, connect via GitHub OAuth or Access Token, and deploy or smart-merge your codebase in seconds.
              </p>

              {/* Call to action */}
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
                <button
                  onClick={() => setIsAuthModalOpen(true)}
                  className="w-full sm:w-auto px-8 py-4 rounded-xl font-mono text-sm font-bold bg-emerald-500 hover:bg-emerald-400 text-slate-950 flex items-center justify-center gap-2.5 shadow-[0_0_30px_rgba(16,185,129,0.4)] transition-all cursor-pointer transform hover:scale-[1.02] active:scale-[0.98]"
                >
                  <Github className="w-5 h-5" />
                  <span>Connect GitHub to Start</span>
                  <ArrowRight className="w-4 h-4" />
                </button>

                <button
                  onClick={() => setIsOAuthGuideOpen(true)}
                  className="w-full sm:w-auto px-6 py-4 rounded-xl font-mono text-sm text-slate-300 hover:text-emerald-300 bg-slate-900/60 hover:bg-slate-800/80 border border-slate-800 hover:border-emerald-500/30 transition-all flex items-center justify-center gap-2"
                >
                  <Cpu className="w-4 h-4 text-emerald-400" />
                  <span>OAuth Setup Instructions</span>
                </button>
              </div>

              {!oauthConfigured && (
                <p className="text-xs font-mono text-slate-500">
                  Tip: You can login instantly with a <button onClick={() => setIsAuthModalOpen(true)} className="text-emerald-400 underline underline-offset-2">Personal Access Token</button> without needing to set up an OAuth app.
                </p>
              )}
            </div>

            {/* Feature Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-6">
              <div className="glass-panel-glow p-6 rounded-2xl space-y-3 border border-emerald-500/20">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                  <FolderGit2 className="w-5 h-5" />
                </div>
                <h3 className="font-mono text-base font-semibold text-slate-100">
                  Direct Git Data API
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Processes files into native Git Blobs, constructs low-level Git Trees, and links commits directly via GitHub's Git Database API for maximum speed.
                </p>
              </div>

              <div className="glass-panel-glow p-6 rounded-2xl space-y-3 border border-emerald-500/20">
                <div className="w-10 h-10 rounded-xl bg-teal-500/10 border border-teal-500/30 flex items-center justify-center text-teal-400">
                  <GitMerge className="w-5 h-5" />
                </div>
                <h3 className="font-mono text-base font-semibold text-slate-100">
                  Smart Merge Architecture
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Auto-detects whether your repository is new or existing. Seamlessly merges updates on top of the latest commit without destroying untouched files.
                </p>
              </div>

              <div className="glass-panel-glow p-6 rounded-2xl space-y-3 border border-emerald-500/20">
                <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                  <Terminal className="w-5 h-5" />
                </div>
                <h3 className="font-mono text-base font-semibold text-slate-100">
                  Streaming Real-Time Terminal
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Watch live chunked NDJSON terminal outputs as your ZIP is extracted, blobs are hashed, commits are created, and branch refs are pushed.
                </p>
              </div>
            </div>
          </div>
        ) : (
          /* ========================================= */
          /* DASHBOARD VIEW (AUTHENTICATED)            */
          /* ========================================= */
          <div className="space-y-6">
            {/* User Profile Bar */}
            <div className="glass-panel p-4 sm:p-5 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 border border-emerald-500/20">
              <div className="flex items-center gap-4">
                <div className="relative">
                  <img
                    src={user.avatar_url}
                    alt={user.login}
                    className="w-12 h-12 rounded-xl border-2 border-emerald-500/50 shadow-[0_0_15px_rgba(16,185,129,0.3)]"
                  />
                  <span className="absolute -bottom-1 -right-1 w-3.5 h-3.5 bg-emerald-500 border-2 border-[#07090e] rounded-full" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm sm:text-base font-bold text-slate-100 font-mono">
                      {user.name || user.login}
                    </h2>
                    <span className="text-[11px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/30">
                      @{user.login}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {user.bio || 'Connected via GitHub Authorization'}
                  </p>
                </div>
              </div>

              {/* Stats & Quick Actions */}
              <div className="flex items-center gap-4 text-xs font-mono text-slate-400">
                <div className="flex items-center gap-3 bg-slate-900/60 px-3 py-1.5 rounded-lg border border-slate-800">
                  <div>
                    <span className="text-emerald-400 font-bold">{user.public_repos}</span>
                    <span className="text-slate-500 ml-1">public</span>
                  </div>
                  <div className="w-px h-3 bg-slate-800" />
                  <div>
                    <span className="text-teal-400 font-bold">{repos.length}</span>
                    <span className="text-slate-500 ml-1">loaded</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleDownloadSampleZip}
                  className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 transition-colors text-xs font-mono"
                  title="Generate a sample project ZIP to test upload"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Get Sample ZIP</span>
                </button>
              </div>
            </div>

            {/* Main Deployment Interface Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Left Column: Project Upload & Configuration Form (5 cols) */}
              <div className="lg:col-span-6 glass-panel-glow p-5 sm:p-7 rounded-2xl border border-emerald-500/20 space-y-6">
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-4">
                  <div className="flex items-center gap-2 font-mono text-slate-200">
                    <Layers className="w-4 h-4 text-emerald-400" />
                    <span className="font-semibold text-sm">Deployment Package Form</span>
                  </div>
                  <span className="text-[11px] font-mono text-emerald-400/90 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/30">
                    Direct Engine
                  </span>
                </div>

                <ProjectForm
                  user={user}
                  repos={repos}
                  loadingRepos={loadingRepos}
                  onRefreshRepos={fetchUserRepos}
                  onSubmit={handleDeploy}
                  isDeploying={isDeploying}
                />
              </div>

              {/* Right Column: Live Terminal Stream Output (6 cols) */}
              <div className="lg:col-span-6 space-y-4">
                <div className="flex items-center justify-between px-1">
                  <div className="flex items-center gap-2 font-mono text-xs text-slate-300">
                    <Terminal className="w-4 h-4 text-emerald-400" />
                    <span className="font-semibold">Live Deployment Console</span>
                  </div>
                  <span className="text-[11px] font-mono text-slate-500">
                    Stream: NDJSON chunked socket
                  </span>
                </div>

                <TerminalOutput
                  logs={logs}
                  progressPercent={progressPercent}
                  currentStep={currentStep}
                  isDeploying={isDeploying}
                  resultData={resultData}
                  errorMessage={errorMessage}
                  onReset={resetDeployment}
                />

                {/* Architecture Explainer Card */}
                <div className="glass-panel p-4 rounded-xl border border-slate-800 text-xs text-slate-400 space-y-2">
                  <div className="flex items-center gap-2 text-slate-200 font-mono font-medium">
                    <Cpu className="w-3.5 h-3.5 text-emerald-400" />
                    <span>How the Smart Merge System works:</span>
                  </div>
                  <p className="text-[11px] leading-relaxed">
                    1. If the repository doesn't exist under <code className="text-emerald-300 font-mono">{user.login}</code>, it is provisioned via GitHub API.<br />
                    2. If it already exists, GitDrop inspects the target branch tree SHA, creates blobs for your unzipped files, builds an incremental tree referencing the parent, and applies the commit smoothly without a separate database.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900/80 bg-[#06080e]/90 py-6 mt-12 z-10 text-xs text-slate-500 font-mono">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span>GitDrop &bull; ZIP to GitHub Deployment Engine</span>
          </div>
          <div className="flex items-center gap-4 text-slate-400">
            <button
              onClick={() => setIsOAuthGuideOpen(true)}
              className="hover:text-emerald-400 transition-colors"
            >
              OAuth Documentation
            </button>
            <span>&bull;</span>
            <a
              href="https://docs.github.com/en/rest/git"
              target="_blank"
              rel="noreferrer"
              className="hover:text-emerald-400 transition-colors"
            >
              GitHub Git Data API
            </a>
          </div>
        </div>
      </footer>

      {/* Modals */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        onAuthSuccess={() => {
          fetchAuthStatus();
        }}
        oauthConfigured={oauthConfigured}
        redirectUri={redirectUri}
      />

      <OAuthGuideModal
        isOpen={isOAuthGuideOpen}
        onClose={() => setIsOAuthGuideOpen(false)}
        redirectUri={redirectUri}
        appUrl={appUrl}
      />
    </div>
  );
}
