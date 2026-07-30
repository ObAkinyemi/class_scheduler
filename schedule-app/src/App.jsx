import React, { useState } from 'react';

// ============================================================================
// HELPER FUNCTIONS & LOGIC
// ============================================================================

/**
 * Converts a floating-point hour (e.g., 14.5 for 14:30) into an iCal UTC time string.
 * Example: 14.5 -> "T143000Z"
 */
const floatHourToTime = (hourFloat) => {
  const hours = Math.floor(hourFloat);
  const minutes = Math.round((hourFloat - hours) * 60);
  const paddedHours = String(hours).padStart(2, '0');
  const paddedMinutes = String(minutes).padStart(2, '0');
  return `T${paddedHours}${paddedMinutes}00Z`;
};

/**
 * Returns an array of [start_time, end_time] for periods 1-9 based on DST rules.
 */
const getPeriodTimes = (dateObj, dstBeginDate, dstEndDate, semester) => {
  let baseHour = 13.5; // Default MDT (7:30 AM MDT = 13:30 UTC)

  // Adjust base hour for Mountain Standard Time (MST = UTC-7) vs MDT (UTC-6)
  if (semester === 'fall' && dateObj >= dstEndDate) {
    baseHour = 14.5; // Fall back to MST after DST end
  } else if (semester === 'spring' && dateObj < dstBeginDate) {
    baseHour = 14.5; // Still in MST before DST begins in Spring
  }

  return [
    [floatHourToTime(baseHour), floatHourToTime(baseHour + 0.8833)],         // Period 1
    [floatHourToTime(baseHour + 1), floatHourToTime(baseHour + 1.8833)],     // Period 2
    [floatHourToTime(baseHour + 2), floatHourToTime(baseHour + 2.8833)],     // Period 3
    [floatHourToTime(baseHour + 3), floatHourToTime(baseHour + 3.8833)],     // Period 4
    [floatHourToTime(baseHour + 6), floatHourToTime(baseHour + 6.8833)],     // Period 5
    [floatHourToTime(baseHour + 7), floatHourToTime(baseHour + 7.8833)],     // Period 6
    [floatHourToTime(baseHour), floatHourToTime(baseHour + 1.8833)],         // Period 7 (Double 1&2)
    [floatHourToTime(baseHour + 2), floatHourToTime(baseHour + 3.8833)],     // Period 8 (Double 3&4)
    [floatHourToTime(baseHour + 6), floatHourToTime(baseHour + 7.8833)],     // Period 9 (Double 5&6)
  ];
};

/**
 * Formats a JavaScript Date object to YYYYMMDD string for iCal.
 */
