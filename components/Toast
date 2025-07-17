import React, { useState, useEffect } from 'react';

interface ToastProps {
  message: string | null;
  onClose: () => void;
  duration?: number;
}

export const Toast: React.FC<ToastProps> = ({ message, onClose, duration = 5000 }) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (message) {
      setIsVisible(true);
      const timer = setTimeout(() => {
        setIsVisible(false);
        // Wait for the fade-out animation to complete before clearing the message
        setTimeout(onClose, 300);
      }, duration);

      return () => {
        clearTimeout(timer);
      };
    } else {
      setIsVisible(false);
    }
  }, [message, duration, onClose]);

  return (
    <div
      aria-live="assertive"
      className={`fixed inset-0 flex items-start justify-center p-6 pointer-events-none z-[100] transition-opacity duration-300 ${
        isVisible ? 'opacity-100' : 'opacity-0'
      }`}
    >
      <div className="w-full max-w-sm pointer-events-auto">
        <div className="bg-slate-800 text-white rounded-lg shadow-lg p-4 flex items-start">
          <div className="flex-1 text-sm font-medium">
            {message}
          </div>
          <button
            onClick={() => {
              setIsVisible(false);
              setTimeout(onClose, 300);
            }}
            className="ml-4 flex-shrink-0 text-slate-400 hover:text-white"
            aria-label="Close"
          >
            <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
};
