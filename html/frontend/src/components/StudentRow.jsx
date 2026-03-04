import React, { useMemo } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { getLocalizedName, transliterate } from '../utils/transliteration';
import { User, Phone, Calendar, Clock, AlertCircle, Edit2, CheckCircle, XCircle, MoreVertical, BriefcaseMedical, Banknote, Star } from 'lucide-react';
import UserAvatar from './UserAvatar';

const StudentRow = ({ 
  student, 
  index, 
  onClick, 
  onEdit, 
  onDelete, 
  onCardClick,
  isAdmin,
  isCoach,
  isParent,
  isSelected,
  toggleSelection,
  calculateAge,
  getParentInfo,
  getStatusColor,
  getStatusIcon,
  BASE_URL,
  group
}) => {
  const { t, language } = useLanguage();
  
  const parentsList = useMemo(() => getParentInfo ? getParentInfo(student) : [], [student, getParentInfo]);
  const studentAge = useMemo(() => calculateAge ? calculateAge(student.dob) : '', [student.dob, calculateAge]);
  const fullName = getLocalizedName(student.first_name, student.last_name, language);
  const isBirthday = student.dob && new Date(student.dob).getMonth() === new Date().getMonth() && new Date(student.dob).getDate() === new Date().getDate();

  // Check debts
  const hasDebt = student.payment_status?.has_debt;
  const debtAmount = student.payment_status?.total_pending || 0;
  const hasPastDebts = student.past_debts && student.past_debts.length > 0;
  const isDebtor = hasDebt || debtAmount > 0 || hasPastDebts;

  // Debt Tooltip
  const getDebtTooltip = () => {
    let parts = [];
    if (hasDebt || debtAmount > 0) parts.push(t('current_debt') || 'Текущий долг');
    if (hasPastDebts) {
        const months = student.past_debts.map(d => d.name).join(', ');
        parts.push(`${t('past_debts') || 'Долги'}: ${months}`);
    }
    return parts.join('. ') || (t('debt_tooltip') || 'Оплата не внесена');
  };

  // Medical Certificate Status
  const getMedStatus = () => {
    // If student has a file, check expiry
    if (student.medical_certificate_file) {
        if (!student.medical_certificate_expires) return 'valid'; 
    }
    
    if (!student.medical_certificate_expires) return 'missing';
    const expiry = new Date(student.medical_certificate_expires);
    const today = new Date();
    // Reset time part to compare dates only
    today.setHours(0,0,0,0);
    expiry.setHours(0,0,0,0);
    
    if (expiry < today) return 'expired';
    
    const warningDate = new Date();
    warningDate.setDate(today.getDate() + 30);
    warningDate.setHours(0,0,0,0);
    
    if (expiry < warningDate) return 'warning';
    return 'valid';
  };
  const medStatus = getMedStatus();

  return (
    <div 
      onClick={onClick}
      className={`group relative bg-[#1A1D24] hover:bg-[#20242C] border border-white/5 rounded-2xl p-4 transition-all duration-300 hover:shadow-lg hover:border-white/10 animate-fade-in`}
      style={{ animationDelay: `${Math.min(index * 30, 500)}ms` }}
    >
      <div className="flex items-center gap-4">
        {/* Checkbox */}
        {isAdmin && (
          <div className="mt-1" onClick={(e) => e.stopPropagation()}>
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => toggleSelection(student.id)}
              className="w-4 h-4 md:w-5 md:h-5 rounded border-white/20 bg-white/5 text-yellow-500 focus:ring-yellow-500 focus:ring-offset-0 cursor-pointer transition-all"
            />
          </div>
        )}

        {/* Avatar */}
        <div 
          onClick={(e) => {
            e.stopPropagation();
            if (isAdmin || isCoach) onCardClick(student.id);
          }}
          className="relative"
        >
           <UserAvatar 
             user={student} 
             size="w-12 h-12 md:w-14 md:h-14" 
             className={`transition-transform duration-300 group-hover:scale-105 ${
               isBirthday
                 ? 'ring-2 ring-pink-500 ring-offset-2 ring-offset-[#1A1D24] animate-pulse'
                 : isDebtor ? 'ring-2 ring-red-500/50' : 'ring-2 ring-yellow-500/20'
             }`}
           />
           
           {/* Birthday Cake */}
           {isBirthday && (
             <div className="absolute -top-3 -right-3 z-30 animate-bounce" title={t('birthday_today') || 'С Днем Рождения!'}>
               <span className="text-2xl drop-shadow-lg filter">🎂</span>
             </div>
           )}
           
           {/* Status Indicators overlaid on Avatar area */}
           {/* Debt Icon */}
           {isDebtor && (
             <div className="absolute -top-1 -right-1 w-4 h-4 md:w-5 md:h-5 bg-red-500 rounded-full flex items-center justify-center border-2 border-[#0F1117] shadow-sm" title={getDebtTooltip()}>
               <AlertCircle size={10} className="text-white md:w-3 md:h-3" />
             </div>
           )}
           
           {/* Medical Status Indicator */}
           {(medStatus === 'missing' || medStatus === 'expired') && (
             <div className="absolute -top-1 -left-1 w-4 h-4 md:w-5 md:h-5 bg-red-500 rounded-full flex items-center justify-center border-2 border-[#0F1117] shadow-sm z-10" title={medStatus === 'missing' ? t('certificate_missing') : t('certificate_expired')}>
               <BriefcaseMedical size={8} className="text-white md:w-[10px] md:h-[10px]" />
             </div>
           )}
           {medStatus === 'warning' && (
             <div className="absolute -top-1 -left-1 w-4 h-4 md:w-5 md:h-5 bg-yellow-500 rounded-full flex items-center justify-center border-2 border-[#0F1117] shadow-sm z-10" title={t('expiring_soon_stat')}>
               <BriefcaseMedical size={8} className="text-black md:w-[10px] md:h-[10px]" />
             </div>
           )}
           {medStatus === 'valid' && (
             <div className="absolute -top-1 -left-1 w-4 h-4 md:w-5 md:h-5 bg-green-500 rounded-full flex items-center justify-center border-2 border-[#0F1117] shadow-sm z-10" title={t('certificate_valid')}>
               <BriefcaseMedical size={8} className="text-white md:w-[10px] md:h-[10px]" />
             </div>
           )}

           {student.is_frozen && (
             <div className="absolute -bottom-1 -right-1 w-4 h-4 md:w-5 md:h-5 bg-blue-500 rounded-full flex items-center justify-center border-2 border-[#0F1117] shadow-sm" title={t('frozen_tooltip')}>
               <span className="text-white text-[8px] md:text-[10px]">❄️</span>
             </div>
           )}

           {/* Stars Badge */}
           {(student.stars > 0) && (
             <div className="absolute -bottom-1 -left-1 z-10" title={`${t('stars') || 'Звезды'}: ${student.stars}`}>
               {student.stars <= 3 ? (
                  // 1-3 Small Stars
                  <div className="flex -space-x-1">
                     {[...Array(student.stars)].map((_, i) => (
                        <div key={i} className="w-4 h-4 md:w-5 md:h-5 bg-yellow-500 rounded-full flex items-center justify-center border-2 border-[#0F1117] shadow-sm">
                           <Star size={8} className="text-black fill-black md:w-[10px] md:h-[10px]" />
                        </div>
                     ))}
                  </div>
               ) : (
                  // >3 Big Star with Number
                  <div className="w-5 h-5 md:w-6 md:h-6 bg-gradient-to-br from-yellow-400 to-amber-600 rounded-full flex items-center justify-center border-2 border-[#0F1117] shadow-lg shadow-yellow-500/20">
                     <span className="text-[10px] md:text-xs font-black text-black">{student.stars}</span>
                  </div>
               )}
             </div>
           )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5 md:mb-1 flex-wrap">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onCardClick(student.id);
                }}
                className="font-bold text-white text-base md:text-lg hover:text-yellow-400 transition-colors text-left truncate max-w-full leading-tight"
              >
                {fullName}
              </button>
              {studentAge && (
                <span className="text-[10px] md:text-sm text-white/40 font-medium px-1.5 py-0.5 rounded-full bg-white/5 whitespace-nowrap">
                  {studentAge} {t('years_old')}
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-x-3 md:gap-x-6 gap-y-1.5 text-xs md:text-sm text-white/50">
              {/* Balance / Payment Status */}
              {!isCoach && (() => {
                // Subscription Status
                const subBalance = student.monthly_balance !== undefined 
                  ? student.monthly_balance 
                  : (student.balance !== undefined ? student.balance : 0);
                
                // Use consistent isDebtor logic for color/icon
                // However, for the specific month pill, we should rely on subBalance directly if possible
                // to distinguish "Current Month Debt" vs "Past Debt".
                // If subBalance < 0, it's a debt for current period (or total if monthly_balance not used).
                const isCurrentMonthDebt = subBalance < 0;
                const isSubNegative = isCurrentMonthDebt; 

                const pastDebts = student.past_debts || [];
                
                // Total Debt Check
                const totalBalance = student.balance !== undefined ? student.balance : 0;
                const hasTotalDebt = totalBalance < 0;
                
                const showTotalDebt = hasTotalDebt && (
                    !isSubNegative || (Math.abs(totalBalance - subBalance) > 1)
                );

                // Month Name
                const currentMonthDate = new Date();
                const monthName = currentMonthDate.toLocaleString(language === 'ru' ? 'ru-RU' : (language === 'ro' ? 'ro-RO' : 'en-US'), { month: 'long' });
                const capitalizedMonth = monthName.charAt(0).toUpperCase() + monthName.slice(1);

                // Fee Calculation
                const monthlyFee = student.individual_fee ?? group?.monthly_fee ?? 0;
                
                // Amount to display
                // If paid (balance >= 0): Show Balance directly (usually 0 if exact payment, or positive if overpayment)
                // If debt (balance < 0): Show Balance (negative)
                // FIX: Do NOT add monthlyFee to the balance for display. Just show the balance.
                const displayAmount = subBalance;
                const displaySign = displayAmount > 0 ? '+' : '';

                return (
                  <div className="flex flex-wrap items-center gap-2">
                      {/* Subscription Pill (Current Month) */}
                      <div className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border ${
                        isSubNegative 
                          ? 'bg-red-500/10 border-red-500/20 text-red-400' 
                          : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                      }`}>
                        <Banknote size={12} />
                        <span className="font-bold">
                          {isSubNegative ? (
                             // Debt: Show negative amount
                             `${displayAmount} MDL`
                          ) : (
                             // Paid/Credit: Show positive balance or "Paid" if 0
                             displayAmount === 0 ? (t('paid') || 'Оплачено') : `${displaySign}${displayAmount} MDL`
                          )}
                        </span>
                        <span className="text-[10px] opacity-60 hidden md:inline">
                          {capitalizedMonth}
                        </span>
                      </div>

                      {/* Past Debts Badges */}
                      {pastDebts.map((debt, idx) => (
                        <div key={`debt-${idx}`} className="flex items-center gap-1 px-1.5 py-0.5 rounded-lg bg-red-500/20 text-red-400 border border-red-500/20" title={`Долг за ${debt.name} ${debt.year}`}>
                           <AlertCircle size={10} className="text-red-400" />
                           <span className="text-[10px] md:text-xs font-bold">
                             {debt.name}
                           </span>
                        </div>
                      ))}

                      {/* Total Debt Badge */}
                      {showTotalDebt && (
                          <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-lg bg-red-900/30 text-red-200 border border-red-500/30" title={t('total_debt') || 'Общий долг'}>
                              <AlertCircle size={10} className="text-red-400" />
                              <span className="text-[10px] md:text-xs font-bold">
                                {totalBalance > 0 ? '+' : ''}{(totalBalance || 0).toLocaleString()} {t('currency')}
                              </span>
                          </div>
                      )}
                  </div>
                );
              })()}

              {/* Attendance */}
              <div className="flex items-center gap-1" title={t('attended_label')}>
                <span className="w-1 md:w-1.5 h-1 md:h-1.5 rounded-full bg-blue-500"></span>
                <span>{t('attended_label')}: <span className="text-white/80">{student.attended_classes ?? 0}</span></span>
              </div>

              {/* DOB */}
              {student.dob && (
                <div className="flex items-center gap-1 hidden sm:flex">
                  <span className="w-1.5 h-1.5 rounded-full bg-purple-500"></span>
                  <span>{new Date(student.dob).toLocaleDateString(t('locale') || 'ru-RU')}</span>
                </div>
              )}
            </div>

            {/* Parents */}
            <div className="mt-1.5 space-y-0.5">
              {parentsList && parentsList.length > 0 ? (
                parentsList.map((parent, idx) => (
                  <div key={idx} className="flex flex-wrap sm:flex-nowrap items-center gap-x-2 gap-y-0.5 text-xs md:text-sm group/parent">
                    <span className="text-white/40 group-hover/parent:text-white/60 transition-colors truncate max-w-[150px] sm:max-w-none">
                      {transliterate(parent.full_name, language) || t('parent_default')}
                    </span>
                    <a 
                      href={`tel:${parent.phone}`} 
                      onClick={(e) => e.stopPropagation()}
                      className="text-yellow-500/70 hover:text-yellow-400 transition-colors flex items-center gap-1 bg-yellow-500/5 px-1.5 py-0.5 rounded hover:bg-yellow-500/10"
                      title={t('call_parent') || 'Позвонить'}
                    >
                      <Phone size={10} className="md:w-3 md:h-3" />
                      {parent.phone}
                    </a>
                  </div>
                ))
              ) : (
                <span className="text-[10px] md:text-xs text-white/20 italic">{t('no_contacts')}</span>
              )}
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className={`
          flex gap-2 justify-end w-full border-t border-white/5 pt-2 mt-2
          md:absolute md:right-4 md:top-4 md:mt-0 md:justify-start md:w-auto md:border-0 md:pt-0 
          md:opacity-0 md:group-hover:opacity-100 transition-opacity duration-200
        `}>
           <button 
             onClick={(e) => {
               e.stopPropagation();
               const parentPhone = student.parent_phone || (student.guardians?.[0]?.user?.phone);
               if (parentPhone) window.location.href = `tel:${parentPhone}`;
             }}
             className="p-2 md:p-2 bg-white/10 hover:bg-green-500/20 text-white/60 hover:text-green-400 rounded-lg backdrop-blur-sm transition-colors flex-1 md:flex-none flex justify-center"
             title={t('call_parent') || 'Позвонить'}
           >
             <Phone size={16} className="md:w-[18px] md:h-[18px]" />
           </button>
           <button 
             onClick={(e) => {
               e.stopPropagation();
               onCardClick(student.id);
             }}
             className="p-2 md:p-2 bg-white/10 hover:bg-yellow-500/20 text-white/60 hover:text-yellow-400 rounded-lg backdrop-blur-sm transition-colors flex-1 md:flex-none flex justify-center"
             title={t('open_profile')}
           >
             <MoreVertical size={16} className="md:w-[18px] md:h-[18px]" />
           </button>
        </div>
      </div>
  );
};

export default React.memo(StudentRow);
