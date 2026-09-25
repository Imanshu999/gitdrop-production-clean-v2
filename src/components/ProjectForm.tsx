import React, { useState, useRef, useEffect } from 'react';
import { GitHubRepoSummary, GitHubUser } from '../types/index.ts';
import { 
  Upload, 
  FileArchive, 
  GitBranch, 
  Lock, 
  Globe, 
  Sparkles, 
  Layers, 
  Check, 
  AlertCircle, 
  ChevronDown, 
  ChevronUp, 
  X,
  FileCode2,
  RefreshCw,
  Rocket
} from 'lucide-react';

interface ProjectFormProps {
  user: GitHubUser;
  repos: GitHubRepoSummary[];
  loadingRepos: boolean;
  onRefreshRepos: () => void;
  onSubmit: (formData: FormData) => void;
  isDeploying: boolean;
}

export const ProjectForm: React.FC<ProjectFormProps> = ({
  user,
  repos,
  loadingRepos,
  onRefreshRepos,
  onSubmit,
  isDeploying,
}) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [repoName, setRepoName] = useState('');
  const [description, setDescription] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [targetBranch, setTargetBranch] = useState('main');
  const [commitMessage, setCommitMessage] = useState('');
  const [smartMerge, setSmartMerge] = useState(true);
  const [forcePush, setForcePush] = useState(true);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [repoMode, setRepoMode] = useState<'create' | 'update'>('create');
  const [selectedExistingRepo, setSelectedExistingRepo] = useState<string>('');
  const [formError, setFormError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Check if current repoName matches an existing repo
  const existingRepoMatch = repos.find(
    (r) => r.name.toLowerCase() === repoName.trim().toLowerCase()
  );

  useEffect(() => {
    if (existingRepoMatch) {
      setRepoMode('update');
      setIsPrivate(existingRepoMatch.private);
      if (existingRepoMatch.description && !description) {
        setDescription(existingRepoMatch.description);
      }
      if (existingRepoMatch.default_branch) {
        setTargetBranch(existingRepoMatch.default_branch);
      }
    }
  }, [repoName, existingRepoMatch]);

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processSelectedFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processSelectedFile(e.target.files[0]);
    }
  };

  const processSelectedFile = (file: File) => {
    if (!file.name.toLowerCase().endsWith('.zip')) {
      setFormError('Please select a valid .ZIP compressed archive file.');
      return;
    }

    if (file.size > 100 * 1024 * 1024) {
      setFormError('File size exceeds the 100MB limit.');
      return;
    }

    setFormError(null);
    setSelectedFile(file);

    // Auto populate repo name from file if empty
    if (!repoName) {
      const baseName = file.name
        .replace(/\.zip$/i, '')
        .replace(/[^a-zA-Z0-9._-]/g, '-')
        .toLowerCase();
      setRepoName(baseName);
    }
  };

  const handleSelectExistingRepo = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const chosenName = e.target.value;
    setSelectedExistingRepo(chosenName);
    if (chosenName) {
      setRepoName(chosenName);
      const found = repos.find((r) => r.name === chosenName);
      if (found) {
        setIsPrivate(found.private);
        if (found.description) setDescription(found.description);
        if (found.default_branch) setTargetBranch(found.default_branch);
      }
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!selectedFile) {
      setFormError('Please select or drop a project ZIP file.');
      return;
    }

    const cleanRepoName = repoName.trim().replace(/\s+/g, '-');
    if (!cleanRepoName) {
      setFormError('Please enter a valid repository name.');
      return;
    }

    // Prepare FormData
    const formData = new FormData();
    formData.append('zipFile', selectedFile);
    formData.append('repoName', cleanRepoName);
    formData.append('description', description.trim());
    formData.append('isPrivate', String(isPrivate));
    formData.append('targetBranch', targetBranch.trim() || 'main');
    formData.append('commitMessage', commitMessage.trim());
    formData.append('smartMerge', String(smartMerge));
    formData.append('forcePush', String(forcePush));

    onSubmit(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {formError && (
        <div className="p-3.5 rounded-xl bg-rose-950/60 border border-rose-500/40 text-rose-200 text-xs flex items-center gap-2.5 animate-in fade-in">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{formError}</span>
        </div>
      )}

      {/* 1. ZIP File Drop Zone */}
      <div className="space-y-2">
        <label className="block text-xs font-mono text-slate-300 font-medium">
          Step 1: Project Archive <span className="text-emerald-400">*</span>
        </label>

        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={handleFileDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`relative border-2 border-dashed rounded-2xl p-6 sm:p-8 text-center cursor-pointer transition-all duration-200 ${
            isDragOver
              ? 'border-emerald-400 bg-emerald-950/30 shadow-[0_0_25px_rgba(16,185,129,0.25)]'
              : selectedFile
              ? 'border-emerald-500/50 bg-slate-900/60'
              : 'border-slate-700/80 hover:border-emerald-500/40 bg-slate-950/40 hover:bg-slate-900/30'
          }`}
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileInputChange}
            accept=".zip,application/zip"
            className="hidden"
            disabled={isDeploying}
          />

          {selectedFile ? (
            <div className="flex flex-col items-center gap-3">
              <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.2)]">
                <FileArchive className="w-7 h-7" />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-slate-100 font-mono flex items-center justify-center gap-2">
                  <span>{selectedFile.name}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                    {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
                  </span>
                </h4>
                <p className="text-xs text-slate-400 mt-1">
                  Ready for extraction and Git blob construction
                </p>
              </div>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedFile(null);
                }}
                disabled={isDeploying}
                className="mt-1 text-xs text-slate-400 hover:text-rose-400 flex items-center gap-1 font-mono transition-colors"
              >
                <X className="w-3.5 h-3.5" />
                <span>Choose different file</span>
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <div className="w-14 h-14 rounded-2xl bg-slate-900/80 border border-slate-800 flex items-center justify-center text-slate-400 group-hover:text-emerald-400 transition-colors">
                <Upload className="w-6 h-6 text-emerald-400" />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-slate-200">
                  Drop your project ZIP file here, or <span className="text-emerald-400 hover:underline">browse files</span>
                </h4>
                <p className="text-xs text-slate-400 mt-1">
                  Supports full codebases, Next.js, React, Node, Python, static HTML, etc. (up to 100MB)
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 2. Project / Repository Name */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="block text-xs font-mono text-slate-300 font-medium">
            Step 2: Repository Name <span className="text-emerald-400">*</span>
          </label>

          {/* Quick select existing repos */}
          {repos.length > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-slate-400">
              <span>Or update existing:</span>
              <select
                value={selectedExistingRepo}
                onChange={handleSelectExistingRepo}
                disabled={isDeploying || loadingRepos}
                className="bg-slate-900 border border-slate-800 rounded px-2 py-0.5 text-xs text-emerald-400 font-mono outline-none focus:border-emerald-500"
              >
                <option value="">Select repo...</option>
                {repos.map((r) => (
                  <option key={r.id} value={r.name}>
                    {r.name} {r.private ? '(private)' : ''}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={onRefreshRepos}
                title="Refresh repositories"
                disabled={loadingRepos}
                className="p-1 text-slate-400 hover:text-emerald-400 transition-colors"
              >
                <RefreshCw className={`w-3 h-3 ${loadingRepos ? 'animate-spin' : ''}`} />
              </button>
            </div>
          )}
        </div>

        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500 font-mono text-xs">
            {user.login} /
          </div>
          <input
            type="text"
            required
            value={repoName}
            onChange={(e) => setRepoName(e.target.value)}
            placeholder="my-cool-project"
            disabled={isDeploying}
            className="w-full bg-slate-950/70 border border-slate-700/80 focus:border-emerald-500 rounded-xl pl-28 pr-4 py-2.5 text-xs text-slate-100 font-mono placeholder:text-slate-600 outline-none focus:ring-1 focus:ring-emerald-500/50 transition-all"
          />
        </div>

        {/* Dynamic Mode Indicator */}
        <div className="flex items-center justify-between text-[11px] font-mono px-1">
          {existingRepoMatch ? (
            <span className="text-amber-400 flex items-center gap-1">
              <Sparkles className="w-3 h-3" />
              <span>Existing repo detected &rarr; <strong>Smart Merge Update</strong></span>
            </span>
          ) : (
            <span className="text-emerald-400 flex items-center gap-1">
              <Check className="w-3 h-3" />
              <span>New repository &rarr; Will be automatically created under @{user.login}</span>
            </span>
          )}
        </div>
      </div>

      {/* 3. Description */}
      <div className="space-y-1.5">
        <label className="block text-xs font-mono text-slate-300 font-medium">
          Step 3: Description <span className="text-slate-500">(Optional)</span>
        </label>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Brief description of the project"
          disabled={isDeploying}
          className="w-full bg-slate-950/70 border border-slate-700/80 focus:border-emerald-500 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 placeholder:text-slate-600 outline-none focus:ring-1 focus:ring-emerald-500/50 transition-all"
        />
      </div>

      {/* 4. Visibility Selector */}
      <div className="space-y-2">
        <label className="block text-xs font-mono text-slate-300 font-medium">
          Step 4: Repository Visibility
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label
            className={`flex items-center gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${
              !isPrivate
                ? 'bg-emerald-500/10 border-emerald-500/50 shadow-[0_0_15px_rgba(16,185,129,0.15)] text-slate-100'
                : 'bg-slate-950/40 border-slate-800 text-slate-400 hover:bg-slate-900/40'
            }`}
          >
            <input
              type="radio"
              name="visibility"
              checked={!isPrivate}
              onChange={() => setIsPrivate(false)}
              disabled={isDeploying}
              className="hidden"
            />
            <Globe className={`w-4 h-4 ${!isPrivate ? 'text-emerald-400' : 'text-slate-500'}`} />
            <div>
              <div className="text-xs font-semibold">Public</div>
              <div className="text-[10px] text-slate-400">Anyone on GitHub can see this repo</div>
            </div>
          </label>

          <label
            className={`flex items-center gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${
              isPrivate
                ? 'bg-emerald-500/10 border-emerald-500/50 shadow-[0_0_15px_rgba(16,185,129,0.15)] text-slate-100'
                : 'bg-slate-950/40 border-slate-800 text-slate-400 hover:bg-slate-900/40'
            }`}
          >
            <input
              type="radio"
              name="visibility"
              checked={isPrivate}
              onChange={() => setIsPrivate(true)}
              disabled={isDeploying}
              className="hidden"
            />
            <Lock className={`w-4 h-4 ${isPrivate ? 'text-emerald-400' : 'text-slate-500'}`} />
            <div>
              <div className="text-xs font-semibold">Private</div>
              <div className="text-[10px] text-slate-400">Only you can view and commit</div>
            </div>
          </label>
        </div>
      </div>

      {/* Advanced Git Options (Collapsible) */}
      <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950/30">
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="w-full px-4 py-2.5 flex items-center justify-between text-xs font-mono text-slate-400 hover:text-slate-200 transition-colors"
        >
          <div className="flex items-center gap-2">
            <GitBranch className="w-3.5 h-3.5 text-emerald-400" />
            <span>Advanced Git & Smart Merge Settings</span>
          </div>
          {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        {showAdvanced && (
          <div className="p-4 border-t border-slate-800/80 space-y-4 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-mono text-slate-400 mb-1">
                  Target Branch
                </label>
                <input
                  type="text"
                  value={targetBranch}
                  onChange={(e) => setTargetBranch(e.target.value)}
                  placeholder="main"
                  disabled={isDeploying}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 font-mono text-xs text-slate-200 outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-mono text-slate-400 mb-1">
                  Custom Commit Message
                </label>
                <input
                  type="text"
                  value={commitMessage}
                  onChange={(e) => setCommitMessage(e.target.value)}
                  placeholder="e.g. Update components and styles"
                  disabled={isDeploying}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 font-mono text-xs text-slate-200 outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            {/* Smart Merge Toggle */}
            <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800/80 flex items-start gap-3">
              <input
                type="checkbox"
                id="smartMerge"
                checked={smartMerge}
                onChange={(e) => setSmartMerge(e.target.checked)}
                disabled={isDeploying}
                className="mt-0.5 rounded border-slate-700 text-emerald-500 focus:ring-emerald-500"
              />
              <label htmlFor="smartMerge" className="cursor-pointer">
                <span className="font-semibold text-slate-200 font-mono block">
                  Smart Merge (Preserve untouched existing files)
                </span>
                <span className="text-[11px] text-slate-400 leading-relaxed block mt-0.5">
                  When updating an existing repository, uses GitHub's Git Tree base to seamlessly overwrite modified files while leaving untouched existing files intact.
                </span>
              </label>
            </div>

            {/* Force Deploy Toggle */}
            <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800/80 flex items-start gap-3">
              <input
                type="checkbox"
                id="forcePush"
                checked={forcePush}
                onChange={(e) => setForcePush(e.target.checked)}
                disabled={isDeploying}
                className="mt-0.5 rounded border-slate-700 text-emerald-500 focus:ring-emerald-500"
              />
              <label htmlFor="forcePush" className="cursor-pointer">
                <span className="font-semibold text-slate-200 font-mono block">
                  Force Deploy & Override (Recommended)
                </span>
                <span className="text-[11px] text-slate-400 leading-relaxed block mt-0.5">
                  Ensures branch references update even across divergent commit histories without crashing on remote Git fast-forward locks.
                </span>
              </label>
            </div>
          </div>
        )}
      </div>

      {/* Submit Button */}
      <button
        type="submit"
        disabled={isDeploying || !selectedFile || !repoName.trim()}
        className="w-full py-3.5 px-6 rounded-xl font-mono text-sm font-semibold flex items-center justify-center gap-2.5 bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-slate-950 shadow-[0_0_25px_rgba(16,185,129,0.35)] transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transform active:scale-[0.99]"
      >
        <Rocket className="w-5 h-5" />
        <span>
          {existingRepoMatch
            ? 'Smart Merge & Update to GitHub'
            : 'Extract & Deploy to GitHub'}
        </span>
      </button>
    </form>
  );
};
