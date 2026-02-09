import React, { useState, useRef, useEffect } from 'react';
import Avatar from './components/Avatar';
import VideoFeed from './components/VideoFeed';
import { useGeminiLive } from './hooks/useGeminiLive';
import { ConnectionState } from './types';
import { Mic, Power, Video, Loader2, Folder, FolderOpen, MessageSquare, X, Settings2, Terminal } from 'lucide-react';

export default function App() {
  const [volume, setVolume] = useState(0);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const controlsTimeoutRef = useRef<number | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  
  const { connectionState, error, connect, disconnect, transcript, mountDirectory, isFileSystemReady } = useGeminiLive({
    onAudioData: (vol) => setVolume(vol)
  });

  const isConnected = connectionState === ConnectionState.CONNECTED;
  const isConnecting = connectionState === ConnectionState.CONNECTING;

  // Auto-open chat when transcript updates
  useEffect(() => {
    if (transcript && transcript.length > 0) {
      setIsChatOpen(true);
    }
  }, [transcript]);

  // Handle Control Bar visibility (auto-hide)
  const handleMouseMove = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = window.setTimeout(() => {
        if (isConnected) setShowControls(false);
    }, 3000);
  };

  const handleToggleConnection = () => {
    if (isConnected || isConnecting) {
      disconnect();
    } else {
      connect(videoRef.current);
    }
  };

  const handleMount = async () => {
      await mountDirectory();
  };

  return (
    <div 
        className="relative w-screen h-screen overflow-hidden bg-black text-white font-sans selection:bg-cyan-500/30"
        onMouseMove={handleMouseMove}
    >
        {/* Background Gradient */}
        <div className="absolute inset-0 bg-gradient-to-b from-slate-900 via-[#0a0a10] to-black z-0" />
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 z-0 pointer-events-none" />

        {/* Error Toast */}
        {error && (
            <div className="absolute top-10 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-top-5">
                <div className="bg-red-950/90 border border-red-500/50 text-red-200 px-6 py-3 rounded-full backdrop-blur-md shadow-2xl flex items-center space-x-3">
                    <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                    <p className="text-sm font-medium">{error}</p>
                </div>
            </div>
        )}

        {/* CENTER: Avatar Layer */}
        <div className={`absolute inset-0 flex items-center justify-center z-10 transition-all duration-700 ${isChatOpen ? 'md:-translate-x-1/4' : ''}`}>
             <div className="relative">
                <Avatar 
                    volume={volume} 
                    isActive={isConnected} 
                    scale={1.2} 
                />
                
                {/* Status Text (Only when Disconnected) */}
                {!isConnected && !isConnecting && (
                    <div className="absolute -bottom-24 left-1/2 -translate-x-1/2 w-max text-center space-y-2">
                        <h1 className="text-3xl font-bold tracking-[0.2em] text-cyan-500/20 font-mono">SYSTEM OFFLINE</h1>
                        <p className="text-slate-500 text-sm">Click power to initialize avatar</p>
                    </div>
                )}
             </div>
        </div>

        {/* RIGHT: Chat Box / Terminal Drawer */}
        <div className={`absolute top-4 bottom-4 right-4 w-full md:w-[450px] z-30 transition-transform duration-500 ease-spring ${isChatOpen ? 'translate-x-0' : 'translate-x-[110%]'}`}>
            <div className="h-full flex flex-col bg-slate-900/80 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
                {/* Chat Header */}
                <div className="flex items-center justify-between p-4 border-b border-white/5 bg-black/20">
                    <div className="flex items-center space-x-2 text-cyan-400">
                        <Terminal className="w-4 h-4" />
                        <span className="text-xs font-mono tracking-widest uppercase">Live Transcript</span>
                    </div>
                    <button 
                        onClick={() => setIsChatOpen(false)}
                        className="p-1 hover:bg-white/10 rounded-lg transition-colors text-slate-400 hover:text-white"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
                
                {/* Chat Content */}
                <div className="flex-1 p-6 overflow-y-auto font-mono text-sm leading-relaxed text-slate-300 space-y-4 custom-scrollbar">
                    {transcript ? (
                        <div className="whitespace-pre-wrap animate-in fade-in duration-500">
                            {transcript}
                            <span className="inline-block w-2 h-4 ml-1 bg-cyan-500 animate-pulse align-middle" />
                        </div>
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center text-slate-600 space-y-4">
                            <MessageSquare className="w-8 h-8 opacity-20" />
                            <p className="text-xs">Waiting for audio input...</p>
                        </div>
                    )}
                </div>
            </div>
        </div>

        {/* BOTTOM: Minimal Controls Dock */}
        <div className={`absolute bottom-8 left-1/2 -translate-x-1/2 z-40 transition-all duration-500 ${showControls || !isConnected ? 'translate-y-0 opacity-100' : 'translate-y-20 opacity-0 pointer-events-none'}`}>
            <div className="flex items-center space-x-4 p-3 bg-white/5 backdrop-blur-2xl border border-white/10 rounded-full shadow-[0_0_50px_rgba(0,0,0,0.5)]">
                
                {/* File System */}
                <button 
                    onClick={handleMount}
                    className={`p-4 rounded-full transition-all duration-300 group relative overflow-hidden ${isFileSystemReady ? 'bg-cyan-500/10 text-cyan-400' : 'bg-transparent text-slate-400 hover:bg-white/5'}`}
                    title="Mount Workspace"
                >
                    {isFileSystemReady ? <FolderOpen className="w-6 h-6" /> : <Folder className="w-6 h-6" />}
                    {/* Tooltip */}
                    <div className="absolute -top-12 left-1/2 -translate-x-1/2 bg-black/80 px-2 py-1 rounded text-xs opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                        {isFileSystemReady ? 'Workspace Mounted' : 'Mount Files'}
                    </div>
                </button>

                {/* Main Power Button */}
                <button 
                    onClick={handleToggleConnection}
                    className={`relative w-20 h-20 rounded-full flex items-center justify-center transition-all duration-500 shadow-xl group ${
                        isConnected 
                            ? 'bg-red-500/20 text-red-500 border border-red-500/50 hover:scale-105' 
                            : isConnecting
                                ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/50'
                                : 'bg-cyan-500 text-black border-4 border-cyan-900/50 hover:shadow-[0_0_30px_rgba(6,182,212,0.6)] hover:scale-110'
                    }`}
                >
                    {isConnecting ? (
                        <Loader2 className="w-8 h-8 animate-spin" />
                    ) : (
                        <Power className="w-8 h-8" />
                    )}
                </button>

                {/* Chat Toggle */}
                <button 
                    onClick={() => setIsChatOpen(!isChatOpen)}
                    className={`p-4 rounded-full transition-all duration-300 group relative ${isChatOpen ? 'bg-white/10 text-white' : 'bg-transparent text-slate-400 hover:bg-white/5'}`}
                >
                    <MessageSquare className="w-6 h-6" />
                    <div className="absolute -top-12 left-1/2 -translate-x-1/2 bg-black/80 px-2 py-1 rounded text-xs opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                        {isChatOpen ? 'Hide Chat' : 'Show Chat'}
                    </div>
                </button>
            </div>
        </div>

        {/* BOTTOM RIGHT: PIP Video Feed */}
        <div className={`absolute bottom-8 right-8 z-20 transition-all duration-700 ${isConnected ? 'w-48 h-32 opacity-100 translate-y-0' : 'w-0 h-0 opacity-0 translate-y-10'}`}>
            <VideoFeed isActive={isConnected || isConnecting} onVideoRef={(el) => (videoRef.current = el)} />
        </div>
    </div>
  );
}