import { memo } from 'react';
import { Clock, Flag, User, Trash2 } from 'lucide-react';

const TaskCard = memo(({ task, users, onDelete, onClick }) => {
  const priorityColors = {
    high: 'text-red-400 bg-red-400/10',
    medium: 'text-yellow-400 bg-yellow-400/10',
    low: 'text-blue-400 bg-blue-400/10'
  };

  const priorityLabels = {
    high: 'Высокий',
    medium: 'Средний',
    low: 'Низкий'
  };

  return (
    <div
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick && onClick(task);
      }}
      className="bg-[#252830] hover:bg-[#2E323A] p-3 rounded-xl border border-white/5 shadow-sm cursor-grab active:cursor-grabbing group transition-all relative hover:shadow-md hover:border-white/10"
    >
      <div className="flex justify-between items-start mb-2">
        <div className="font-medium text-white break-words pr-6">
          {task.title}
        </div>
        {onDelete && (
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onDelete(task.id);
            }}
            className="absolute top-3 right-3 text-gray-500 hover:text-red-400 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity p-1 bg-[#252830] sm:bg-transparent rounded-full shadow-sm sm:shadow-none"
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Priority Badge */}
          <div className={`px-2 py-0.5 rounded text-[10px] uppercase font-medium tracking-wider flex items-center gap-1 ${priorityColors[task.priority] || priorityColors.medium}`}>
            <Flag size={10} />
            {priorityLabels[task.priority] || 'Нормальный'}
          </div>

          {/* Due Date */}
          {task.due_date && (
            <div className="flex items-center gap-1 text-[10px] text-gray-400 bg-white/5 px-2 py-0.5 rounded">
              <Clock size={10} />
              {new Date(task.due_date).toLocaleDateString()}
            </div>
          )}
        </div>

        {/* Description Preview */}
        {task.description && (
          <div className="text-xs text-gray-500 line-clamp-2">
            {task.description}
          </div>
        )}

        {/* Footer: Assignee */}
        <div className="flex items-center justify-between mt-2 pt-2 border-t border-white/5">
           <div className="flex items-center gap-1.5 text-xs text-gray-400">
             <div className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center text-white/50">
               <User size={12} />
             </div>
             <span className="truncate max-w-[100px]">
               {task.assignee_id 
                 ? (users?.find(u => u.id === task.assignee_id)?.full_name || users?.find(u => u.id === task.assignee_id)?.username || `User #${task.assignee_id}`)
                 : 'Не назначен'}
             </span>
           </div>
           <div className="text-[10px] text-gray-600">
             #{task.id}
           </div>
        </div>
      </div>
    </div>
  );
});

export default TaskCard;
