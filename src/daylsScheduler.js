import React, { useState, useEffect, useCallback, createContext, useContext } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc, collection, query, where, getDocs, updateDoc, Timestamp } from 'firebase/firestore';

// Context for Firebase and User ID
const AppContext = createContext(null);

const AppProvider = ({ children }) => {
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [userId, setUserId] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [firebaseError, setFirebaseError] = useState(null);

  useEffect(() => {
    try {
      // Fixed appId for deployment outside Canvas
      const appId = "dayls-academy-applink"; // Use your actual Firebase projectId

      // Your Firebase configuration
      const firebaseConfig = {
        apiKey: "AIzaSyAW_HijWvV6xutDukN17on2dcL0zi1xkas", // Replace with your Firebase API Key
        authDomain: "dayls-academy-applink.firebaseapp.com", // Replace with your Firebase Auth Domain
        projectId: "dayls-academy-applink", // Replace with your Firebase Project ID
        storageBucket: "dayls-academy-applink.firebasestorage.app", // Replace with your Firebase Storage Bucket
        messagingSenderId: "965486105547", // Replace with your Firebase Messaging Sender ID
        appId: "1:965486105547:web:7bb88d8d01fa6085131c4e", // Replace with your Firebase App ID
        measurementId: "G-Y7TGR51F2M" // Optional, uncomment and add if you use Analytics
      };

      if (!Object.keys(firebaseConfig).length || !firebaseConfig.apiKey) {
        setFirebaseError("Firebase config is missing or incomplete. Please provide your actual Firebase project configuration.");
        return;
      }

      const app = initializeApp(firebaseConfig);
      const firestore = getFirestore(app);
      const firebaseAuth = getAuth(app);

      setDb(firestore);
      setAuth(firebaseAuth);

      const unsubscribe = onAuthStateChanged(firebaseAuth, async (user) => {
        if (user) {
          setUserId(user.uid);
        } else {
          try {
            await signInAnonymously(firebaseAuth);
          } catch (error) {
            console.error("Firebase Auth Error:", error);
            setFirebaseError(`Authentication failed: ${error.message}. Data saving/loading might not work.`);
          }
        }
        setIsAuthReady(true);
      });

      return () => unsubscribe();

    } catch (error) {
      console.error("Firebase Initialization Error:", error);
      setFirebaseError(`Firebase initialization failed: ${error.message}. Data saving/loading might not work.`);
    }
  }, []);

  return (
    <AppContext.Provider value={{ db, auth, userId, isAuthReady, firebaseError }}>
      {children}
    </AppContext.Provider>
  );
};

// Helper to generate UUIDs
const generateId = () => crypto.randomUUID();

// Helper function to format time input consistently (e.g., 11AM, 13:00, 1.30 -> 11:00 AM, 01:00 PM, 01:30 PM)
const formatTime = (inputTime) => {
  if (!inputTime) return '';
  inputTime = String(inputTime).trim();

  // Handle common separators: '.', ':' and optional AM/PM
  const match = inputTime.match(/^(\d{1,2})[.:]?(\d{2})?\s*(AM|PM)?$/i);

  if (!match) {
    // Try to handle "11AM" or "1PM" without separator
    const directAmPmMatch = inputTime.match(/^(\d{1,2})\s*(AM|PM)$/i);
    if (directAmPmMatch) {
      let hour = parseInt(directAmPmMatch[1], 10);
      const ampm = directAmPmMatch[2].toUpperCase();

      if (ampm === 'PM' && hour !== 12) hour += 12;
      if (ampm === 'AM' && hour === 12) hour = 0; // For internal 24-hr conversion then back to 12-hr

      // Reformat to HH:MM AM/PM
      const displayHour = (hour % 12 === 0) ? 12 : hour % 12;
      return `${String(displayHour).padStart(2, '0')}:00 ${ampm}`;
    }
    return inputTime; // Return as is if format is completely unrecognized
  }

  let hour = parseInt(match[1], 10);
  let minutes = match[2] ? parseInt(match[2], 10) : 0;
  let ampm = match[3] ? match[3].toUpperCase() : '';

  // Adjust for 24-hour format if no AM/PM specified
  if (!ampm) {
    if (hour >= 13 && hour <= 23) {
      hour -= 12;
      ampm = 'PM';
    } else if (hour === 0) { // 00:XX implies 12 AM
      hour = 12;
      ampm = 'AM';
    } else if (hour === 12 && minutes > 0) { // 12:XX without AM/PM, assume PM
      ampm = 'PM';
    } else if (hour === 12 && minutes === 0) { // 12:00 without AM/PM, usually PM
      ampm = 'PM';
    } else {
      ampm = 'AM'; // Default for 1-11
    }
  }

  // Ensure 12-hour format for 12 AM/PM correctly
  if (ampm === 'AM' && hour === 12) hour = 0; // For internal 24-hr equivalent before final display
  if (ampm === 'PM' && hour === 12) hour = 12; // 12PM is 12

  const displayHour = (hour === 0) ? 12 : (hour > 12 ? hour - 12 : hour);
  const displayMinutes = String(minutes).padStart(2, '0');
  const finalAmpm = ampm || (hour >= 12 ? 'PM' : 'AM'); // Fallback in case inference failed

  return `${String(displayHour).padStart(2, '0')}:${displayMinutes} ${finalAmpm}`;
};

// Helper to get day abbreviation (MON, TUE etc.)
const getDayAbbreviation = (dateString) => {
  const date = new Date(dateString);
  const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  return days[date.getDay()];
};

// Helper to format time for Class Name (e.g., "11:00 AM" -> "11AM", "01:30 PM" -> "130PM")
const formatTimeForClassName = (timeString) => {
  if (!timeString) return '';
  const parts = timeString.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!parts) return timeString.replace(/[^a-zA-Z0-9]/g, ''); // Fallback for really messy input

  let hour = String(parseInt(parts[1], 10)); // No leading zero for hour if single digit
  const minutes = parts[2];
  const ampm = parts[3].toUpperCase();

  // If minutes are 00, omit them. Otherwise, include.
  return `${hour}${minutes === '00' ? '' : minutes}${ampm}`;
};

// Helper to create a stable ID for a performer based on their name (for performers collection)
const generatePerformerId = (name) => {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
};

