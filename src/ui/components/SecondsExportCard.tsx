import React, { useState, useRef, useEffect } from 'react';
import { Download } from 'lucide-react';
import { useAppStore } from '../../state/store';
import { exportSecondsZip, type SecondsExportProgress, SECONDS_EXPORT_CANCELLED } from '../../lib/secondsExport';
import { saveBlobChunked } from '../../lib/saveAndShare';

export const SecondsExportCard: React.FC = () => {
  const { settings } = useAppStore();
  const [hours, setHours] = useState<number | null>(24);
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState<SecondsExportProgress | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const cancelRef = useRef(false);
  const startRef = useRef(0);

  useEffect(() => {
    if (!isRunning) return;
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [isRunning]);

  const handleExport = async () => {
    setIsRunning(true);
    cancelRef.current = false;
    startRef.current = Date.now();
    setElapsed(0);
    setSuccessMessage(null);
    setErrorMessage(null);
    setProgress({ stage: 'Starting', detail: '', percent: 0 });

    try {
      const symbols = settings.trackedSymbols.length > 0 ? settings.trackedSymbols : ['BTCUSDT'];
      const { blob, filename, rows } = await exportSecondsZip(
        symbols,
        hours,
        (p) => setProgress(p),
        () => cancelRef.current
      );

      await saveBlobChunked(
        blob,
        filename,
        (f) =>
          setProgress({
            stage: 'Saving file',
            detail: Math.round(f * 100) + '% written',
            percent: 95 + Math.round(f * 5),
          }),
        () => cancelRef.current
      );

      setSuccessMessage(`Saved ${filename} (${rows.toLocaleString()} rows)`);
    } catch (err: any) {
      if (String(err?.message || err) !== SECONDS_EXPORT_CANCELLED) {
        setErrorMessage(err?.message || 'Export failed');
      }
    } finally {
      setIsRunning(false);
      setProgress(null);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 mb-4 shadow-xl">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-base font-semibold text-white">Export seconds data</h3>
        <Download className="w-4 h-4 text-cyan-400" />
      </div>

      <p className="text-xs text-slate-400 mb-4 leading-relaxed">
        Saves the stored 1-second candles (price, volume, trades, buy/sell volume) as CSV files in a zip.
      </p>

      {/* Choice buttons */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <button
          onClick={() => setHours(24)}
          disabled={isRunning}
          className={`py-2 rounded-xl border text-xs font-bold transition ${
            hours === 24
              ? 'bg-cyan-500/10 border-cyan-500/50 text-white'
              : 'bg-slate-800/60 border-slate-800 text-slate-400 hover:bg-slate-800'
          }`}
        >
          Last 24 hours
        </button>
        <button
          onClick={() => setHours(72)}
          disabled={isRunning}
          className={`py-2 rounded-xl border text-xs font-bold transition ${
            hours === 72
              ? 'bg-cyan-500/10 border-cyan-500/50 text-white'
              : 'bg-slate-800/60 border-slate-800 text-slate-400 hover:bg-slate-800'
          }`}
        >
          Last 72 hours
        </button>
        <button
          onClick={() => setHours(null)}
          disabled={isRunning}
          className={`py-2 rounded-xl border text-xs font-bold transition ${
            hours === null
              ? 'bg-cyan-500/10 border-cyan-500/50 text-white'
              : 'bg-slate-800/60 border-slate-800 text-slate-400 hover:bg-slate-800'
          }`}
        >
          All stored
        </button>
      </div>

      {/* Progress UI */}
      {isRunning && progress !== null && (
        <div className="mb-4 p-4 rounded-2xl bg-slate-800/80 border border-slate-700/80 space-y-2 text-xs">
          <div className="flex items-center justify-between text-slate-200">
            <span className="font-semibold truncate pr-2">
              {progress.stage + (progress.detail ? ' - ' + progress.detail : '')}
            </span>
            <span className="font-mono font-bold text-cyan-400">{progress.percent}%</span>
          </div>

          <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
            <div
              className="h-full bg-cyan-400 transition-all duration-300"
              style={{ width: `${progress.percent}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-slate-400 pt-0.5">
            <span className="font-mono">
              Time elapsed:{' '}
              {String(Math.floor(elapsed / 60)).padStart(2, '0')}:
              {String(elapsed % 60).padStart(2, '0')}
            </span>
            <button
              onClick={() => {
                cancelRef.current = true;
              }}
              disabled={cancelRef.current}
              className="px-2.5 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 font-semibold transition disabled:opacity-50"
            >
              {cancelRef.current ? 'Cancelling...' : 'Cancel'}
            </button>
          </div>

          <div className="text-[10px] text-slate-500 leading-tight">
            Still working. Keep this screen open. If the timer stops counting, the phone is busy; wait.
          </div>
        </div>
      )}

      {/* Success / Error Messages */}
      {successMessage && (
        <div className="mb-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs">
          {successMessage}
        </div>
      )}
      {errorMessage && (
        <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
          {errorMessage}
        </div>
      )}

      {/* Export Action Button */}
      <button
        onClick={handleExport}
        disabled={isRunning}
        className="w-full py-3 rounded-2xl bg-cyan-500 text-slate-950 font-bold text-sm hover:bg-cyan-400 active:scale-98 transition flex items-center justify-center gap-2 disabled:opacity-50"
      >
        <Download className="w-4 h-4" />
        {isRunning ? 'Exporting...' : 'Export seconds (zip)'}
      </button>
    </div>
  );
};
