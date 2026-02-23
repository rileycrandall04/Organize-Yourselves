import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { usePeople } from '../hooks/useDb';
import { getAssignmentHistory, checkPersonHistory } from '../utils/sacramentHistory';
import {
  Music, User, MessageSquare, Plus, Trash2, Settings as SettingsIcon,
  AlertTriangle, CheckCircle2,
} from 'lucide-react';

const EMPTY_PROGRAM = {
  presiding: '',
  conducting: '',
  announcements: '',
  openingHymn: '',
  invocation: '',
  wardBusiness: '',
  sacramentHymn: '',
  speakers: [
    { name: '', topic: '' },
    { name: '', topic: '' },
  ],
  musicalNumber: '',
  intermediateHymn: '',
  closingHymn: '',
  benediction: '',
  notes: '',
};

export default function SacramentProgram({ instance, onUpdate, disabled }) {
  const [program, setProgram] = useState(() => ({
    ...EMPTY_PROGRAM,
    ...(instance.programData || {}),
    speakers: instance.programData?.speakers?.length > 0
      ? instance.programData.speakers
      : EMPTY_PROGRAM.speakers,
  }));
  const [history, setHistory] = useState({});
  const [thresholdMonths, setThresholdMonths] = useState(12);
  const [showSettings, setShowSettings] = useState(false);
  const { people } = usePeople();

  // Load assignment history on mount
  useEffect(() => {
    getAssignmentHistory().then(setHistory);
  }, []);

  // Load threshold from profile if available
  useEffect(() => {
    if (instance.programData?.thresholdMonths) {
      setThresholdMonths(instance.programData.thresholdMonths);
    }
  }, [instance.programData?.thresholdMonths]);

  // Persist changes
  const saveTimeout = useRef(null);
  const persistProgram = useCallback((updated) => {
    if (disabled) return;
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(() => {
      onUpdate(instance.id, {
        programData: { ...updated, thresholdMonths },
      });
    }, 500);
  }, [instance.id, onUpdate, disabled, thresholdMonths]);

  function set(field, value) {
    setProgram(prev => {
      const updated = { ...prev, [field]: value };
      persistProgram(updated);
      return updated;
    });
  }

  function setSpeaker(index, field, value) {
    setProgram(prev => {
      const speakers = [...prev.speakers];
      speakers[index] = { ...speakers[index], [field]: value };
      const updated = { ...prev, speakers };
      persistProgram(updated);
      return updated;
    });
  }

  function addSpeaker() {
    setProgram(prev => {
      const speakers = [...prev.speakers, { name: '', topic: '' }];
      const updated = { ...prev, speakers };
      persistProgram(updated);
      return updated;
    });
  }

  function removeSpeaker(index) {
    setProgram(prev => {
      if (prev.speakers.length <= 1) return prev;
      const speakers = prev.speakers.filter((_, i) => i !== index);
      const updated = { ...prev, speakers };
      persistProgram(updated);
      return updated;
    });
  }

  return (
    <div className="space-y-5">
      {/* Section: Leadership */}
      <ProgramSection title="Leadership" icon={User}>
        <div className="grid grid-cols-2 gap-3">
          <NameField
            label="Presiding"
            value={program.presiding}
            onChange={v => set('presiding', v)}
            people={people}
            disabled={disabled}
          />
          <NameField
            label="Conducting"
            value={program.conducting}
            onChange={v => set('conducting', v)}
            people={people}
            disabled={disabled}
          />
        </div>
      </ProgramSection>

      {/* Section: Opening */}
      <ProgramSection title="Opening" icon={Music}>
        <div className="space-y-3">
          <TextField label="Announcements" value={program.announcements} onChange={v => set('announcements', v)} disabled={disabled} multiline />
          <div className="grid grid-cols-2 gap-3">
            <TextField label="Opening Hymn" value={program.openingHymn} onChange={v => set('openingHymn', v)} disabled={disabled} placeholder="e.g., #2 The Spirit of God" />
            <NameFieldWithHistory
              label="Invocation"
              value={program.invocation}
              onChange={v => set('invocation', v)}
              people={people}
              history={history}
              thresholdMonths={thresholdMonths}
              type="prayed"
              disabled={disabled}
            />
          </div>
        </div>
      </ProgramSection>

      {/* Section: Ward Business & Sacrament */}
      <ProgramSection title="Sacrament" icon={MessageSquare}>
        <div className="space-y-3">
          <TextField label="Ward Business" value={program.wardBusiness} onChange={v => set('wardBusiness', v)} disabled={disabled} placeholder="Sustainings, releases, etc." multiline />
          <TextField label="Sacrament Hymn" value={program.sacramentHymn} onChange={v => set('sacramentHymn', v)} disabled={disabled} placeholder="e.g., #169 As Now We Take the Sacrament" />
        </div>
      </ProgramSection>

      {/* Section: Program */}
      <ProgramSection
        title="Speakers & Music"
        icon={User}
        action={!disabled && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="text-gray-400 hover:text-gray-600 transition-colors"
              title="History settings"
            >
              <SettingsIcon size={14} />
            </button>
            <button
              onClick={addSpeaker}
              className="flex items-center gap-0.5 text-[10px] text-primary-600 hover:text-primary-800"
            >
              <Plus size={12} /> Speaker
            </button>
          </div>
        )}
      >
        {showSettings && (
          <div className="bg-gray-50 rounded-lg p-3 mb-3">
            <label className="text-xs text-gray-500 block mb-1">History warning threshold</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={36}
                value={thresholdMonths}
                onChange={e => setThresholdMonths(parseInt(e.target.value) || 12)}
                className="input-field w-16 text-sm"
              />
              <span className="text-xs text-gray-500">months</span>
            </div>
          </div>
        )}

        <div className="space-y-3">
          {program.speakers.map((speaker, i) => (
            <div key={i} className="flex items-start gap-2">
              <div className="flex-1 grid grid-cols-2 gap-2">
                <NameFieldWithHistory
                  label={`Speaker ${i + 1}`}
                  value={speaker.name}
                  onChange={v => setSpeaker(i, 'name', v)}
                  people={people}
                  history={history}
                  thresholdMonths={thresholdMonths}
                  type="spoke"
                  disabled={disabled}
                />
                <TextField
                  label="Topic"
                  value={speaker.topic}
                  onChange={v => setSpeaker(i, 'topic', v)}
                  disabled={disabled}
                  placeholder="Topic"
                />
              </div>
              {!disabled && program.speakers.length > 1 && (
                <button
                  onClick={() => removeSpeaker(i)}
                  className="text-gray-300 hover:text-red-500 transition-colors mt-6 flex-shrink-0"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))}

          <TextField label="Musical Number" value={program.musicalNumber} onChange={v => set('musicalNumber', v)} disabled={disabled} placeholder="Special musical number (optional)" />
          <TextField label="Intermediate Hymn" value={program.intermediateHymn} onChange={v => set('intermediateHymn', v)} disabled={disabled} placeholder="e.g., #146 Gently Raise the Sacred Strain" />
        </div>
      </ProgramSection>

      {/* Section: Closing */}
      <ProgramSection title="Closing" icon={Music}>
        <div className="grid grid-cols-2 gap-3">
          <TextField label="Closing Hymn" value={program.closingHymn} onChange={v => set('closingHymn', v)} disabled={disabled} placeholder="e.g., #304 Teach Me to Walk in the Light" />
          <NameFieldWithHistory
            label="Benediction"
            value={program.benediction}
            onChange={v => set('benediction', v)}
            people={people}
            history={history}
            thresholdMonths={thresholdMonths}
            type="prayed"
            disabled={disabled}
          />
        </div>
      </ProgramSection>

      {/* Notes */}
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Program Notes</label>
        <textarea
          value={program.notes}
          onChange={e => set('notes', e.target.value)}
          placeholder="Additional notes..."
          rows={2}
          className="input-field text-sm"
          disabled={disabled}
        />
      </div>
    </div>
  );
}

// ── Sub-Components ──────────────────────────────────────────

function ProgramSection({ title, icon: Icon, children, action }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
          <Icon size={12} className="text-primary-600" />
          {title}
        </h3>
        {action}
      </div>
      <div className="card">{children}</div>
    </div>
  );
}

