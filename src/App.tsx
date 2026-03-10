/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Trophy, Target, TrendingUp, TrendingDown, Moon, Sun, Crown, Users, X, ChevronRight, LogIn, UserPlus, LogOut, AlertTriangle, Shield, Trash2, Ban, UserCheck, Send, MessageSquare, Zap, EyeOff, Unlock } from 'lucide-react';
import { io, Socket } from 'socket.io-client';

type Rank = {
  name: string;
  minElo: number;
  color: string;
  icon: React.ReactNode;
};

type Player = {
  name: string;
  elo: number;
  rank: string;
  isGuest?: boolean;
  isAdmin?: boolean;
};

type AdminUser = {
  id: number;
  username: string;
  elo: number;
  rank: string;
  streak: number;
  is_admin: number;
  is_leaderboard_banned: number;
  banned_until: string | null;
};

const RANKS: Rank[] = [
  { name: 'Unranked', minElo: 0, color: 'text-slate-400', icon: <Target className="w-5 h-5" /> },
  { name: 'Bronze 1', minElo: 100, color: 'text-orange-700', icon: <Trophy className="w-5 h-5" /> },
  { name: 'Bronze 2', minElo: 500, color: 'text-orange-700', icon: <Trophy className="w-5 h-5" /> },
  { name: 'Bronze 3', minElo: 1000, color: 'text-orange-700', icon: <Trophy className="w-5 h-5" /> },
  { name: 'Silver 1', minElo: 2500, color: 'text-slate-300', icon: <Trophy className="w-5 h-5" /> },
  { name: 'Silver 2', minElo: 5000, color: 'text-slate-300', icon: <Trophy className="w-5 h-5" /> },
  { name: 'Silver 3', minElo: 7500, color: 'text-slate-300', icon: <Trophy className="w-5 h-5" /> },
  { name: 'Gold 1', minElo: 12500, color: 'text-yellow-400', icon: <Trophy className="w-5 h-5" /> },
  { name: 'Gold 2', minElo: 17500, color: 'text-yellow-400', icon: <Trophy className="w-5 h-5" /> },
  { name: 'Gold 3', minElo: 25000, color: 'text-yellow-400', icon: <Trophy className="w-5 h-5" /> },
  { name: 'Obsidian 1', minElo: 35000, color: 'text-purple-600', icon: <Trophy className="w-5 h-5" /> },
  { name: 'Obsidian 2', minElo: 45000, color: 'text-purple-600', icon: <Trophy className="w-5 h-5" /> },
  { name: 'Obsidian 3', minElo: 60000, color: 'text-purple-600', icon: <Trophy className="w-5 h-5" /> },
  { name: 'Sun', minElo: 75000, color: 'text-amber-500', icon: <Sun className="w-6 h-6" /> },
  { name: 'Moon', minElo: 85000, color: 'text-blue-200', icon: <Moon className="w-6 h-6" /> },
  { name: 'Blood Moon', minElo: 95000, color: 'text-red-600', icon: <Moon className="w-6 h-6 fill-current" /> },
  { name: 'King Moon', minElo: 100000, color: 'text-yellow-200', icon: <Crown className="w-8 h-8" /> },
];