const formatDateForICal = (dateObj) => {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
  const d = String(dateObj.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
};

// ============================================================================
// MAIN REACT COMPONENT
// ============================================================================

export default function ScheduleGeneratorApp() {
  // --- STATE MANAGEMENT ---
  const [semester, setSemester] = useState('fall');
  const [firstDay, setFirstDay] = useState('2026-08-06');
  const [dstChangeDate, setDstChangeDate] = useState('2026-11-01');
  const [generateMTDays, setGenerateMTDays] = useState(true);
  
  // Excluded dates (Days Off) stored as an array of YYYY-MM-DD strings
  const [daysOff, setDaysOff] = useState([
    '2026-09-07', '2026-09-11', '2026-09-18', '2026-10-12',
    '2026-11-11', '2026-11-24', '2026-11-25', '2026-11-26',
    '2026-11-27', '2026-11-28', '2026-11-29', '2026-11-30'
  ]);
  const [newDayOff, setNewDayOff] = useState('');

  // Individual class list state
  const [classes, setClasses] = useState([
    { id: 1, name: '5J37 - ECON 361', period: '2', day: 'm', reminder: true, oneGo: false, goLetter: 'Z' },
    { id: 2, name: '4D22 - CE 300A', period: '6', day: 'm', reminder: true, oneGo: true, goLetter: 'A' },
  ]);

  // --- HANDLERS FOR UI UPDATES ---
  const handleAddDayOff = () => {
    if (newDayOff && !daysOff.includes(newDayOff)) {
      setDaysOff([...daysOff, newDayOff].sort());
      setNewDayOff('');
    }
  };

  const handleRemoveDayOff = (dateToRemove) => {
    setDaysOff(daysOff.filter((d) => d !== dateToRemove));
  };

  const handleAddClass = () => {
    const newId = classes.length > 0 ? Math.max(...classes.map((c) => c.id)) + 1 : 1;
    setClasses([
      ...classes,
      { id: newId, name: 'NEW CLASS', period: '1', day: 'm', reminder: true, oneGo: false, goLetter: 'Z' }
    ]);
  };

  const handleUpdateClass = (id, field, value) => {
    setClasses(classes.map((cls) => (cls.id === id ? { ...cls, [field]: value } : cls)));
  };

  const handleRemoveClass = (id) => {
    setClasses(classes.filter((cls) => cls.id !== id));
  };

  // --- ICAL GENERATION ENGINE ---
  const generateICS = () => {
    const start = new Date(`${firstDay}T00:00:00`);
    const dstDate = new Date(`${dstChangeDate}T00:00:00`);
    const dstBeginSpring = new Date('2026-03-08T00:00:00');

    const mdays = [];
    const tdays = [];
    let currentDay = new Date(start);
    let dayType = 'M';

    // Loop until we collect exactly 40 M-days and 40 T-days
    while (mdays.length < 40 || tdays.length < 40) {
      const dayOfWeek = currentDay.getDay(); // 0 = Sun, 6 = Sat
      const dateString = currentDay.toISOString().split('T')[0];

      // Check if Monday-Friday and NOT in daysOff array
      if (dayOfWeek !== 0 && dayOfWeek !== 6 && !daysOff.includes(dateString)) {
        if (dayType === 'M' && mdays.length < 40) {
          mdays.push(new Date(currentDay));
          dayType = 'T';
        } else if (dayType === 'T' && tdays.length < 40) {
          tdays.push(new Date(currentDay));
          dayType = 'M';
        }
      }
      currentDay.setDate(currentDay.getDate() + 1);
    }

    // Slice 40 days into GO blocks of 10 days each
    const getGos = (daysArray) => {
      if (semester === 'fall') {
        return {
          A: daysArray.slice(0, 10),
          B: daysArray.slice(10, 20),
          C: daysArray.slice(20, 30),
          D: daysArray.slice(30, 40),
        };
      } else {
        return {
          E: daysArray.slice(0, 10),
          F: daysArray.slice(10, 20),
          G: daysArray.slice(20, 30),
          H: daysArray.slice(30, 40),
        };
      }
    };

    const mGOs = getGos(mdays);
    const tGOs = getGos(tdays);

    // Build the ICS string
    let ics = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nCALSCALE:GREGORIAN\r\nMETHOD:PUBLISH\r\n\r\n';

    // 1. Optional M1-T40 All-Day Events
    if (generateMTDays) {
      const allDays = [];
      for (let i = 0; i < 40; i++) {
        allDays.push({ type: 'M', num: i + 1, date: mdays[i] });
        allDays.push({ type: 'T', num: i + 1, date: tdays[i] });
      }

      // Sort chronologically
      allDays.sort((a, b) => a.date - b.date);

      allDays.forEach((item) => {
        const startDateStr = formatDateForICal(item.date);
        const nextDay = new Date(item.date);
        nextDay.setDate(nextDay.getDate() + 1);
        const endDateStr = formatDateForICal(nextDay);

        ics += 'BEGIN:VEVENT\r\n';
        ics += `SUMMARY:${item.type}${item.num}\r\n`;
        ics += `DTSTART;VALUE=DATE:${startDateStr}\r\n`;
        ics += `DTEND;VALUE=DATE:${endDateStr}\r\n`;
        ics += 'TRANSP:TRANSPARENT\r\n';
        ics += 'X-MICROSOFT-CDO-BUSYSTATUS:FREE\r\n';
        ics += 'X-MICROSOFT-CDO-INTENDEDSTATUS:BUSY\r\n';
        ics += 'X-MICROSOFT-CDO-ALLDAYEVENT:TRUE\r\n';
        ics += 'END:VEVENT\r\n\r\n';
      });
    }

    // 2. Individual Class Events
    const appendClassEvent = (cls, dateObj) => {
      const dateStr = formatDateForICal(dateObj);
      const periods = getPeriodTimes(dateObj, dstBeginSpring, dstDate, semester);
      let periodIndex = parseInt(cls.period, 10) - 1;

      // Handle periods automatically as per original script
      if (periodIndex === 0 && cls.period === '7') periodIndex = 6;
      if (periodIndex === 2 && cls.period === '8') periodIndex = 7;
      if (periodIndex === 4 && cls.period === '9') periodIndex = 8;

      const [startUTC, endUTC] = periods[periodIndex];

      ics += 'BEGIN:VEVENT\r\n';
      ics += `SUMMARY:${cls.name}\r\n`;
      ics += `DTSTART:${dateStr}${startUTC}\r\n`;
      ics += `DTEND:${dateStr}${endUTC}\r\n`;

      if (cls.reminder) {
        ics += 'BEGIN:VALARM\r\n';
        ics += 'ACTION:DISPLAY\r\n';
        ics += 'DESCRIPTION:REMINDER\r\n';
        ics += 'TRIGGER:-PT15M\r\n';
        ics += 'END:VALARM\r\n';
      }

      ics += 'END:VEVENT\r\n\r\n';
    };

    classes.forEach((cls) => {
      const isM = cls.day.toLowerCase() === 'm';
      const targetDays = isM ? mdays : tdays;
      const targetGOs = isM ? mGOs : tGOs;

      if (!cls.oneGo) {
        // Full semester class
        targetDays.forEach((dateObj) => appendClassEvent(cls, dateObj));
      } else {
        // Single GO block class
        const goKey = cls.goLetter.toUpperCase();
        if (targetGOs[goKey]) {
          targetGOs[goKey].forEach((dateObj) => appendClassEvent(cls, dateObj));
        }
      }
    });

    ics += 'END:VCALENDAR';

    // Trigger browser file download
    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', 'schedule.ics');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="max-w-4xl mx-auto p-6 bg-gray-50 min-h-screen font-sans">
      <div className="bg-white p-6 rounded-lg shadow-md mb-6">
        <h1 className="text-2xl font-bold text-gray-800 mb-2">USAFA Academic Schedule Generator</h1>
        <p className="text-sm text-gray-600">
          Configure your academic calendar parameters below and export directly to Outlook or Apple Calendar.
        </p>
      </div>

      {/* SECTION 1: ACADEMIC CALENDAR RULES */}
      <div className="bg-white p-6 rounded-lg shadow-md mb-6">
        <h2 className="text-lg font-semibold text-gray-700 mb-4 border-b pb-2">1. Semester Parameters</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div>
            <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Semester</label>
            <select
              value={semester}
              onChange={(e) => setSemester(e.target.value)}
              className="w-full border rounded p-2 text-sm"
            >
              <option value="fall">Fall Semester (GOs A-D)</option>
              <option value="spring">Spring Semester (GOs E-H)</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-600 uppercase mb-1">First Day of Classes</label>
            <input
              type="date"
              value={firstDay}
              onChange={(e) => setFirstDay(e.target.value)}
              className="w-full border rounded p-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-600 uppercase mb-1">DST End/Start Date</label>
            <input
              type="date"
              value={dstChangeDate}
              onChange={(e) => setDstChangeDate(e.target.value)}
              className="w-full border rounded p-2 text-sm"
            />
          </div>
        </div>

        <div className="flex items-center mt-4">
          <input
            type="checkbox"
            id="mtReminder"
            checked={generateMTDays}
            onChange={(e) => setGenerateMTDays(e.target.checked)}
            className="w-4 h-4 text-blue-600 rounded"
          />
          <label htmlFor="mtReminder" className="ml-2 text-sm text-gray-700">
            Generate All-Day Banners for M1–T40 Academic Days
          </label>
        </div>
      </div>

      {/* SECTION 2: DAYS OFF / HOLIDAYS */}
      <div className="bg-white p-6 rounded-lg shadow-md mb-6">
        <h2 className="text-lg font-semibold text-gray-700 mb-4 border-b pb-2">2. Excluded Dates (Days Off)</h2>
        <div className="flex gap-2 mb-4">
          <input
            type="date"
            value={newDayOff}
            onChange={(e) => setNewDayOff(e.target.value)}
            className="border rounded p-2 text-sm flex-grow"
          />
          <button
            onClick={handleAddDayOff}
            className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700 font-semibold"
          >
            Add Date
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {daysOff.map((dateStr) => (
            <span key={dateStr} className="bg-gray-200 text-gray-800 text-xs px-3 py-1 rounded-full flex items-center">
              {dateStr}
              <button
                onClick={() => handleRemoveDayOff(dateStr)}
                className="ml-2 text-red-600 font-bold hover:text-red-800"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      </div>

      {/* SECTION 3: CLASS CONFIGURATION */}
      <div className="bg-white p-6 rounded-lg shadow-md mb-6">
        <div className="flex justify-between items-center mb-4 border-b pb-2">
          <h2 className="text-lg font-semibold text-gray-700">3. Class Schedule</h2>
          <button
            onClick={handleAddClass}
            className="bg-green-600 text-white px-3 py-1 rounded text-sm hover:bg-green-700 font-semibold"
          >
            + Add Class
          </button>
        </div>

        <div className="space-y-4">
          {classes.map((cls) => (
            <div key={cls.id} className="border p-4 rounded bg-gray-50 flex flex-wrap gap-3 items-center">
              <input
                type="text"
                value={cls.name}
                onChange={(e) => handleUpdateClass(cls.id, 'name', e.target.value)}
                placeholder="Course Name"
                className="border p-2 rounded text-sm flex-grow min-w-[180px]"
              />

              <select
                value={cls.period}
                onChange={(e) => handleUpdateClass(cls.id, 'period', e.target.value)}
                className="border p-2 rounded text-sm"
              >
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((p) => (
                  <option key={p} value={p}>
                    Period {p} {p >= 7 ? '(Double)' : ''}
                  </option>
                ))}
              </select>

              <select
                value={cls.day}
                onChange={(e) => handleUpdateClass(cls.id, 'day', e.target.value)}
                className="border p-2 rounded text-sm"
              >
                <option value="m">M-Day</option>
                <option value="t">T-Day</option>
              </select>

              <label className="flex items-center text-xs text-gray-700">
                <input
                  type="checkbox"
                  checked={cls.reminder}
                  onChange={(e) => handleUpdateClass(cls.id, 'reminder', e.target.checked)}
                  className="mr-1"
                />
                15m Alarm
              </label>

              <label className="flex items-center text-xs text-gray-700">
                <input
                  type="checkbox"
                  checked={cls.oneGo}
                  onChange={(e) => handleUpdateClass(cls.id, 'oneGo', e.target.checked)}
                  className="mr-1"
                />
                10-Lesson GO
              </label>

              {cls.oneGo && (
                <select
                  value={cls.goLetter}
                  onChange={(e) => handleUpdateClass(cls.id, 'goLetter', e.target.value)}
                  className="border p-1 rounded text-xs bg-yellow-50"
                >
                  {semester === 'fall'
                    ? ['A', 'B', 'C', 'D'].map((g) => <option key={g} value={g}>GO {g}</option>)
                    : ['E', 'F', 'G', 'H'].map((g) => <option key={g} value={g}>GO {g}</option>)}
                </select>
              )}

              <button
                onClick={() => handleRemoveClass(cls.id)}
                className="text-red-500 hover:text-red-700 text-sm font-semibold ml-auto"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* EXPORT ACTION */}
      <div className="text-center">
        <button
          onClick={generateICS}
          className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-8 rounded-lg shadow-lg text-lg transition duration-200"
        >
          Download Schedule (.ics)
        </button>
      </div>
    </div>
  );
}