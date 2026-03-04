import { memo } from 'react';
import { Phone, User, Briefcase, Calendar, Trash2 } from 'lucide-react';

const CandidateCard = memo(({ candidate, onDelete, onClick }) => {
  const formatDate = (dateString) => {
    if (!dateString) return null;
    return new Date(dateString).toLocaleDateString();
  };

  const nextInterview = formatDate(candidate.next_interview_at);

  const roleLabel =
    candidate.target_role === 'coach'
      ? 'Тренер'
      : candidate.target_role === 'admin'
      ? 'Администратор'
      : candidate.target_role === 'accountant'
      ? 'Бухгалтер'
      : candidate.target_role || '';

  return (
    <div
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick(candidate);
      }}
      className="bg-[#252830] hover:bg-[#2E323A] p-3 rounded-xl border border-white/5 shadow-sm cursor-grab active:cursor-grabbing group transition-all relative hover:shadow-md hover:border-white/10"
    >
      <div className="flex justify-between items-start mb-2">
        <div className="font-medium text-white truncate pr-6">{candidate.full_name}</div>
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onDelete(candidate.id);
          }}
          className="absolute top-3 right-3 text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity p-1"
        >
          <Trash2 size={14} />
        </button>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2 text-xs text-emerald-400">
          <Briefcase size={12} />
          <span>{roleLabel}</span>
          {candidate.experience_years ? (
            <span className="text-gray-400">
              {candidate.experience_years} год(а) опыта
            </span>
          ) : null}
        </div>

        <div className="flex items-center gap-2 text-xs text-blue-400">
          <Phone size={12} />
          <a
            href={`tel:${candidate.phone}`}
            onClick={(e) => e.stopPropagation()}
            className="hover:underline"
          >
            {candidate.phone}
          </a>
        </div>

        {candidate.experience_summary ? (
          <div className="text-xs text-gray-500 line-clamp-2 mt-1">
            {candidate.experience_summary}
          </div>
        ) : null}

        {nextInterview && (
          <div className="flex items-center gap-1 text-[10px] text-yellow-400">
            <Calendar size={10} />
            <span>Следующее собеседование: {nextInterview}</span>
          </div>
        )}

        <div className="flex items-center justify-between pt-2 border-t border-white/5 text-[10px] text-gray-600">
          <div className="flex items-center gap-1">
            <User size={10} />
            <span>{candidate.resume_url ? 'Резюме прикреплено' : 'Резюме не прикреплено'}</span>
          </div>
        </div>
      </div>
    </div>
  );
});

export default CandidateCard;