function TextField({ label, value, onChange, disabled, placeholder, multiline }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      {multiline ? (
        <textarea
          value={value || ''}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder || ''}
          rows={2}
          className="input-field text-sm"
          disabled={disabled}
        />
      ) : (
        <input
          type="text"
          value={value || ''}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder || ''}
          className="input-field text-sm"
          disabled={disabled}
        />
      )}
    </div>
  );
}

function NameField({ label, value, onChange, people, disabled }) {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const ref = useRef(null);

  const suggestions = useMemo(() => {
    if (!value || value.length < 2) return [];
    const q = value.toLowerCase();
    return people.filter(p => p.name.toLowerCase().includes(q)).slice(0, 5);
  }, [value, people]);

  return (
    <div className="relative" ref={ref}>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      <input
        type="text"
        value={value || ''}
        onChange={e => { onChange(e.target.value); setShowSuggestions(true); }}
        onFocus={() => setShowSuggestions(true)}
        onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
        className="input-field text-sm"
        disabled={disabled}
      />
      {showSuggestions && suggestions.length > 0 && !disabled && (
        <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-32 overflow-y-auto">
          {suggestions.map(p => (
            <button
              key={p.id}
              onMouseDown={(e) => { e.preventDefault(); onChange(p.name); setShowSuggestions(false); }}
              className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-primary-50 transition-colors"
            >
              {p.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function NameFieldWithHistory({ label, value, onChange, people, history, thresholdMonths, type, disabled }) {
  const [showSuggestions, setShowSuggestions] = useState(false);

  const suggestions = useMemo(() => {
    if (!value || value.length < 2) return [];
    const q = value.toLowerCase();
    return people.filter(p => p.name.toLowerCase().includes(q)).slice(0, 5);
  }, [value, people]);

  const historyCheck = useMemo(() => {
    return checkPersonHistory(history, value, thresholdMonths);
  }, [history, value, thresholdMonths]);

  return (
    <div className="relative">
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      <input
        type="text"
        value={value || ''}
        onChange={e => { onChange(e.target.value); setShowSuggestions(true); }}
        onFocus={() => setShowSuggestions(true)}
        onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
        className="input-field text-sm"
        disabled={disabled}
      />

      {/* History badge */}
      {historyCheck && value?.trim() && (
        <div className={`flex items-center gap-1 mt-1 text-[10px] font-medium
          ${historyCheck.withinThreshold ? 'text-amber-600' : 'text-green-600'}`}>
          {historyCheck.withinThreshold
            ? <AlertTriangle size={10} />
            : <CheckCircle2 size={10} />
          }
          {historyCheck.label}
        </div>
      )}

      {/* Autocomplete suggestions */}
      {showSuggestions && suggestions.length > 0 && !disabled && (
        <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-32 overflow-y-auto">
          {suggestions.map(p => {
            const personHistory = checkPersonHistory(history, p.name, thresholdMonths);
            return (
              <button
                key={p.id}
                onMouseDown={(e) => { e.preventDefault(); onChange(p.name); setShowSuggestions(false); }}
                className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-primary-50 transition-colors flex items-center justify-between"
              >
                <span>{p.name}</span>
                {personHistory && (
                  <span className={`text-[10px] ${personHistory.withinThreshold ? 'text-amber-500' : 'text-green-500'}`}>
                    {personHistory.withinThreshold ? '!' : ''} {personHistory.label}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
