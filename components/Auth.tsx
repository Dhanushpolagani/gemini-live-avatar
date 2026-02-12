import React, { useState } from 'react';
import { User, Lock, Mail, ArrowRight, Sparkles, Fingerprint } from 'lucide-react';

interface AuthProps {
  onLogin: (user: any) => void;
}

export default function Auth({ onLogin }: AuthProps) {
  const [isLogin, setIsLogin] = useState(true);
  const [formData, setFormData] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!formData.email || !formData.password) {
      setError('Please fill in all fields');
      return;
    }

    const users = JSON.parse(localStorage.getItem('gemini_avatar_users') || '[]');

    if (isLogin) {
      const user = users.find((u: any) => u.email === formData.email && u.password === formData.password);
      if (user) {
        localStorage.setItem('gemini_avatar_session', JSON.stringify(user));
        onLogin(user);
      } else {
        setError('Invalid credentials');
      }
    } else {
      if (!formData.name) {
        setError('Name is required');
        return;
      }
      if (users.find((u: any) => u.email === formData.email)) {
        setError('Email already exists');
        return;
      }
      const newUser = { ...formData, id: crypto.randomUUID() };
      users.push(newUser);
      localStorage.setItem('gemini_avatar_users', JSON.stringify(users));
      localStorage.setItem('gemini_avatar_session', JSON.stringify(newUser));
      onLogin(newUser);
    }
  };

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4 relative overflow-hidden font-sans">
       {/* Background Aesthetics */}
       <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-black to-slate-900" />
       <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 pointer-events-none" />
       
       {/* Animated Orbs */}
       <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-cyan-500/10 rounded-full blur-[100px] animate-pulse" />
       <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-600/10 rounded-full blur-[120px] animate-pulse" />

       <div className="w-full max-w-md bg-slate-900/50 backdrop-blur-xl border border-white/10 p-8 rounded-3xl shadow-2xl relative z-10">
          <div className="text-center mb-8">
             <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-cyan-500/10 mb-4 ring-1 ring-cyan-500/50">
                <Fingerprint className="w-8 h-8 text-cyan-400" />
             </div>
             <h1 className="text-3xl font-bold text-white mb-2 tracking-tight">Gemini Avatar</h1>
             <p className="text-slate-400 text-sm">Secure Neural Interface</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <div className="relative group">
                <User className="absolute left-4 top-3.5 w-5 h-5 text-slate-500 group-focus-within:text-cyan-400 transition-colors" />
                <input 
                  type="text" 
                  placeholder="Full Name"
                  className="w-full bg-black/40 border border-white/10 rounded-xl py-3 pl-12 pr-4 text-white focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50 transition-all placeholder:text-slate-600"
                  value={formData.name}
                  onChange={e => setFormData({...formData, name: e.target.value})}
                />
              </div>
            )}
            
            <div className="relative group">
              <Mail className="absolute left-4 top-3.5 w-5 h-5 text-slate-500 group-focus-within:text-cyan-400 transition-colors" />
              <input 
                type="email" 
                placeholder="Email Address"
                className="w-full bg-black/40 border border-white/10 rounded-xl py-3 pl-12 pr-4 text-white focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50 transition-all placeholder:text-slate-600"
                value={formData.email}
                onChange={e => setFormData({...formData, email: e.target.value})}
              />
            </div>

            <div className="relative group">
              <Lock className="absolute left-4 top-3.5 w-5 h-5 text-slate-500 group-focus-within:text-cyan-400 transition-colors" />
              <input 
                type="password" 
                placeholder="Password"
                className="w-full bg-black/40 border border-white/10 rounded-xl py-3 pl-12 pr-4 text-white focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50 transition-all placeholder:text-slate-600"
                value={formData.password}
                onChange={e => setFormData({...formData, password: e.target.value})}
              />
            </div>

            {error && (
              <div className="text-red-400 text-sm text-center bg-red-500/10 py-2 rounded-lg border border-red-500/20">
                {error}
              </div>
            )}

            <button 
              type="submit"
              className="w-full bg-cyan-600 hover:bg-cyan-500 text-white font-medium py-3 rounded-xl transition-all shadow-lg shadow-cyan-900/20 flex items-center justify-center space-x-2 group"
            >
              <span>{isLogin ? 'Initialize Session' : 'Create Identity'}</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </button>
          </form>

          <div className="mt-6 text-center">
            <button 
              onClick={() => { setIsLogin(!isLogin); setError(''); }}
              className="text-slate-500 hover:text-cyan-400 text-sm transition-colors"
            >
              {isLogin ? "Don't have an access key? Register" : "Already have an identity? Login"}
            </button>
          </div>
       </div>
    </div>
  );
}