import { useState, useEffect, useCallback } from 'react';
import { eventsAPI, usersAPI } from '../api/client';
import { useLanguage } from '../context/LanguageContext';

export default function Booking() {
  const { t, language } = useLanguage();
  const [coaches, setCoaches] = useState([]);
  const [availableSlots, setAvailableSlots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCoach, setSelectedCoach] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [bookingForm, setBookingForm] = useState({
    student_name: '',
    phone: '+373',
    notes: ''
  });

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    try {
      const coachesRes = await usersAPI.getByRole('coach');
      const allUsers = coachesRes.data?.data || coachesRes.data || [];
      setCoaches(Array.isArray(allUsers) ? allUsers.filter(u => u.role?.toLowerCase() === 'coach') : []);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadAvailableSlots = useCallback(async () => {
    if (!selectedCoach || !selectedDate) return;
    
    try {
      const start = new Date(selectedDate);
      const end = new Date(start);
      end.setDate(start.getDate() + 1);
      
      const eventsRes = await eventsAPI.getAll();
      const events = eventsRes.data?.data || eventsRes.data || [];
      
      const slots = [];
      for (let hour = 9; hour < 18; hour += 2) {
        const slotTime = `${hour.toString().padStart(2, '0')}:00`;
        const slotEndTime = `${(hour + 2).toString().padStart(2, '0')}:00`;
        
        const isBooked = events.some(event => {
          const eventDate = (event.start_time || '').split('T')[0];
          const eventTime = new Date(event.start_time).toTimeString().slice(0, 5);
          return eventDate === selectedDate && eventTime === slotTime;
        });
        
        slots.push({ time: slotTime, end_time: slotEndTime, booked: isBooked });
      }
      
      setAvailableSlots(slots);
    } catch (error) {
      console.error('Error loading slots:', error);
    }
  }, [selectedCoach, selectedDate]);

  useEffect(() => { loadAvailableSlots(); }, [loadAvailableSlots]);

  const handleBook = async () => {
    if (!selectedSlot || !bookingForm.student_name.trim()) {
      alert(t('fill_all_fields'));
      return;
    }

    try {
      const startDateTime = `${selectedDate}T${selectedSlot.time}:00`;
      const endDateTime = `${selectedDate}T${selectedSlot.end_time}:00`;
      
      const eventData = {
        coach_id: parseInt(selectedCoach),
        student_name: bookingForm.student_name,
        parent_phone: bookingForm.phone,
        start_time: startDateTime,
        end_time: endDateTime,
        type: 'individual',
        location: 'Main Field',
        status: 'confirmed',
        notes: bookingForm.notes
      };

      await eventsAPI.create(eventData);
      alert(t('booking_confirmed'));
      
      setSelectedSlot(null);
      setBookingForm({ student_name: '', phone: '+373', notes: '' });
      loadAvailableSlots();
      
    } catch (error) {
      console.error('Error booking:', error);
      alert(error.response?.data?.detail || t('error_booking'));
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const localeMap = { ru: 'ru-RU', en: 'en-US', ro: 'ro-RO' };
    return date.toLocaleDateString(localeMap[language] || 'ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0F1117] flex items-center justify-center">
        <div className="text-yellow-500 text-lg">{t('loading')}</div>
      </div>
    );
  }

  const inputClasses = "w-full px-4 py-3 bg-[#0F1117] border border-white/10 rounded-xl text-white focus:outline-none focus:border-yellow-500/50 placeholder-gray-500";

  return (
    <div className="min-h-screen bg-[#0F1117] p-6 text-white">
      <div className="fixed inset-0 pointer-events-none bg-gradient-mesh opacity-50" />
      
      <div className="max-w-4xl mx-auto relative z-10">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl md:text-4xl font-bold">
            <span className="bg-gradient-to-r from-yellow-400 to-amber-500 bg-clip-text text-transparent">📅 {t('book_individual_training')}</span>
          </h1>
          <p className="text-gray-500 mt-2">{t('book_training_description')}</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Coach Selection */}
          <div className="bg-white/5 rounded-2xl border border-white/10 p-6">
            <h2 className="text-xl font-bold mb-4 text-white flex items-center gap-2">
              <span className="text-yellow-400">👤</span> {t('select_coach')}
            </h2>
            
            <div className="space-y-3">
              {coaches.length === 0 ? (
                <p className="text-gray-500 text-center py-4">Нет доступных тренеров</p>
              ) : (
                coaches.map(coach => (
                  <div 
                    key={coach.id}
                    onClick={() => setSelectedCoach(coach.id.toString())}
                    className={`p-4 rounded-xl border cursor-pointer transition ${
                      selectedCoach === coach.id.toString() 
                        ? 'border-yellow-500 bg-yellow-500/10' 
                        : 'border-white/10 bg-white/5 hover:bg-white/10'
                    }`}
                  >
                    <div className="font-semibold text-white">{coach.full_name}</div>
                    <div className="text-sm text-gray-400">{t('coach')}</div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Date Selection */}
          <div className="bg-white/5 rounded-2xl border border-white/10 p-6">
            <h2 className="text-xl font-bold mb-4 text-white flex items-center gap-2">
              <span className="text-yellow-400">📅</span> {t('select_date')}
            </h2>
            
            <input
              type="date"
              min={new Date().toISOString().split('T')[0]}
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className={inputClasses}
              disabled={!selectedCoach}
            />
            
            {selectedDate && (
              <div className="mt-4 text-sm text-gray-400">
                {formatDate(selectedDate)}
              </div>
            )}
          </div>
        </div>

        {/* Available Slots */}
        {selectedCoach && selectedDate && (
          <div className="mt-6 bg-white/5 rounded-2xl border border-white/10 p-6">
            <h2 className="text-xl font-bold mb-4 text-white flex items-center gap-2">
              <span className="text-yellow-400">⏰</span> {t('available_slots')}
            </h2>
            
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {availableSlots.map((slot, idx) => (
                <div
                  key={idx}
                  onClick={() => !slot.booked && setSelectedSlot(slot)}
                  className={`p-4 rounded-xl border text-center cursor-pointer transition ${
                    selectedSlot?.time === slot.time
                      ? 'border-yellow-500 bg-yellow-500/10'
                      : slot.booked
                        ? 'border-red-500/30 bg-red-500/10 opacity-50 cursor-not-allowed'
                        : 'border-white/10 bg-white/5 hover:bg-white/10'
                  }`}
                >
                  <div className="font-semibold text-white">
                    {slot.time} - {slot.end_time}
                  </div>
                  <div className={`text-sm mt-1 ${slot.booked ? 'text-red-400' : 'text-emerald-400'}`}>
                    {slot.booked ? '🔒 ' + t('booked') : '✅ ' + t('available')}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Booking Form */}
        {selectedSlot && (
          <div className="mt-6 bg-white/5 rounded-2xl border border-white/10 p-6">
            <h2 className="text-xl font-bold mb-4 text-white flex items-center gap-2">
              <span className="text-yellow-400">📝</span> {t('booking_details')}
            </h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-white/70 mb-2">
                  {t('student_name')} *
                </label>
                <input
                  type="text"
                  value={bookingForm.student_name}
                  onChange={(e) => setBookingForm({...bookingForm, student_name: e.target.value})}
                  className={inputClasses}
                  placeholder={t('enter_student_name')}
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-white/70 mb-2">
                  {t('phone')}
                </label>
                <input
                  type="tel"
                  value={bookingForm.phone}
                  onChange={(e) => setBookingForm({...bookingForm, phone: e.target.value})}
                  className={inputClasses}
                  placeholder="+373XXXXXXXX"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-white/70 mb-2">
                  {t('notes')}
                </label>
                <textarea
                  value={bookingForm.notes}
                  onChange={(e) => setBookingForm({...bookingForm, notes: e.target.value})}
                  className={inputClasses}
                  rows="3"
                  placeholder={t('notes_placeholder')}
                />
              </div>
              
              <div className="bg-yellow-500/10 border border-yellow-500/30 p-4 rounded-xl">
                <div className="font-medium text-yellow-400">
                  📅 {formatDate(selectedDate)}, {selectedSlot.time} - {selectedSlot.end_time}
                </div>
              </div>
              
              <button
                onClick={handleBook}
                className="w-full bg-gradient-to-r from-yellow-500 to-amber-500 hover:from-yellow-400 hover:to-amber-400 text-black py-3.5 rounded-xl font-bold shadow-lg shadow-yellow-500/25 transition-all"
              >
                ✅ {t('confirm_booking')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
