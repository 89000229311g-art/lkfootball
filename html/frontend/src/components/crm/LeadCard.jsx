import { memo } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { Loader2, Calendar, Phone, Trash2, Clock, User } from 'lucide-react';

const LeadCard = memo(({ lead, onDelete, onClick }) => {
  const { t } = useLanguage();
  
  // Format date safely
  const formatDate = (dateString) => {
    if (!dateString) return null;
    return new Date(dateString).toLocaleDateString();
  };

  const nextContact = formatDate(lead.next_contact_date);
  const isOverdue = lead.next_contact_date && new Date(lead.next_contact_date) < new Date();

  return (
    <div
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick(lead);
      }}
      className="bg-[#252830] hover:bg-[#2E323A] p-3 rounded-xl border border-white/5 shadow-sm cursor-grab active:cursor-grabbing group transition-all relative hover:shadow-md hover:border-white/10"
    >
      <div className="flex justify-between items-start mb-2">
        <div className="font-medium text-white truncate pr-6">{lead.name}</div>
        <button 
          onClick={(e) => {
            e.stopPropagation();
            onDelete(lead.id);
          }}
          className="absolute top-3 right-3 text-gray-400 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity p-1"
        >
          <Trash2 size={14} />
        </button>
      </div>
      
      <div className="space-y-2">
        {/* Contact Info */}
        <div className="flex items-center gap-2 text-xs text-blue-400">
          <Phone size={12} /> 
          <a href={`tel:${lead.phone}`} onClick={(e) => e.stopPropagation()} className="hover:underline">
            {lead.phone}
          </a>
        </div>

        {/* Age & Source Tags */}
        <div className="flex flex-wrap gap-2">
          {lead.age && (
            <span className="bg-white/5 px-1.5 py-0.5 rounded text-[10px] text-gray-400 flex items-center gap-1">
              <User size={10} /> {lead.age} {t('years_old') || 'лет'}
            </span>
          )}
          {lead.source && (
            <span className="bg-blue-500/10 text-blue-300 px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider">
              {lead.source}
            </span>
          )}
        </div>
        
        {/* Next Contact */}
        {nextContact && (
          <div className={`flex items-center gap-1 text-[10px] ${isOverdue ? 'text-red-400' : 'text-yellow-500/80'}`}>
            <Clock size={10} />
            <span>
              {isOverdue ? 'Просрочено: ' : 'Связаться: '} 
              {nextContact}
            </span>
          </div>
        )}
        
        {/* Notes Preview */}
        {lead.notes && (
          <div className="text-xs text-gray-500 line-clamp-2 mt-1">
            {lead.notes}
          </div>
        )}
        
        {/* Footer */}
        <div className="flex items-center justify-between pt-2 border-t border-white/5 text-[10px] text-gray-600">
          <div className="flex items-center gap-1">
              <Calendar size={10} />
              {new Date(lead.created_at).toLocaleDateString()}
          </div>
        </div>
      </div>
    </div>
  );
});

export default LeadCard;
