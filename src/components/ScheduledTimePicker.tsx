import React, { useState, useEffect, useId } from 'react';
import { Calendar, Clock } from 'lucide-react';
import { getCountdown, parseTargetTimestamp, parseDateParts, formatCountdown } from '../utils/timerUtils';

interface ScheduledTimePickerProps {
  value: string;
  onChange: (isoString: string) => void;
  label?: string;
  labelStyle?: React.CSSProperties;
  required?: boolean;
}

export const ScheduledTimePicker: React.FC<ScheduledTimePickerProps> = ({
  value,
  onChange,
  label = 'Schedule Time',
  labelStyle,
  required = true,
}) => {
  const pickerId = useId();

  // Internal state for Date, Hour, Minute, Second
  const [datePart, setDatePart] = useState<string>(() => parseDateParts(value).date);
  const [hourPart, setHourPart] = useState<string>(() => parseDateParts(value).hours);
  const [minPart, setMinPart] = useState<string>(() => parseDateParts(value).minutes);
  const [secPart, setSecPart] = useState<string>(() => parseDateParts(value).seconds);

  // Sync internal state when external value changes
  useEffect(() => {
    if (value) {
      const parts = parseDateParts(value);
      setDatePart(parts.date);
      setHourPart(parts.hours);
      setMinPart(parts.minutes);
      setSecPart(parts.seconds);
    }
  }, [value]);

  // Compute live countdown preview - ticks downwards in real time every second
  const [countdownTimer, setCountdownTimer] = useState<string>('00d : 00h : 00m : 00s');

  useEffect(() => {
    const updateCountdown = () => {
      const iso = `${datePart}T${hourPart.padStart(2, '0')}:${minPart.padStart(2, '0')}:${secPart.padStart(2, '0')}`;
      const targetMs = parseTargetTimestamp(iso);
      const res = getCountdown(targetMs);
      setCountdownTimer(formatCountdown(res));
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [datePart, hourPart, minPart, secPart]);

  // Push updates to parent
  const emitChange = (d: string, h: string, m: string, s: string) => {
    const pad = (n: string | number) => n.toString().padStart(2, '0');
    const cleanD = d || parseDateParts().date;
    const cleanH = pad(Math.max(0, Math.min(23, parseInt(h || '0', 10))));
    const cleanM = pad(Math.max(0, Math.min(59, parseInt(m || '0', 10))));
    const cleanS = pad(Math.max(0, Math.min(59, parseInt(s || '0', 10))));

    const iso = `${cleanD}T${cleanH}:${cleanM}:${cleanS}`;
    onChange(iso);
  };

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newD = e.target.value;
    setDatePart(newD);
    emitChange(newD, hourPart, minPart, secPart);
  };

  const handleUnifiedTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value; // "HH:MM" or "HH:MM:SS"
    if (!val) return;
    const parts = val.split(':');
    const h = parts[0] || '00';
    const m = parts[1] || '00';
    const s = parts[2] || secPart || '00';
    setHourPart(h);
    setMinPart(m);
    setSecPart(s);
    emitChange(datePart, h, m, s);
  };

  const todayStr = new Date().toISOString().split('T')[0];
  const timeString = `${hourPart.padStart(2, '0')}:${minPart.padStart(2, '0')}:${secPart.padStart(2, '0')}`;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label htmlFor={`${pickerId}-date`} className="block text-xs font-black text-slate-900">
          <span style={labelStyle}>{label}</span>
          {required && <span className="text-rose-600 font-bold ml-0.5">*</span>}
        </label>
      </div>

      {/* Streamlined Input Row: Date Picker + Single Unified Time Row (Replaces 3 separate boxes H/M/S) */}
      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
        {/* Date Picker (sm:col-span-6) */}
        <div className="sm:col-span-6 relative">
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
            <Calendar className="w-4 h-4" />
          </div>
          <input
            id={`${pickerId}-date`}
            type="date"
            min={todayStr}
            required={required}
            value={datePart}
            onChange={handleDateChange}
            className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-slate-300 rounded-xl text-slate-900 outline-none focus:border-slate-500 font-semibold cursor-pointer shadow-2xs"
          />
        </div>

        {/* Streamlined Consolidated Time Input (sm:col-span-6) */}
        <div className="sm:col-span-6 relative flex items-center bg-white border border-slate-300 rounded-xl px-3 py-2 focus-within:border-slate-500 shadow-2xs">
          <Clock className="w-4 h-4 text-slate-400 shrink-0 mr-2 pointer-events-none" />
          <input
            id={`${pickerId}-time`}
            type="time"
            step="1"
            required={required}
            value={timeString}
            onChange={handleUnifiedTimeChange}
            className="w-full text-xs font-mono font-bold text-slate-900 outline-none bg-transparent cursor-pointer"
          />
        </div>
      </div>

      {/* Pure Centered Countdown Digits Display */}
      <div className="flex items-center justify-center bg-white border border-slate-200/90 px-3.5 py-2 rounded-xl shadow-2xs">
        <span className="text-xs sm:text-sm font-mono font-black text-slate-900 tracking-wider text-center">
          {countdownTimer}
        </span>
      </div>
    </div>
  );
};
