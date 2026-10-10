import React, { useState } from 'react';
import { useAppStore } from '../../state/store';
import { PAPER_DEFAULT_START } from '../../data/repositories';
import { formatPrice } from '../../lib/formatters';
import { X, AlertCircle } from 'lucide-react';

interface Props {
  onClose: () => void;
}

type Mode = 'add' | 'reduce' | 'set' | 'reset';

export const PaperAccountSheet: React.FC<Props> = ({ onClose }) => {
  const {
    paperBalance,
    paperLedger,
    addPaperFunds,
    reducePaperFunds,
    setPaperBalance,
    resetPaperAccount,
  } = useAppStore();

  const [mode, setMode] = useState<Mode>('add');
  const [amountStr, setAmountStr] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isConfirmingReset, setIsConfirmingReset] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const handleModeChange = (newMode: Mode) => {
    setMode(newMode);
    setErrorMsg(null);
    setIsConfirmingReset(false);
    if (newMode === 'reset') {
      setAmountStr(String(PAPER_DEFAULT_START));
    } else {
      setAmountStr('');
    }
  };

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setAmountStr(e.target.value);
    setErrorMsg(null);
    if (mode === 'reset') {
      setIsConfirmingReset(false);
    }
  };

  const handleSubmit = async () => {
    setErrorMsg(null);

    const parsed = Number(amountStr);

    if (amountStr.trim() === '' || isNaN(parsed)) {
      setErrorMsg('Enter an amount greater than 0');
      return;
    }

    if (mode === 'add' || mode === 'reduce') {
      if (parsed <= 0) {
        setErrorMsg('Enter an amount greater than 0');
        return;
      }
    } else if (mode === 'set' || mode === 'reset') {
      if (parsed < 0) {
        setErrorMsg("Balance can't go below 0");
        return;
      }
    }

    if (parsed > 1000000000) {
      setErrorMsg('Maximum is 1,000,000,000');
      return;
    }

    if (mode === 'reduce' && (paperBalance ?? 0) - parsed < 0) {
      setErrorMsg("Balance can't go below 0");
      return;
    }

    if (mode === 'reset' && !isConfirmingReset) {
      setIsConfirmingReset(true);
      return;
    }

    setIsSubmitting(true);
    try {
      if (mode === 'add') {
        await addPaperFunds(parsed);
      } else if (mode === 'reduce') {
        await reducePaperFunds(parsed);
      } else if (mode === 'set') {
        await setPaperBalance(parsed);
      } else if (mode === 'reset') {
        await resetPaperAccount(parsed);
      }
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Operation failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getButtonLabel = () => {
    if (mode === 'add') return 'Add Funds';
    if (mode === 'reduce') return 'Reduce Funds';
    if (mode === 'set') return 'Set Balance';
    if (mode === 'reset') {
      return isConfirmingReset ? 'Tap again to confirm reset' : 'Reset Account';
    }
    return 'Confirm';
  };

  const formatEntryDate = (timestamp: number) => {
    const d = new Date(timestamp);
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${month}/${day} ${hours}:${minutes}`;
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex flex-col justify-end">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative bg-slate-900 border-t border-slate-800 rounded-t-3xl p-5 pb-8 max-w-md mx-auto w-full z-10 shadow-2xl space-y-4 max-h-[90dvh] overflow-y-auto">
        <div className="w-10 h-1 bg-slate-700 rounded-full mx-auto mb-1" />

        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-white">Adjust Paper Account</h3>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 1. Current Balance */}
        <div className="bg-slate-950/70 border border-slate-800/80 rounded-2xl p-4 flex items-center justify-between">
          <span className="text-xs text-slate-400 font-medium">Current Balance</span>
          <span className="text-xl font-bold text-white font-mono tracking-tight tabular-nums">
            {paperBalance !== null ? `$${formatPrice(paperBalance, 2)}` : '—'}
          </span>
        </div>

        {/* 2. 4-Option Segmented Control */}
        <div className="grid grid-cols-4 gap-1 p-1 bg-slate-950 border border-slate-800 rounded-xl">
          {[
            { id: 'add', label: 'Add' },
            { id: 'reduce', label: 'Reduce' },
            { id: 'set', label: 'Set To' },
            { id: 'reset', label: 'Reset' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => handleModeChange(tab.id as Mode)}
              className={`py-2 text-xs font-semibold rounded-lg transition ${
                mode === tab.id
                  ? 'bg-cyan-500 text-slate-950 shadow-md font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* 3. Numeric Amount Field */}
        <div className="space-y-1.5">
          <label className="text-xs text-slate-400 block px-0.5">
            {mode === 'add'
              ? 'Amount to Add'
              : mode === 'reduce'
              ? 'Amount to Deduct'
              : mode === 'set'
              ? 'New Target Balance'
              : 'Starting Balance'}
          </label>
          <div className="flex items-center bg-slate-950 border border-slate-700/80 rounded-2xl px-4 py-2.5 focus-within:border-cyan-400 transition">
            <span className="text-slate-400 font-mono text-sm mr-2">$</span>
            <input
              type="number"
              step="any"
              inputMode="decimal"
              placeholder="0.00"
              value={amountStr}
              onChange={handleAmountChange}
              className="bg-transparent text-white font-mono text-sm w-full focus:outline-none"
            />
          </div>
        </div>

        {/* Validation message inline */}
        {errorMsg && (
          <div className="flex items-center gap-1.5 text-xs text-rose-400 px-1">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Reset Confirmation Note */}
        {mode === 'reset' && isConfirmingReset && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 text-xs text-amber-300 leading-relaxed">
            Starts a new paper run. Past trades stay saved for research but are not counted in the new run.
          </div>
        )}

        {/* Primary Action Button */}
        <button
          onClick={handleSubmit}
          disabled={isSubmitting}
          className={`w-full py-3 px-4 rounded-2xl font-bold text-xs uppercase tracking-wider shadow-lg active:scale-98 transition flex items-center justify-center gap-2 ${
            mode === 'reset' && isConfirmingReset
              ? 'bg-amber-500 hover:bg-amber-400 text-slate-950'
              : mode === 'reduce'
              ? 'bg-rose-500 hover:bg-rose-400 text-white'
              : 'bg-cyan-500 hover:bg-cyan-400 text-slate-950'
          }`}
        >
          {getButtonLabel()}
        </button>

        {/* Account History (up to 10 entries of current run) */}
        <div className="space-y-2 pt-2 border-t border-slate-800">
          <div className="text-xs font-semibold text-slate-300 uppercase tracking-wider px-0.5">
            Account History
          </div>

          <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
            {paperLedger.map((entry) => {
              const isStart = entry.type === 'start';
              const isAdded = entry.type === 'adjust' && entry.amount >= 0;
              const isReduced = entry.type === 'adjust' && entry.amount < 0;

              const typeLabel = isStart ? 'Start' : isAdded ? 'Added' : 'Reduced';
              const sign = isStart ? '' : isAdded ? '+' : '';

              return (
                <div
                  key={entry.id}
                  className="bg-slate-950/60 border border-slate-800/60 rounded-xl px-3 py-2 flex items-center justify-between text-xs"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2 py-0.5 rounded-md text-[10px] font-semibold ${
                        isStart
                          ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'
                          : isAdded
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                      }`}
                    >
                      {typeLabel}
                    </span>
                    <span className="text-[11px] text-slate-400 font-mono">
                      {formatEntryDate(entry.t)}
                    </span>
                  </div>

                  <span
                    className={`font-mono font-bold tabular-nums ${
                      isStart
                        ? 'text-slate-100'
                        : isAdded
                        ? 'text-emerald-400'
                        : 'text-rose-400'
                    }`}
                  >
                    {sign}${formatPrice(Math.abs(entry.amount), 2)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
