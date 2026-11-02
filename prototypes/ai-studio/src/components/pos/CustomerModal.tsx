/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * RestaurantOS — Foodics POS Add/Edit Customer Modal
 */

import React, { useState } from 'react';
import { X, UserPlus, Phone, User, Check } from 'lucide-react';

interface CustomerModalProps {
  currentCustomerName?: string;
  currentCustomerPhone?: string;
  onSave: (name: string, phone: string) => void;
  onClose: () => void;
}

export const CustomerModal: React.FC<CustomerModalProps> = ({
  currentCustomerName = '',
  currentCustomerPhone = '',
  onSave,
  onClose,
}) => {
  const [name, setName] = useState(currentCustomerName);
  const [phone, setPhone] = useState(currentCustomerPhone);

  const quickCustomers = [
    { name: 'Khalid Al-Otaibi', phone: '+966 50 123 4567' },
    { name: 'Fahad Al-Dosari', phone: '+966 55 987 6543' },
    { name: 'Sara Al-Ghamdi', phone: '+966 54 332 1100' },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-[#5A24CA] text-white">
          <div className="flex items-center gap-2">
            <UserPlus className="w-5 h-5" />
            <h3 className="font-bold text-lg">Add Customer</h3>
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
              Customer Full Name
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter customer name..."
                className="w-full text-sm pl-10 pr-4 py-3 bg-slate-50 border-2 border-slate-200 rounded-xl focus:border-[#5A24CA] focus:bg-white outline-none text-slate-800 transition-all"
                autoFocus
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
              Mobile Phone
            </label>
            <div className="relative">
              <Phone className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+966 5X XXX XXXX"
                className="w-full text-sm pl-10 pr-4 py-3 bg-slate-50 border-2 border-slate-200 rounded-xl focus:border-[#5A24CA] focus:bg-white outline-none text-slate-800 transition-all"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
              Recent Loyal Customers
            </label>
            <div className="space-y-1.5">
              {quickCustomers.map((c) => (
                <button
                  key={c.name}
                  type="button"
                  onClick={() => {
                    setName(c.name);
                    setPhone(c.phone);
                  }}
                  className="w-full p-2.5 rounded-xl border border-slate-100 hover:border-[#5A24CA] hover:bg-[#5A24CA]/5 flex items-center justify-between text-left transition-colors"
                >
                  <span className="text-xs font-bold text-slate-800">{c.name}</span>
                  <span className="text-xs font-mono text-slate-500">{c.phone}</span>
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
                onSave(name, phone);
                onClose();
              }}
              className="flex-1 py-3 px-4 rounded-xl bg-[#5A24CA] hover:bg-[#4C1CB3] text-white font-bold text-sm transition-colors shadow-md shadow-[#5A24CA]/30 flex items-center justify-center gap-2"
            >
              <Check className="w-4 h-4" />
              Save Customer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
