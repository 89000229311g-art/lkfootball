import { useState, useEffect } from 'react';
import { X, Plus, Trash2, ArrowUp, ArrowDown, Save, Loader2, RotateCcw } from 'lucide-react';
import { funnelAPI, hrFunnelAPI, settingsAPI } from '../../api/client';
import toast from 'react-hot-toast';

export default function FunnelSettingsModal({ onClose, onUpdate, variant = 'crm' }) {
  const [stages, setStages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  
  // New stage form
  const [newStage, setNewStage] = useState({
    title: '',
    key: '',
    color: 'bg-gray-500'
  });

  const colors = [
    'bg-blue-500', 'bg-yellow-500', 'bg-purple-500', 
    'bg-indigo-500', 'bg-green-500', 'bg-emerald-600', 
    'bg-red-500', 'bg-pink-500', 'bg-orange-500', 'bg-gray-500'
  ];

  const api = variant === 'hr' ? hrFunnelAPI : funnelAPI;
  const templatesKey = variant === 'hr' ? 'hr.message_templates' : 'crm.message_templates';

  useEffect(() => {
    fetchStages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const load = async () => {
      try {
        setTemplatesLoading(true);
        const res = await settingsAPI.getAll();
        const items = Array.isArray(res.data) ? res.data : [];
        const tplSetting = items.find((s) => s.key === templatesKey);
        if (tplSetting && tplSetting.value) {
          try {
            const parsed = JSON.parse(tplSetting.value);
            if (Array.isArray(parsed)) {
              setTemplates(parsed);
            }
          } catch {
            // ignore parse error
          }
        }
      } catch {
        // ignore load error
      } finally {
        setTemplatesLoading(false);
      }
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchStages = async () => {
    try {
      setLoading(true);
      const res = await api.getAll();
      if (res.data.length === 0) {
        // If empty, offer to init defaults
      }
      setStages(res.data);
    } finally {
      setLoading(false);
    }
  };

  const handleInitDefaults = async () => {
    try {
      setLoading(true);
      await api.initDefaults();
      fetchStages();
      toast.success('Этапы восстановлены');
      onUpdate();
    } catch (error) {
      console.error('Error init defaults:', error);
      toast.error('Ошибка инициализации');
    }
  };

  const handleCreate = async () => {
    if (!newStage.title || !newStage.key) {
      toast.error('Заполните название и ключ');
      return;
    }
    
    // Basic validation for key (only letters/numbers/dashes)
    if (!/^[a-z0-9-]+$/.test(newStage.key)) {
        toast.error('Ключ должен содержать только маленькие латинские буквы, цифры и дефис');
        return;
    }

    try {
      setSaving(true);
      const stageData = {
        ...newStage,
        order: stages.length
      };
      await api.create(stageData);
      setNewStage({ title: '', key: '', color: 'bg-gray-500' });
      fetchStages();
      toast.success('Этап добавлен');
      onUpdate();
    } catch (error) {
      console.error('Error creating stage:', error);
      toast.error('Ошибка создания (возможно, ключ уже занят)');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Удалить этот этап? Лиды на этом этапе могут потеряться или стать недоступными.')) return;
    
    try {
      await api.delete(id);
      fetchStages();
      toast.success('Этап удален');
      onUpdate();
    } catch (error) {
      console.error('Error deleting stage:', error);
      toast.error('Ошибка удаления (системные этапы нельзя удалить)');
    }
  };

  const handleMove = async (index, direction) => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === stages.length - 1) return;

    const newStages = [...stages];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    
    // Swap
    [newStages[index], newStages[targetIndex]] = [newStages[targetIndex], newStages[index]];
    setStages(newStages);

    // Save order
    try {
      const orderedIds = newStages.map(s => s.id);
      await api.reorder(orderedIds);
      onUpdate();
    } catch (error) {
      console.error('Error reordering:', error);
      toast.error('Ошибка сохранения порядка');
      fetchStages(); // Revert
    }
  };

  const handleUpdateStage = async (id, data) => {
    try {
      await api.update(id, data);
      toast.success('Обновлено');
      fetchStages();
      onUpdate();
    } catch {
      toast.error('Ошибка обновления');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[100] p-0 md:p-4 animate-fade-in">
      <div className="bg-[#1C1E24] rounded-none md:rounded-2xl border-0 md:border border-white/10 w-full max-w-2xl shadow-2xl flex flex-col h-full md:h-auto md:max-h-[90vh] animate-scale-in overflow-hidden">
        
        {/* Header */}
        <div className="p-5 border-b border-white/10 flex justify-between items-center shrink-0">
          <h2 className="text-xl font-bold text-white">Настройка воронки</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 custom-scrollbar space-y-6 pb-24 md:pb-6">
          
          {loading ? (
             <div className="flex justify-center py-12"><Loader2 className="animate-spin text-blue-500" size={32} /></div>
          ) : stages.length === 0 ? (
            <div className="text-center py-12">
                <p className="text-gray-400 mb-4">Этапы не найдены</p>
                <button 
                    onClick={handleInitDefaults}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg flex items-center gap-2 mx-auto"
                >
                    <RotateCcw size={16} /> Восстановить стандартные
                </button>
            </div>
          ) : (
            <div className="space-y-3">
              {stages.map((stage, index) => (
                <div key={stage.id} className="bg-white/5 border border-white/10 rounded-xl p-3 flex items-center gap-3">
                  {/* Drag handles / Arrows */}
                  <div className="flex flex-col gap-1">
                    <button 
                        disabled={index === 0}
                        onClick={() => handleMove(index, 'up')}
                        className="text-gray-500 hover:text-white disabled:opacity-30"
                    >
                        <ArrowUp size={14} />
                    </button>
                    <button 
                        disabled={index === stages.length - 1}
                        onClick={() => handleMove(index, 'down')}
                        className="text-gray-500 hover:text-white disabled:opacity-30"
                    >
                        <ArrowDown size={14} />
                    </button>
                  </div>

                  {/* Color Picker */}
                  <div className="dropdown relative group">
                    <div className={`w-8 h-8 rounded-lg ${stage.color} cursor-pointer border border-white/10`}></div>
                    <div className="absolute top-full left-0 mt-2 bg-[#252830] border border-white/10 rounded-xl p-2 grid grid-cols-5 gap-1 w-[160px] hidden group-hover:grid z-10 shadow-xl">
                        {colors.map(c => (
                            <button 
                                key={c} 
                                className={`w-6 h-6 rounded-md ${c} hover:scale-110 transition-transform`}
                                onClick={() => handleUpdateStage(stage.id, { color: c })}
                            />
                        ))}
                    </div>
                  </div>

                  {/* Info */}
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                        <input 
                            type="text" 
                            defaultValue={stage.title}
                            onBlur={(e) => {
                                if (e.target.value !== stage.title) {
                                    handleUpdateStage(stage.id, { title: e.target.value });
                                }
                            }}
                            className="bg-transparent border-none text-white font-medium focus:bg-white/5 rounded px-1 -ml-1 w-full"
                        />
                    </div>
                    <div className="text-xs text-gray-500 font-mono">key: {stage.key}</div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    {stage.is_system && (
                      <span className="text-[10px] text-gray-600 bg-white/5 px-2 py-0.5 rounded">
                        Системный
                      </span>
                    )}
                    <button 
                        onClick={() => handleDelete(stage.id)}
                        className="p-2 text-gray-500 hover:text-red-400 transition-colors"
                        title="Удалить этап"
                    >
                        <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Add New */}
          <div className="bg-white/5 border border-white/10 rounded-xl p-4 mt-6">
            <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-3">Добавить новый этап</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <input
                    type="text"
                    placeholder="Название (например: Архив)"
                    value={newStage.title}
                    onChange={(e) => setNewStage({...newStage, title: e.target.value})}
                    className="bg-[#1C1E24] border border-white/10 rounded-lg px-3 py-2 text-white text-sm"
                />
                <input
                    type="text"
                    placeholder="Ключ (например: archive)"
                    value={newStage.key}
                    onChange={(e) => setNewStage({...newStage, key: e.target.value})}
                    className="bg-[#1C1E24] border border-white/10 rounded-lg px-3 py-2 text-white text-sm font-mono"
                />
                <button
                    onClick={handleCreate}
                    disabled={saving}
                    className="bg-blue-600 hover:bg-blue-500 text-white rounded-lg px-4 py-2 text-sm font-bold flex items-center justify-center gap-2"
                >
                    {saving ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />}
                    Добавить
                </button>
            </div>
          </div>

          <div className="border-t border-white/10 mt-6 pt-6">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-sm font-bold text-gray-300 uppercase tracking-wider">Шаблоны сообщений</h3>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    const idx = templates.length + 1;
                    setTemplates([...templates, { key: `custom_${idx}`, title: `Шаблон ${idx}`, body: '' }]);
                  }}
                  className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg text-sm"
                >
                  Добавить шаблон
                </button>
                <button
                  onClick={async () => {
                    try {
                      setSaving(true);
                      await settingsAPI.update(templatesKey, {
                        value: JSON.stringify(templates),
                        description: variant === 'hr' ? 'HR message templates' : 'CRM message templates',
                      });
                      toast.success('Шаблоны сохранены');
                      onUpdate && onUpdate();
                    } catch (e) {
                      console.error('Error saving templates:', e);
                      toast.error('Ошибка сохранения шаблонов');
                    } finally {
                      setSaving(false);
                    }
                  }}
                  disabled={saving}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm flex items-center gap-2"
                >
                  {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
                  Сохранить
                </button>
              </div>
            </div>

            {templatesLoading ? (
              <div className="flex justify-center py-6"><Loader2 className="animate-spin text-blue-500" size={28} /></div>
            ) : templates.length === 0 ? (
              <div className="text-xs text-gray-500">
                Пока нет шаблонов. Добавьте первый, либо будут использованы стандартные в карточке лида.
              </div>
            ) : (
              <div className="space-y-3">
                {templates.map((tpl, index) => (
                  <div key={tpl.key + index} className="bg-white/5 border border-white/10 rounded-xl p-3">
                    <div className="flex items-start gap-3">
                      <div className="flex flex-col gap-1 pt-1">
                        <button
                          disabled={index === 0}
                          onClick={() => {
                            if (index === 0) return;
                            const next = [...templates];
                            [next[index - 1], next[index]] = [next[index], next[index - 1]];
                            setTemplates(next);
                          }}
                          className="text-gray-500 hover:text-white disabled:opacity-30"
                          title="Вверх"
                        >
                          <ArrowUp size={14} />
                        </button>
                        <button
                          disabled={index === templates.length - 1}
                          onClick={() => {
                            if (index === templates.length - 1) return;
                            const next = [...templates];
                            [next[index + 1], next[index]] = [next[index], next[index + 1]];
                            setTemplates(next);
                          }}
                          className="text-gray-500 hover:text-white disabled:opacity-30"
                          title="Вниз"
                        >
                          <ArrowDown size={14} />
                        </button>
                      </div>
                      <div className="flex-1 space-y-2">
                        <input
                          type="text"
                          value={tpl.title}
                          onChange={(e) => {
                            const next = [...templates];
                            next[index] = { ...next[index], title: e.target.value };
                            setTemplates(next);
                          }}
                          placeholder="Название шаблона"
                          className="w-full bg-[#1C1E24] border border-white/10 rounded-lg px-3 py-2 text-white text-sm"
                        />
                        <textarea
                          value={tpl.body}
                          onChange={(e) => {
                            const next = [...templates];
                            next[index] = { ...next[index], body: e.target.value };
                            setTemplates(next);
                          }}
                          placeholder="Текст сообщения"
                          className="w-full bg-[#1C1E24] border border-white/10 rounded-lg px-3 py-2 text-white text-sm min-h-[100px] resize-y"
                        />
                        <div className="text-[11px] text-gray-500 font-mono">key: {tpl.key}</div>
                      </div>
                      <button
                        onClick={() => {
                          const next = [...templates];
                          next.splice(index, 1);
                          setTemplates(next);
                        }}
                        className="p-2 text-gray-500 hover:text-red-400 transition-colors"
                        title="Удалить шаблон"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
