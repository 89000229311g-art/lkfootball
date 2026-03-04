import React, { useState } from 'react';
import { motion as Motion } from 'framer-motion';
import { Download, Plus, Trash2, Layout } from 'lucide-react';
import { jsPDF } from 'jspdf';
import { downloadBlob } from '../../../utils/exportUtils';

const TacticBoard = ({ t }) => {
  const [players, setPlayers] = useState([
    { id: 1, x: 50, y: 50, label: 'GK', color: 'bg-yellow-500' },
    { id: 2, x: 150, y: 100, label: '2', color: 'bg-red-500' },
    { id: 3, x: 150, y: 200, label: '3', color: 'bg-red-500' },
  ]);

  const addPlayer = () => {
    const id = Math.max(0, ...players.map(p => p.id)) + 1;
    setPlayers([...players, { id, x: 100, y: 100, label: `${id}`, color: 'bg-blue-500' }]);
  };

  const exportPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(20);
    doc.text("Training Plan & Tactics", 20, 20);
    doc.setFontSize(12);
    doc.text("Tactical Setup:", 20, 40);
    players.forEach((p, i) => {
      doc.text(`Player ${p.label}: Position (${Math.round(p.x)}, ${Math.round(p.y)})`, 20, 50 + (i * 10));
    });
    const blob = doc.output('blob');
    downloadBlob(blob, "tactics.pdf");
  };

  return (
    <div className="bg-brand-gray/20 rounded-3xl p-4 md:p-6 border border-brand-gray/50 flex flex-col h-full">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg md:text-xl font-bold text-white flex items-center gap-2">
          <Layout className="text-brand-yellow" />
          {t('tacticBoard') || "Tactical Board"}
        </h3>
        <div className="flex gap-2">
          <button 
            onClick={addPlayer}
            className="p-2 bg-brand-gray/50 hover:bg-brand-gray text-white rounded-2xl border border-brand-gray transition-colors"
          >
            <Plus size={18} />
          </button>
          <button 
            onClick={exportPDF}
            className="p-2 bg-brand-yellow text-black rounded-2xl hover:bg-yellow-400 transition-colors"
          >
            <Download size={18} />
          </button>
        </div>
      </div>

      <div className="flex-1 relative bg-green-800/80 rounded-2xl overflow-hidden border border-green-700 min-h-[400px]">
        {/* Pitch Markings */}
        <div className="absolute inset-4 border-2 border-white/30 rounded-sm pointer-events-none"></div>
        <div className="absolute top-0 bottom-0 left-1/2 w-px bg-white/30 transform -translate-x-1/2 pointer-events-none"></div>
        <div className="absolute top-1/2 left-1/2 w-24 h-24 border-2 border-white/30 rounded-full transform -translate-x-1/2 -translate-y-1/2 pointer-events-none"></div>
        <div className="absolute top-1/2 left-0 w-16 h-32 border-2 border-white/30 transform -translate-y-1/2 border-l-0 pointer-events-none"></div>
        <div className="absolute top-1/2 right-0 w-16 h-32 border-2 border-white/30 transform -translate-y-1/2 border-r-0 pointer-events-none"></div>

        {/* Draggable Players */}
        {players.map((player) => (
          <Motion.div
            key={player.id}
            drag
            dragMomentum={false}
            dragConstraints={{ left: 0, right: 300, top: 0, bottom: 400 }} // Approximate constraints, better to use ref
            initial={{ x: player.x, y: player.y }}
            className={`absolute w-8 h-8 ${player.color} rounded-full flex items-center justify-center text-white text-xs font-bold shadow-lg cursor-move border-2 border-white/50`}
            whileHover={{ scale: 1.1 }}
            whileDrag={{ scale: 1.2, zIndex: 10 }}
          >
            {player.label}
          </Motion.div>
        ))}
      </div>
      
      <p className="text-xs text-gray-500 mt-2 text-center">
        {t('dragInstructions') || "Drag players to position. Click + to add player."}
      </p>
    </div>
  );
};

export default TacticBoard;
