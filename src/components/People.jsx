import { useState } from 'react';
import { usePeople } from '../hooks/useDb';
import Modal from './shared/Modal';
import {
  ArrowLeft, Users, Plus, Search, X, Phone, Mail, Trash2, Edit3,
} from 'lucide-react';

export default function People({ onBack }) {
  const { people, loading, add, update, remove } = usePeople();
  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editPerson, setEditPerson] = useState(null);

  // Form state
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const filtered = search.trim()
    ? people.filter(p => p.name.toLowerCase().includes(search.toLowerCase()))
    : people;

  function openAdd() {
    setEditPerson(null);
    setName('');
    setPhone('');
    setEmail('');
    setConfirmDelete(false);
    setFormOpen(true);
  }

  function openEdit(person) {
    setEditPerson(person);
    setName(person.name || '');
    setPhone(person.phone || '');
    setEmail(person.email || '');
    setConfirmDelete(false);
    setFormOpen(true);
  }

  async function handleSave() {
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      const data = {
        name: name.trim(),
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
      };
      if (editPerson) {
        await update(editPerson.id, data);
      } else {
        await add(data);
      }
      setFormOpen(false);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    await remove(editPerson.id);
    setFormOpen(false);
  }

  return (
    <div className="px-4 pt-6 pb-24 max-w-lg mx-auto">
      {/* Header */}
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-primary-600 mb-4">
        <ArrowLeft size={16} />
        Back
      </button>

      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <Users size={24} className="text-primary-700" />
          <h1 className="text-2xl font-bold text-gray-900">People</h1>
          {people.length > 0 && (
            <span className="text-sm text-gray-400">({people.length})</span>
          )}
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-1 text-sm font-medium text-primary-600 hover:text-primary-800"
        >
          <Plus size={16} />
          Add
        </button>
      </div>

      <p className="text-xs text-gray-400 mb-4">
        Contacts relevant to your callings. Not a full ward list — add people as needed.
      </p>

      {/* Search */}
      {people.length > 3 && (
        <div className="relative mb-4">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search people..."
            className="input-field pl-9 pr-8"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2">
              <X size={16} className="text-gray-400" />
            </button>
          )}
        </div>
      )}

      {/* People list */}
      {loading ? (
        <div className="text-center py-12 text-gray-400">
          <div className="animate-spin w-6 h-6 border-2 border-primary-300 border-t-primary-700 rounded-full mx-auto mb-3" />
          <p className="text-sm">Loading...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="card text-center text-gray-400 py-12">
          <Users size={40} className="mx-auto mb-3 text-gray-300" />
          <p className="text-sm">
            {search ? `No people matching "${search}"` : 'No contacts added yet.'}
          </p>
          {!search && (
            <button onClick={openAdd} className="btn-primary mt-3 text-sm">
              <Plus size={14} className="inline mr-1" />
              Add First Contact
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(person => (
            <div
              key={person.id}
              onClick={() => openEdit(person)}
              className="card flex items-center gap-3 cursor-pointer hover:border-primary-200 transition-colors"
            >
              <div className="w-8 h-8 rounded-full bg-primary-50 flex items-center justify-center flex-shrink-0">
                <span className="text-sm font-medium text-primary-700">
                  {person.name.charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900">{person.name}</p>
                <div className="flex items-center gap-3 mt-0.5">
                  {person.phone && (
                    <span className="text-[11px] text-gray-400 flex items-center gap-0.5">
                      <Phone size={9} />
                      {person.phone}
                    </span>
                  )}
                  {person.email && (
                    <span className="text-[11px] text-gray-400 flex items-center gap-0.5">
                      <Mail size={9} />
                      {person.email}
                    </span>
                  )}
                </div>
              </div>
              <Edit3 size={14} className="text-gray-300 flex-shrink-0" />
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit modal */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editPerson ? 'Edit Person' : 'Add Person'}
        size="sm"
      >
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Full name"
              className="input-field"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
            <input
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="(optional)"
              className="input-field"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="(optional)"
              className="input-field"
            />
          </div>
          <div className="flex gap-3 pt-1">
            <button onClick={handleSave} disabled={!name.trim() || saving} className="btn-primary flex-1">
              {saving ? 'Saving...' : editPerson ? 'Update' : 'Add'}
            </button>
            <button onClick={() => setFormOpen(false)} className="btn-secondary flex-1">
              Cancel
            </button>
          </div>
          {editPerson && (
            <button
              onClick={handleDelete}
              className={`w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors
                ${confirmDelete ? 'bg-red-600 text-white' : 'text-red-600 hover:bg-red-50'}`}
            >
              <Trash2 size={14} />
              {confirmDelete ? 'Tap again to delete' : 'Delete'}
            </button>
          )}
        </div>
      </Modal>
    </div>
  );
}
