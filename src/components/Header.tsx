import React from 'react';
import { GitHubUser } from '../types/index.ts';
import { 
  Github, 
  Terminal, 
  LogOut, 
  Settings, 
  CheckCircle2, 
  ExternalLink,
  ShieldCheck,
  FolderGit2
} from 'lucide-react';

interface HeaderProps {
  user: GitHubUser | null;
  onLogout: () => void;
  onOpenOAuthGuide: () => void;
  onOpenAuthModal: () => void;
  oauthConfigured: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  user,
  onLogout,
  onOpenOAuthGuide,
  onOpenAuthModal,
  oauthConfigured,
}) => {
  return (
    <header className="border-b border-emerald-500/20 bg-[#080d16]/80 backdrop-blur-md sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="relative group">
            <div className="w-10 h-10 rounded-lg bg-emerald-950/80 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.3)] transition-all group-hover:border-emerald-400 group-hover:shadow-[0_0_20px_rgba(16,185,129,0.5)]">
              <FolderGit2 className="w-5 h-5 text-emerald-400" />
            </div>
            <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-emerald-500 rounded-full border-2 border-[#080d16]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-lg tracking-wider text-slate-100 font-mono">
                GIT<span className="text-emerald-400">DROP</span>
              </span>
              <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                v2.4
              </span>
            </div>
            <p className="text-xs text-slate-400 hidden sm:block">
              ZIP Archive &rarr; Direct GitHub Git Database Engine
            </p>
          </div>
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-3">
          <button
            onClick={onOpenOAuthGuide}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono text-slate-400 hover:text-emerald-300 bg-slate-900/60 hover:bg-slate-800/80 border border-slate-800 hover:border-emerald-500/30 transition-all"
            title="Configure GitHub OAuth app settings"
          >
            <Settings className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden sm:inline">OAuth Setup</span>
            {!oauthConfigured && (
              <span className="w-2 h-2 rounded-full bg-amber-400" title="OAuth credentials not set in env" />
            )}
          </button>

          {user ? (
            <div className="flex items-center gap-3 bg-slate-900/90 border border-emerald-500/30 px-3 py-1.5 rounded-lg">
              <img
                src={user.avatar_url}
                alt={user.login}
                className="w-7 h-7 rounded-full border border-emerald-500/50"
              />
              <div className="text-left hidden md:block">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-slate-200">
                    {user.name || user.login}
                  </span>
                  <ShieldCheck className="w-3 h-3 text-emerald-400" />
                </div>
                <a
                  href={user.html_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] font-mono text-emerald-400 hover:underline flex items-center gap-0.5"
                >
                  @{user.login}
                  <ExternalLink className="w-2.5 h-2.5" />
                </a>
              </div>

              <div className="h-4 w-px bg-slate-800 mx-1 hidden md:block" />

              <button
                onClick={onLogout}
                className="p-1 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded transition-colors"
                title="Disconnect Account"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={onOpenAuthModal}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-mono font-semibold bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/50 hover:border-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.2)] transition-all cursor-pointer"
            >
              <Github className="w-4 h-4" />
              <span>Connect GitHub</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
