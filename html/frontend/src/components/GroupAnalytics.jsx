import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { groupsAPI } from '../api/client';
import { Trophy, Users, Loader2 } from 'lucide-react';

const GroupAnalytics = ({ groupId: propGroupId, groups = [], t }) => {
  const { id: paramGroupId } = useParams();
  const initialGroupId = propGroupId || paramGroupId || (groups.length > 0 ? groups[0].id : null);
  
  const [selectedGroupId, setSelectedGroupId] = useState(initialGroupId);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (groups.length > 0 && !selectedGroupId) {
      setSelectedGroupId(groups[0].id);
    }
  }, [groups]);

  useEffect(() => {
    if (propGroupId) {
      setSelectedGroupId(propGroupId);
    }
  }, [propGroupId]);

  useEffect(() => {
    const fetchGroupData = async () => {
      if (!selectedGroupId) return;
      
      try {
        setLoading(true);
        const groupRes = await groupsAPI.getStudents(selectedGroupId);
        let studentList = [];
        if (Array.isArray(groupRes.data)) {
            studentList = groupRes.data;
        } else if (groupRes.data?.data && Array.isArray(groupRes.data.data)) {
            studentList = groupRes.data.data;
        }

        setStudents(studentList);
      } catch (error) {
        console.error("Error fetching group analytics:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchGroupData();
  }, [selectedGroupId]);

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="animate-spin text-yellow-500" /></div>;

  return (
    <div className="space-y-6">
      {/* Group Selector */}
      <div className="flex justify-between items-center bg-[#1C1E26] p-4 rounded-xl border border-white/10">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <Users className="text-yellow-500" />
          {t('group_students') || 'Students'}
        </h2>
        <select 
          value={selectedGroupId || ''} 
          onChange={(e) => setSelectedGroupId(Number(e.target.value))}
          className="bg-black/20 border border-white/10 rounded-lg px-4 py-2 text-white"
        >
          {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
      </div>

      {/* Simple Student List */}
      <div className="bg-[#1C1E26] rounded-xl border border-white/10 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="text-gray-400 text-xs uppercase border-b border-white/5">
                <th className="p-4">#</th>
                <th className="p-4">{t('student') || 'Student'}</th>
                <th className="p-4">{t('age') || 'Age'}</th>
                <th className="p-4">{t('status') || 'Status'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {students.map((student, idx) => (
                <tr key={student.id} className="hover:bg-white/5 transition-colors">
                  <td className="p-4 text-gray-500">{idx + 1}</td>
                  <td className="p-4 font-medium text-white">
                    {student.first_name} {student.last_name}
                  </td>
                  <td className="p-4 text-gray-300">{student.age}</td>
                  <td className="p-4">
                    <span className={`px-2 py-1 rounded text-xs ${
                      student.status === 'active' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                    }`}>
                      {student.status}
                    </span>
                  </td>
                </tr>
              ))}
              {students.length === 0 && (
                <tr>
                  <td colSpan="4" className="p-8 text-center text-gray-500">
                    {t('no_students') || 'No students found'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default GroupAnalytics;
