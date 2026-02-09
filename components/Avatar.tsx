import React, { useEffect, useState } from 'react';

interface AvatarProps {
  volume: number; // 0 to 1
  isActive: boolean;
  scale?: number;
}

const Avatar: React.FC<AvatarProps> = ({ volume, isActive, scale = 1 }) => {
  const [blink, setBlink] = useState(false);
  const [pupilX, setPupilX] = useState(0);
  const [pupilY, setPupilY] = useState(0);

  // Random blinking
  useEffect(() => {
    const interval = setInterval(() => {
      setBlink(true);
      setTimeout(() => setBlink(false), 150);
    }, 4000 + Math.random() * 2000);
    return () => clearInterval(interval);
  }, []);

  // Random eye movement
  useEffect(() => {
    const interval = setInterval(() => {
      setPupilX((Math.random() - 0.5) * 15);
      setPupilY((Math.random() - 0.5) * 15);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  // Mouth opening calculation based on volume
  // Scale volume to a reasonable pixel height for the mouth
  const mouthHeight = Math.max(6, volume * 150); 

  // Base size classes
  const sizeClass = "w-80 h-80"; 

  return (
    <div 
      className={`relative flex items-center justify-center transition-all duration-700 ${isActive ? 'scale-110' : 'scale-100 grayscale opacity-60'}`}
      style={{ transform: `scale(${scale})` }}
    >
      {/* Glow Effect */}
      <div className={`absolute inset-0 rounded-full bg-blue-500 opacity-20 blur-[100px] ${isActive ? 'animate-pulse-glow' : 'hidden'}`} />
      
      {/* Head Shape */}
      <div className={`${sizeClass} relative bg-slate-900 rounded-[3.5rem] shadow-2xl border-4 border-slate-700 flex flex-col items-center pt-24 overflow-hidden animate-float`}>
        
        {/* Forehead/Tech Lines */}
        <div className="absolute top-6 w-full flex justify-center space-x-2 opacity-50">
             <div className="w-24 h-1.5 bg-cyan-500 rounded-full shadow-[0_0_10px_rgba(6,182,212,0.8)]"></div>
        </div>

        {/* Eyes Container */}
        <div className="flex space-x-10 mb-10 z-10">
          {/* Left Eye */}
          <div className={`w-16 h-20 bg-black rounded-full relative overflow-hidden transition-all duration-100 ring-2 ring-slate-800 ${blink ? 'h-1 mt-10' : 'h-20'}`}>
            <div 
              className="absolute w-6 h-6 bg-cyan-400 rounded-full shadow-[0_0_15px_rgba(34,211,238,1)] transition-transform duration-500 ease-out"
              style={{ top: '30%', left: '30%', transform: `translate(${pupilX}px, ${pupilY}px)` }}
            />
          </div>
          {/* Right Eye */}
          <div className={`w-16 h-20 bg-black rounded-full relative overflow-hidden transition-all duration-100 ring-2 ring-slate-800 ${blink ? 'h-1 mt-10' : 'h-20'}`}>
             <div 
              className="absolute w-6 h-6 bg-cyan-400 rounded-full shadow-[0_0_15px_rgba(34,211,238,1)] transition-transform duration-500 ease-out"
              style={{ top: '30%', left: '30%', transform: `translate(${pupilX}px, ${pupilY}px)` }}
            />
          </div>
        </div>

        {/* Mouth */}
        <div className="relative z-10 flex items-center justify-center h-16">
            <div 
                className="bg-cyan-500 rounded-full transition-all duration-75 ease-linear shadow-[0_0_20px_rgba(34,211,238,0.6)]"
                style={{
                    width: '80px',
                    height: `${mouthHeight}px`,
                    opacity: isActive ? 0.9 : 0.3
                }}
            />
        </div>
        
        {/* Reflection/Shine */}
        <div className="absolute top-0 right-0 w-40 h-40 bg-white opacity-5 rounded-full blur-3xl transform translate-x-10 -translate-y-10" />
      </div>
    </div>
  );
};

export default Avatar;