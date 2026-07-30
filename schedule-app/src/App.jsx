import React, { useState } from 'react';
import { 
  Calendar, PartyPopper, Clock, Save, Brush, 
  BookOpen, Bell, Plus, Trash2, MapPin, 
  Download, AlertCircle, X, Hash, Settings 
} from 'lucide-react';

// ============================================================================
// ICAL TIME & DATE HELPERS
// ============================================================================

const floatHourToTime = (hourFloat) => {
  const hours = Math.floor(hourFloat);
  const minutes = Math.round((hourFloat - hours) * 60);
  return `T${String(hours).padStart(2, '0')}${String(minutes).padStart(2, '0')}00Z`;
};

const getPeriodTimes = (dateObj, dstBeginDate, dstEndDate, semester, isModifiedSoC = false) => {
  let baseHour = 13.5; // 7:30 AM MDT = 13:30 UTC
  if (semester === 'fall' && dateObj >= dstEndDate) baseHour = 14.5;
  else if (semester === 'spring' && dateObj < dstBeginDate) baseHour = 14.5;

  // Normal afternoon classes start 6 hours after 0730 (13:30 MDT).
  // On a Modified SoC day, afternoon classes start 1 hour earlier at 12:30 MDT (+5 hours).
  const p5Start = isModifiedSoC ? 5 : 6;
  const p6Start = isModifiedSoC ? 6 : 7;

  return [
    [floatHourToTime(baseHour), floatHourToTime(baseHour + 0.8833)],                       // P1: 0730 - 0823
    [floatHourToTime(baseHour + 1), floatHourToTime(baseHour + 1.8833)],                   // P2: 0830 - 0923
    [floatHourToTime(baseHour + 2), floatHourToTime(baseHour + 2.8833)],                   // P3: 0930 - 1023
    [floatHourToTime(baseHour + 3), floatHourToTime(baseHour + 3.8833)],                   // P4: 1030 - 1123
    [floatHourToTime(baseHour + p5Start), floatHourToTime(baseHour + p5Start + 0.8833)],   // P5: 1330 (or 1230) - 53m
    [floatHourToTime(baseHour + p6Start), floatHourToTime(baseHour + p6Start + 0.8833)],   // P6: 1430 (or 1330) - 53m
    [floatHourToTime(baseHour), floatHourToTime(baseHour + 1.8833)],                       // P7 (Double 1-2): 0730 - 0923
    [floatHourToTime(baseHour + 2), floatHourToTime(baseHour + 3.8833)],                   // P8 (Double 3-4): 0930 - 1123
    [floatHourToTime(baseHour + p5Start), floatHourToTime(baseHour + p6Start + 0.8833)],   // P9 (Double 5-6): 1330 (or 1230) - 1523 (or 1423)
  ];
};

