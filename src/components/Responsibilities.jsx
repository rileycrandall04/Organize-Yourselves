import { useState } from 'react';
import { useUserCallings, useResponsibilities } from '../hooks/useDb';
import { getCallingConfig } from '../data/callings';
import { CADENCE_LIST } from '../utils/constants';
import Modal from './shared/Modal';
import {
  ArrowLeft, ClipboardList, Plus, BookOpen, RotateCw, Trash2,
} from 'lucide-react';

export default function Responsibilities({ onBack }) {
  const { callings } = useUserCallings();
  const [activeCalling, setActiveCalling] = useState(null);

  // Default to first calling if only one
  const callingKey = activeCalling || (callings.length === 1 ? callings[0].callingKey : null);

  return (
    <div className="px-4 pt-6 pb-24 max-w-lg mx-auto">
      {/* Header */}
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-primary-600 mb-4">
        <ArrowLeft size={16} />
        Back
      </button>

      <div className="flex items-center gap-2 mb-5">
        <ClipboardList size={24} className="text-primary-700" />
        <h1 className="text-2xl font-bold text-gray-900">Responsibilities</h1>
      </div>

      {/* Calling selector (if multiple callings) */}
      {callings.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto pb-3 -mx-4 px-4 no-scrollbar mb-2">
          {callings.map(uc => {
            const config = getCallingConfig(uc.callingKey);
            const active = callingKey === uc.callingKey;
            return (
              <button
                key={uc.id}
                onClick={() => setActiveCalling(uc.callingKey)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors
                  ${active
                    ? 'bg-primary-700 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
              >
                {config?.title || uc.callingKey}
              </button>
            );
          })}
        </div>
      )}

      {callingKey ? (
        <ResponsibilityList callingKey={callingKey} />
      ) : (
        <div className="card text-center text-gray-400 py-12">
          <ClipboardList size={40} className="mx-auto mb-3 text-gray-300" />
          <p className="text-sm">Select a calling above to view responsibilities.</p>
        </div>
      )}
    </div>
  );
}

function ResponsibilityList({ callingKey }) {
  const { responsibilities, loading, add, update, remove } = useResponsibilities(callingKey);
  const [addOpen, setAddOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newRecurring, setNewRecurring] = useState(false);
  const [newCadence, setNewCadence] = useState('');

  // Sort: handbook ref first (alphabetical), then by title
  const sorted = [...responsibilities].sort((a, b) => {
    if (a.handbook && b.handbook) return a.handbook.localeCompare(b.handbook);
    if (a.handbook) return -1;
    if (b.handbook) return 1;
    return a.title.localeCompare(b.title);
  });

  async function handleAdd() {
    if (!newTitle.trim()) return;
    await add({
      callingId: callingKey,
      title: newTitle.trim(),
      isCustom: true,
      isRecurring: newRecurring,
      recurringCadence: newRecurring ? newCadence : undefined,
    });
    setNewTitle('');
    setNewRecurring(false);
    setNewCadence('');
    setAddOpen(false);
  }

  async function handleDelete(id) {
    await remove(id);
  }

  if (loading) {
    return (
      <div className="text-center py-12 text-gray-400">
        <div className="animate-spin w-6 h-6 border-2 border-primary-300 border-t-primary-700 rounded-full mx-auto mb-3" />
        <p className="text-sm">Loading...</p>
      </div>
    );
  }

  return (
    <div>
      {/* Add button */}
      <div className="flex justify-end mb-3">
        <button
          onClick={() => setAddOpen(true)}
          className="flex items-center gap-1 text-xs font-medium text-primary-600 hover:text-primary-800"
        >
          <Plus size={14} />
          Add Custom
        </button>
      </div>

      {sorted.length === 0 ? (
        <div className="card text-center text-gray-400 py-12">
          <ClipboardList size={40} className="mx-auto mb-3 text-gray-300" />
          <p className="text-sm">No responsibilities set up yet.</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {sorted.map(resp => (
            <div
              key={resp.id}
              className="card flex items-start gap-3 py-3"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-900">{resp.title}</p>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  {resp.isCustom && (
                    <span className="badge bg-blue-50 text-blue-600">Custom</span>
                  )}
                  {resp.handbook && (
                    <span className="text-[10px] text-gray-400">
                      <BookOpen size={10} className="inline mr-0.5" />
                      {resp.handbook}
                    </span>
                  )}
                  {resp.isRecurring && resp.recurringCadence && (
                    <span className="text-[10px] text-gray-400">
                      <RotateCw size={10} className="inline mr-0.5" />
                      {CADENCE_LIST.find(c => c.key === resp.recurringCadence)?.label || resp.recurringCadence}
                    </span>
                  )}
                </div>
              </div>
              {resp.isCustom && (
                <button
                  onClick={() => handleDelete(resp.id)}
                  className="text-gray-300 hover:text-red-500 transition-colors flex-shrink-0 mt-0.5"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add modal */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add Custom Responsibility" size="sm">
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
            <input
              type="text"
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              placeholder="e.g., Update new move-in list weekly"
              className="input-field"
              autoFocus
            />
          </div>
          <div>
            <button
              type="button"
              onClick={() => setNewRecurring(!newRecurring)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors text-sm w-full
                ${newRecurring ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}
            >
              <RotateCw size={16} />
              {newRecurring ? 'Recurring' : 'Make recurring'}
            </button>
            {newRecurring && (
              <select
                value={newCadence}
                onChange={e => setNewCadence(e.target.value)}
                className="input-field mt-2"
              >
                <option value="">Select cadence</option>
                {CADENCE_LIST.map(c => (
                  <option key={c.key} value={c.key}>{c.label}</option>
                ))}
              </select>
            )}
          </div>
          <div className="flex gap-3 pt-1">
            <button
              onClick={handleAdd}
              disabled={!newTitle.trim()}
              className="btn-primary flex-1"
            >
              Add
            </button>
            <button onClick={() => setAddOpen(false)} className="btn-secondary flex-1">
              Cancel
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
