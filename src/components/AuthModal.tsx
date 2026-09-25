import React, { useState } from 'react';
import { 
  Github, 
  Key, 
  ShieldAlert, 
  ExternalLink, 
  Check, 
  X, 
  Loader2, 
  Info, 
  ArrowRight,
  Sparkles
} from 'lucide-react';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAuthSuccess: (token?: string) => void;
  oauthConfigured: boolean;
  redirectUri: string;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onAuthSuccess,
  oauthConfigured,
  redirectUri,
}) => {
  const [activeTab, setActiveTab] = useState<'oauth' | 'pat'>('oauth');
  const [patInput, setPatInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleOAuthConnect = async () => {
    setError(null);
    setLoading(true);
    try {
      const response = await fetch('/api/auth/url');
      const data = await response.json();

      if (!response.ok || !data.url) {
        throw new Error(data.error || 'Failed to generate GitHub OAuth URL');
      }

      // Open OAuth provider directly in popup window per skill guidelines
      const authWindow = window.open(
        data.url,
        'github_oauth_popup',
        'width=600,height=720,scrollbars=yes,status=yes'
      );

      if (!authWindow) {
        setError('Popup was blocked by your browser. Please allow popups for this site and retry.');
        setLoading(false);
        return;
      }

      // Keep loading indicator active until popup completes
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'OAuth connection error';
      setError(msg);
      setLoading(false);
    }
  };

  const handlePatSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!patInput.trim()) {
      setError('Please paste a GitHub Personal Access Token.');
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const res = await fetch('/api/auth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: patInput.trim() }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Invalid GitHub token. Ensure it has "repo" scope.');
      }

      onAuthSuccess();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to verify token';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div 
        className="glass-panel-glow w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl border border-emerald-500/30 flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-800/80 flex items-center justify-between bg-slate-900/60">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
              <Github className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-100 font-mono flex items-center gap-2">
                Connect GitHub Account
              </h2>
              <p className="text-xs text-slate-400">
                Grant permission to create and push repositories
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Auth Method Tabs */}
        <div className="flex border-b border-slate-800 bg-slate-950/40 p-1.5 gap-1.5 mx-6 mt-4 rounded-xl">
          <button
            type="button"
            onClick={() => { setActiveTab('oauth'); setError(null); }}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-mono font-medium transition-all ${
              activeTab === 'oauth'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
            }`}
          >
            <Github className="w-3.5 h-3.5" />
            <span>GitHub OAuth</span>
            {oauthConfigured && (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            )}
          </button>
          <button
            type="button"
            onClick={() => { setActiveTab('pat'); setError(null); }}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-mono font-medium transition-all ${
              activeTab === 'pat'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
            }`}
          >
            <Key className="w-3.5 h-3.5" />
            <span>Personal Access Token</span>
            <span className="text-[10px] bg-slate-800 text-slate-300 px-1 rounded">Direct</span>
          </button>
        </div>

        {/* Tab Content */}
        <div className="p-6 overflow-y-auto terminal-scroll">
          {error && (
            <div className="mb-4 p-3.5 rounded-xl bg-rose-950/50 border border-rose-500/30 text-rose-200 text-xs flex items-start gap-2.5">
              <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div className="flex-1 leading-relaxed">{error}</div>
            </div>
          )}

          {activeTab === 'oauth' ? (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800 text-xs text-slate-300 space-y-2">
                <div className="flex items-center gap-2 font-mono text-emerald-400 font-semibold">
                  <Sparkles className="w-4 h-4" />
                  <span>One-Click Authorization Flow</span>
                </div>
                <p className="text-slate-400 leading-relaxed">
                  Clicking below opens a secure GitHub window requesting permissions to manage repositories (<code className="text-emerald-300 font-mono">repo</code>, <code className="text-emerald-300 font-mono">user</code> scope).
                </p>
              </div>

              {!oauthConfigured && (
                <div className="p-3.5 rounded-xl bg-amber-950/30 border border-amber-500/30 text-xs text-amber-200 space-y-2">
                  <div className="flex items-center gap-1.5 font-semibold text-amber-300">
                    <Info className="w-4 h-4" />
                    <span>OAuth App Credentials Missing</span>
                  </div>
                  <p className="text-amber-200/80 leading-relaxed text-[11px]">
                    To use OAuth, set <code className="font-mono text-amber-100 bg-amber-950/80 px-1 py-0.5 rounded">GITHUB_CLIENT_ID</code> and <code className="font-mono text-amber-100 bg-amber-950/80 px-1 py-0.5 rounded">GITHUB_CLIENT_SECRET</code> in your project environment.
                  </p>
                  <p className="text-[11px] text-amber-300/90 font-medium">
                    &rarr; Or switch to the <strong>Personal Access Token</strong> tab for immediate login without OAuth setup!
                  </p>
                </div>
              )}

              <button
                type="button"
                onClick={handleOAuthConnect}
                disabled={loading}
                className="w-full py-3 px-4 rounded-xl font-mono text-sm font-semibold flex items-center justify-center gap-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-[0_0_20px_rgba(16,185,129,0.4)] transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Authorizing via GitHub Popup...</span>
                  </>
                ) : (
                  <>
                    <Github className="w-4 h-4" />
                    <span>Login with GitHub OAuth</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>

              <div className="text-center">
                <span className="text-[11px] text-slate-500">
                  Protected by secure pop-up postMessage communication.
                </span>
              </div>
            </div>
          ) : (
            <form onSubmit={handlePatSubmit} className="space-y-4">
              <div className="space-y-2">
                <label className="block text-xs font-mono text-slate-300">
                  GitHub Personal Access Token (classic or fine-grained)
                </label>
                <div className="relative">
                  <input
                    type="password"
                    placeholder="Enter your GitHub access token"
                    value={patInput}
                    onChange={(e) => setPatInput(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700/80 focus:border-emerald-500 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 font-mono placeholder:text-slate-600 outline-none focus:ring-1 focus:ring-emerald-500/50 transition-all"
                  />
                  <div className="absolute right-3 top-2.5 text-slate-500">
                    <Key className="w-4 h-4" />
                  </div>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 text-[11px] text-slate-400 space-y-1.5">
                <div className="flex items-center justify-between text-slate-300 font-medium">
                  <span>How to generate a token in 30 seconds:</span>
                  <a
                    href="https://github.com/settings/tokens/new?scopes=repo,user&description=GitDrop%20App"
                    target="_blank"
                    rel="noreferrer"
                    className="text-emerald-400 hover:underline flex items-center gap-1 font-mono text-[10px]"
                  >
                    Create Token on GitHub
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
                <ul className="list-disc list-inside space-y-1 text-slate-400">
                  <li>Click the link above to open GitHub Token Settings prefilled.</li>
                  <li>Ensure the <code className="text-emerald-400 font-mono">repo</code> scope checkbox is selected.</li>
                  <li>Click <em>Generate token</em> at the bottom, copy and paste it here.</li>
                </ul>
              </div>

              <button
                type="submit"
                disabled={loading || !patInput.trim()}
                className="w-full py-2.5 px-4 rounded-xl font-mono text-xs font-semibold flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-[0_0_15px_rgba(16,185,129,0.3)] transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Verifying GitHub Token...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Verify & Save Token</span>
                  </>
                )}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
