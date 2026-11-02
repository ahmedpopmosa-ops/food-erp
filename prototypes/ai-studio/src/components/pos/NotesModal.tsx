/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * RestaurantOS — Foodics POS Order Notes Modal
 */

import React, { useState } from 'react';
import { X, FileText, Check } from 'lucide-react';

interface NotesModalProps {
  currentNotes: string;
  onSave: (notes: string) => void;
  onClose: () => void;
}

export const NotesModal: React.FC<NotesModalProps> = ({
  currentNotes,
  onSave,
  onClose,
}) => {
  const [notes, setNotes] = useState(currentNotes || '');

  const quickPresets = [
    'Extra napkins',
    'No ice in drinks',
    'Serve all together',
    'Less spicy',
    'Gluten allergy alert',
    'Urgent order',
    'Pack for takeaway',
    'VIP Guest',
  ];

  const addPreset = (text: string) => {
    setNotes((prev) => (prev ? `${prev}, ${text}` : text));
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-[#5A24CA] text-white">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            <h3 className="font-bold text-lg">Order & Kitchen Notes</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
              Kitchen Instructions
            </label>
            <textarea
              rows={4}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Well done burgers, extra chili sauce on the side..."
              className="w-full text-sm p-3.5 bg-slate-50 border-2 border-slate-200 rounded-xl focus:border-[#5A24CA] focus:bg-white outline-none text-slate-800 transition-all resize-none"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
              Quick Tags / Presets
            </label>
            <div className="flex flex-wrap gap-1.5">
              {quickPresets.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => addPreset(preset)}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-[#5A24CA]/10 hover:border-[#5A24CA] hover:text-[#5A24CA] text-xs font-medium text-slate-700 transition-colors"
                >
                  + {preset}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 px-4 rounded-xl border border-slate-200 text-slate-700 font-semibold hover:bg-slate-50 transition-colors text-center text-sm"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                onSave(notes);
                onClose();
              }}
              className="flex-1 py-3 px-4 rounded-xl bg-[#5A24CA] hover:bg-[#4C1CB3] text-white font-bold text-sm transition-colors shadow-md shadow-[#5A24CA]/30 flex items-center justify-center gap-2"
            >
              <Check className="w-4 h-4" />
              Save Note
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
