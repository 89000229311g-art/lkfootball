import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { studentsAPI, usersAPI, groupsAPI, loggingAPI } from '../api/client';
import { User, Users, CreditCard, Check, ArrowRight, ArrowLeft, Loader2, Search } from 'lucide-react';
import CustomDatePicker from '../components/CustomDatePicker';
import { toast } from 'react-hot-toast';

export default function NewContractWizard() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  
  // Data State
  const [studentData, setStudentData] = useState({
    first_name: '',
    last_name: '',
    dob: '',
    status: 'active'
  });
  
  const [parentData, setParentData] = useState({
    mode: 'new', // 'new' | 'existing'
    existingUser: null,
    // New user fields
    phone: '',
    full_name: '',
    password: '', // Should generate or ask? Let's ask.
    role: 'parent'
  });
  
  const [groupData, setGroupData] = useState({
    selectedGroup: null,
    individualFee: null,
    reason: ''
  });

  // Resources
  const [groups, setGroups] = useState([]);
  const [foundParents, setFoundParents] = useState([]);
  const [parentSearch, setParentSearch] = useState('');

  useEffect(() => {
    groupsAPI.getAll().then(res => setGroups(res.data.data || []));
  }, []);

  // Search Parents
  useEffect(() => {
    if (parentData.mode === 'existing' && parentSearch.length > 2) {
      const timeout = setTimeout(() => {
        usersAPI.getAll({ search: parentSearch, role: 'parent' })
          .then(res => setFoundParents(res.data.data || []));
      }, 500);
      return () => clearTimeout(timeout);
    }
  }, [parentSearch, parentData.mode]);

  const handleNext = async () => {
    if (step === 1) {
        if (!studentData.first_name || !studentData.last_name || !studentData.dob) {
            loggingAPI.logFrontendError(
              'Student data incomplete in NewContractWizard',
              { step: 1 },
              null
            );
            return;
        }
    }
    if (step === 2) {
        if (parentData.mode === 'new' && (!parentData.full_name || !parentData.phone || !parentData.password)) {
            loggingAPI.logFrontendError(
              'Parent data incomplete in NewContractWizard',
              { step: 2, mode: 'new' },
              null
            );
            return;
        }
        if (parentData.mode === 'existing' && !parentData.existingUser) {
            loggingAPI.logFrontendError(
              'Parent not selected in NewContractWizard',
              { step: 2, mode: 'existing' },
              null
            );
            return;
        }
    }
    if (step === 3) {
        if (!groupData.selectedGroup) {
            loggingAPI.logFrontendError(
              'Group not selected in NewContractWizard',
              { step: 3 },
              null
            );
            return;
        }
    }

    if (step === 4) {
      await handleSubmit();
    } else {
      setStep(s => s + 1);
    }
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      let guardianUserId = null;
      let parentPhone = null;

      // 1. Handle Parent
      if (parentData.mode === 'existing') {
        if (!parentData.existingUser) {
           loggingAPI.logFrontendError(
             'Parent not selected in NewContractWizard submit',
             { mode: 'existing' },
             null
           );
           setLoading(false);
           return;
        }
        guardianUserId = parentData.existingUser.id;
        parentPhone = parentData.existingUser.phone;
      } else {
        // Create new user
        if (!parentData.phone || !parentData.full_name || !parentData.password) {
             loggingAPI.logFrontendError(
               'Parent data incomplete in NewContractWizard submit',
               { mode: 'new' },
               null
             );
             setLoading(false);
             return;
        }
        try {
            const newUser = await usersAPI.create({
                phone: parentData.phone,
                full_name: parentData.full_name,
                password: parentData.password,
                role: 'parent'
            });
            guardianUserId = newUser.data.id;
            parentPhone = newUser.data.phone;
        } catch (e) {
            loggingAPI.logFrontendError(
              'Error creating parent in NewContractWizard',
              null,
              e?.response?.data?.detail || e.message || null
            );
            setLoading(false);
            return;
        }
      }

      // 2. Create Student
      const newStudent = await studentsAPI.create({
        ...studentData,
        group_id: groupData.selectedGroup?.id,
        guardian_user_id: guardianUserId,
        parent_phone: parentPhone,
        relationship_type: 'Parent' // Default
      });

      // 3. Set Individual Fee if needed
      if (groupData.individualFee !== null) {
         await studentsAPI.setIndividualFee(newStudent.data.id, groupData.individualFee, groupData.reason);
      }

      toast.success("Контракт успешно создан!");
      navigate(`/students`); // Or stay?
    } catch (error) {
      console.error(error);
      loggingAPI.logFrontendError(
        'Error creating contract in NewContractWizard',
        null,
        error?.response?.data?.detail || error.message || null
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-8">
         <h1 className="text-2xl md:text-4xl font-bold mb-2">
           <span className="bg-gradient-to-r from-yellow-400 to-amber-500 bg-clip-text text-transparent">Мастер нового контракта</span>
         </h1>
         <div className="flex items-center gap-2 text-sm text-gray-400">
           <span className={step >= 1 ? "text-primary" : ""}>1. Ученик</span>
           <span>→</span>
           <span className={step >= 2 ? "text-primary" : ""}>2. Родитель</span>
           <span>→</span>
           <span className={step >= 3 ? "text-primary" : ""}>3. Группа</span>
           <span>→</span>
           <span className={step >= 4 ? "text-primary" : ""}>4. Тариф</span>
         </div>
      </div>

      <div className="bg-[#1C1E24] rounded-2xl p-8 border border-white/5 shadow-xl">
        {step === 1 && (
            <div className="space-y-4 animate-in fade-in slide-in-from-right-4">
                <h2 className="text-xl font-semibold text-white mb-4">Данные ученика</h2>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs text-gray-400 mb-1">Имя</label>
                        <input 
                          value={studentData.first_name} 
                          onChange={e => setStudentData({...studentData, first_name: e.target.value})}
                          className="w-full bg-black/20 border border-white/10 rounded-lg p-3 text-white focus:border-primary focus:outline-none"
                        />
                    </div>
                    <div>
                        <label className="block text-xs text-gray-400 mb-1">Фамилия</label>
                        <input 
                          value={studentData.last_name} 
                          onChange={e => setStudentData({...studentData, last_name: e.target.value})}
                          className="w-full bg-black/20 border border-white/10 rounded-lg p-3 text-white focus:border-primary focus:outline-none"
                        />
                    </div>
                    <div>
                        <label className="block text-xs text-gray-400 mb-1">Дата рождения</label>
                        <CustomDatePicker
                          selected={studentData.dob ? new Date(studentData.dob) : null} 
                          onChange={date => {
                            if (!date) {
                                setStudentData({...studentData, dob: ''});
                                return;
                            }
                            const year = date.getFullYear();
                            const month = String(date.getMonth() + 1).padStart(2, '0');
                            const day = String(date.getDate()).padStart(2, '0');
                            setStudentData({...studentData, dob: `${year}-${month}-${day}`});
                          }}
                          placeholder="Выберите дату рождения"
                          maxDate={new Date()}
                        />
                    </div>
                </div>
            </div>
        )}

        {step === 2 && (
             <div className="space-y-4 animate-in fade-in slide-in-from-right-4">
                <h2 className="text-xl font-semibold text-white mb-4">Данные родителя</h2>
                <div className="flex gap-4 mb-6">
                    <button 
                       onClick={() => setParentData({...parentData, mode: 'new'})}
                       className={`flex-1 p-4 rounded-xl border transition ${parentData.mode === 'new' ? 'bg-primary/20 border-primary text-primary' : 'bg-black/20 border-white/10 text-gray-400'}`}
                    >
                        Новый родитель
                    </button>
                    <button 
                       onClick={() => setParentData({...parentData, mode: 'existing'})}
                       className={`flex-1 p-4 rounded-xl border transition ${parentData.mode === 'existing' ? 'bg-primary/20 border-primary text-primary' : 'bg-black/20 border-white/10 text-gray-400'}`}
                    >
                        Существующий
                    </button>
                </div>

                {parentData.mode === 'new' ? (
                    <div className="space-y-4">
                        <input 
                          placeholder="ФИО Родителя"
                          value={parentData.full_name} 
                          onChange={e => setParentData({...parentData, full_name: e.target.value})}
                          className="w-full bg-black/20 border border-white/10 rounded-lg p-3 text-white focus:border-primary focus:outline-none"
                        />
                        <input 
                          placeholder="Телефон (Login)"
                          value={parentData.phone} 
                          onChange={e => setParentData({...parentData, phone: e.target.value})}
                          className="w-full bg-black/20 border border-white/10 rounded-lg p-3 text-white focus:border-primary focus:outline-none"
                        />
                        <input 
                          placeholder="Пароль"
                          type="password"
                          value={parentData.password} 
                          onChange={e => setParentData({...parentData, password: e.target.value})}
                          className="w-full bg-black/20 border border-white/10 rounded-lg p-3 text-white focus:border-primary focus:outline-none"
                        />
                    </div>
                ) : (
                    <div className="space-y-4">
                         <div className="relative">
                            <Search className="absolute left-3 top-3 text-gray-500" size={18} />
                            <input 
                              placeholder="Поиск родителя по имени или телефону..."
                              value={parentSearch}
                              onChange={e => setParentSearch(e.target.value)}
                              className="w-full pl-10 bg-black/20 border border-white/10 rounded-lg p-3 text-white focus:border-primary focus:outline-none"
                            />
                         </div>
                         <div className="max-h-60 overflow-y-auto space-y-2">
                             {foundParents.map(p => (
                                 <div 
                                   key={p.id}
                                   onClick={() => setParentData({...parentData, existingUser: p})}
                                   className={`p-3 rounded-lg cursor-pointer border ${parentData.existingUser?.id === p.id ? 'bg-primary/20 border-primary' : 'bg-black/10 border-white/5 hover:bg-black/20'}`}
                                 >
                                     <div className="font-medium text-white">{p.full_name}</div>
                                     <div className="text-xs text-gray-400">{p.phone}</div>
                                 </div>
                             ))}
                         </div>
                    </div>
                )}
             </div>
        )}

        {step === 3 && (
             <div className="space-y-4 animate-in fade-in slide-in-from-right-4">
                <h2 className="text-xl font-semibold text-white mb-4">Выбор группы</h2>
                <div className="grid md:grid-cols-2 gap-4 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
                    {groups.map(group => (
                        <div 
                          key={group.id}
                          onClick={() => setGroupData({...groupData, selectedGroup: group})}
                          className={`p-4 rounded-xl cursor-pointer border transition ${groupData.selectedGroup?.id === group.id ? 'bg-primary/20 border-primary' : 'bg-black/20 border-white/10 hover:border-white/30'}`}
                        >
                            <div className="flex justify-between mb-2">
                                <h3 className="font-bold text-white">{group.name}</h3>
                                <span className="text-primary font-bold">{group.monthly_fee} MDL</span>
                            </div>
                            <div className="text-sm text-gray-400 mb-2">
                                Тренер: {group.coach_name || 'Не назначен'}
                            </div>
                            <div className="text-xs text-gray-500">
                                Возраст: {group.age_range || 'Любой'} • Мест: {group.max_capacity}
                            </div>
                        </div>
                    ))}
                </div>
             </div>
        )}

        {step === 4 && (
             <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
                <h2 className="text-xl font-semibold text-white mb-4">Тариф и Подтверждение</h2>
                
                <div className="bg-black/20 p-4 rounded-xl border border-white/10">
                    <h3 className="text-gray-400 text-sm mb-4 uppercase">Итоговая стоимость</h3>
                    <div className="flex items-center gap-4">
                        <div className="text-4xl font-bold text-white">
                            {groupData.individualFee !== null ? groupData.individualFee : groupData.selectedGroup?.monthly_fee} <span className="text-xl text-gray-500">MDL/мес</span>
                        </div>
                        {groupData.individualFee !== null && (
                            <span className="bg-yellow-500/20 text-yellow-500 px-2 py-1 rounded text-xs border border-yellow-500/30">
                                Индивидуальный тариф
                            </span>
                        )}
                    </div>
                </div>

                <div className="space-y-4">
                     <label className="flex items-center gap-2 cursor-pointer">
                         <input 
                           type="checkbox" 
                           checked={groupData.individualFee !== null}
                           onChange={e => setGroupData({...groupData, individualFee: e.target.checked ? 0 : null})}
                           className="rounded border-white/20 bg-black/20"
                         />
                         <span className="text-white">Установить индивидуальную цену?</span>
                     </label>

                     {groupData.individualFee !== null && (
                         <div className="grid grid-cols-2 gap-4 pl-6 border-l-2 border-white/10">
                             <div>
                                 <label className="block text-xs text-gray-400 mb-1">Сумма (MDL)</label>
                                 <input 
                                   type="number"
                                   value={groupData.individualFee}
                                   onChange={e => setGroupData({...groupData, individualFee: Number(e.target.value)})}
                                   className="w-full bg-black/20 border border-white/10 rounded-lg p-3 text-white"
                                 />
                             </div>
                             <div>
                                 <label className="block text-xs text-gray-400 mb-1">Причина скидки</label>
                                 <input 
                                   placeholder="Например: Многодетная семья"
                                   value={groupData.reason}
                                   onChange={e => setGroupData({...groupData, reason: e.target.value})}
                                   className="w-full bg-black/20 border border-white/10 rounded-lg p-3 text-white"
                                 />
                             </div>
                         </div>
                     )}
                </div>

                <div className="bg-white/5 p-4 rounded-xl space-y-2 text-sm text-gray-300">
                    <div><span className="text-gray-500 w-24 inline-block">Ученик:</span> {studentData.first_name} {studentData.last_name}</div>
                    <div><span className="text-gray-500 w-24 inline-block">Родитель:</span> {parentData.mode === 'new' ? parentData.full_name : parentData.existingUser?.full_name} ({parentData.mode === 'new' ? parentData.phone : parentData.existingUser?.phone})</div>
                    <div><span className="text-gray-500 w-24 inline-block">Группа:</span> {groupData.selectedGroup?.name}</div>
                </div>
             </div>
        )}

        <div className="flex justify-between mt-8 pt-6 border-t border-white/10">
            <button 
              onClick={() => setStep(s => Math.max(1, s - 1))}
              disabled={step === 1 || loading}
              className="px-6 py-3 rounded-xl bg-white/5 text-white hover:bg-white/10 disabled:opacity-50 transition flex items-center gap-2"
            >
                <ArrowLeft size={18} /> Назад
            </button>
            <button 
              onClick={handleNext}
              disabled={loading}
              className="px-8 py-3 rounded-xl bg-primary text-black font-bold hover:bg-primary-light transition flex items-center gap-2"
            >
                {loading && <Loader2 size={18} className="animate-spin" />}
                {step === 4 ? 'Создать контракт' : 'Далее'} 
                {step !== 4 && <ArrowRight size={18} />}
            </button>
        </div>
      </div>
    </div>
  );
}
