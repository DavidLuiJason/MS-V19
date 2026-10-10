import React, { useState, useRef } from 'react';
import { FileText, Copy, RefreshCw } from 'lucide-react';
import { buildEvidenceSummary } from '../../lib/evidenceSummary';

export const EvidenceSummaryCard: React.FC = () => {
  const [text, setText] = useState<string>('');
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleBuild = async () => {
    setIsRunning(true);
    setCopyStatus(null);
    try {
      const result = await buildEvidenceSummary();
      setText(result);
    } catch (err: any) {
      setText('Failed to build evidence summary: ' + (err?.message || String(err)));
    } finally {
      setIsRunning(false);
    }
  };

  const handleCopy = async () => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopyStatus('Copied.');
      setTimeout(() => setCopyStatus(null), 3000);
    } catch {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.select();
      }
      setCopyStatus('Press and hold the text, then Copy.');
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 mb-4 shadow-xl">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-base font-semibold text-white">Evidence summary</h3>
        <FileText className="w-4 h-4 text-cyan-400" />
      </div>

      <p className="text-xs text-slate-400 mb-4 leading-relaxed">
        One-tap summary in plain text across 1-second collection, Seconds Lab trials, history screenings, Arena bets, and honest status.
      </p>

      {text === '' ? (
        <button
          onClick={handleBuild}
          disabled={isRunning}
          className="w-full py-3 rounded-2xl bg-cyan-500 text-slate-950 font-bold text-sm hover:bg-cyan-400 active:scale-98 transition flex items-center justify-center gap-2 disabled:opacity-50"
        >
          <FileText className="w-4 h-4" />
          {isRunning ? 'Building...' : 'Build summary'}
        </button>
      ) : (
        <div className="space-y-3">
          <textarea
            ref={textareaRef}
            readOnly
            value={text}
            rows={14}
            className="w-full p-3 rounded-2xl bg-slate-950 border border-slate-800 text-slate-300 font-mono text-[11px] leading-relaxed resize-none focus:outline-hidden select-all"
          />

          {copyStatus && (
            <div className="text-xs text-center font-medium text-cyan-400">
              {copyStatus}
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={handleCopy}
              className="py-2.5 rounded-xl bg-cyan-500 text-slate-950 font-bold text-xs hover:bg-cyan-400 active:scale-98 transition flex items-center justify-center gap-1.5"
            >
              <Copy className="w-3.5 h-3.5" />
              Copy
            </button>
            <button
              onClick={handleBuild}
              disabled={isRunning}
              className="py-2.5 rounded-xl bg-slate-800 border border-slate-700 hover:bg-slate-750 text-slate-200 font-bold text-xs active:scale-98 transition flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRunning ? 'animate-spin' : ''}`} />
              {isRunning ? 'Building...' : 'Rebuild'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
