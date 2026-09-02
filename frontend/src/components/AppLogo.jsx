import React from 'react';

export default function AppLogo({ className = "w-10 h-10", size = 48, glowing = true }) {
  return (
    <div className={`relative inline-flex items-center justify-center flex-shrink-0 ${className}`}>
      {glowing && (
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-tr from-primary-500 to-emerald-400 opacity-40 blur-md -z-10 animate-pulse"></div>
      )}
      <svg 
        viewBox="0 0 512 512" 
        className="w-full h-full drop-shadow-md select-none"
        fill="none" 
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="logoBgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#0284c7" />
            <stop offset="60%" stopColor="#0369a1" />
            <stop offset="100%" stopColor="#0f172a" />
          </linearGradient>

          <linearGradient id="logoAccentGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#38bdf8" />
            <stop offset="100%" stopColor="#10b981" />
          </linearGradient>

          <linearGradient id="logoGoldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#fbbf24" />
            <stop offset="100%" stopColor="#f59e0b" />
          </linearGradient>
        </defs>

        {/* Base Squircle */}
        <rect x="32" y="32" width="448" height="448" rx="112" fill="url(#logoBgGrad)" />
        <rect x="40" y="40" width="432" height="432" rx="104" fill="none" stroke="url(#logoAccentGrad)" strokeWidth="6" strokeOpacity="0.45" />

        {/* RFID Waves */}
        <path d="M 330 140 A 130 130 0 0 1 410 220" fill="none" stroke="url(#logoAccentGrad)" strokeWidth="16" strokeLinecap="round" opacity="0.9" />
        <path d="M 300 170 A 90 90 0 0 1 360 230" fill="none" stroke="url(#logoAccentGrad)" strokeWidth="14" strokeLinecap="round" opacity="0.75" />
        <path d="M 270 200 A 50 50 0 0 1 310 240" fill="none" stroke="url(#logoAccentGrad)" strokeWidth="12" strokeLinecap="round" opacity="0.6" />

        {/* Card Body */}
        <rect x="110" y="150" width="292" height="200" rx="24" fill="#ffffff" fillOpacity="0.1" stroke="#ffffff" strokeWidth="3" strokeOpacity="0.3" />
        
        {/* Card Chip */}
        <rect x="145" y="215" width="60" height="50" rx="10" fill="url(#logoGoldGrad)" stroke="#d97706" strokeWidth="2" />
        <line x1="145" y1="240" x2="205" y2="240" stroke="#78350f" strokeWidth="2" />
        <line x1="175" y1="215" x2="175" y2="265" stroke="#78350f" strokeWidth="2" />

        {/* Graduation Cap */}
        <g transform="translate(256, 210)">
          <polygon points="0,-48 85,-18 0,12 -85,-18" fill="url(#logoAccentGrad)" />
          <path d="M -50 -5 L -50 24 C -50 48 50 48 50 24 L 50 -5 Z" fill="#0284c7" opacity="0.95" />
          <path d="M 55 -8 C 65 5 70 20 72 38" fill="none" stroke="url(#logoGoldGrad)" strokeWidth="6" strokeLinecap="round" />
          <circle cx="72" cy="42" r="6" fill="#fbbf24" />
        </g>

        {/* Indicator */}
        <circle cx="256" cy="405" r="9" fill="#10b981" />
      </svg>
    </div>
  );
}