const formatDateForICal = (dateObj) => {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
  const d = String(dateObj.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
};

// ============================================================================
// MAIN APPLICATION COMPONENT
// ============================================================================

export default function App() {

  // 1. ADD THIS HELPER RIGHT AT THE TOP OF App() (Not nested inside anything else)
  const getSavedData = (key, fallback) => {
    try {
      const saved = localStorage.getItem('usafa_schedule_data');
      if (!saved) return fallback;
      const parsed = JSON.parse(saved);
      return parsed[key] !== undefined ? parsed[key] : fallback;
    } catch (e) {
      return fallback;
    }
  };

  // --- INDEPENDENT SEMESTER & DATE PARAMETERS ---
  const [semester, setSemester] = useState(() => getSavedData('semester', 'fall'));
  const [firstDay, setFirstDay] = useState(() => getSavedData('firstDay', '2026-08-06'));
  const [dstChangeDate, setDstChangeDate] = useState(() => getSavedData('dstChangeDate', '2026-11-01'));
  const [generateMTDays, setGenerateMTDays] = useState(false);

  // --- MODULAR HOLIDAYS (DAYS OFF) & MODIFIED SOCs ---
  const [daysOff, setDaysOff] = useState(() => getSavedData('daysOff', [
    { name: "Labor Day", date: "2026-09-07" },
    { name: "Commandant Training Day", date: "2026-09-11" },
    { name: "Commandant Training Day", date: "2026-09-18" },
    { name: "Columbus Day", date: "2026-10-12" },
    { name: "Veterans Day", date: "2026-11-11" },
    { name: "Thanksgiving Break", date: "2026-11-24" },
    { name: "Thanksgiving Break", date: "2026-11-25" },
    { name: "Thanksgiving Break", date: "2026-11-26" },
    { name: "Thanksgiving Break", date: "2026-11-27" }
  ]));
  
  const [modifiedSocs, setModifiedSocs] = useState(() => getSavedData('modifiedSocs', [
    { name: "Modified SoC", date: "2026-09-25" },
    { name: "Modified SoC", date: "2026-10-16" }
  ]));

  // Modal visibility controls (Leave these alone!)
  const [activeModal, setActiveModal] = useState(null);
  const [newModalName, setNewModalName] = useState('');
  const [newModalDate, setNewModalDate] = useState('');

  // --- CLASS CREATION FORM STATE (Leave these alone!) ---
  const [courseName, setCourseName] = useState('');
  const [location, setLocation] = useState('');
  const [period, setPeriod] = useState('1');
  const [cycle, setCycle] = useState('Every Day (M & T)');
  const [reminder, setReminder] = useState(true);
  const [durationTab, setDurationTab] = useState('full');
  const [goGroup, setGoGroup] = useState('A');
  const [lessons, setLessons] = useState(10);
  const [athleticsToggle, setAthleticsToggle] = useState(false);

  // --- ADDED CLASSES LIST ---
  const [classes, setClasses] = useState(() => getSavedData('classes', [
    {
      id: 1,
      name: 'Econ 361',
      location: '5J37',
      period: '2',
      cycle: 'M-Day Only',
      reminder: true,
      duration: 'full',
      goGroup: null
    }
  ]));

  // --- FORM HANDLERS ---
  const handleSemesterChange = (newSem) => {
    setSemester(newSem);
    // Automatically switch default GO letter to match the selected semester
    setGoGroup(newSem === 'fall' ? 'A' : 'E');
  };

  const handleAddClass = (e) => {
    e.preventDefault();
    if (!courseName.trim()) return;

    // LOGIC: If it's a GO block, combine the M/T dropdown choice with the GO letter
    // Example output: "M-Day Only (GO A)" or "T-Day Only (GO E)"
    const formattedCycle = durationTab === 'go' 
      ? `${cycle} (GO ${goGroup})` 
      : cycle;

    const newClass = {
      id: Date.now(),
      name: courseName,
      location: location || 'TBD',
      period,
      cycle: formattedCycle, // <-- Now it will always contain 'M' if you picked M-Day!
      reminder,
      duration: durationTab,
      goGroup: durationTab === 'go' ? goGroup : null,
      lessons: durationTab === 'go' ? lessons : null,
      athletics: durationTab === 'go' ? athleticsToggle : false
    };

    // DEBUG PRINT: Watch the console to verify what you just created
    console.log("=== NEW CLASS ADDED ===", newClass);

    setClasses([newClass, ...classes]);
    setCourseName('');
    setLocation('');
  };

  const handleRemoveClass = (id) => {
    setClasses(classes.filter(c => c.id !== id));
  };

  const handleAddModalItem = () => {
    if (!newModalDate || !newModalName) return;
    const item = { name: newModalName, date: newModalDate };
    if (activeModal === 'holidays') setDaysOff([...daysOff, item].sort((a,b) => a.date.localeCompare(b.date)));
    if (activeModal === 'socs') setModifiedSocs([...modifiedSocs, item].sort((a,b) => a.date.localeCompare(b.date)));
    setNewModalName('');
    setNewModalDate('');
  };

  const handleRemoveModalItem = (dateToRemove) => {
    if (activeModal === 'holidays') setDaysOff(daysOff.filter(d => d.date !== dateToRemove));
    if (activeModal === 'socs') setModifiedSocs(modifiedSocs.filter(d => d.date !== dateToRemove));
  };

  // --- ICAL FILE ENGINE ---
  const generateICS = () => {
    const start = new Date(`${firstDay}T00:00:00`);
    const dstDate = new Date(`${dstChangeDate}T00:00:00`);
    const dstBeginSpring = new Date('2026-03-08T00:00:00');
    const excludedDatesString = daysOff.map(d => d.date);

    const mdays = [];
    const tdays = [];
    let currentDay = new Date(start);
    let dayType = 'M';

    // Loop until 40 M-days and 40 T-days are collected
    while (mdays.length < 41 || tdays.length < 41) {
      const dayOfWeek = currentDay.getDay();
      const dateStr = currentDay.toISOString().split('T')[0];

      if (dayOfWeek !== 0 && dayOfWeek !== 6 && !excludedDatesString.includes(dateStr)) {
        if (dayType === 'M' && mdays.length < 41) {
          mdays.push(new Date(currentDay));
          dayType = 'T';
        } else if (dayType === 'T' && tdays.length < 41) {
          tdays.push(new Date(currentDay));
          dayType = 'M';
        }
      }
      currentDay.setDate(currentDay.getDate() + 1);
    }

    const getGos = (arr) => semester === 'fall' 
      ? { A: arr.slice(0,10), B: arr.slice(10,20), C: arr.slice(20,30), D: arr.slice(30,41) }
      : { E: arr.slice(0,10), F: arr.slice(10,20), G: arr.slice(20,30), H: arr.slice(30,41) };

    const mGOs = getGos(mdays);
    const tGOs = getGos(tdays);

    let ics = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nCALSCALE:GREGORIAN\r\nMETHOD:PUBLISH\r\n\r\n';

    // Optional M1-T40 Day Banners
    if (generateMTDays) {
      const allDays = [];
      mdays.forEach((d, i) => allDays.push({ type: 'M', num: i + 1, date: d }));
      tdays.forEach((d, i) => allDays.push({ type: 'T', num: i + 1, date: d }));
      allDays.sort((a, b) => a.date - b.date);

      allDays.forEach(item => {
        const startStr = formatDateForICal(item.date);
        const next = new Date(item.date);
        next.setDate(next.getDate() + 1);
        const endStr = formatDateForICal(next);

        ics += 'BEGIN:VEVENT\r\n';
        ics += `SUMMARY:${item.type}${item.num}\r\n`;
        ics += `DTSTART;VALUE=DATE:${startStr}\r\n`;
        ics += `DTEND;VALUE=DATE:${endStr}\r\n`;
        ics += 'TRANSP:TRANSPARENT\r\n';
        ics += 'X-MICROSOFT-CDO-ALLDAYEVENT:TRUE\r\n';
        ics += 'END:VEVENT\r\n\r\n';
      });
    }

    // Classes
    // 1. Define appendEvent WITH (cls, dateObj) as its parameters
    const appendEvent = (cls, dateObj) => {
      const dateStr = formatDateForICal(dateObj);
      
      // Check if THIS specific dateObj is a Modified SoC day
      const dateIso = dateObj.toISOString().split('T')[0];
      const isModSoC = modifiedSocs.some(m => m.date === dateIso);

      // 2. Define periods HERE so it uses dateObj and isModSoC
      const periods = getPeriodTimes(dateObj, dstBeginSpring, dstDate, semester, isModSoC);

      // Map period numbers (1-9) to array indexes (0-8)
      let pIdx = parseInt(cls.period, 10) - 1;
      if (pIdx === 0 && cls.period === '7') pIdx = 6;
      if (pIdx === 2 && cls.period === '8') pIdx = 7;
      if (pIdx === 4 && cls.period === '9') pIdx = 8;

      // 3. USE periods right here to grab the UTC start and end times!
      const [sUTC, eUTC] = periods[pIdx];

      ics += 'BEGIN:VEVENT\r\n';
      ics += `SUMMARY:${cls.name} (${cls.location})\r\n`;
      ics += `DTSTART:${dateStr}${sUTC}\r\n`;
      ics += `DTEND:${dateStr}${eUTC}\r\n`;
      if (cls.reminder) {
        ics += 'BEGIN:VALARM\r\nACTION:DISPLAY\r\nDESCRIPTION:REMINDER\r\nTRIGGER:-PT15M\r\nEND:VALARM\r\n';
      }
      ics += 'END:VEVENT\r\n\r\n';
    };

    // 4. Loop through your classes and pass each date ('d') into appendEvent as 'dateObj'
    classes.forEach(cls => {
      const isM = cls.cycle.toLowerCase().includes('m');
      const targetDays = isM ? mdays : tdays;
      const targetGOs = isM ? mGOs : tGOs;

      if (cls.duration === 'full') {
        targetDays.forEach(d => appendEvent(cls, d));
      } else if (cls.goGroup && targetGOs[cls.goGroup]) {
        targetGOs[cls.goGroup].forEach(d => appendEvent(cls, d));
      }
    });

    ics += 'END:VCALENDAR';

    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', 'USAFA_Schedule.ics');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 font-sans pb-12">
      
      {/* HEADER NAVBAR */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-slate-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-900 text-white shadow-md">
              <Calendar className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-lg font-bold leading-none text-slate-900">USAFA Schedule Generator</h1>
              <div className="flex items-center space-x-2 mt-1 text-xs text-slate-500">
                <span className="font-semibold text-blue-900 uppercase">{semester} Semester</span>
                <span>•</span>
                <span>First Day: {firstDay}</span>
              </div>
            </div>
          </div>

          {/* ACTION BUTTONS (MODALS) */}
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setActiveModal('holidays')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-slate-300 rounded-md bg-white hover:bg-slate-50 shadow-xs"
            >
              <PartyPopper className="h-4 w-4 text-blue-600" /> Holidays
            </button>
            <button 
              onClick={() => setActiveModal('socs')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-slate-300 rounded-md bg-white hover:bg-slate-50 shadow-xs"
            >
              <Clock className="h-4 w-4 text-amber-600" /> Modified SoCs
            </button>
            <div className="h-6 w-px bg-slate-300 mx-1"></div>
            <button 
              onClick={() => {
                const dataToSave = {
                  semester,
                  firstDay,
                  dstChangeDate,
                  daysOff,
                  modifiedSocs,
                  classes
                };
                localStorage.setItem('usafa_schedule_data', JSON.stringify(dataToSave));
                alert("Schedule and calendar settings permanently saved to LocalStorage!");
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-slate-300 rounded-md bg-white hover:bg-slate-50 shadow-xs"
            >
              <Save className="h-4 w-4 text-slate-600" /> Save
            </button>
            <button 
              onClick={() => setClasses([])}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-slate-300 rounded-md bg-white hover:bg-red-50 hover:text-red-600 shadow-xs"
            >
              <Brush className="h-4 w-4" /> Clear
            </button>
          </div>
        </div>
      </header>

      {/* MAIN CONTAINER */}
      <main className="max-w-5xl mx-auto px-6 py-8 space-y-8">
        
        {/* ==================================================================== */}
        {/* CARD 0: INDEPENDENT SEMESTER & DATE CONFIGURATION                  */}
        {/* ==================================================================== */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <div className="border-b border-slate-100 pb-3 mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold flex items-center gap-2 text-slate-900">
                <Settings className="h-4 w-4 text-blue-900" /> 1. Semester Configuration
              </h2>
              <p className="text-xs text-slate-500">Set your term parameters independent of individual class schedules</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* SEMESTER SELECTOR */}
            <div>
              <label className="block text-xs font-bold uppercase text-slate-600 mb-1">Semester Selection</label>
              <select
                value={semester}
                onChange={(e) => handleSemesterChange(e.target.value)}
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm bg-white font-semibold text-blue-900 focus:outline-none focus:ring-2 focus:ring-blue-900"
              >
                <option value="fall">Fall Semester (GOs A – D)</option>
                <option value="spring">Spring Semester (GOs E – H)</option>
              </select>
            </div>

            {/* FIRST DAY OF CLASSES */}
            <div>
              <label className="block text-xs font-bold uppercase text-slate-600 mb-1">First Day of Classes</label>
              <input
                type="date"
                value={firstDay}
                onChange={(e) => setFirstDay(e.target.value)}
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-900"
              />
            </div>

            {/* DAYLIGHT SAVING TIME END/START DATE */}
            <div>
              <label className="block text-xs font-bold uppercase text-slate-600 mb-1">DST Change Date</label>
              <input
                type="date"
                value={dstChangeDate}
                onChange={(e) => setDstChangeDate(e.target.value)}
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-900"
              />
            </div>
          </div>
        </div>

        {/* ==================================================================== */}
        {/* CARD 1: ADD NEW CLASS                                                */}
        {/* ==================================================================== */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <div className="border-b border-slate-100 pb-4 mb-6">
            <h2 className="text-lg font-bold flex items-center gap-2 text-slate-900">
              <BookOpen className="h-5 w-5 text-blue-900" /> 2. Add New Class
            </h2>
            <p className="text-sm text-slate-500">Enter your course details to add it to your schedule</p>
          </div>

          <form onSubmit={handleAddClass} className="grid gap-6 md:grid-cols-2">
            
            {/* LEFT COLUMN: BASIC INFO */}
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase text-slate-600 mb-1">Course Name *</label>
                <input 
                  type="text" 
                  required
                  placeholder="e.g. CHEM 200, MATH 141"
                  value={courseName}
                  onChange={(e) => setCourseName(e.target.value)}
                  className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-900"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-600 mb-1">Location</label>
                <input 
                  type="text" 
                  placeholder="e.g. Fairchild 2M124"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-900"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-600 mb-1">Class Period</label>
                <select 
                  value={period}
                  onChange={(e) => setPeriod(e.target.value)}
                  className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm bg-white"
                >
                  {[1, 2, 3, 4, 5, 6].map(p => <option key={p} value={p}>Period {p} (Single)</option>)}
                  {[7, 8, 9].map(p => <option key={p} value={p}>Period {p} (Double Block)</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-600 mb-1">Schedule Cycle</label>
                <select 
                  value={cycle}
                  onChange={(e) => setCycle(e.target.value)}
                  className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm bg-white"
                >
                  <option value="Every Day (M & T)">Every Day (M & T)</option>
                  <option value="M-Day Only">M-Day Only</option>
                  <option value="T-Day Only">T-Day Only</option>
                </select>
              </div>

              {/* ALERT BANNERS */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-600 space-y-1">
                <div><strong className="text-red-600">* Continuous Periods:</strong> Academic blocks like labs must use consecutive periods.</div>
                <div><strong className="text-red-600">* Athletics Toggle:</strong> PE GO blocks automatically offset M & T training days.</div>
              </div>
            </div>

            {/* RIGHT COLUMN: DURATION & TOGGLES */}
            <div className="space-y-4 flex flex-col justify-between">
              <div>
                <label className="block text-xs font-bold uppercase text-slate-600 mb-1">Class Duration</label>
                
                {/* DURATION TAB PILLS */}
                <div className="grid grid-cols-2 p-1 bg-slate-100 rounded-lg mb-4">
                  <button 
                    type="button"
                    onClick={() => setDurationTab('full')}
                    className={`py-1.5 text-xs font-bold rounded-md transition-all ${durationTab === 'full' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500'}`}
                  >
                    Full Semester
                  </button>
                  <button 
                    type="button"
                    onClick={() => setDurationTab('go')}
                    className={`py-1.5 text-xs font-bold rounded-md transition-all ${durationTab === 'go' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500'}`}
                  >
                    GO Block
                  </button>
                </div>

                {/* MODULAR GO GROUP SELECTION (DRIVEN BY TOP SEMESTER SELECTION) */}
                {durationTab === 'go' && (
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-4 animate-fadeIn">
                    
                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <label className="block text-xs font-bold uppercase text-slate-600">Select GO Group</label>
                        <span className="text-[11px] text-slate-500 font-semibold uppercase">Showing {semester} GOs</span>
                      </div>
                      <div className="grid grid-cols-4 gap-2">
                        {(semester === 'fall' ? ['A', 'B', 'C', 'D'] : ['E', 'F', 'G', 'H']).map(g => (
                          <button
                            key={g}
                            type="button"
                            onClick={() => setGoGroup(g)}
                            className={`py-2 text-sm font-bold rounded-md border transition-all ${goGroup === g ? 'bg-blue-900 text-white border-blue-900 shadow-md' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'}`}
                          >
                            {g}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold uppercase text-slate-600 mb-1">Number of Lessons *</label>
                      <div className="relative">
                        <Hash className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                        <input 
                          type="number" 
                          min="1" 
                          max="40"
                          value={lessons}
                          onChange={(e) => setLessons(e.target.value)}
                          className="w-full border border-slate-300 rounded-md pl-9 pr-3 py-1.5 text-sm bg-white"
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      <span className="text-xs font-medium text-slate-700">Athletics Toggle (PE GO Block)</span>
                      <input 
                        type="checkbox"
                        checked={athleticsToggle}
                        onChange={(e) => setAthleticsToggle(e.target.checked)}
                        className="h-4 w-4 text-blue-900 rounded cursor-pointer"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* REMINDER & SUBMIT BUTTON */}
              <div className="space-y-4 pt-4">
                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200">
                  <div className="flex items-center gap-2">
                    <Bell className="h-4 w-4 text-blue-900" />
                    <span className="text-sm font-semibold text-slate-700">15-minute reminder</span>
                  </div>
                  <input 
                    type="checkbox" 
                    checked={reminder} 
                    onChange={(e) => setReminder(e.target.checked)}
                    className="h-4 w-4 text-blue-900 rounded cursor-pointer"
                  />
                </div>

                <button 
                  type="submit"
                  className="w-full h-12 bg-blue-900 hover:bg-blue-800 text-white font-bold rounded-lg shadow-md flex items-center justify-center gap-2 transition-colors text-base"
                >
                  <Plus className="h-5 w-5" /> Add Class to Schedule
                </button>
              </div>

            </div>
          </form>
        </div>

        {/* ==================================================================== */}
        {/* CARD 2: YOUR SCHEDULE LIST                                           */}
        {/* ==================================================================== */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Your Schedule</h2>
              <p className="text-sm text-slate-500">{classes.length} {classes.length === 1 ? 'class' : 'classes'} added</p>
            </div>
            {classes.length > 0 && (
              <button 
                onClick={() => setClasses([])}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-slate-300 rounded-md bg-white hover:bg-red-50 hover:text-red-600 shadow-xs"
              >
                <Trash2 className="h-3.5 w-3.5" /> Clear All
              </button>
            )}
          </div>

          <div className="space-y-3">
            {classes.length === 0 ? (
              <p className="text-center py-8 text-sm text-slate-400 italic">No classes added yet. Use the form above to build your schedule!</p>
            ) : (
              classes.map(cls => (
                <div key={cls.id} className="flex items-center justify-between p-4 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-1.5 h-10 rounded-full bg-blue-900"></div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900">{cls.name}</span>
                        <span className="inline-flex items-center text-xs text-slate-500">
                          <MapPin className="h-3 w-3 mr-0.5" /> {cls.location}
                        </span>
                      </div>
                      
                      {/* PILL BADGES */}
                      <div className="flex gap-1.5 mt-1">
                        <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700">
                          P{cls.period}
                        </span>
                        <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700">
                          {cls.cycle}
                        </span>
                        {cls.reminder && (
                          <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-blue-800 flex items-center">
                            <Bell className="h-3 w-3 mr-1" /> 15m
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <button 
                    onClick={() => handleRemoveClass(cls.id)}
                    className="text-slate-400 hover:text-red-600 p-2 rounded-md hover:bg-red-50 transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* ==================================================================== */}
        {/* CARD 3: READY TO EXPORT                                              */}
        {/* ==================================================================== */}
        <div className="bg-gradient-to-br from-blue-900/5 to-blue-900/10 rounded-xl border border-blue-900/20 shadow-sm p-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div>
              <h3 className="text-lg font-bold flex items-center gap-2 text-slate-900">
                <Download className="h-5 w-5 text-blue-900" /> Ready to Export
              </h3>
              <p className="text-sm text-slate-600 mt-1">
                Download your schedule as an .ics file and import it into Outlook, Apple Calendar, or Google Calendar.
              </p>
              
              <label className="flex items-center gap-2 mt-3 cursor-pointer">
                <input 
                  type="checkbox"
                  checked={generateMTDays}
                  onChange={(e) => setGenerateMTDays(e.target.checked)}
                  className="rounded text-blue-900 h-4 w-4"
                />
                <span className="text-xs font-bold text-slate-700 uppercase">Include M1-T40 academic day markers</span>
              </label>
            </div>

            <button 
              onClick={generateICS}
              className="w-full md:w-auto px-8 h-12 bg-blue-900 hover:bg-blue-800 text-white font-bold rounded-lg shadow-md flex items-center justify-center gap-2 transition-colors text-base whitespace-nowrap"
            >
              <Download className="h-5 w-5" /> Generate Calendar File
            </button>
          </div>
        </div>

        {/* FOOTER & DISCLAIMER */}
        <footer className="text-center space-y-2 pt-6 opacity-60">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">FalconNet Modular Edition • Developed for USAFA Cadets</p>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-white border border-slate-300 rounded-full text-xs text-slate-600">
            <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
            <span>Always verify your schedule against official Schedule in Compass</span>
          </div>
          <p className="text-xs italic text-slate-500">"Integrity First, Service Before Self, Excellence in All We Do."</p>
        </footer>
      </main>

      {/* ==================================================================== */}
      {/* MODULAR POPUP MODAL (HOLIDAYS & MODIFIED SOCS)                       */}
      {/* ==================================================================== */}
      {activeModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full shadow-2xl overflow-hidden border border-slate-200 animate-fadeIn">
            
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50">
              <h3 className="font-bold text-slate-900 flex items-center gap-2">
                {activeModal === 'holidays' ? <PartyPopper className="h-5 w-5 text-blue-600" /> : <Clock className="h-5 w-5 text-amber-600" />}
                {activeModal === 'holidays' ? 'Days Off (No Classes)' : 'Modified Schedule of Calls'}
              </h3>
              <button 
                onClick={() => setActiveModal(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-md"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-xs text-slate-500">
                {activeModal === 'holidays' 
                  ? 'Add or remove modular excluded academic dates (Commandant Training Days, Spring Break, VALEX, etc.).' 
                  : 'Add or remove days where afternoon periods start 1 hour earlier at 12:30.'}
              </p>

              {/* ADD NEW MODAL ITEM INPUTS */}
              <div className="flex gap-2">
                <input 
                  type="date" 
                  value={newModalDate}
                  onChange={(e) => setNewModalDate(e.target.value)}
                  className="border border-slate-300 rounded-md px-2 py-1 text-xs w-36"
                />
                <input 
                  type="text" 
                  placeholder="Event Name..."
                  value={newModalName}
                  onChange={(e) => setNewModalName(e.target.value)}
                  className="border border-slate-300 rounded-md px-2 py-1 text-xs flex-1"
                />
                <button 
                  onClick={handleAddModalItem}
                  className="bg-blue-900 text-white px-3 py-1 rounded-md text-xs font-bold hover:bg-blue-800"
                >
                  Add
                </button>
              </div>

              {/* LIST OF MODULAR DATES */}
              <div className="max-h-60 overflow-y-auto space-y-1.5 border border-slate-100 rounded-lg p-2 bg-slate-50">
                {(activeModal === 'holidays' ? daysOff : modifiedSocs).map((item, i) => (
                  <div key={i} className="flex items-center justify-between p-2 bg-white rounded border border-slate-200 text-xs">
                    <span className="font-bold text-slate-800">{item.name}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-slate-500 bg-slate-100 px-2 py-0.5 rounded">{item.date}</span>
                      <button 
                        onClick={() => handleRemoveModalItem(item.date)}
                        className="text-red-500 hover:text-red-700 font-bold px-1"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="px-6 py-3 border-t border-slate-100 bg-slate-50 flex justify-end">
              <button 
                onClick={() => setActiveModal(null)}
                className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 rounded-md text-xs font-bold text-slate-700"
              >
                Done
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}