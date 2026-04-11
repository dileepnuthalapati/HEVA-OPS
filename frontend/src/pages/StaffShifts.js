import React, { useState, useEffect, useCallback } from 'react';
import { shiftAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Card } from '../components/ui/card';
import { Calendar, Clock } from 'lucide-react';

function formatTime(t) {
  if (!t) return '';
  const [h, m] = t.split(':');
  const hr = parseInt(h);
  return `${hr % 12 || 12}:${m} ${hr >= 12 ? 'PM' : 'AM'}`;
}

function getNext14Days() {
  const dates = [];
  const now = new Date();
  for (let i = 0; i < 14; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() + i);
    dates.push(d.toISOString().split('T')[0]);
  }
  return dates;
}

export default function StaffShifts() {
  const { user } = useAuth();
  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(true);

  const dates = getNext14Days();
  const startDate = dates[0];
  const endDate = dates[dates.length - 1];

  const loadShifts = useCallback(async () => {
    setLoading(true);
    try {
      const all = await shiftAPI.getAll(startDate, endDate);
      // Filter to only the current user's shifts
      const mine = all.filter(s => s.staff_id === user?.id || s.staff_name === user?.username);
      setShifts(mine);
    } catch {
      // If no shifts, just empty
    } finally { setLoading(false); }
  }, [startDate, endDate, user]);

  useEffect(() => { loadShifts(); }, [loadShifts]);

  // Group shifts by date
  const shiftsByDate = {};
  shifts.forEach(s => {
    if (!shiftsByDate[s.date]) shiftsByDate[s.date] = [];
    shiftsByDate[s.date].push(s);
  });

  const today = new Date().toISOString().split('T')[0];

  return (
    <div className="p-4 max-w-lg mx-auto" data-testid="staff-shifts-page">
      <h2 className="text-lg font-bold mb-1">My Shifts</h2>
      <p className="text-xs text-muted-foreground mb-4">Upcoming 2 weeks</p>

      {loading ? (
        <p className="text-sm text-center py-8 text-muted-foreground">Loading shifts...</p>
      ) : shifts.length === 0 ? (
        <Card className="p-8 text-center">
          <Calendar className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No upcoming shifts scheduled</p>
          <p className="text-xs text-muted-foreground mt-1">Check back later or contact your manager</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {dates.map(date => {
            const dayShifts = shiftsByDate[date];
            if (!dayShifts) return null;
            const isToday = date === today;
            const dayLabel = new Date(date + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

            return (
              <div key={date}>
                <div className={`text-xs font-semibold mb-1.5 ${isToday ? 'text-indigo-600' : 'text-slate-500'}`}>
                  {isToday ? 'Today' : dayLabel}
                </div>
                {dayShifts.map(s => (
                  <Card key={s.id} className={`p-3 mb-1.5 ${isToday ? 'border-indigo-200 bg-indigo-50/50' : ''}`} data-testid={`shift-card-${s.id}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${isToday ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                          <Clock className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold">{formatTime(s.start_time)} - {formatTime(s.end_time)}</p>
                          {s.position && <p className="text-[11px] text-muted-foreground">{s.position}</p>}
                        </div>
                      </div>
                      {s.published ? (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium">Confirmed</span>
                      ) : (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">Draft</span>
                      )}
                    </div>
                    {s.note && <p className="text-xs text-muted-foreground mt-1.5 pl-11">{s.note}</p>}
                  </Card>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
