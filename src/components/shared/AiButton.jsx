import { useState } from 'react';
import { Sparkles } from 'lucide-react';

export default function AiButton({ onClick, label, loading, disabled, className = '' }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className={`flex items-center gap-1 text-xs font-medium text-violet-600 hover:text-violet-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${className}`}
    >
      <Sparkles size={12} className={loading ? 'animate-pulse' : ''} />
      {loading ? 'Thinking...' : label}
    </button>
  );
}

export function AiResultCard({ title, content, onClose }) {
  if (!content) return null;

  return (
    <div className="bg-violet-50 border border-violet-200 rounded-xl p-3 mt-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold text-violet-700 flex items-center gap-1">
          <Sparkles size={12} />
          {title}
        </h3>
        {onClose && (
          <button
            onClick={onClose}
            className="text-violet-400 hover:text-violet-600 text-xs"
          >
            Dismiss
          </button>
        )}
      </div>
      <div className="text-xs text-violet-900 whitespace-pre-wrap leading-relaxed">
        {content}
      </div>
    </div>
  );
}