export default function App() {
  const [elo, setElo] = useState<number>(0);
  const [streak, setStreak] = useState<number>(1);
  const [name, setName] = useState<string>('');
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [token, setToken] = useState<string | null>(localStorage.getItem('mo-ranked-token'));
  const [isGuest, setIsGuest] = useState<boolean>(localStorage.getItem('mo-ranked-is-guest') === 'true');
  const [isAuthOpen, setIsAuthOpen] = useState(!localStorage.getItem('mo-ranked-token') && localStorage.getItem('mo-ranked-is-guest') !== 'true');
  const [authMode, setAuthMode] = useState<'login' | 'signup' | 'guest'>('login');
  const [authForm, setAuthForm] = useState({ username: '', password: '' });
  const [authError, setAuthError] = useState<string | null>(null);
  const [bannedInfo, setBannedInfo] = useState<{ bannedUntil: string; isPermanent: boolean } | null>(null);

  const [dotPos, setDotPos] = useState({ x: 50, y: 50 });
  const [feedback, setFeedback] = useState<{ id: number; x: number; y: number; value: number }[]>([]);
  const [streakTimeLeft, setStreakTimeLeft] = useState(0);
  const [showRankUp, setShowRankUp] = useState<Rank | null>(null);
  const [leaderboard, setLeaderboard] = useState<Player[]>([]);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [globalMessage, setGlobalMessage] = useState<{ message: string; from: string } | null>(null);
  const socketRef = useRef<Socket | null>(null);
  
  const [lastRankName, setLastRankName] = useState<string>('Unranked');
  const containerRef = useRef<HTMLDivElement>(null);

  const getCurrentRank = useCallback((currentElo: number) => {
    for (let i = RANKS.length - 1; i >= 0; i--) {
      if (currentElo >= RANKS[i].minElo) {
        return RANKS[i];
      }
    }
    return RANKS[0];
  }, []);

  // Fetch user data on load
  useEffect(() => {
    if (token) {
      fetch('/api/auth/me', {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      .then(async res => {
        let data;
        try {
          data = await res.json();
        } catch (e) {
          if (res.status === 403) {
            setBannedInfo({ 
              bannedUntil: '9999-12-31T23:59:59.999Z', 
              isPermanent: true 
            });
            setIsAuthOpen(false);
            setAuthError(null);
            return;
          }
          if (!res.ok) {
            handleLogout();
            return;
          }
          throw e;
        }
        
        if (!res.ok) {
          const isBanned = res.status === 403 && (data.error?.toLowerCase().includes("ban") || data.bannedUntil);
          if (isBanned) {
            setBannedInfo({ 
              bannedUntil: data.bannedUntil || '9999-12-31T23:59:59.999Z', 
              isPermanent: !!data.isPermanent || data.bannedUntil?.startsWith('9999') 
            });
            setIsAuthOpen(false);
            setAuthError(null);
          } else {
            handleLogout();
          }
          return;
        }
        if (data.user) {
          setName(data.user.username);
          setElo(data.user.elo);
          setStreak(data.user.streak || 1);
          setLastRankName(data.user.rank);
          setIsAdmin(data.user.isAdmin);
        }
      })
      .catch(() => handleLogout());
    } else if (isGuest) {
      const savedElo = localStorage.getItem('mo-ranked-elo');
      const savedName = localStorage.getItem('mo-ranked-name');
      if (savedElo) setElo(parseInt(savedElo, 10));
      if (savedName) setName(savedName);
    }
  }, [token, isGuest]);

  useEffect(() => {
    socketRef.current = io();

    socketRef.current.on('connect', () => {
      if (name) {
        socketRef.current?.emit('join', {
          name,
          elo,
          streak,
          rank: getCurrentRank(elo).name,
          isGuest,
          isAdmin,
          token: token || undefined
        });
      }
    });

    socketRef.current.on('leaderboard-update', (data: Player[]) => {
      setLeaderboard(data);
    });

    socketRef.current.on('global-message', (data: { message: string; from: string }) => {
      setGlobalMessage(data);
      setTimeout(() => setGlobalMessage(null), 8000);
    });

    socketRef.current.on('force-elo-update', (data: { elo: number; rank: string }) => {
      setElo(data.elo);
      setLastRankName(data.rank);
    });

    socketRef.current.on('force-streak-update', (data: { streak: number }) => {
      setStreak(data.streak);
    });

    socketRef.current.on('kick', (data: { reason: string; bannedUntil?: string; isPermanent?: boolean }) => {
      if (data.bannedUntil) {
        setBannedInfo({ bannedUntil: data.bannedUntil, isPermanent: !!data.isPermanent });
      } else {
        alert(data.reason);
        setToken(null);
        setName('');
        setElo(100);
        setLastRankName('Bronze I');
        localStorage.removeItem('mo-ranked-token');
        localStorage.removeItem('mo-ranked-is-guest');
        window.location.reload();
      }
    });

    return () => {
      socketRef.current?.disconnect();
    };
  }, [name, isAdmin]);

  useEffect(() => {
    if (isGuest) {
      localStorage.setItem('mo-ranked-elo', elo.toString());
      localStorage.setItem('mo-ranked-name', name);
    }
    
    const currentRank = getCurrentRank(elo);
    
    socketRef.current?.emit('update-elo', {
      elo,
      rank: currentRank.name,
      token: token || undefined
    });

    if (currentRank.name !== lastRankName) {
      const currentIndex = RANKS.findIndex(r => r.name === currentRank.name);
      const lastIndex = RANKS.findIndex(r => r.name === lastRankName);
      
      if (currentIndex > lastIndex) {
        setShowRankUp(currentRank);
        setTimeout(() => setShowRankUp(null), 3000);
      }
      setLastRankName(currentRank.name);
    }
  }, [elo, lastRankName, name, token, isGuest]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    const endpoint = authMode === 'login' ? '/api/auth/login' : '/api/auth/signup';
    
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(authForm)
      });
      
      let data;
      try {
        data = await res.json();
      } catch (e) {
        if (res.status === 403) {
          setBannedInfo({ 
            bannedUntil: '9999-12-31T23:59:59.999Z', 
            isPermanent: true 
          });
          setIsAuthOpen(false);
          setAuthError(null);
          return;
        }
        if (!res.ok) {
          setAuthError(`Server error (${res.status})`);
          return;
        }
        throw e;
      }
      
      if (!res.ok) {
        const isBanned = res.status === 403 && (data.error?.toLowerCase().includes("ban") || data.bannedUntil);
        if (isBanned) {
          setBannedInfo({ 
            bannedUntil: data.bannedUntil || '9999-12-31T23:59:59.999Z', 
            isPermanent: !!data.isPermanent || data.bannedUntil?.startsWith('9999') 
          });
          setIsAuthOpen(false);
          setAuthError(null);
        } else {
          setAuthError(data.error || "Authentication failed");
        }
        return;
      }

      localStorage.setItem('mo-ranked-token', data.token);
      localStorage.removeItem('mo-ranked-is-guest');
      setToken(data.token);
      setIsGuest(false);
      setName(data.user.username);
      setElo(data.user.elo);
      setIsAdmin(data.user.isAdmin);
      setIsAuthOpen(false);
      setBannedInfo(null);
    } catch (err: any) {
      setAuthError(err.message);
    }
  };

  const fetchAdminUsers = async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/admin/users', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.users) setAdminUsers(data.users);
    } catch (err) {
      console.error("Failed to fetch admin users", err);
    }
  };

  const adminAction = async (endpoint: string, body: any) => {
    if (!token) return;
    try {
      const res = await fetch(`/api/admin/${endpoint}`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (res.ok) {
        fetchAdminUsers();
      } else {
        alert(data.error || `Admin action ${endpoint} failed`);
      }
    } catch (err) {
      console.error(`Admin action ${endpoint} failed`, err);
      alert("Network error. Check console.");
    }
  };

  const handleGuestJoin = () => {
    if (!authForm.username.trim()) {
      setAuthError("Please enter a nickname");
      return;
    }
    localStorage.setItem('mo-ranked-is-guest', 'true');
    localStorage.setItem('mo-ranked-name', authForm.username);
    setIsGuest(true);
    setName(authForm.username);
    setIsAuthOpen(false);
  };

  const handleLogout = () => {
    localStorage.removeItem('mo-ranked-token');
    localStorage.removeItem('mo-ranked-is-guest');
    setToken(null);
    setIsGuest(false);
    setIsAdmin(false);
    setName('');
    setElo(0);
    setIsAuthOpen(true);
  };

  useEffect(() => {
    if (streakTimeLeft > 0) {
      const timer = setInterval(() => {
        setStreakTimeLeft(prev => Math.max(0, prev - 1));
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [streakTimeLeft]);

  const moveDot = useCallback(() => {
    // Random position between 10% and 90% to keep it away from edges
    const newX = Math.random() * 80 + 10;
    const newY = Math.random() * 80 + 10;
    setDotPos({ x: newX, y: newY });
  }, []);

  const handleDotClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    
    // 1/10 chance for a streak if not already in one
    if (streakTimeLeft === 0 && Math.random() < 0.1) {
      setStreakTimeLeft(10);
    }

    const gain = (streakTimeLeft > 0 ? 2 : 1) * streak;
    setElo(prev => prev + gain);
    addFeedback(e.clientX, e.clientY, gain);
    moveDot();
  };

  const handleMiss = (e: React.MouseEvent) => {
    if (elo > 0) {
      setElo(prev => Math.max(0, prev - 1));
      addFeedback(e.clientX, e.clientY, -1);
    }
  };

  const addFeedback = (x: number, y: number, value: number) => {
    const id = Date.now();
    setFeedback(prev => [...prev, { id, x, y, value }]);
    setTimeout(() => {
      setFeedback(prev => prev.filter(f => f.id !== id));
    }, 1000);
  };

  const currentRank = getCurrentRank(elo);
  const nextRank = RANKS[RANKS.indexOf(currentRank) + 1];

  return (
    <div 
      ref={containerRef}
      onClick={handleMiss}
      className="relative w-full h-screen bg-[#050505] overflow-hidden flex flex-col items-center justify-center cursor-crosshair select-none"
    >
      {/* Atmospheric Background */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-900/20 rounded-full blur-[120px]" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-900/10 rounded-full blur-[120px]" />
        {elo >= 25000 && (
          <div className="absolute inset-0 bg-red-900/5 transition-colors duration-1000" />
        )}
      </div>

      {/* HUD */}
      <div className="absolute top-8 left-0 right-0 flex flex-col items-center pointer-events-none z-10">
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center"
        >
          <div className="flex items-center gap-4 mb-1">
            <h1 className="text-4xl font-black tracking-tighter text-white uppercase italic">
              MoRanked
            </h1>
            <div className="flex items-center gap-2 pointer-events-auto">
              <button
                onClick={(e) => { e.stopPropagation(); setShowLeaderboard(true); }}
                className="p-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-colors"
                title="Leaderboard"
              >
                <Users className="w-5 h-5 text-white" />
              </button>
              {isAdmin && (
                <button
                  onClick={(e) => { e.stopPropagation(); setShowAdminPanel(true); fetchAdminUsers(); }}
                  className="p-2 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/30 rounded-xl transition-colors"
                  title="Admin Panel"
                >
                  <Shield className="w-5 h-5 text-blue-400" />
                </button>
              )}
              <button
                onClick={(e) => { e.stopPropagation(); handleLogout(); }}
                className="p-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-colors"
                title="Logout"
              >
                <LogOut className="w-5 h-5 text-white" />
              </button>
            </div>
          </div>
          
          <AnimatePresence>
            {globalMessage && (
              <motion.div
                initial={{ opacity: 0, y: -20, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="mb-4 px-6 py-3 bg-blue-600 border border-blue-400 rounded-2xl shadow-[0_0_30px_rgba(37,99,235,0.4)] flex items-center gap-3 pointer-events-auto"
              >
                <MessageSquare className="w-5 h-5 text-white animate-pulse" />
                <div className="flex flex-col">
                  <span className="text-[10px] font-black uppercase tracking-widest text-blue-200 leading-none mb-1">Global Broadcast</span>
                  <span className="text-sm font-bold text-white leading-tight">{globalMessage.message}</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {isGuest && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-2 px-3 py-1 bg-red-500/10 border border-red-500/20 rounded-full flex items-center gap-2"
              >
                <AlertTriangle className="w-3 h-3 text-red-400" />
                <span className="text-[10px] font-bold text-red-400 uppercase tracking-widest">Guest Mode: ELO will not save permanently</span>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {streakTimeLeft > 0 && (
              <motion.div
                initial={{ opacity: 0, scale: 0.5, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.5, y: 10 }}
                className="mb-2 px-4 py-1 bg-gradient-to-r from-orange-500 to-yellow-500 rounded-full shadow-[0_0_20px_rgba(249,115,22,0.4)] flex items-center gap-2 border border-white/20"
              >
                <TrendingUp className="w-4 h-4 text-white animate-bounce" />
                <span className="text-xs font-black text-white uppercase tracking-widest">Streak Active! x2 ELO ({streakTimeLeft}s)</span>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex items-center gap-3 bg-white/5 backdrop-blur-md border border-white/10 px-6 py-3 rounded-2xl shadow-2xl">
            {streak > 1 && (
              <div className="flex flex-col items-center justify-center bg-emerald-500/20 border border-emerald-500/30 px-3 py-1 rounded-xl mr-2">
                <span className="text-[8px] font-black text-emerald-400 uppercase tracking-tighter">Multiplier</span>
                <span className="text-sm font-black text-emerald-400 leading-none">x{streak}</span>
              </div>
            )}
            <div className={`p-2 rounded-lg bg-black/40 ${currentRank.color}`}>
              {currentRank.icon}
            </div>
            <div className="flex flex-col">
              <span className={`text-xs font-bold uppercase tracking-widest opacity-60 ${currentRank.color}`}>
                Current Rank
              </span>
              <span className="text-xl font-bold text-white leading-tight">
                {currentRank.name}
              </span>
            </div>
            <div className="h-8 w-px bg-white/10 mx-2" />
            <div className="flex flex-col items-end">
              <span className="text-xs font-bold uppercase tracking-widest text-slate-500">
                ELO Rating
              </span>
              <motion.span 
                key={elo}
                initial={{ scale: 1.2, color: '#fff' }}
                animate={{ scale: 1, color: '#fff' }}
                className="text-2xl font-mono font-bold"
              >
                {elo.toLocaleString()}
              </motion.span>
            </div>
          </div>
        </motion.div>

        {nextRank && (
          <div className="mt-4 w-64">
            <div className="flex justify-between text-[10px] uppercase font-bold tracking-widest text-slate-500 mb-1">
              <span>Progress to {nextRank.name}</span>
              <span>{Math.floor(((elo - currentRank.minElo) / (nextRank.minElo - currentRank.minElo)) * 100)}%</span>
            </div>
            <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden border border-white/5">
              <motion.div 
                className={`h-full bg-gradient-to-r from-blue-500 to-purple-500`}
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(100, ((elo - currentRank.minElo) / (nextRank.minElo - currentRank.minElo)) * 100)}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* The Dot (The Moon) */}
      <motion.div
        layoutId="target-dot"
        onClick={handleDotClick}
        animate={{ 
          left: `${dotPos.x}%`, 
          top: `${dotPos.y}%`,
          scale: [1, 1.1, 1],
        }}
        transition={{ 
          type: 'spring', 
          stiffness: 300, 
          damping: 25,
          scale: { repeat: Infinity, duration: 2 }
        }}
        className="absolute w-12 h-12 -ml-6 -mt-6 rounded-full cursor-pointer z-20 group"
      >
        <div className="absolute inset-0 bg-white rounded-full shadow-[0_0_30px_rgba(255,255,255,0.5)] group-hover:shadow-[0_0_50px_rgba(255,255,255,0.8)] transition-shadow duration-300" />
        <div className="absolute inset-1 bg-slate-100 rounded-full overflow-hidden opacity-20">
          <div className="absolute top-2 left-2 w-3 h-3 bg-slate-400 rounded-full blur-[1px]" />
          <div className="absolute bottom-3 right-4 w-2 h-2 bg-slate-400 rounded-full blur-[1px]" />
        </div>
      </motion.div>

      {/* Click Feedback */}
      <AnimatePresence>
        {feedback.map(f => (
          <motion.div
            key={f.id}
            initial={{ opacity: 1, y: f.y - 20, x: f.x }}
            animate={{ opacity: 0, y: f.y - 100 }}
            exit={{ opacity: 0 }}
            className={`absolute pointer-events-none text-xl font-black italic flex items-center gap-1 z-30 ${f.value > 0 ? 'text-emerald-400' : 'text-red-500'}`}
          >
            {f.value > 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
            {f.value > 0 ? `+${f.value}` : f.value} ELO
          </motion.div>
        ))}
      </AnimatePresence>

      {/* Admin Panel Overlay */}
      <AnimatePresence>
        {showAdminPanel && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowAdminPanel(false)}
            className="absolute inset-0 bg-black/80 backdrop-blur-md z-[150] flex items-center justify-center p-6"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-4xl h-[80vh] bg-[#0a0a0a] border border-white/10 rounded-[40px] shadow-2xl flex flex-col overflow-hidden"
            >
              <div className="p-8 border-b border-white/10 flex items-center justify-between bg-white/5">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-blue-500/20 rounded-2xl border border-blue-500/30">
                    <Shield className="w-6 h-6 text-blue-400" />
                  </div>
                  <div>
                    <h2 className="text-3xl font-black uppercase italic tracking-tighter">Admin Control</h2>
                    <p className="text-slate-500 text-xs font-bold uppercase tracking-widest">Global Management System</p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowAdminPanel(false)}
                  className="p-3 hover:bg-white/10 rounded-2xl transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-8 space-y-8">
                {/* Global Broadcast Section */}
                <div className="grid md:grid-cols-2 gap-8">
                  <section className="space-y-4">
                    <h3 className="text-xs font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
                      <Send className="w-4 h-4" /> Global Broadcast
                    </h3>
                    <div className="flex gap-3">
                      <input 
                        id="broadcast-msg"
                        type="text"
                        placeholder="Type a message to everyone..."
                        className="flex-1 bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-white font-bold focus:outline-none focus:border-blue-500/50"
                      />
                      <button 
                        onClick={() => {
                          const input = document.getElementById('broadcast-msg') as HTMLInputElement;
                          if (input.value) {
                            adminAction('broadcast', { message: input.value });
                            input.value = '';
                          }
                        }}
                        className="px-8 bg-blue-500 hover:bg-blue-600 rounded-2xl text-white font-black uppercase text-xs transition-all"
                      >
                        Send
                      </button>
                    </div>
                  </section>

                  <section className="space-y-4">
                    <h3 className="text-xs font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
                      <Zap className="w-4 h-4" /> Global Multiplier
                    </h3>
                    <div className="flex gap-3">
                      <input 
                        id="global-streak-input"
                        type="number"
                        placeholder="Set streak for all..."
                        className="flex-1 bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-white font-bold focus:outline-none focus:border-emerald-500/50"
                      />
                      <button 
                        onClick={() => {
                          const input = document.getElementById('global-streak-input') as HTMLInputElement;
                          const val = parseInt(input.value);
                          if (!isNaN(val)) {
                            adminAction('set-streak-all', { streak: val });
                            input.value = '';
                          }
                        }}
                        className="px-8 bg-emerald-500 hover:bg-emerald-600 rounded-2xl text-white font-black uppercase text-xs transition-all"
                      >
                        Set All
                      </button>
                    </div>
                  </section>
                </div>

                {/* User Management Section */}
                <section className="space-y-4">
                  <h3 className="text-xs font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
                    <Users className="w-4 h-4" /> User Management
                  </h3>
                  <div className="grid gap-3">
                    {adminUsers.map(user => (
                      <div key={user.id} className="bg-white/5 border border-white/10 rounded-3xl p-6 flex flex-col gap-4 group hover:border-white/20 transition-all">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center border border-white/10">
                              {user.is_admin ? <Shield className="w-6 h-6 text-blue-400" /> : <Users className="w-6 h-6 text-slate-500" />}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-black text-white text-lg">{user.username}</span>
                                {user.is_admin ? <span className="text-[8px] bg-blue-500 px-1.5 py-0.5 rounded uppercase font-black">Admin</span> : null}
                                {user.banned_until && new Date(user.banned_until) > new Date() && (
                                  <span className="text-[8px] bg-red-500 px-1.5 py-0.5 rounded uppercase font-black">
                                    {user.banned_until.startsWith('9999') ? 'Terminated' : 'Banned'}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-3 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                                <span>{user.rank}</span>
                                <span className="w-1 h-1 bg-slate-700 rounded-full" />
                                <span>{user.elo.toLocaleString()} ELO</span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            {/* Inline ELO Input */}
                            <div className="flex items-center bg-black/40 rounded-xl border border-white/5 overflow-hidden">
                              <input 
                                id={`elo-input-${user.id}`}
                                type="number"
                                defaultValue={user.elo}
                                className="w-20 bg-transparent px-3 py-2 text-xs font-bold text-emerald-400 focus:outline-none"
                              />
                              <button 
                                onClick={() => {
                                  const input = document.getElementById(`elo-input-${user.id}`) as HTMLInputElement;
                                  const val = parseInt(input.value);
                                  if (!isNaN(val)) {
                                    adminAction('set-elo', { userId: user.id, elo: val, rank: getCurrentRank(val).name });
                                  }
                                }}
                                className="px-3 py-2 text-[10px] font-black uppercase text-emerald-500 hover:bg-emerald-500/10 border-l border-white/5 transition-colors"
                              >
                                Set
                              </button>
                            </div>

                            {/* Inline Streak Input */}
                            <div className="flex items-center bg-black/40 rounded-xl border border-white/5 overflow-hidden">
                              <input 
                                id={`streak-input-${user.id}`}
                                type="number"
                                defaultValue={user.streak}
                                className="w-12 bg-transparent px-2 py-2 text-xs font-bold text-blue-400 focus:outline-none"
                              />
                              <button 
                                onClick={() => {
                                  const input = document.getElementById(`streak-input-${user.id}`) as HTMLInputElement;
                                  const val = parseInt(input.value);
                                  if (!isNaN(val)) {
                                    adminAction('set-streak', { userId: user.id, streak: val });
                                  }
                                }}
                                className="px-2 py-2 text-[8px] font-black uppercase text-blue-500 hover:bg-blue-500/10 border-l border-white/5 transition-colors"
                              >
                                Set
                              </button>
                            </div>

                            <button 
                              onClick={() => adminAction('promote', { userId: user.id, isAdmin: !user.is_admin })}
                              className={`p-2 hover:bg-white/10 rounded-xl transition-colors ${user.is_admin ? 'text-slate-400' : 'text-blue-400'}`}
                              title={user.is_admin ? "Demote" : "Promote to Admin"}
                            >
                              <UserCheck className="w-5 h-5" />
                            </button>

                            <button 
                              onClick={() => adminAction('leaderboard-ban', { userId: user.id, isBanned: !user.is_leaderboard_banned })}
                              className={`p-2 hover:bg-white/10 rounded-xl transition-colors ${user.is_leaderboard_banned ? 'text-red-500' : 'text-slate-400'}`}
                              title={user.is_leaderboard_banned ? "Unban from Leaderboard" : "Ban from Leaderboard"}
                            >
                              <EyeOff className="w-5 h-5" />
                            </button>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 pt-4 border-t border-white/5">
                          <span className="text-[10px] font-black uppercase tracking-widest text-slate-600">Ban Controls:</span>
                          <div className="flex gap-2">
                            {user.banned_until && new Date(user.banned_until) > new Date() ? (
                              <button 
                                onClick={() => adminAction('unban', { userId: user.id })}
                                className="px-4 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all border border-emerald-500/20"
                              >
                                Revoke Ban
                              </button>
                            ) : (
                              <>
                                <button 
                                  onClick={() => adminAction('ban', { userId: user.id, durationMinutes: 60 })}
                                  className="px-4 py-1.5 bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all border border-orange-500/20"
                                >
                                  1 Hour
                                </button>
                                <button 
                                  onClick={() => adminAction('ban', { userId: user.id, durationMinutes: 1440 })}
                                  className="px-4 py-1.5 bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all border border-orange-500/20"
                                >
                                  24 Hours
                                </button>
                                <button 
                                  onClick={() => adminAction('ban', { userId: user.id, isPermanent: true })}
                                  className="px-4 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all border border-red-500/20"
                                >
                                  Permanent
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Instructions */}
      <div className="absolute bottom-8 text-slate-500 text-[10px] uppercase font-bold tracking-[0.2em] pointer-events-none">
        Click the moon to climb • Miss and lose ELO
      </div>

      {/* Leaderboard Overlay */}
      <AnimatePresence>
        {showLeaderboard && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowLeaderboard(false)}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-end p-4"
          >
            <motion.div
              initial={{ x: 400 }}
              animate={{ x: 0 }}
              exit={{ x: 400 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md h-full bg-[#0a0a0a] border-l border-white/10 shadow-2xl flex flex-col"
            >
              <div className="p-6 border-bottom border-white/10 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Users className="w-6 h-6 text-blue-400" />
                  <h2 className="text-2xl font-black uppercase italic tracking-tighter">Leaderboard</h2>
                </div>
                <button 
                  onClick={() => setShowLeaderboard(false)}
                  className="p-2 hover:bg-white/5 rounded-full transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-3">
                {leaderboard.map((player, index) => (
                  <div 
                    key={index}
                    className={`flex items-center justify-between p-4 rounded-2xl border transition-all ${
                      player.name === name 
                        ? 'bg-blue-500/10 border-blue-500/30' 
                        : 'bg-white/5 border-white/5'
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <span className="text-xl font-black italic text-white/20 w-6">
                        {index + 1}
                      </span>
                      <div className="flex flex-col">
                        <span className="font-bold text-white flex items-center gap-2">
                          {player.name}
                          {player.name === name && <span className="text-[10px] bg-blue-500 px-1.5 py-0.5 rounded uppercase font-black">You</span>}
                        </span>
                        <span className="text-[10px] uppercase font-bold tracking-widest text-slate-500">
                          {player.rank}
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-mono font-bold text-white">
                        {player.elo.toLocaleString()}
                      </div>
                      <div className="text-[10px] uppercase font-bold tracking-widest text-slate-500">
                        ELO
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Banned GUI */}
      <AnimatePresence>
        {bannedInfo && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0 bg-black/95 backdrop-blur-2xl z-[200] flex items-center justify-center p-6"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="w-full max-w-md bg-red-950/20 border border-red-500/30 rounded-[40px] p-10 flex flex-col items-center text-center shadow-[0_0_50px_rgba(239,68,68,0.2)]"
            >
              <div className="w-24 h-24 bg-red-500/20 rounded-3xl flex items-center justify-center mb-8 border border-red-500/30">
                <Ban className="w-12 h-12 text-red-500 animate-pulse" />
              </div>
              <h2 className="text-4xl font-black uppercase italic tracking-tighter mb-4 text-red-500">Banned</h2>
              <p className="text-slate-200 text-xl font-bold mb-12 leading-relaxed">
                Your account has been banned for {bannedInfo.isPermanent ? 'Permanent' : new Date(bannedInfo.bannedUntil).toLocaleString()}
              </p>

              <button 
                onClick={() => {
                  setToken(null);
                  localStorage.removeItem('mo-ranked-token');
                  setBannedInfo(null);
                  setIsAuthOpen(true);
                }}
                className="w-full py-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl text-white font-black uppercase tracking-widest text-xs transition-all"
              >
                Return to Login
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Auth Overlay */}
      <AnimatePresence>
        {isAuthOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0 bg-black/90 backdrop-blur-xl z-[100] flex items-center justify-center p-6"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="w-full max-w-sm flex flex-col items-center"
            >
              <div className="w-20 h-20 bg-blue-500/20 rounded-3xl flex items-center justify-center mb-6 border border-blue-500/30">
                <Crown className="w-10 h-10 text-blue-400" />
              </div>
              <h2 className="text-3xl font-black uppercase italic tracking-tighter mb-2 text-center">MoRanked</h2>
              <p className="text-slate-400 text-sm mb-8 text-center">Join the cosmic competition.</p>
              
              <div className="w-full space-y-4">
                <div className="flex p-1 bg-white/5 rounded-2xl border border-white/10">
                  <button 
                    onClick={() => { setAuthMode('login'); setAuthError(null); }}
                    className={`flex-1 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${authMode === 'login' ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/60'}`}
                  >
                    Login
                  </button>
                  <button 
                    onClick={() => { setAuthMode('signup'); setAuthError(null); }}
                    className={`flex-1 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${authMode === 'signup' ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/60'}`}
                  >
                    Signup
                  </button>
                  <button 
                    onClick={() => { setAuthMode('guest'); setAuthError(null); }}
                    className={`flex-1 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${authMode === 'guest' ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/60'}`}
                  >
                    Guest
                  </button>
                </div>

                <form onSubmit={handleAuth} className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-black tracking-widest text-slate-500 ml-2">
                      {authMode === 'guest' ? 'Nickname' : 'Username'}
                    </label>
                    <input
                      type="text"
                      value={authForm.username}
                      onChange={(e) => setAuthForm(prev => ({ ...prev, username: e.target.value }))}
                      className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-white font-bold placeholder:text-white/10 focus:outline-none focus:border-blue-500/50 transition-all"
                      placeholder={authMode === 'guest' ? "Your Nickname" : "Username"}
                      required
                    />
                  </div>

                  {authMode !== 'guest' && (
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-black tracking-widest text-slate-500 ml-2">Password</label>
                      <input
                        type="password"
                        value={authForm.password}
                        onChange={(e) => setAuthForm(prev => ({ ...prev, password: e.target.value }))}
                        className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-white font-bold placeholder:text-white/10 focus:outline-none focus:border-blue-500/50 transition-all"
                        placeholder="••••••••"
                        required
                      />
                    </div>
                  )}

                  {authError && (
                    <motion.p 
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="text-red-400 text-[10px] font-bold uppercase tracking-widest text-center"
                    >
                      {authError}
                    </motion.p>
                  )}

                  <button
                    type={authMode === 'guest' ? 'button' : 'submit'}
                    onClick={authMode === 'guest' ? handleGuestJoin : undefined}
                    className="w-full py-4 bg-blue-500 hover:bg-blue-600 rounded-2xl text-white font-black uppercase text-sm transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20"
                  >
                    {authMode === 'login' && <><LogIn className="w-4 h-4" /> Login</>}
                    {authMode === 'signup' && <><UserPlus className="w-4 h-4" /> Create Account</>}
                    {authMode === 'guest' && <><ChevronRight className="w-4 h-4" /> Play as Guest</>}
                  </button>
                </form>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Rank Up Notification */}
      <AnimatePresence>
        {showRankUp && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 flex items-center justify-center pointer-events-none z-50 overflow-hidden"
          >
            {/* Flash Effect */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 1, 0] }}
              transition={{ duration: 0.5 }}
              className="absolute inset-0 bg-white z-10"
            />

            {/* Background Rays */}
            <motion.div
              initial={{ scale: 0, rotate: 0 }}
              animate={{ scale: 4, rotate: 360 }}
              transition={{ duration: 3, ease: "linear", repeat: Infinity }}
              className={`absolute w-96 h-96 opacity-20 blur-3xl ${showRankUp.color.replace('text-', 'bg-')}`}
              style={{ clipPath: 'polygon(50% 50%, 0 0, 100% 0, 100% 100%, 0 100%)' }}
            />

            <motion.div
              initial={{ scale: 0.5, opacity: 0, y: 50 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 1.5, opacity: 0, y: -50 }}
              transition={{ type: "spring", damping: 15 }}
              className="relative bg-black/80 backdrop-blur-2xl border-2 border-white/20 p-16 rounded-[60px] flex flex-col items-center shadow-[0_0_100px_rgba(255,255,255,0.1)] z-20"
            >
              <motion.div
                initial={{ rotateY: 0 }}
                animate={{ rotateY: 360 }}
                transition={{ duration: 1, repeat: 1 }}
                className={`p-8 rounded-full bg-white/5 mb-8 border border-white/10 shadow-inner ${showRankUp.color}`}
              >
                {showRankUp.icon && (
                  <div className="scale-[3]">
                    {showRankUp.icon}
                  </div>
                )}
              </motion.div>

              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 }}
                className="text-center"
              >
                <h2 className="text-xl font-black uppercase tracking-[0.5em] text-white/40 mb-2">
                  Rank Promoted
                </h2>
                <h3 className={`text-7xl font-black italic uppercase tracking-tighter drop-shadow-2xl ${showRankUp.color}`}>
                  {showRankUp.name}
                </h3>
              </motion.div>

              {/* Particle Burst Simulation */}
              <div className="absolute inset-0 pointer-events-none">
                {[...Array(12)].map((_, i) => (
                  <motion.div
                    key={i}
                    initial={{ x: 0, y: 0, opacity: 1 }}
                    animate={{ 
                      x: (Math.random() - 0.5) * 400, 
                      y: (Math.random() - 0.5) * 400,
                      opacity: 0,
                      scale: 0
                    }}
                    transition={{ duration: 1, delay: 0.1 }}
                    className={`absolute left-1/2 top-1/2 w-2 h-2 rounded-full ${showRankUp.color.replace('text-', 'bg-')}`}
                  />
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
