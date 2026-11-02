/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * RestaurantOS — Staff Directory & Shift Attendance
 */

import React from 'react';
import { useRestaurantStore } from '../../services/store';
import { translations, formatCurrency } from '../../lib/i18n';
import { Users, UserCheck, Shield, Clock, Phone } from 'lucide-react';
import { Employee } from '../../types';

export const EmployeesManager: React.FC = () => {
  const { state } = useRestaurantStore();
  const t = translations[state.language];

  const employees: Employee[] = [
    {
      id: 'emp-1',
      tenantId: state.tenant.id,
      branchId: state.activeBranchId,
      fullNameAr: 'أحمد مصطفى الدسوقي',
      fullNameEn: 'Ahmed Moustafa',
      jobTitleAr: 'كاشير رئيسي ومسؤول الخزينة',
      jobTitleEn: 'Head Cashier',
      role: 'CASHIER',
      salaryEGP: 7500,
      shiftStatus: 'ON_DUTY',
      phone: '+20 102 389 4410',
      hireDate: '2025-03-15',
    },
    {
      id: 'emp-2',
      tenantId: state.tenant.id,
      branchId: state.activeBranchId,
      fullNameAr: 'الشيف محمود الحلواني',
      fullNameEn: 'Mahmoud El-Halawani',
      jobTitleAr: 'رئيس الطهاة ومدير المطبخ',
      jobTitleEn: 'Executive Chef',
      role: 'CHEF',
      salaryEGP: 16500,
      shiftStatus: 'ON_DUTY',
      phone: '+20 114 778 9901',
      hireDate: '2024-06-01',
    },
    {
      id: 'emp-3',
      tenantId: state.tenant.id,
      branchId: state.activeBranchId,
      fullNameAr: 'كريم عادل الشناوي',
      fullNameEn: 'Kareem Adel',
      jobTitleAr: 'مدير عام الفرع والتشغيل',
      jobTitleEn: 'Branch General Manager',
      role: 'MANAGER',
      salaryEGP: 19000,
      shiftStatus: 'ON_DUTY',
      phone: '+20 120 551 2280',
      hireDate: '2024-01-10',
    },
    {
      id: 'emp-4',
      tenantId: state.tenant.id,
      branchId: state.activeBranchId,
      fullNameAr: 'سارة النجار',
      fullNameEn: 'Sara El-Naggar',
      jobTitleAr: 'محاسب مالي قانوني معتمد',
      jobTitleEn: 'Senior Financial Accountant',
      role: 'ACCOUNTANT',
      salaryEGP: 14500,
      shiftStatus: 'OFF_DUTY',
      phone: '+20 109 441 8830',
      hireDate: '2024-11-01',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-lg font-bold text-white">{t.hubEmployees}</h2>
        <p className="text-xs text-slate-400">
          {state.language === 'ar'
            ? 'سجل الموظفين، الأدوار والصلاحيات، الورديات، ومتابعة الحضور والرواتب'
            : 'Employee roster, roles & permissions, shift attendance, and payroll records'}
        </p>
      </div>

      {/* Employees Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {employees.map((emp) => (
          <div
            key={emp.id}
            className="p-5 bg-slate-900 border border-slate-800 rounded-2xl space-y-4 shadow-sm"
          >
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-sm font-bold text-white">
                  {state.language === 'ar' ? emp.fullNameAr : emp.fullNameEn}
                </h3>
                <span className="text-xs text-slate-400 block mt-0.5">
                  {state.language === 'ar' ? emp.jobTitleAr : emp.jobTitleEn}
                </span>
              </div>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  emp.shiftStatus === 'ON_DUTY'
                    ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                    : 'bg-slate-800 text-slate-400'
                }`}
              >
                {emp.shiftStatus === 'ON_DUTY'
                  ? state.language === 'ar'
                    ? 'على رأس العمل'
                    : 'On Duty'
                  : state.language === 'ar'
                  ? 'خارج الوردية'
                  : 'Off Duty'}
              </span>
            </div>

            <div className="pt-2 border-t border-slate-800 grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-slate-500 text-[10px] block">
                  {state.language === 'ar' ? 'الصلاحية والمسار' : 'Role'}
                </span>
                <span className="font-mono text-slate-300 font-semibold">{emp.role}</span>
              </div>
              <div>
                <span className="text-slate-500 text-[10px] block">
                  {state.language === 'ar' ? 'الراتب الشهري' : 'Monthly Salary'}
                </span>
                <span className="font-mono text-emerald-400 font-bold tabular-nums">
                  {formatCurrency(emp.salaryEGP, state.language)}
                </span>
              </div>
              <div className="col-span-2 pt-1 flex items-center justify-between text-[11px] text-slate-400">
                <span className="font-mono">{emp.phone}</span>
                <span>
                  {state.language === 'ar' ? 'تاريخ التعيين:' : 'Hired:'} {emp.hireDate}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
