/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * RestaurantOS — Foodics POS Void Order Modal
 */

import React, { useState } from 'react';
import { X, Ban, AlertTriangle } from 'lucide-react';

interface VoidModalProps {
  orderNumber: string;
  onConfirmVoid: (reason: string) => void;
  onClose: () => void;
}

export const VoidModal: React.FC<VoidModalProps> = ({
  orderNumber,
  onConfirmVoid,
  onClose,
}) => {
  const [reason, setReason] = useState('Customer changed mind');
  const [customReason, setCustomReason] = useState('');

  const voidReasons = [
    'Customer changed mind',
    'Incorrect items entered',
    'Kitchen shortage / unavailable item',
    'Customer left without ordering',
    'Manager test ticket',
    'Duplicate order',
  ];

  const handleConfirm = () => {
    const finalReason = reason === 'Other' ? customReason : reason;
    onConfirmVoid(finalReason || 'Order Voided');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-rose-600 text-white">
          <div className="flex items-center gap-2">
            <Ban className="w-5 h-5" />
            <h3 className="font-bold text-lg">Void Order #{orderNumber}</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div className="flex items-start gap-3 p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs">
            <AlertTriangle className="w-5 h-5 shrink-0 text-rose-600 mt-0.5" />
            <div>
              <p className="font-bold">Warning: Irreversible action</p>
              <p className="mt-0.5 text-rose-700">
                Voiding this order will release the table, cancel preparation, and log an audited void event in the manager journal.
              </p>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
              Select Void Reason
            </label>
            <div className="space-y-2">
              {voidReasons.map((r) => (
                <label
                  key={r}
                  className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                    reason === r
                      ? 'border-rose-500 bg-rose-50/50 text-slate-900 font-medium'
                      : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <input
                    type="radio"
                    name="voidReason"
                    checked={reason === r}
                    onChange={() => setReason(r)}
                    className="accent-rose-600"
                  />
                  <span className="text-sm">{r}</span>
                </label>
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
              onClick={handleConfirm}
              className="flex-1 py-3 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-sm transition-colors shadow-md shadow-rose-600/30 flex items-center justify-center gap-2"
            >
              <Ban className="w-4 h-4" />
              Confirm Void
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
