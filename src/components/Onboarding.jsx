import { useState } from 'react';
import { useProfile, useUserCallings } from '../hooks/useDb';
import { getCallingList, getCallingConfig, generateCustomCallingKey } from '../data/callings';
import { ORGANIZATIONS } from '../data/callings';
import { addMeeting, addResponsibility, initializeOrgChartForRole, autoPopulateUserSlot } from '../db';
import { Plus, X } from 'lucide-react';

export default function Onboarding() {
  const { save: saveProfile } = useProfile();
  const { add: addCalling } = useUserCallings();
  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [selectedCallings, setSelectedCallings] = useState([]);
  const [customCallings, setCustomCallings] = useState([]); // [{ key, title }]
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customTitle, setCustomTitle] = useState('');
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);

  const callingList = getCallingList();

  // Group callings by organization
  const grouped = ORGANIZATIONS.map(org => ({
    ...org,
    callings: callingList.filter(c => c.organization === org.key),
  })).filter(g => g.callings.length > 0);

  // Filter by search
  const filteredGroups = search
    ? grouped.map(g => ({
        ...g,
        callings: g.callings.filter(c =>
          c.title.toLowerCase().includes(search.toLowerCase())
        ),
      })).filter(g => g.callings.length > 0)
    : grouped;

  function toggleCalling(key) {
    setSelectedCallings(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  }

  function addCustomCalling() {
    if (!customTitle.trim()) return;
    const key = generateCustomCallingKey();
    setCustomCallings(prev => [...prev, { key, title: customTitle.trim() }]);
    setCustomTitle('');
    setShowCustomInput(false);
  }

  function removeCustomCalling(key) {
    setCustomCallings(prev => prev.filter(c => c.key !== key));
  }

  const totalSelected = selectedCallings.length + customCallings.length;

  async function handleFinish() {
    if (!name.trim() || totalSelected === 0) return;
    setSaving(true);
    try {
      await saveProfile({ name: name.trim() });

      // Add predefined callings
      for (const key of selectedCallings) {
        await addCalling({ callingKey: key });
        const config = getCallingConfig(key);
        if (config) {
          // Seed meetings from calling config
          for (const m of config.meetings || []) {
            await addMeeting({
              callingId: key,
              name: m.name,
              cadence: m.cadence,
              agendaTemplate: m.agendaTemplate || [],
              handbook: m.handbook,
            });
          }
          // Seed responsibilities from calling config
          for (const r of config.responsibilities || []) {
            await addResponsibility({
              callingId: key,
              title: r.title,
              isCustom: false,
              handbook: r.handbook,
            });
          }
        }
      }

      // Add custom callings (no seeded data — blank slate)
      for (const cc of customCallings) {
        await addCalling({ callingKey: cc.key, customTitle: cc.title });
      }

      // Auto-initialize org chart for each predefined calling
      for (const key of selectedCallings) {
        await initializeOrgChartForRole(key);
        // Auto-populate user into their own calling slot
        await autoPopulateUserSlot(key, name.trim());
      }
      // Custom callings skip org chart init — user builds their own tree
    } catch (err) {
      console.error('Onboarding error:', err);
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-primary-700 text-white px-6 pt-12 pb-8">
        <h1 className="text-2xl font-bold">Organize Yourselves</h1>
        <p className="text-primary-200 text-sm mt-1">Prepare every needful thing</p>
      </div>

      <div className="flex-1 px-4 py-6 max-w-lg mx-auto w-full">
        {step === 1 && (
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">What's your name?</h2>
            <p className="text-sm text-gray-500 mb-4">This is just for your personal greeting.</p>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g., Brother Johnson"
              className="input-field text-lg"
              autoFocus
            />
            <button
              onClick={() => setStep(2)}
              disabled={!name.trim()}
              className="btn-primary w-full mt-6"
            >
              Continue
            </button>
          </div>
        )}

        {step === 2 && (
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Select your calling(s)</h2>
            <p className="text-sm text-gray-500 mb-4">
              Choose one or more, or create a custom calling. We'll set up responsibilities and meetings for predefined callings.
            </p>

            {/* Custom Calling Section */}
            <div className="mb-4">
              {customCallings.length > 0 && (
                <div className="space-y-1.5 mb-3">
                  {customCallings.map(cc => (
                    <div
                      key={cc.key}
                      className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm bg-emerald-50 text-emerald-700 border border-emerald-200 font-medium"
                    >
                      <span className="flex-1">{cc.title}</span>
                      <span className="text-[10px] text-emerald-500 font-normal">Custom</span>
                      <button
                        onClick={() => removeCustomCalling(cc.key)}
                        className="text-emerald-400 hover:text-red-500 transition-colors"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {showCustomInput ? (
                <div className="flex gap-2 mb-3">
                  <input
                    type="text"
                    value={customTitle}
                    onChange={e => setCustomTitle(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') addCustomCalling(); }}
                    placeholder="e.g., Activity Committee Chair"
                    className="input-field flex-1 text-sm"
                    autoFocus
                  />
                  <button
                    onClick={addCustomCalling}
                    disabled={!customTitle.trim()}
                    className="btn-primary text-sm px-3"
                  >
                    Add
                  </button>
                  <button
                    onClick={() => { setShowCustomInput(false); setCustomTitle(''); }}
                    className="btn-secondary text-sm px-2"
                  >
                    <X size={16} />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowCustomInput(true)}
                  className="w-full text-left px-3 py-2.5 rounded-lg text-sm border-2 border-dashed border-gray-300 text-gray-500 hover:border-primary-300 hover:text-primary-600 transition-colors flex items-center gap-2"
                >
                  <Plus size={16} />
                  Create Custom Calling
                </button>
              )}
            </div>

            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search callings..."
              className="input-field mb-4"
            />

            <div className="space-y-4 max-h-[50vh] overflow-y-auto">
              {filteredGroups.map(group => (
                <div key={group.key}>
                  <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                    {group.label}
                  </h3>
                  <div className="space-y-1">
                    {group.callings.map(calling => (
                      <button
                        key={calling.key}
                        onClick={() => toggleCalling(calling.key)}
                        className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors
                          ${selectedCallings.includes(calling.key)
                            ? 'bg-primary-50 text-primary-700 border border-primary-200 font-medium'
                            : 'bg-white border border-gray-200 text-gray-700 hover:border-gray-300'
                          }`}
                      >
                        {calling.title}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 flex gap-3">
              <button onClick={() => setStep(1)} className="btn-secondary flex-1">
                Back
              </button>
              <button
                onClick={handleFinish}
                disabled={totalSelected === 0 || saving}
                className="btn-primary flex-1"
              >
                {saving ? 'Setting up...' : `Get Started (${totalSelected})`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
