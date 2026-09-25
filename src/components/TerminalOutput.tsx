import React, { useEffect, useRef, useState } from 'react';
import { DeployProgressEvent } from '../types/index.ts';
import { 
  Terminal, 
  ExternalLink, 
  CheckCircle2, 
  AlertTriangle, 
  Copy, 
  Check, 
  RotateCcw,
  Sparkles,
  GitCommit,
  GitBranch,
  FolderGit2
} from 'lucide-react';

interface TerminalOutputProps {
  logs: Array<{
    timestamp: string;
    step: string;
    message: string;
    percent: number;
    data?: any;
  }>;
  progressPercent: number;
  currentStep: string;
  isDeploying: boolean;
  resultData: any | null;
  errorMessage: string | null;
  onReset: () => void;
}

export const TerminalOutput: React.FC<TerminalOutputProps> = ({
  logs,
  progressPercent,
  currentStep,
  isDeploying,
  resultData,
  errorMessage,
  onReset,
}) => {
  const terminalBottomRef = useRef<HTMLDivElement>(null);
  const [copiedClone, setCopiedClone] = useState(false);

  // Auto scroll to bottom as logs stream in
  useEffect(() => {
    terminalBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const copyCloneCmd = (repoUrl: string) => {
    navigator.clipboard.writeText(`git clone ${repoUrl}.git`);
    setCopiedClone(true);
    setTimeout(() => setCopiedClone(false), 2000);
  };

  return (
    <div className="terminal-window rounded-2xl overflow-hidden border border-emerald-500/30 flex flex-col shadow-2xl relative">
      {/* Terminal Title Bar */}
      <div className="bg-[#0b101c] px-4 py-3 border-b border-emerald-500/20 flex items-center justify-between z-10">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-rose-500/80 inline-block border border-rose-400/40" />
            <span className="w-3 h-3 rounded-full bg-amber-500/80 inline-block border border-amber-400/40" />
            <span className="w-3 h-3 rounded-full bg-emerald-500/80 inline-block border border-emerald-400/40" />
          </div>
          <div className="h-4 w-px bg-slate-800 mx-2" />
          <div className="flex items-center gap-1.5 text-xs font-mono text-emerald-400">
            <Terminal className="w-3.5 h-3.5" />
            <span>gitdrop-deploy-daemon@v2.4: ~</span>
          </div>
        </div>

        {/* Step Badge */}
        <div className="flex items-center gap-2">
          {isDeploying && (
            <span className="flex items-center gap-1.5 text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 animate-pulse">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              DEPLOYING
            </span>
          )}
          {resultData && !errorMessage && (
            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-500/30 text-emerald-300 border border-emerald-500/50 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" />
              SUCCESS
            </span>
          )}
          {errorMessage && (
            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-rose-500/30 text-rose-300 border border-rose-500/50 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              FAILED
            </span>
          )}
        </div>
      </div>

      {/* Progress Bar Header */}
      <div className="bg-slate-950/80 px-4 py-2 border-b border-slate-900 flex items-center justify-between text-xs font-mono text-slate-400">
        <div className="flex items-center gap-2">
          <span>PROGRESS:</span>
          <span className="text-emerald-400 font-bold">{progressPercent}%</span>
        </div>
        <div className="w-1/2 bg-slate-900 rounded-full h-2 overflow-hidden border border-slate-800">
          <div
            className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Terminal Log Console */}
      <div className="p-4 sm:p-5 h-80 overflow-y-auto font-mono text-xs space-y-1.5 terminal-scroll bg-[#04070d]/95 z-10 selection:bg-emerald-500/40 selection:text-white">
        {logs.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-600 space-y-2">
            <Terminal className="w-8 h-8 text-slate-700" />
            <p>Awaiting deployment pipeline execution...</p>
            <p className="text-[11px] text-slate-700">
              Terminal logs will stream here in real-time.
            </p>
          </div>
        ) : (
          logs.map((log, index) => {
            const isWarning =
              log.message.toLowerCase().includes('warning') ||
              log.message.toLowerCase().includes('skipped') ||
              log.message.toLowerCase().includes('conflict detected');
            const isError =
              !isWarning &&
              (log.step === 'error' ||
                log.message.toLowerCase().startsWith('error') ||
                log.message.toLowerCase().includes('fatal'));
            const isSuccess = log.step === 'complete';
            const timeStr = log.timestamp ? log.timestamp.split('T')[1].slice(0, 8) : '';

            return (
              <div
                key={index}
                className={`flex items-start gap-2.5 leading-relaxed transition-all ${
                  isError
                    ? 'text-rose-400 bg-rose-950/20 p-1 rounded border border-rose-500/20'
                    : isWarning
                    ? 'text-amber-300 bg-amber-950/30 p-1 rounded border border-amber-500/30'
                    : isSuccess
                    ? 'text-emerald-300 font-semibold bg-emerald-950/30 p-1.5 rounded border border-emerald-500/30'
                    : 'text-slate-300'
                }`}
              >
                <span className="text-slate-600 select-none text-[11px] shrink-0">
                  [{timeStr}]
                </span>
                <span
                  className={`select-none shrink-0 ${
                    isError ? 'text-rose-500' : isWarning ? 'text-amber-400' : 'text-emerald-500'
                  }`}
                >
                  &gt;
                </span>
                <span className="flex-1 break-words">{log.message}</span>
              </div>
            );
          })
        )}
        <div ref={terminalBottomRef} />
      </div>

      {/* Completion Banner with Repository Links */}
      {resultData && (
        <div className="bg-emerald-950/50 border-t border-emerald-500/40 p-4 sm:p-5 z-10 space-y-3">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-2 text-emerald-400 font-semibold font-mono text-sm">
              <Sparkles className="w-4 h-4 text-emerald-300" />
              <span>
                {resultData.isNewRepo
                  ? 'Repository Created & Deployed!'
                  : 'Smart Merge Deployed to GitHub!'}
              </span>
            </div>

            <button
              onClick={onReset}
              className="text-xs font-mono text-slate-400 hover:text-emerald-300 flex items-center gap-1 bg-slate-900 border border-slate-800 hover:border-emerald-500/40 px-2.5 py-1 rounded transition-colors"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Deploy Another</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            {/* Repo Link */}
            <a
              href={resultData.repoUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-between p-3 rounded-xl bg-slate-900/90 border border-emerald-500/30 hover:border-emerald-400 transition-all text-xs font-mono group"
            >
              <div className="flex items-center gap-2">
                <FolderGit2 className="w-4 h-4 text-emerald-400" />
                <span className="text-slate-200 group-hover:text-emerald-300 truncate max-w-[200px]">
                  {resultData.repoUrl.replace('https://github.com/', '')}
                </span>
              </div>
              <ExternalLink className="w-3.5 h-3.5 text-slate-400 group-hover:text-emerald-400" />
            </a>

            {/* Branch / Commit Link */}
            <a
              href={resultData.commitUrl || `${resultData.repoUrl}/tree/${resultData.branch || 'main'}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-between p-3 rounded-xl bg-slate-900/90 border border-emerald-500/30 hover:border-emerald-400 transition-all text-xs font-mono group"
            >
              <div className="flex items-center gap-2">
                <GitCommit className="w-4 h-4 text-teal-400" />
                <span className="text-slate-200 group-hover:text-teal-300">
                  {resultData.commitSha ? `Commit: ${resultData.commitSha.slice(0, 7)}` : `Branch: ${resultData.branch || 'main'}`} ({resultData.filesCount || 0} files)
                </span>
              </div>
              <ExternalLink className="w-3.5 h-3.5 text-slate-400 group-hover:text-teal-400" />
            </a>
          </div>

          {/* Quick Git Clone Copy */}
          <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono">
            <span className="text-slate-400 truncate mr-2">
              git clone {resultData.repoUrl}.git
            </span>
            <button
              onClick={() => copyCloneCmd(resultData.repoUrl)}
              className="text-emerald-400 hover:text-emerald-300 flex items-center gap-1 shrink-0 px-2 py-0.5 rounded hover:bg-slate-900"
            >
              {copiedClone ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              <span>{copiedClone ? 'Copied!' : 'Copy'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Error Action Banner */}
      {errorMessage && !isDeploying && (
        <div className="bg-rose-950/60 border-t border-rose-500/30 p-4 z-10 flex items-center justify-between">
          <div className="flex items-center gap-2 text-rose-300 text-xs font-mono">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>Process halted: {errorMessage}</span>
          </div>
          <button
            onClick={onReset}
            className="text-xs font-mono text-slate-200 bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 px-3 py-1 rounded transition-colors"
          >
            Retry
          </button>
        </div>
      )}
    </div>
  );
};
