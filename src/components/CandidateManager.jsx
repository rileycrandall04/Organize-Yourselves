import { useState } from 'react';
import Modal from './shared/Modal';
import { usePeople } from '../hooks/useDb';
import { addCandidate, declineCandidate, acceptCandidate } from '../db';
import { UserPlus, Check, X, ChevronDown, ChevronRight, Archive, User } from 'lucide-react';

export default function CandidateManager({ open, onClose, slot, onAccepted }) {
  const { people } = usePeople();
  const [showAddForm, setShowAddForm] = useState(false);
  const [showPrior, setShowPrior] = useState(false);
  const [name, setName] = useState('');
  const [personId, setPersonId] = useState(null);
  const [submittedBy, setSubmittedBy] = useState('');
  const [notes, setNotes] = useState('');
  const [showPeoplePicker, setShowPeoplePicker] = useState(false);

  if (!slot) return null;

  const candidates = slot.candidates || [];
  const priorSubmissions = slot.priorSubmissions || [];

  async function handleAdd() {
    if (!name.trim()) return;
    await addCandidate(slot.id, {
      name: name.trim(),
      personId: personId || undefined,
      submittedBy: submittedBy.trim() || undefined,
      notes: notes.trim() || undefined,
    });
    setName('');
    setPersonId(null);
    setSubmittedBy('');
    setNotes('');
    setShowAddForm(false);
  }

  async function handleDecline(index) {
    await declineCandidate(slot.id, index);
  }

  async function handleAccept(index) {
    const result = await acceptCandidate(slot.id, index);
    if (result && onAccepted) {
      onAccepted(result);
    }
    onClose();
  }

  function selectPerson(person) {
    setName(person.name);
    setPersonId(person.id);
    setShowPeoplePicker(false);
  }

  return (
    <Modal open={open} onClose={onClose} title={`Candidates — ${slot.roleName}`} size="lg">
      <div className="space-y-4">
        {/* Active Candidates */}
        <div>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Active Candidates ({candidates.length})
          </h3>

          {candidates.length === 0 ? (
            <p className="text-xs text-gray-400 italic py-2">No candidates submitted yet.</p>
          ) : (
            <div className="space-y-2">
              {candidates.map((c, i) => (
                <div key={i} className="card !p-3 flex items-start gap-3">
                  <User size={14} className="text-primary-500 mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">{c.name}</p>
                    {c.submittedBy && (
                      <p className="text-[10px] text-gray-400">
                        Submitted by {c.submittedBy} &middot; {new Date(c.submittedAt).toLocaleDateString()}
                      </p>
                    )}
                    {c.notes && (
                      <p className="text-[10px] text-gray-500 mt-1">{c.notes}</p>
                    )}
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <button
                      onClick={() => handleAccept(i)}
                      className="p-1.5 rounded-lg bg-green-50 text-green-600 hover:bg-green-100 transition-colors"
                      title="Accept"
                    >
                      <Check size={12} />
                    </button>
                    <button
                      onClick={() => handleDecline(i)}
                      className="p-1.5 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 transition-colors"
                      title="Decline"
                    >
                      <X size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Add Candidate Form */}
        {showAddForm ? (
          <div className="card !p-3 border-dashed space-y-3">
            <div>
              <label className="block text-[10px] font-medium text-gray-500 uppercase mb-1">Name</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={name}
                  onChange={e => { setName(e.target.value); setPersonId(null); }}
                  placeholder="Candidate name"
                  className="input-field flex-1 text-sm"
                  autoFocus
                />
                {people.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowPeoplePicker(!showPeoplePicker)}
                    className="btn-secondary text-xs px-2"
                  >
                    Pick
                  </button>
                )}
              </div>
              {showPeoplePicker && (
                <div className="mt-1 max-h-28 overflow-y-auto border border-gray-200 rounded-lg">
                  {people.map(p => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => selectPerson(p)}
                      className="w-full text-left px-3 py-1.5 text-xs hover:bg-primary-50 border-b border-gray-100 last:border-0"
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div>
              <label className="block text-[10px] font-medium text-gray-500 uppercase mb-1">Submitted By</label>
              <input
                type="text"
                value={submittedBy}
                onChange={e => setSubmittedBy(e.target.value)}
                placeholder="e.g., EQ President, Sister Thompson"
                className="input-field text-sm"
              />
            </div>
            <div>
              <label className="block text-[10px] font-medium text-gray-500 uppercase mb-1">Notes</label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Optional notes..."
                rows={2}
                className="input-field text-xs"
              />
            </div>
            <div className="flex gap-2">
              <button onClick={handleAdd} disabled={!name.trim()} className="btn-primary text-xs flex-1">
                Add Candidate
              </button>
              <button onClick={() => setShowAddForm(false)} className="btn-secondary text-xs">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowAddForm(true)}
            className="w-full flex items-center justify-center gap-1.5 py-2 text-xs font-medium text-primary-600 hover:bg-primary-50 rounded-lg border border-dashed border-primary-200 transition-colors"
          >
            <UserPlus size={12} />
            Add Candidate
          </button>
        )}

        {/* Prior Submissions (collapsed) */}
        {priorSubmissions.length > 0 && (
          <div>
            <button
              onClick={() => setShowPrior(!showPrior)}
              className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors"
            >
              {showPrior ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              <Archive size={12} />
              Prior Submissions ({priorSubmissions.length})
            </button>

            {showPrior && (
              <div className="mt-2 space-y-1.5">
                {priorSubmissions.map((ps, i) => (
                  <div key={i} className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 rounded-lg">
                    <User size={12} className="text-gray-300 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <span className="text-xs text-gray-500 line-through">{ps.name}</span>
                      {ps.submittedBy && (
                        <span className="text-[10px] text-gray-300 ml-1.5">
                          from {ps.submittedBy}
                        </span>
                      )}
                    </div>
                    <span className="text-[9px] text-red-400">
                      Declined {ps.declinedAt ? new Date(ps.declinedAt).toLocaleDateString() : ''}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
