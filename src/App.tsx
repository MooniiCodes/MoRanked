/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Trophy, Target, TrendingUp, TrendingDown, Moon, Sun, Crown, Users, X, ChevronRight } from 'lucide-react';
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
  const [elo, setElo] = useState<number>(() => {
    const saved = localStorage.getItem('mo-ranked-elo');
    return saved ? parseInt(saved, 10) : 0;
  });

  const [name, setName] = useState<string>(() => {
    const saved = localStorage.getItem('mo-ranked-name');
    return saved || `Player ${Math.floor(Math.random() * 1000)}`;
  });

  const [isNaming, setIsNaming] = useState(!localStorage.getItem('mo-ranked-name'));
  const [dotPos, setDotPos] = useState({ x: 50, y: 50 });
  const [feedback, setFeedback] = useState<{ id: number; x: number; y: number; value: number }[]>([]);
  const [streakTimeLeft, setStreakTimeLeft] = useState(0);
  const [showRankUp, setShowRankUp] = useState<Rank | null>(null);
  const [leaderboard, setLeaderboard] = useState<Player[]>([]);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
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

  useEffect(() => {
    socketRef.current = io();

    socketRef.current.on('connect', () => {
      socketRef.current?.emit('join', {
        name,
        elo,
        rank: getCurrentRank(elo).name
      });
    });

    socketRef.current.on('leaderboard-update', (data: Player[]) => {
      setLeaderboard(data);
    });

    return () => {
      socketRef.current?.disconnect();
    };
  }, []);

  useEffect(() => {
    localStorage.setItem('mo-ranked-elo', elo.toString());
    localStorage.setItem('mo-ranked-name', name);
    
    const currentRank = getCurrentRank(elo);
    
    socketRef.current?.emit('update-elo', {
      elo,
      rank: currentRank.name
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
  }, [elo, lastRankName, name]);

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

    const gain = streakTimeLeft > 0 ? 2 : 1;
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
            <button
              onClick={(e) => { e.stopPropagation(); setShowLeaderboard(true); }}
              className="pointer-events-auto p-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-colors"
            >
              <Users className="w-5 h-5 text-white" />
            </button>
          </div>
          
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

      {/* Name Entry Overlay */}
      <AnimatePresence>
        {isNaming && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0 bg-black/90 backdrop-blur-xl z-[100] flex items-center justify-center p-6"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="w-full max-w-sm flex flex-col items-center text-center"
            >
              <div className="w-20 h-20 bg-blue-500/20 rounded-3xl flex items-center justify-center mb-6 border border-blue-500/30">
                <Users className="w-10 h-10 text-blue-400" />
              </div>
              <h2 className="text-3xl font-black uppercase italic tracking-tighter mb-2">Welcome to MoRanked</h2>
              <p className="text-slate-400 text-sm mb-8">Enter your display name to join the global leaderboard.</p>
              
              <div className="w-full relative group">
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && name.trim() && setIsNaming(false)}
                  placeholder="Your Nickname"
                  className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-white font-bold placeholder:text-white/20 focus:outline-none focus:border-blue-500/50 transition-all"
                  autoFocus
                />
                <button
                  disabled={!name.trim()}
                  onClick={() => setIsNaming(false)}
                  className="absolute right-2 top-2 bottom-2 px-4 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 disabled:hover:bg-blue-500 rounded-xl text-white font-black uppercase text-xs transition-all flex items-center gap-2"
                >
                  Join <ChevronRight className="w-4 h-4" />
                </button>
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
