import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { Loader2 } from 'lucide-react';
import LeadCard from './LeadCard';

export default function KanbanBoard({ leads, stages, loading, onStatusChange, onDelete, onLeadClick, renderCard }) {
  const onDragEnd = (result) => {
    const { destination, source, draggableId } = result;

    if (!destination) {
      return;
    }

    if (
      destination.droppableId === source.droppableId &&
      destination.index === source.index
    ) {
      return;
    }

    onStatusChange(draggableId, destination.droppableId);
  };

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <div className="flex flex-col sm:flex-row gap-6 sm:gap-4 sm:overflow-x-auto h-auto sm:h-full snap-x snap-mandatory px-1 pb-4 sm:pb-4 overflow-y-auto">
        {stages.map((stage) => {
          const stageLeads = leads.filter((l) => l.status === stage.key);
          
          return (
            <div
              key={stage.key}
              className="w-full sm:min-w-[280px] sm:w-[280px] bg-[#1C1E24] border border-white/10 rounded-2xl flex flex-col shrink-0 snap-center shadow-lg min-h-[500px] sm:h-full overflow-hidden"
            >
              {/* Header with gradient underline */}
              <div className="p-4 md:p-3 relative overflow-hidden group shrink-0 bg-[#252830] rounded-t-2xl">
                <div className={`absolute inset-x-0 bottom-0 h-[2px] bg-gradient-to-r from-transparent via-${stage.color.replace('bg-', '')} to-transparent opacity-70`}></div>
                
                <div className="flex items-center justify-between relative z-10">
                  <div className="font-bold text-white flex items-center gap-3 text-lg md:text-base">
                    <div className={`w-3 h-3 rounded-full ${stage.color} shadow-[0_0_8px_rgba(0,0,0,0.5)]`}></div>
                    <span className="tracking-wide">{stage.title}</span>
                  </div>
                  <span className="bg-black/30 px-3 py-1 rounded-lg text-sm md:text-xs text-gray-300 font-mono border border-white/5">
                    {stageLeads.length}
                  </span>
                </div>
              </div>

              <div className="flex-1 p-3 relative flex flex-col min-h-0 bg-[#15171B]">
                {loading && (
                  <div className="absolute inset-0 bg-[#1C1E24]/80 backdrop-blur-sm z-20 flex items-center justify-center rounded-b-2xl">
                    <Loader2 className="animate-spin text-blue-500 w-10 h-10" />
                  </div>
                )}
                
                <Droppable droppableId={stage.key}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={`flex-1 overflow-y-auto custom-scrollbar p-1 space-y-3 transition-all duration-300 ${
                        snapshot.isDraggingOver ? 'bg-white/5 rounded-xl ring-1 ring-white/10' : ''
                      }`}
                    >
                      {!loading && stageLeads.length === 0 && !snapshot.isDraggingOver ? (
                        <div className="flex flex-col items-center justify-center h-32 text-gray-500 text-sm border-2 border-dashed border-white/5 rounded-xl m-1 group hover:border-white/10 transition-colors">
                          <div className="mb-2 opacity-50 text-2xl">📭</div>
                          <span>Нет задач</span>
                        </div>
                      ) : (
                        stageLeads.map((lead, index) => (
                          <Draggable
                            key={lead.id}
                            draggableId={String(lead.id)}
                            index={index}
                            isDragDisabled={loading}
                          >
                            {(provided, snapshot) => (
                              <div
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                {...provided.dragHandleProps}
                                style={{
                                  ...provided.draggableProps.style,
                                  opacity: snapshot.isDragging ? 0.8 : 1,
                                  transform: snapshot.isDragging ? `${provided.draggableProps.style.transform} scale(1.02)` : provided.draggableProps.style.transform,
                                }}
                                className={`transition-transform ${snapshot.isDragging ? 'z-50' : ''}`}
                              >
                                {renderCard ? (
                                  renderCard(lead, {
                                    onDelete,
                                    onClick: onLeadClick,
                                  })
                                ) : (
                                  <LeadCard
                                    lead={lead}
                                    onDelete={onDelete}
                                    onClick={onLeadClick}
                                  />
                                )}
                              </div>
                            )}
                          </Draggable>
                        ))
                      )}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </div>
            </div>
          );
        })}
      </div>
    </DragDropContext>
  );
}
