import React from 'react';
import DatePicker, { registerLocale } from 'react-datepicker';
import { ru } from 'date-fns/locale';
import "react-datepicker/dist/react-datepicker.css";
import { Calendar } from 'lucide-react';

// Register Russian locale globally
registerLocale('ru', ru);

const CustomDatePicker = ({ 
  selected, 
  onChange, 
  placeholder = "Выберите дату", 
  minDate, 
  maxDate, 
  required = false,
  className = "",
  showIcon = false,
  showMonthYearPicker = false,
  dateFormat = "dd.MM.yyyy"
}) => {
  return (
    <div className="relative w-full">
      <style>{`
        .react-datepicker-wrapper {
          width: 100%;
        }
        .react-datepicker {
          background-color: #1A1D24;
          border-color: #333;
          color: white;
          font-family: inherit;
          font-size: 0.875rem;
        }
        .react-datepicker__header {
          background-color: #252830;
          border-bottom-color: #333;
        }
        .react-datepicker__current-month, 
        .react-datepicker__day-name,
        .react-datepicker__day {
          color: white;
        }
        .react-datepicker__day:hover {
          background-color: #333;
        }
        .react-datepicker__day--selected {
          background-color: #EAB308 !important; /* brand-yellow */
          color: black !important;
          font-weight: bold;
        }
        .react-datepicker__day--keyboard-selected {
          background-color: rgba(234, 179, 8, 0.5);
        }
        .react-datepicker__day--disabled {
          color: #555;
        }
        .react-datepicker__navigation-icon::before {
          border-color: white;
        }
        .react-datepicker__month-select,
        .react-datepicker__year-select {
          background-color: #1A1D24;
          color: white;
          border: 1px solid #333;
          border-radius: 4px;
          padding: 2px;
        }
        /* Triangle fix */
        .react-datepicker__triangle {
            display: none;
        }
      `}</style>
      
      {showIcon && (
        <div className="absolute left-3 top-1/2 transform -translate-y-1/2 pointer-events-none z-10">
          <Calendar size={16} className="text-white/40" />
        </div>
      )}
      
      <DatePicker
        selected={selected}
        onChange={onChange}
        minDate={minDate}
        maxDate={maxDate}
        dateFormat={dateFormat}
        locale="ru"
        placeholderText={placeholder}
        className={`w-full bg-black/20 border border-white/10 rounded-lg p-3 text-white focus:border-brand-yellow focus:outline-none transition-colors ${showIcon ? 'pl-10' : ''} ${className}`}
        wrapperClassName="w-full"
        showMonthDropdown={!showMonthYearPicker}
        showYearDropdown={!showMonthYearPicker}
        showMonthYearPicker={showMonthYearPicker}
        dropdownMode="select"
        required={required}
        autoComplete="off"
      />
    </div>
  );
};

export default CustomDatePicker;