// Helper to create a stable ID for a class instance (for classes collection)
const generateClassInstanceId = (date, startTime, classType, roomName) => {
  const day = getDayAbbreviation(date);
  const time = formatTimeForClassName(startTime);
  return `${date}-${day}-${time}-${classType}-${roomName}`;
};


// Reusable Input Field
const InputField = ({ label, type = 'text', value, onChange, onBlur, placeholder = '', className = '' }) => (
  <div className={`mb-2 ${className}`}>
    <label className="block text-gray-700 text-sm font-bold mb-1">{label}</label>
    <input
      type={type}
      value={value}
      onChange={onChange}
      onBlur={onBlur}
      placeholder={placeholder}
      className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline bg-white/70"
    />
  </div>
);

// Reusable Select Field
const SelectField = ({ label, value, onChange, options, className = '' }) => (
  <div className={`mb-2 ${className}`}>
    <label className="block text-gray-700 text-sm font-bold mb-1">{label}</label>
    <select
      value={value}
      onChange={onChange}
      className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline bg-white/70"
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  </div>
);

// Custom Modal Component for confirmations/alerts
const CustomModal = ({ title, message, isOpen, onConfirm, onCancel, confirmText = 'Yes', cancelText = 'No' }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-75 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl p-6 max-w-sm w-full mx-auto">
        <h3 className="text-lg font-bold text-gray-900 mb-4">{title}</h3>
        <p className="text-gray-700 mb-6">{message}</p>
        <div className="flex justify-end space-x-3">
          {onCancel && (
            <button
              onClick={onCancel}
              className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition duration-200"
            >
              {cancelText}
            </button>
          )}
          {onConfirm && (
            <button
              onClick={onConfirm}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition duration-200"
            >
              {confirmText}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};


// Performer Input Component
const PerformerInput = ({ performer, onPerformerChange, onRemove }) => {
  const KNOWN_PERFORMERS = [
    'Danica Mathias', 'Ayaan Raj', 'Ayaan Shaji', 'Ayan Dsouza',
    'Shaun Dsouza', 'Ethan Lasrado'
  ].map(name => name.toLowerCase());

  const [inputValue, setInputValue] = useState(performer.name);
  const [suggestions, setSuggestions] = useState([]);
  const [showNewPerformerConfirmation, setShowNewPerformerConfirmation] = useState(false);
  const [tempPerformerName, setTempPerformerName] = useState('');

  useEffect(() => {
    setInputValue(performer.name);
  }, [performer.name]);

  const handleNameChange = (e) => {
    const value = e.target.value;
    setInputValue(value);
    if (value.length > 0) {
      setSuggestions(
        KNOWN_PERFORMERS.filter(name => name.includes(value.toLowerCase()))
          .map(name => name.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '))
      );
    } else {
      setSuggestions([]);
    }
  };

  const handleNameBlur = () => {
    const trimmedValue = inputValue.trim();
    if (!trimmedValue) {
      setSuggestions([]);
      onPerformerChange('name', '');
      return;
    }

    const isKnown = KNOWN_PERFORMERS.some(name => name === trimmedValue.toLowerCase());

    if (!isKnown) {
      setTempPerformerName(trimmedValue);
      setShowNewPerformerConfirmation(true);
    } else {
      onPerformerChange('name', trimmedValue);
      setSuggestions([]);
    }
  };

  const selectSuggestion = (suggestion) => {
    setInputValue(suggestion);
    onPerformerChange('name', suggestion);
    setSuggestions([]);
    setShowNewPerformerConfirmation(false);
  };

  const confirmNewPerformer = () => {
    onPerformerChange('name', tempPerformerName);
    setShowNewPerformerConfirmation(false);
    setSuggestions([]);
    setTempPerformerName('');
  };

  const cancelNewPerformer = () => {
    setInputValue('');
    onPerformerChange('name', '');
    setShowNewPerformerConfirmation(false);
    setSuggestions([]);
    setTempPerformerName('');
  };


  const performerRoles = [
    { value: '', label: 'Select Role' },
    { value: 'Drums', label: 'Drums' },
    { value: 'Keyboard', label: 'Keyboard' },
    { value: 'Guitar', label: 'Guitar' },
    { value: 'Bass', label: 'Bass' },
    { value: 'Vocals', label: 'Vocals' },
    { value: 'Drums, Keyboard', label: 'Drums, Keyboard' },
    { value: 'Keyboard, Vocals', label: 'Keyboard, Vocals' },
    { value: 'Guitar, Vocals', label: 'Guitar, Vocals' },
    { value: 'Drums, Bass', label: 'Drums, Bass' },
  ];

  const performerTypes = [
    { value: '', label: 'Select Type' },
    { value: 'Class', label: 'Class' },
    { value: 'Not Class', label: 'Not Class' },
    { value: 'Trial', label: 'Trial' },
  ];

  return (
    <div className="bg-blue-50 p-3 rounded-lg mb-2 border border-blue-200 flex flex-wrap items-end gap-2 relative">
      <InputField
        label="Performer Name"
        value={inputValue}
        onChange={handleNameChange}
        onBlur={handleNameBlur}
        placeholder="Performer Name"
        className="flex-1 min-w-[120px]"
      />
      {suggestions.length > 0 && (
        <ul className="absolute z-10 bg-white border border-gray-300 rounded-md shadow-lg mt-1 w-full left-0 right-0 top-full max-h-40 overflow-y-auto">
          {suggestions.map((s, idx) => (
            <li
              key={idx}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => selectSuggestion(s)}
              className="px-3 py-2 cursor-pointer hover:bg-gray-100"
            >
              {s}
            </li>
          ))}
        </ul>
      )}

      <SelectField
        label="Roles"
        value={performer.roles}
        onChange={(e) => onPerformerChange('roles', e.target.value)}
        options={performerRoles}
        className="flex-1 min-w-[120px]"
      />
      <SelectField
        label="Type"
        value={performer.type}
        onChange={(e) => onPerformerChange('type', e.target.value)}
        options={performerTypes}
        className="flex-1 min-w-[120px]"
      />
      <InputField
        label="Notes (Optional)"
        value={performer.notes}
        onChange={(e) => onPerformerChange('notes', e.target.value)}
        placeholder="e.g., didn't do HW"
        className="flex-1 min-w-[150px]"
      />
      <button
        onClick={onRemove}
        className="bg-red-500 hover:bg-red-700 text-white font-bold py-1 px-2 rounded-full shadow-md transition duration-200 text-sm"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
      </button>

      <CustomModal
        title="New Performer?"
        message={`"${tempPerformerName}" is not in the known performers list. Add as a new performer?`}
        isOpen={showNewPerformerConfirmation}
        onConfirm={confirmNewPerformer}
        onCancel={cancelNewPerformer}
      />
    </div>
  );
};

// Activity Input Component
const ActivityInput = ({ activity, onActivityChange, onRemoveActivity, currentDate, startTime }) => {
  const ageGroups = [
    { value: '', label: 'Select Age Group' },
    { value: 'JR', label: 'Junior' },
    { value: 'TN', label: 'Teen' },
    { value: 'SR', label: 'Senior' },
    { value: 'AD', label: 'Adult' },
  ];

  const levels = [
    { value: '', label: 'Select Level' },
    { value: '1', label: '1' },
    { value: '2', label: '2' },
    { value: '3', label: '3' },
    { value: 'C', label: 'C (Core)' },
  ];

  const rooms = [
    { value: 'JAM', label: 'JAM Room' },
    { value: 'ACC', label: 'Acceleration Room' },
  ];

  const [generatedClassName, setGeneratedClassName] = useState('');

  useEffect(() => {
    const newClassType = `${(activity.ageGroup ? activity.ageGroup.charAt(0) : '')}${(activity.level || '')}`;
    if (activity.classType !== newClassType) {
      onActivityChange('classType', newClassType);
    }

    if (currentDate && startTime && newClassType && activity.roomName) {
      const day = getDayAbbreviation(currentDate);
      const time = formatTimeForClassName(startTime);
      const className = `${day}-${time}-${newClassType}-${activity.roomName}`;
      setGeneratedClassName(className);
    } else {
      setGeneratedClassName('');
    }

  }, [activity.ageGroup, activity.level, activity.classType, activity.roomName, onActivityChange, currentDate, startTime]);


  const handlePerformerChange = (performerId, field, value) => {
    onActivityChange('performers', activity.performers.map(p =>
      p.id === performerId ? { ...p, [field]: value } : p
    ));
  };

  const addPerformer = () => {
    onActivityChange('performers', [
      ...activity.performers,
      { id: generateId(), name: '', roles: '', type: '', notes: '' },
    ]);
  };

  const removePerformer = (performerId) => {
    onActivityChange('performers', activity.performers.filter(p => p.id !== performerId));
  };

  return (
    <div className="bg-white p-4 rounded-lg shadow-md mb-4 border border-gray-200">
      <div className="flex justify-between items-center mb-3">
        <h4 className="text-md font-semibold text-gray-800">Activity Details</h4>
        {generatedClassName && (
          <div className="bg-gray-200 text-gray-800 px-3 py-1 rounded-full text-sm font-mono inline-block">
            {generatedClassName}
          </div>
        )}
        <button
          onClick={onRemoveActivity}
          className="bg-red-500 hover:bg-red-700 text-white font-bold py-1 px-3 rounded-full shadow-md transition duration-200 text-sm"
        >
          Remove Activity
        </button>
      </div>


      <InputField
        label="Activity Name"
        value={activity.name}
        onChange={(e) => onActivityChange('name', e.target.value)}
        placeholder="e.g., Roundabout - Yes"
      />
      <InputField
        label="Activity Notes (Optional)"
        value={activity.notes}
        onChange={(e) => onActivityChange('notes', e.target.value)}
        placeholder="e.g., HW same? 2 rolls"
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-2 mb-4">
        <SelectField
          label="Age Group"
          value={activity.ageGroup}
          onChange={(e) => onActivityChange('ageGroup', e.target.value)}
          options={ageGroups}
        />
        <SelectField
          label="Level"
          value={activity.level}
          onChange={(e) => onActivityChange('level', e.target.value)}
          options={levels}
        />
        <SelectField
          label="Room Name"
          value={activity.roomName}
          onChange={(e) => onActivityChange('roomName', e.target.value)}
          options={rooms}
        />
      </div>


      <h5 className="text-sm font-semibold text-gray-700 mt-4 mb-2">Performers:</h5>
      {activity.performers.map((performer) => (
        <PerformerInput
          key={performer.id}
          performer={performer}
          onPerformerChange={(field, value) => handlePerformerChange(performer.id, field, value)}
          onRemove={() => removePerformer(performer.id)}
        />
      ))}
      <div className="flex space-x-2 mt-3">
        <button
          onClick={addPerformer}
          className="bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg shadow-md transition duration-200 flex items-center justify-center space-x-1 flex-1"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
          <span>Add Performer</span>
        </button>
      </div>
    </div>
  );
};

// Hourly Block Component
const HourlyBlock = ({ hourlyBlock, onHourlyBlockChange, onRemoveHourlyBlock, currentDate }) => {
  const addActivity = () => {
    const defaultRoom = hourlyBlock.activities.length === 0 ? 'JAM' : 'ACC';
    onHourlyBlockChange('activities', [
      ...hourlyBlock.activities,
      { id: generateId(), name: '', notes: '', performers: [], ageGroup: '', level: '', classType: '', roomName: defaultRoom },
    ]);
  };

  const handleActivityChange = (activityId, field, value) => {
    onHourlyBlockChange('activities', hourlyBlock.activities.map(a =>
      a.id === activityId ? { ...a, [field]: value } : a
    ));
  };

  const removeActivity = (activityId) => {
    onHourlyBlockChange('activities', hourlyBlock.activities.filter(a => a.id !== activityId));
  };

  return (
    <div className="bg-gray-100 p-5 rounded-xl shadow-inner mb-6 border-2 border-gray-300">
      <div className="flex justify-between items-center mb-4">
        <div className="flex flex-grow mr-4 space-x-2">
          <InputField
            label="Start Time"
            value={hourlyBlock.startTime}
            onChange={(e) => onHourlyBlockChange('startTime', e.target.value)}
            onBlur={(e) => onHourlyBlockChange('startTime', formatTime(e.target.value))}
            placeholder="e.g., 11:00 AM"
            className="flex-1"
          />
          <InputField
            label="End Time"
            value={hourlyBlock.endTime}
            onChange={(e) => onHourlyBlockChange('endTime', e.target.value)}
            onBlur={(e) => onHourlyBlockChange('endTime', formatTime(e.target.value))}
            placeholder="e.g., 12:00 PM"
            className="flex-1"
          />
        </div>
        <button
          onClick={onRemoveHourlyBlock}
          className="bg-red-600 hover:bg-red-800 text-white font-bold py-2 px-4 rounded-lg shadow-md transition duration-200"
        >
          Remove Hour
        </button>
      </div>

      {hourlyBlock.activities.map((activity) => (
        <ActivityInput
          key={activity.id}
          activity={activity}
          onActivityChange={(field, value) => handleActivityChange(activity.id, field, value)}
          onRemoveActivity={() => removeActivity(activity.id)}
          currentDate={currentDate}
          startTime={hourlyBlock.startTime}
        />
      ))}

      <button
        onClick={addActivity}
        className="bg-blue-600 hover:bg-blue-800 text-white font-bold py-2 px-4 rounded-lg mt-3 shadow-md transition duration-200 w-full flex items-center justify-center space-x-1"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
        </svg>
        <span>Add Activity (Separate Room)</span>
      </button>
    </div>
  );
};

// Instructor Input Component
const InstructorInput = ({ instructor, onInstructorChange, onRemove }) => {
  const instructorStatuses = [
    { value: '', label: 'Select Status' },
    { value: 'Entered', label: 'Entered' },
    { value: 'Exited', label: 'Exited' },
  ];

  const instructorTypes = [
    { value: '', label: 'Select Type' },
    { value: 'Teacher', label: 'Teacher' },
    { value: 'Intern', label: 'Intern' },
  ];

  return (
    <div className="bg-yellow-50 p-3 rounded-lg mb-2 border border-yellow-200 flex flex-wrap items-end gap-2">
      <InputField
        label="Instructor Name"
        value={instructor.name}
        onChange={(e) => onInstructorChange('name', e.target.value)}
        placeholder="Instructor Name"
        className="flex-1 min-w-[120px]"
      />
      <SelectField
        label="Type"
        value={instructor.type}
        onChange={(e) => onInstructorChange('type', e.target.value)}
        options={instructorTypes}
        className="flex-1 min-w-[120px]"
      />
      <InputField
        label="Time (e.g., 11 AM)"
        value={instructor.timeSlot}
        onChange={(e) => onInstructorChange('timeSlot', e.target.value)}
        onBlur={(e) => onInstructorChange('timeSlot', formatTime(e.target.value))}
        placeholder="Time"
        className="flex-1 min-w-[120px]"
      />
      <SelectField
        label="Status"
        value={instructor.status}
        onChange={(e) => onInstructorChange('status', e.target.value)}
        options={instructorStatuses}
        className="flex-1 min-w-[120px]"
      />
      <button
        onClick={onRemove}
        className="bg-red-500 hover:bg-red-700 text-white font-bold py-1 px-2 rounded-full shadow-md transition duration-200 text-sm"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
      </button>
    </div>
  );
};


// Main App Component
const App = () => {
  const { db, userId, isAuthReady, firebaseError } = useContext(AppContext);
  const [currentDate, setCurrentDate] = useState(new Date().toISOString().slice(0, 10)); // YYYY-MM-DD
  const [schedule, setSchedule] = useState({ hourlyBlocks: [], instructors: [] });
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState(''); // 'success' or 'error'
  const [loading, setLoading] = useState(false);

  // Performer History states
  const [performerSearchName, setPerformerSearchName] = useState('');
  const [performerHistory, setPerformerHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [performerInsight, setPerformerInsight] = useState('');
  const [generatingInsight, setGeneratingInsight] = useState(false);
  const [allPerformers, setAllPerformers] = useState([]); // New state for all unique performers
  const [allPerformersLoading, setAllPerformersLoading] = useState(false);

  // Class History Search states
  const [classSearchDate, setClassSearchDate] = useState('');
  const [classSearchTime, setClassSearchTime] = useState('');
  const [classSearchAgeGroup, setClassSearchAgeGroup] = useState('');
  const [classSearchLevel, setClassSearchLevel] = useState('');
  const [classSearchRoom, setClassSearchRoom] = useState('');
  const [classHistory, setClassHistory] = useState([]);
  const [classHistoryLoading, setClassHistoryLoading] = useState(false);

  // Fixed appId for deployment outside Canvas
  const appId = "dayls-academy-applink"; // Use your actual Firebase projectId


  const showMessage = (msg, type) => {
    setMessage(msg);
    setMessageType(type);
    setTimeout(() => {
      setMessage('');
      setMessageType('');
    }, 5000); // Message disappears after 5 seconds
  };

  // Function to load schedule from Firestore
  const loadSchedule = useCallback(async () => {
    if (!db || !userId || !isAuthReady) {
      console.log("Firebase not ready for loading.");
      return;
    }

    setLoading(true);
    setMessage(''); // Clear previous messages
    try {
      const scheduleRef = doc(db, `artifacts/${appId}/users/${userId}/activitySchedules`, currentDate);
      const docSnap = await getDoc(scheduleRef);

      if (docSnap.exists()) {
        setSchedule(docSnap.data());
        showMessage('Schedule loaded successfully!', 'success');
      } else {
        setSchedule({ hourlyBlocks: [], instructors: [] }); // Reset if no data found
        showMessage('No schedule found for this date. Starting fresh.', 'info');
      }
    } catch (error) {
      console.error("Error loading schedule:", error);
      showMessage(`Error loading schedule: ${error.message}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [db, userId, isAuthReady, currentDate, appId]);

  // Function to save schedule to Firestore (now includes performer and class history updates)
  const saveSchedule = useCallback(async () => {
    if (!db || !userId || !isAuthReady) {
      showMessage('Firebase not initialized. Cannot save.', 'error');
      return;
    }

    setLoading(true);
    setMessage(''); // Clear previous messages
    try {
      // 1. Save the main daily schedule
      const scheduleRef = doc(db, `artifacts/${appId}/users/${userId}/activitySchedules`, currentDate);
      await setDoc(scheduleRef, schedule);

      // 2. Update performer history and master performer list
      const performersCollectionRef = collection(db, `artifacts/${appId}/users/${userId}/performers`);
      const classesCollectionRef = collection(db, `artifacts/${appId}/users/${userId}/classes`);

      for (const hourlyBlock of schedule.hourlyBlocks) {
        for (const activity of hourlyBlock.activities) {
          const generatedClassName = `${getDayAbbreviation(currentDate)}-${formatTimeForClassName(hourlyBlock.startTime)}-${(activity.ageGroup ? activity.ageGroup.charAt(0) : '')}${(activity.level || '')}-${activity.roomName}`;

          // Save/Update class instance
          if (generatedClassName && activity.name) {
            const classInstanceId = generateClassInstanceId(currentDate, hourlyBlock.startTime, activity.classType, activity.roomName);
            await setDoc(doc(classesCollectionRef, classInstanceId), {
              date: currentDate,
              startTime: hourlyBlock.startTime,
              endTime: hourlyBlock.endTime,
              activityName: activity.name,
              ageGroup: activity.ageGroup,
              level: activity.level,
              classType: activity.classType,
              roomName: activity.roomName,
              notes: activity.notes || '',
              performers: activity.performers.map(p => ({ name: p.name, roles: p.roles })), // Store lightweight performer info
              fullClassName: generatedClassName,
              createdAt: Timestamp.now()
            }, { merge: true }); // Use merge true to update if exists
          }

          // Update each performer's record
          for (const performer of activity.performers) {
            if (performer.name) {
              const performerId = generatePerformerId(performer.name);
              const performerDocRef = doc(performersCollectionRef, performerId);

              // Update master performer record (or create if new)
              await setDoc(performerDocRef, {
                name: performer.name,
                lastSeen: Timestamp.now()
              }, { merge: true }); // Merge true so we don't overwrite if other fields are added later

              // Add to performer's activitiesTaken subcollection
              const activitiesTakenCollectionRef = collection(performerDocRef, 'activitiesTaken');
              await setDoc(doc(activitiesTakenCollectionRef, generateId()), { // Use new ID for each unique activity entry
                date: currentDate,
                startTime: hourlyBlock.startTime,
                endTime: hourlyBlock.endTime,
                activityName: activity.name,
                roles: performer.roles,
                type: performer.type,
                notes: performer.notes || '',
                classType: activity.classType,
                roomName: activity.roomName,
                fullClassName: generatedClassName,
                recordedAt: Timestamp.now()
              });
            }
          }
        }
      }

      showMessage('Schedule saved successfully!', 'success');
    } catch (error) {
      console.error("Error saving schedule:", error);
      showMessage(`Error saving schedule: ${error.message}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [db, userId, isAuthReady, currentDate, schedule, appId]);

  // Load schedule when date or auth state changes
  useEffect(() => {
    if (isAuthReady && db && userId) {
      loadSchedule();
    }
  }, [currentDate, isAuthReady, db, userId, loadSchedule]);


  // New: Load All Performers for dropdown
  const loadAllPerformers = useCallback(async () => {
    if (!db || !userId || !isAuthReady) return;
    setAllPerformersLoading(true);
    try {
      const q = query(collection(db, `artifacts/${appId}/users/${userId}/performers`));
      const querySnapshot = await getDocs(q);
      const performersList = querySnapshot.docs.map(doc => doc.data().name).sort();
      setAllPerformers(performersList);
    } catch (error) {
      console.error("Error loading all performers:", error);
    } finally {
      setAllPerformersLoading(false);
    }
  }, [db, userId, isAuthReady, appId]);

  useEffect(() => {
    if (isAuthReady && db && userId) {
      loadAllPerformers();
    }
  }, [isAuthReady, db, userId, loadAllPerformers]);


  // Handler to search performer history
  const handlePerformerSearch = useCallback(async () => {
    if (!db || !userId || !isAuthReady || !performerSearchName.trim()) {
      setPerformerHistory([]);
      showMessage('Please select or enter a performer name to search.', 'error');
      return;
    }

    setHistoryLoading(true);
    setPerformerHistory([]); // Clear previous results
    setPerformerInsight(''); // Clear previous insight
    showMessage('Searching performer history...', 'info');

    try {
      const performerId = generatePerformerId(performerSearchName.trim());
      const activitiesTakenCollectionRef = collection(db, `artifacts/${appId}/users/${userId}/performers/${performerId}/activitiesTaken`);
      const q = query(activitiesTakenCollectionRef);
      const querySnapshot = await getDocs(q);

      let history = [];
      querySnapshot.forEach((docSnap) => {
        history.push(docSnap.data());
      });
      setPerformerHistory(history.sort((a, b) => new Date(a.date) - new Date(b.date) || parseTimeForSorting(a.startTime) - parseTimeForSorting(b.startTime)));
      if (history.length > 0) {
        showMessage(`Found ${history.length} historical entries for ${performerSearchName}.`, 'success');
      } else {
        showMessage(`No history found for ${performerSearchName}.`, 'info');
      }
    } catch (error) {
      console.error("Error searching performer history:", error);
      showMessage(`Error searching history: ${error.message}`, 'error');
    } finally {
      setHistoryLoading(false);
    }
  }, [db, userId, isAuthReady, performerSearchName, appId]);


  // LLM Call for Performer Insight
  const generatePerformerInsight = async () => {
    if (!performerHistory.length) {
      setPerformerInsight('No history to generate insights from.');
      return;
    }
    setGeneratingInsight(true);
    setPerformerInsight('Generating insights...');

    try {
      const historySummary = performerHistory.map(entry =>
        `Date: ${entry.date}, Activity: "${entry.activityName}", Roles: ${entry.roles}, Type: ${entry.type}, Notes: "${entry.notes || 'N/A'}"`
      ).join('\n');

      const prompt = `Given the following historical activities for performer "${performerSearchName}":\n\n${historySummary}\n\nBased on this data, provide an insightful summary of their primary instruments, frequency of participation, any notable observations from the notes, and suggest 2-3 specific development recommendations (e.g., focus on a new genre, improve specific technique, try leading a session). Keep it concise, 3-5 sentences for summary and 2-3 bullet points for recommendations.`;

      let chatHistory = [];
      chatHistory.push({ role: "user", parts: [{ text: prompt }] });
      const payload = { contents: chatHistory };
      const apiKey = ""; // Canvas will automatically provide this if empty
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const result = await response.json();

      if (result.candidates && result.candidates.length > 0 &&
          result.candidates[0].content && result.candidates[0].content.parts &&
          result.candidates[0].content.parts.length > 0) {
        const text = result.candidates[0].content.parts[0].text;
        setPerformerInsight(text);
      } else {
        setPerformerInsight('Failed to generate insights. Please try again.');
      }
    } catch (error) {
      console.error("Error generating insights:", error);
      setPerformerInsight(`Error: ${error.message}. Could not generate insights.`);
    } finally {
      setGeneratingInsight(false);
    }
  };


  // Handler to search Class History (now queries the new 'classes' collection)
  const handleClassSearch = useCallback(async () => {
    if (!db || !userId || !isAuthReady) {
      showMessage('Firebase not ready for search.', 'error');
      return;
    }

    // At least one search criteria should be provided for the query to be meaningful
    if (!classSearchDate && !classSearchTime && !classSearchAgeGroup && !classSearchLevel && !classSearchRoom) {
      showMessage('Please provide at least one search criteria for class history.', 'error');
      setClassHistory([]);
      return;
    }

    setClassHistoryLoading(true);
    setClassHistory([]);
    showMessage('Searching class history...', 'info');

    try {
      let q = collection(db, `artifacts/${appId}/users/${userId}/classes`);
      let hasWhereClause = false;

      // Build query dynamically based on provided criteria
      if (classSearchDate) {
        q = query(q, where('date', '==', classSearchDate));
        hasWhereClause = true;
      }
      if (classSearchTime) {
        q = query(q, where('startTime', '==', formatTime(classSearchTime))); // Ensure time is formatted correctly for query
        hasWhereClause = true;
      }
      if (classSearchAgeGroup) {
        q = query(q, where('ageGroup', '==', classSearchAgeGroup));
        hasWhereClause = true;
      }
      if (classSearchLevel) {
        q = query(q, where('level', '==', classSearchLevel));
        hasWhereClause = true;
      }
      if (classSearchRoom) {
        q = query(q, where('roomName', '==', classSearchRoom));
        hasWhereClause = true;
      }

      const querySnapshot = await getDocs(q);

      let history = [];
      querySnapshot.forEach((docSnap) => {
        history.push(docSnap.data());
      });

      setClassHistory(history.sort((a, b) => new Date(a.date) - new Date(b.date) || parseTimeForSorting(a.startTime) - parseTimeForSorting(b.startTime)));

      if (history.length > 0) {
        showMessage(`Found ${history.length} historical entries for the class.`, 'success');
      } else {
        showMessage('No class history found for the selected criteria.', 'info');
      }

    } catch (error) {
      console.error("Error searching class history:", error);
      showMessage(`Error searching class history: ${error.message}`, 'error');
    } finally {
      setClassHistoryLoading(false);
    }

  }, [db, userId, isAuthReady, appId, classSearchDate, classSearchTime, classSearchAgeGroup, classSearchLevel, classSearchRoom]);


  // Handlers for modifying the schedule state
  const addHourlyBlock = () => {
    setSchedule(prev => {
      const newBlock = { id: generateId(), startTime: '', endTime: '', activities: [{ id: generateId(), name: '', notes: '', performers: [], ageGroup: '', level: '', classType: '', roomName: 'JAM' }] };
      return {
        ...prev,
        hourlyBlocks: [...prev.hourlyBlocks, newBlock],
      };
    });
  };

  const updateHourlyBlock = (hourlyBlockId, field, value) => {
    setSchedule(prev => ({
      ...prev,
      hourlyBlocks: prev.hourlyBlocks.map(block =>
        block.id === hourlyBlockId ? { ...block, [field]: value } : block
      ),
    }));
  };

  const removeHourlyBlock = (hourlyBlockId) => {
    setSchedule(prev => ({
      ...prev,
      hourlyBlocks: prev.hourlyBlocks.filter(block => block.id !== hourlyBlockId),
    }));
  };

  const addInstructor = () => {
    setSchedule(prev => ({
      ...prev,
      instructors: [
        ...prev.instructors,
        { id: generateId(), name: '', type: '', timeSlot: '', status: '' },
      ],
    }));
  };

  const updateInstructor = (instructorId, field, value) => {
    setSchedule(prev => ({
      ...prev,
      instructors: prev.instructors.map(inst =>
        inst.id === instructorId ? { ...inst, [field]: value } : inst
      ),
    }));
  };

  const removeInstructor = (instructorId) => {
    setSchedule(prev => ({
      ...prev,
      instructors: prev.instructors.filter(inst => inst.id !== instructorId),
    }));
  };

  // Helper function to parse time for sorting (handles H:MM AM/PM, HH:MM AM/PM)
  const parseTimeForSorting = (timeString) => {
    if (!timeString) return Number.MAX_SAFE_INTEGER;
    const formattedTime = formatTime(timeString);

    const parts = formattedTime.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (!parts) return Number.MAX_SAFE_INTEGER;

    let hour = parseInt(parts[1], 10);
    const minutes = parseInt(parts[2], 10);
    const ampm = parts[3].toLowerCase();

    if (ampm === 'pm' && hour !== 12) hour += 12;
    if (ampm === 'am' && hour === 12) hour = 0;

    return hour * 60 + minutes;
  };

  // Sort hourly blocks by start time (and then by end time if start times are the same)
  const sortedHourlyBlocks = [...schedule.hourlyBlocks].sort((a, b) => {
    const timeA = parseTimeForSorting(a.startTime);
    const timeB = parseTimeForSorting(b.startTime);
    if (timeA === timeB) {
      return parseTimeForSorting(a.endTime) - parseTimeForSorting(b.endTime);
    }
    return timeA - timeB;
  });


  return (
    <div className="font-sans min-h-screen bg-gradient-to-br from-purple-100 to-blue-200 p-4 sm:p-6 lg:p-8 rounded-xl shadow-lg">
      <style>
        {`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');
        body { font-family: 'Inter', sans-serif; }
        input[type="date"]::-webkit-calendar-picker-indicator {
          filter: invert(0.5) sepia(1) saturate(5) hue-rotate(175deg);
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        .animate-spin {
          animation: spin 1s linear infinite;
        }
        `}
      </style>
      <div className="max-w-4xl mx-auto bg-white bg-opacity-90 rounded-2xl shadow-xl p-6 md:p-8 border border-gray-200">
        <h1 className="text-3xl md:text-4xl font-bold text-center text-purple-800 mb-6">
          Dayls Academy Activity Scheduler
        </h1>

        {firebaseError && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4" role="alert">
            <strong className="font-bold">Firebase Error:</strong>
            <span className="block sm:inline ml-2">{firebaseError}</span>
          </div>
        )}

        {message && (
          <div className={`px-4 py-3 rounded relative mb-4 ${messageType === 'success' ? 'bg-green-100 border-green-400 text-green-700' : 'bg-red-100 border-red-400 text-red-700'}`} role="alert">
            {message}
          </div>
        )}

        {userId && (
          <div className="text-center text-sm text-gray-600 mb-4 p-2 bg-gray-50 rounded-lg">
            User ID: <span className="font-mono text-gray-800 break-all">{userId}</span> (Your data is saved privately under this ID)
          </div>
        )}

        {/* Date Selector and Actions */}
        <div className="flex flex-col sm:flex-row items-center justify-between bg-purple-50 p-4 rounded-xl mb-6 shadow-sm border border-purple-200">
          <InputField
            label="Select Date"
            type="date"
            value={currentDate}
            onChange={(e) => setCurrentDate(e.target.value)}
            className="w-full sm:w-auto mb-4 sm:mb-0 sm:mr-4"
          />
          <div className="flex space-x-3 w-full sm:w-auto">
            <button
              onClick={saveSchedule}
              disabled={loading || !isAuthReady || firebaseError}
              className={`bg-purple-500 hover:bg-purple-700 text-white font-bold py-2 px-5 rounded-lg shadow-md transition duration-200 flex-1 flex items-center justify-center space-x-2 ${loading || !isAuthReady || firebaseError ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {loading ? (
                <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9m4-5l4 4m0 0l4-4m-4 4V3m6 10V5a2 2 0 00-2-2H7a2 2 0 00-2 2v4m3 8h11a2 2 0 002-2v-3m-2 4H8" />
                </svg>
              )}
              <span>Save Schedule</span>
            </button>
            <button
              onClick={loadSchedule}
              disabled={loading || !isAuthReady || firebaseError}
              className={`bg-gray-500 hover:bg-gray-700 text-white font-bold py-2 px-5 rounded-lg shadow-md transition duration-200 flex-1 flex items-center justify-center space-x-2 ${loading || !isAuthReady || firebaseError ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {loading ? (
                <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004 16.002V9.5M4 12l3-3m0 0l3 3" />
                </svg>
              )}
              <span>Load Schedule</span>
            </button>
          </div>
        </div>

        {/* Hourly Activity Blocks */}
        <h2 className="text-2xl font-bold text-gray-800 mb-4 mt-6">Hourly Schedule</h2>
        {sortedHourlyBlocks.map((block) => (
          <HourlyBlock
            key={block.id}
            hourlyBlock={block}
            onHourlyBlockChange={(field, value) => updateHourlyBlock(block.id, field, value)}
            onRemoveHourlyBlock={() => removeHourlyBlock(block.id)}
            currentDate={currentDate}
          />
        ))}
        <button
          onClick={addHourlyBlock}
          className="bg-purple-600 hover:bg-purple-800 text-white font-bold py-3 px-6 rounded-lg shadow-lg transition duration-200 w-full flex items-center justify-center space-x-2 mt-6"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
          <span>Add New Hour Block</span>
        </button>

        {/* Instructor Section */}
        <h2 className="text-2xl font-bold text-gray-800 mb-4 mt-8">Instructor Movements</h2>
        {schedule.instructors.map((instructor) => (
          <InstructorInput
            key={instructor.id}
            instructor={instructor}
            onInstructorChange={(field, value) => updateInstructor(instructor.id, field, value)}
            onRemove={() => removeInstructor(instructor.id)}
          />
        ))}
        <button
          onClick={addInstructor}
          className="bg-yellow-600 hover:bg-yellow-800 text-white font-bold py-3 px-6 rounded-lg shadow-lg transition duration-200 w-full flex items-center justify-center space-x-2 mt-6"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
          <span>Add Instructor Event</span>
        </button>

        {/* Performer History Section */}
        <h2 className="text-2xl font-bold text-gray-800 mb-4 mt-8">Performer History</h2>
        <div className="bg-green-50 p-4 rounded-xl mb-6 shadow-sm border border-green-200">
          <div className="flex flex-col sm:flex-row items-end sm:items-center space-y-3 sm:space-y-0 sm:space-x-3">
            <InputField
              label="Search Performer Name"
              value={performerSearchName}
              onChange={(e) => setPerformerSearchName(e.target.value)}
              placeholder="e.g., Abhigyan"
              className="flex-grow"
            />
            {/* New: All Performers Dropdown */}
            <SelectField
                label="Or Select Performer"
                value={performerSearchName}
                onChange={(e) => setPerformerSearchName(e.target.value)}
                options={[{value: '', label: 'Select All Performers'}, ...allPerformers.map(p => ({value: p, label: p}))]}
                className="flex-grow"
            />
            <button
              onClick={handlePerformerSearch}
              disabled={historyLoading || !isAuthReady || firebaseError || !performerSearchName.trim()}
              className={`bg-green-600 hover:bg-green-800 text-white font-bold py-2 px-5 rounded-lg shadow-md transition duration-200 flex items-center justify-center space-x-2 ${historyLoading || !isAuthReady || firebaseError || !performerSearchName.trim() ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {historyLoading ? (
                <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16l2.879-2.879m0 0A3 3 0 1017 10a3 3 0 00-4.121-4.121m0 0L8 8m-4 3h16M7 3h10a2 2 0 012 2v10a2 2 0 01-2 2H7a2 2 0 01-2-2V5a2 2 0 012-2z" />
                </svg>
              )}
              <span>Search History</span>
            </button>
          </div>

          {performerHistory.length > 0 && (
            <>
              <div className="mt-4 p-3 bg-white rounded-lg shadow-inner max-h-80 overflow-y-auto">
                <h3 className="text-lg font-semibold text-gray-800 mb-2">Results for {performerSearchName}:</h3>
                {performerHistory.map((entry, index) => (
                  <div key={index} className="mb-3 p-3 border-b border-gray-100 last:border-b-0">
                    <p className="text-sm font-medium text-gray-700">
                      <span className="text-purple-600 font-bold">{entry.date}</span> from <span className="font-semibold">{entry.startTime}</span> to <span className="font-semibold">{entry.endTime}</span>
                    </p>
                    <p className="text-md text-gray-800">
                      <span className="font-bold">{entry.activityName}</span> - Roles: {entry.roles} ({entry.type})
                      {entry.fullClassName && (
                        <span className="ml-2 px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-mono">
                          {entry.fullClassName}
                        </span>
                      )}
                    </p>
                    {entry.notes && <p className="text-sm text-gray-600 italic">Notes: {entry.notes}</p>}
                  </div>
                ))}
              </div>
              <button
                onClick={generatePerformerInsight}
                disabled={generatingInsight}
                className={`bg-blue-600 hover:bg-blue-800 text-white font-bold py-2 px-4 rounded-lg shadow-md transition duration-200 w-full mt-4 flex items-center justify-center space-x-1 ${generatingInsight ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {generatingInsight ? (
                  <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 21h.01M10 21v-.01M7 21v-.01M4 21v-.01M3 21h.01M3 17h.01M3 13h.01M3 9h.01M3 5h.01M7 3h.01M10 3h.01M14 3h.01M17 3h.01M21 3h.01M21 7h.01M21 11h.01M21 15h.01M21 19h.01M21 21h.01M17 21h.01M14 21h.01M9.663 17C10 16 11 15 12 15s2 1 2.337 2m-2.337-4V7a3 3 0 00-3-3H7a3 3 0 00-3 3v6m3-3h10a3 3 0 013 3v6" />
                  </svg>
                )}
                <span>Generate Performer Insight</span>
              </button>
              {performerInsight && (
                <div className="mt-3 p-3 text-sm bg-blue-100 rounded text-blue-800 border border-blue-200 whitespace-pre-wrap">
                  {performerInsight}
                </div>
              )}
            </>
          )}
        </div>

        {/* Class History Section */}
        <h2 className="text-2xl font-bold text-gray-800 mb-4 mt-8">Class History</h2>
        <div className="bg-orange-50 p-4 rounded-xl mb-6 shadow-sm border border-orange-200">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-2 mb-4">
            <InputField
              label="Search Date"
              type="date"
              value={classSearchDate}
              onChange={(e) => setClassSearchDate(e.target.value)}
              className="w-full"
            />
            <InputField
              label="Search Start Time"
              value={classSearchTime}
              onChange={(e) => setClassSearchTime(e.target.value)}
              onBlur={(e) => setClassSearchTime(formatTime(e.target.value))}
              placeholder="e.g., 11:00 AM"
              className="w-full"
            />
            <SelectField
              label="Search Age Group"
              value={classSearchAgeGroup}
              onChange={(e) => setClassSearchAgeGroup(e.target.value)}
              options={[
                { value: '', label: 'Any Age Group' },
                { value: 'JR', label: 'Junior' },
                { value: 'TN', label: 'Teen' },
                { value: 'SR', label: 'Senior' },
                { value: 'AD', label: 'Adult' },
              ]}
              className="w-full"
            />
            <SelectField
              label="Search Level"
              value={classSearchLevel}
              onChange={(e) => setClassSearchLevel(e.target.value)}
              options={[
                { value: '', label: 'Any Level' },
                { value: '1', label: '1' },
                { value: '2', label: '2' },
                { value: '3', label: '3' },
                { value: 'C', label: 'C (Core)' },
              ]}
              className="w-full"
            />
            <SelectField
              label="Search Room"
              value={classSearchRoom}
              onChange={(e) => setClassSearchRoom(e.target.value)}
              options={[
                { value: '', label: 'Any Room' },
                { value: 'JAM', label: 'JAM Room' },
                { value: 'ACC', label: 'Acceleration Room' },
              ]}
              className="w-full"
            />
          </div>
          <button
            onClick={handleClassSearch}
            disabled={classHistoryLoading || !isAuthReady || firebaseError}
            className={`bg-orange-600 hover:bg-orange-800 text-white font-bold py-2 px-5 rounded-lg shadow-md transition duration-200 w-full flex items-center justify-center space-x-2 mt-3 ${classHistoryLoading || !isAuthReady || firebaseError ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {classHistoryLoading ? (
              <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16l2.879-2.879m0 0A3 3 0 1017 10a3 3 0 00-4.121-4.121m0 0L8 8m-4 3h16M7 3h10a2 2 0 012 2v10a2 2 0 01-2 2H7a2 2 0 01-2-2V5a2 2 0 012-2z" />
              </svg>
            )}
            <span>Search Class History</span>
          </button>

          {classHistory.length > 0 && (
            <div className="mt-4 p-3 bg-white rounded-lg shadow-inner max-h-80 overflow-y-auto">
              <h3 className="text-lg font-semibold text-gray-800 mb-2">Class History Results:</h3>
              {classHistory.map((entry, index) => (
                <div key={index} className="mb-3 p-3 border-b border-gray-100 last:border-b-0">
                  <p className="text-sm font-medium text-gray-700">
                    <span className="text-orange-600 font-bold">{entry.fullClassName}</span>
                  </p>
                  <p className="text-sm text-gray-800">
                    Date: {entry.date}, Time: {entry.startTime} - {entry.endTime}
                  </p>
                  <p className="text-sm text-gray-800">
                    Activity: {entry.activityName}
                  </p>
                  {entry.performers && entry.performers.length > 0 && (
                    <p className="text-xs text-gray-600 italic">
                      Performers: {entry.performers.map(p => `${p.name} (${p.roles})`).join(', ')}
                    </p>
                  )}
                  {entry.notes && <p className="text-xs text-gray-600 italic">Notes: {entry.notes}</p>}
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
};

// Root component that provides the Firebase context
const ActivityScheduler = () => (
  <AppProvider>
    <App />
  </AppProvider>
);

export default ActivityScheduler;