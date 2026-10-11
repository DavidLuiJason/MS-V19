import React, { useState } from 'react';
import { Info, ChevronDown } from 'lucide-react';

export function InfoToggle({
  label = 'How this works',
  children,
}: {
  label?: string;
  children: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500 hover:text-slate-300"
      >
        <Info className="w-3.5 h-3.5" />
        <span>{label}</span>
        <ChevronDown
          className={`w-3 h-3 transition-transform duration-200 ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>
      {isOpen && (
        <div className="mt-2 text-[11px] leading-relaxed text-slate-400">
          {children}
        </div>
      )}
    </div>
  );
}
