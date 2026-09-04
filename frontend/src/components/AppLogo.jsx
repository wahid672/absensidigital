import React from 'react';

export default function AppLogo({ className = "w-10 h-10", size = 48, glowing = true }) {
  return (
    <div className={`relative inline-flex items-center justify-center flex-shrink-0 ${className}`}>
      {glowing && (
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-tr from-sky-500 to-indigo-500 opacity-30 blur-md -z-10 animate-pulse"></div>
      )}
      <img 
        src="/logo.png" 
        alt="PresensiRFID" 
        className="w-full h-full object-contain select-none drop-shadow-sm" 
      />
    </div>
  );
}
