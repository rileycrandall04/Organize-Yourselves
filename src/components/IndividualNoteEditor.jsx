import { useState, useRef, useCallback } from 'react';
import BlockEditor from './BlockEditor';
import { htmlToPlainText } from './shared/RichTextEditor';
import { addIndividualNote, updateIndividualNote } from '../db';
import { Save, X } from 'lucide-react';

/**
 * Rich-text note editor for Individual updates.
 * Follows JournalEntryEditor patterns: sync ref, lazy creation, auto-save.
 */
export default function IndividualNoteEditor({ individualId, note, onSaved, onCancel }) {
  const isEdit = !!note;

  // Initialize blocks synchronously (not in useEffect) so TipTap sees content on first render
  const [blocks] = useState(() => {
    if (note?.html) return [{ id: 'n1', type: 'richtext', html: note.html }];
    return [{ id: 'n1', type: 'richtext', html: '<p></p>' }];
  });

  const latestBlocksRef = useRef(blocks);
  const noteIdRef = useRef(note?.id || null);
  const creatingRef = useRef(null);

  // Sync ref on every change (critical: prevents stale reads on quick save)
  const handleChange = useCallback((newBlocks) => {
    latestBlocksRef.current = newBlocks;
  }, []);

  // Lazy creation: create note in DB only when content exists
  async function ensureNote(html) {
    if (noteIdRef.current) return noteIdRef.current;
    if (creatingRef.current) return creatingRef.current;

    const text = htmlToPlainText(html);
    if (!text.trim()) return null;

    creatingRef.current = (async () => {
      const id = await addIndividualNote({
        individualId,
        html,
        text,
      });
      noteIdRef.current = id;
      creatingRef.current = null;
      return id;
    })();
    return creatingRef.current;
  }

  // Save handler — called by auto-save and manual save
  const handleSave = useCallback(async (newBlocks) => {
    const currentBlocks = newBlocks || latestBlocksRef.current;
    const html = currentBlocks?.[0]?.html || '';
    const text = htmlToPlainText(html);

    if (noteIdRef.current) {
      await updateIndividualNote(noteIdRef.current, { html, text });
    } else if (text.trim()) {
      await ensureNote(html);
    }
  }, [individualId]);

  // Manual save button
  async function handleManualSave() {
    await handleSave();
    if (onSaved) onSaved();
  }

  return (
    <div className="border border-cyan-200 rounded-xl bg-cyan-50/30 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-cyan-100 bg-cyan-50/50">
        <span className="text-xs font-medium text-cyan-700">
          {isEdit ? 'Edit Update' : 'New Update'}
        </span>
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleManualSave}
            className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-white bg-cyan-600 rounded-lg hover:bg-cyan-700 transition-colors"
          >
            <Save size={12} />
            Save
          </button>
          {onCancel && (
            <button
              onClick={onCancel}
              className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* BlockEditor */}
      <div className="p-2">
        <BlockEditor
          blocks={blocks}
          onChange={handleChange}
          onSave={handleSave}
          mode="journal"
          individualId={individualId}
          autoSaveMs={5000}
        />
      </div>
    </div>
  );
}
