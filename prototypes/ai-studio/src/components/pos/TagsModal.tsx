/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * RestaurantOS — Foodics POS Tags Modal
 */

import React, { useState } from 'react';
import { X, Tag, Check, Plus } from 'lucide-react';

interface TagsModalProps {
  currentTags: string[];
  onSave: (tags: string[]) => void;
  onClose: () => void;
}

export const TagsModal: React.FC<TagsModalProps> = ({
  currentTags,
  onSave,
  onClose,
}) => {
  const [tags, setTags] = useState<string[]>(currentTags || []);
  const [customTag, setCustomTag] = useState('');

  const availableTags = [
    'VIP',
    'Loyalty Member',
    'Urgent',
    'Outdoor Terrace',
    'Birthday',
    'Corporate Account',
    'Special Request',
    'No Onion',
    'Gluten Free',
    'Delivery Priority',
  ];

  const toggleTag = (tag: string) => {
    setTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const addCustomTag = () => {
    if (customTag.trim() && !tags.includes(customTag.trim())) {
      setTags([...tags, customTag.trim()]);
      setCustomTag('');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-[#5A24CA] text-white">
          <div className="flex items-center gap-2">
            <Tag className="w-5 h-5" />
            <h3 className="font-bold text-lg">Order Tags</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Tag selection pills */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
              Select Applicable Tags
            </label>
            <div className="flex flex-wrap gap-2">
              {availableTags.map((tag) => {
                const isSelected = tags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTag(tag)}
                    className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-all flex items-center gap-1.5 ${
                      isSelected
                        ? 'bg-[#5A24CA] border-[#5A24CA] text-white shadow-sm'
                        : 'bg-slate-50 border-slate-200 text-slate-700 hover:border-slate-300'
                    }`}
                  >
                    {isSelected && <Check className="w-3.5 h-3.5" />}
                    {tag}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Add custom tag */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
              Custom Tag
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={customTag}
                onChange={(e) => setCustomTag(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCustomTag())}
                placeholder="Enter custom tag..."
                className="flex-1 text-sm px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:border-[#5A24CA] focus:bg-white outline-none text-slate-800"
              />
              <button
                type="button"
                onClick={addCustomTag}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold rounded-xl text-xs flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                Add
              </button>
            </div>
          </div>

          {/* Action buttons */}
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
                onSave(tags);
                onClose();
              }}
              className="flex-1 py-3 px-4 rounded-xl bg-[#5A24CA] hover:bg-[#4C1CB3] text-white font-bold text-sm transition-colors shadow-md shadow-[#5A24CA]/30 flex items-center justify-center gap-2"
            >
              <Check className="w-4 h-4" />
              Save Tags
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
