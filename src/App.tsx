/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Zap, 
  Shield, 
  Sword, 
  Cpu, 
  RefreshCw, 
  Eye,
  Trophy,
  History,
  Info,
  ChevronRight
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { getRuneTweaks, getItemSuggestions, type RuneSuggestion, type ItemSuggestion } from './lib/ai';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const CHAMPIONS: Record<number, string> = {
  10: "Kayle",
  17: "Teemo",
  136: "Aurelion Sol",
  64: "Lee Sin",
  103: "Ahri",
  157: "Yasuo",
  81: "Ezreal",
  27: "Singed",
};

const CHAMPION_THEMES: Record<number, { name: string; class: string; border: string; accent: string; icon: any }> = {
  10: { name: 'Divine', class: 'theme-divine', border: 'divine-border', accent: '#C89B3C', icon: Zap },
  136: { name: 'Cosmic', class: 'theme-cosmic', border: 'cosmic-border', accent: '#914FBF', icon: Cpu },
  17: { name: 'Poison', class: 'theme-poison', border: 'poison-border', accent: '#783F04', icon: Sword },
};

interface ExtendedRuneAdvice extends RuneSuggestion {
  winCondition: string;
}

interface ExtendedItemAdvice extends ItemSuggestion {
  winCondition: string;
}

export default function App() {
  const [phase, setPhase] = useState<'IDLE' | 'DRAFT' | 'GAME'>('IDLE');
  const [isVisible, setIsVisible] = useState(true);
  const [runeAdvice, setRuneAdvice] = useState<ExtendedRuneAdvice | null>(null);
  const [itemAdvice, setItemAdvice] = useState<ExtendedItemAdvice | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [simulation, setSimulation] = useState(true);
  const [logs, setLogs] = useState<string[]>([]);
  const [activeChamp, setActiveChamp] = useState<string>("Scanning...");
  const [activeChampId, setActiveChampId] = useState<number | null>(null);
  const [lcuInfo, setLcuInfo] = useState<{ port: string; password: string; protocol: string } | null>(null);

  const theme = activeChampId ? CHAMPION_THEMES[activeChampId] : null;

  const addLog = (msg: string) => {
    setLogs((prev: string[]) => [msg, ...prev].slice(0, 3));
  };

  // On mount, get lockfile and listen for F10 from main process
  useEffect(() => {
    const init = async () => {
      if (window.electronAPI) {
        addLog("Initializing telemetry...");
        const info = await window.electronAPI.readLockfile();
        setLcuInfo(info);
        if (info) {
          addLog("Telemetry stream open.");
        } else {
          addLog("Lockfile not found. Run as Admin?");
        }
        
        window.electronAPI.onTriggerRuneImport(() => {
          handleImport();
        });
      }
    };
    init();
  }, []);

  const getLcuHeaders = useCallback(() => {
    if (!lcuInfo) return null;
    const auth = btoa(`riot:${lcuInfo.password}`);
    return {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/json',
    };
  }, [lcuInfo]);

  const pollLCU = useCallback(async () => {
    try {
      let session;
      if (window.electronAPI) {
        session = await window.electronAPI.lcuRequest({ path: '/lol-champ-select/v1/session' });
      } else {
        const res = await fetch('/api/lcu/lol-champ-select/v1/session');
        const contentType = res.headers.get("content-type");
        if (!res.ok || !contentType || !contentType.includes("application/json")) {
           throw new Error('LCU closed or restricted');
        }
        session = await res.json();
      }
      
      if (!session) throw new Error('No session');
      
    const phaseName = session.timer.phase;
    const timeLeft = session.timer.adjustedTimeLeftInPhase / 1000;
    
    setPhase('DRAFT');
    
  // Specialist roster: Kayle, Teemo, ASol + User additions
    const myCellId = session.localPlayerCellId;
    const me = session.myTeam.find((p: any) => p.cellId === myCellId) || session.myTeam[0];
    const myId = me?.championId;

    const specialistIds = [10, 17, 136, 64, 103, 157, 81, 27]; 
    
    if (myId && specialistIds.includes(myId)) {
      setActiveChampId(myId);
      const name = CHAMPIONS[myId] || "Specialist";
      setActiveChamp(name);
      
      // Wait specifically for FINALIZATION (the last 30s)
      if (phaseName === 'FINALIZATION' && !runeAdvice) {
        addLog("Analyzing composition...");
        const myTeamNames = session.myTeam.map((p: any) => CHAMPIONS[p.championId] || "Ally");
        const rivalNames = session.theirTeam.map((p: any) => CHAMPIONS[p.championId] || "Enemy");
        
        try {
          const advice = await getRuneTweaks(name, myTeamNames, rivalNames);
          setRuneAdvice(advice as any);
          addLog("Strategic tweaks ready.");
        } catch (err) {
          addLog("Calibration needed.");
        }
      }
    } else {
      setRuneAdvice(null);
      setActiveChampId(null);
      if (phaseName === 'FINALIZATION') {
        setActiveChamp("Syncing...");
      } else {
        setActiveChamp("Lobby Link...");
      }
    }
    } catch (e: any) {
      if (phase !== 'GAME') {
        const msg = e.message.includes("Unexpected token") 
          ? "Admin access needed for Link" 
          : e.message;
        addLog(`Link: ${msg}`);
        pollGame();
      }
    }
  }, [runeAdvice, activeChamp, phase]);

  const pollGame = useCallback(async () => {
    try {
      let data;
      if (window.electronAPI) {
        data = await window.electronAPI.gameRequest({ path: 'allgamedata' });
      } else {
        const res = await fetch('/api/liveclientdata/allgamedata');
        const contentType = res.headers.get("content-type");
        if (!res.ok || !contentType || !contentType.includes("application/json")) {
           throw new Error('Game data waiting...');
        }
        data = await res.json();
      }

      if (!data) throw new Error('No game data');
      
      setPhase('GAME');
      
      const myData = data.allPlayers.find((p: any) => p.summonerName === data.activePlayer.summonerName);
      if (myData) {
        const myName = myData.championName;
        // Fix for name mismatches (e.g. "AurelionSol" vs "Aurelion Sol")
        const normalizedMyName = myName.replace(/\s+/g, '').toLowerCase();
        const currentId = Object.keys(CHAMPIONS).find(id => 
          CHAMPIONS[Number(id)].replace(/\s+/g, '').toLowerCase() === normalizedMyName
        );
        
        if (currentId) setActiveChampId(Number(currentId));
        setActiveChamp(myName);
      }

      const myItems = data.activePlayer.items.map((i: any) => i.name);
      const myTeamId = myData?.team || "ORDER";
      const enemyTeam = data.allPlayers.filter((p: any) => p.team !== myTeamId);
      const enemyChamps = enemyTeam.map((p: any) => p.championName);
      const enemyItems = enemyTeam.flatMap((p: any) => p.items.map((i: any) => i.name));

      if (activeChampId && !itemAdvice) {
        const advice = await getItemSuggestions(activeChamp, myItems, enemyChamps, enemyItems);
        setItemAdvice(advice as any);
      }
    } catch (e: any) {
      const msg = e.message.includes("Unexpected token") ? "Waiting for game start..." : e.message;
      addLog(`Game Status: ${msg}`);
      if (phase === 'GAME') setPhase('IDLE');
    }
  }, [activeChamp, activeChampId, phase, itemAdvice]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (phase === 'GAME') pollGame();
      else pollLCU();
    }, 2000); // 2s for responsive UI updates
    return () => clearInterval(interval);
  }, [phase, pollLCU, pollGame]);

  const handleImport = async () => {
    if (!runeAdvice) return;
    setIsImporting(true);
    addLog("Atomic cycle: Equip...");
    
    try {
      if (window.electronAPI) {
        await window.electronAPI.lcuRuneImport({
          name: "Hextech Elite",
          primaryStyleId: runeAdvice.primaryPathId,
          subStyleId: runeAdvice.subPathId,
          selectedPerkIds: runeAdvice.selectedPerkIds,
          isEditable: true,
        });
      } else {
        const res = await fetch('/api/lcu-rune-import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: "Hextech Elite",
            primaryStyleId: runeAdvice.primaryPathId,
            subStyleId: runeAdvice.subPathId,
            selectedPerkIds: runeAdvice.selectedPerkIds,
            isEditable: true,
          })
        });
        if (!res.ok) throw new Error("Sync failed");
      }
      addLog("Runes optimized successfully.");
    } catch (e) {
      addLog("Local simulation complete.");
    } finally {
      setTimeout(() => setIsImporting(false), 1000);
    }
  };

  const toggleClickThrough = (ignore: boolean) => {
    // Only toggle if we are in a state that needs it
    if (window.electronAPI) {
      window.electronAPI.setIgnoreMouseEvents(ignore, { forward: true });
    }
  };

  // Diagnostic cleanup: Unhide if shortcut is pressed
  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.setIgnoreMouseEvents(false); // Ensure interaction on start
    }
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F9') setIsVisible((v: boolean) => !v);
      if (e.key === 'F10') handleImport();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [runeAdvice]);

  return (
    <div className={cn(
      "fixed top-6 right-6 w-80 flex flex-col items-end gap-4 select-none",
      !isVisible && "pointer-events-none"
    )}>
      {/* Hextech Anchor (Drag Handle) */}
      <div className="flex flex-col items-end gap-1">
        {window.electronAPI?.ping?.() === 'pong-v5' ? (
          <span className="text-[9px] text-[#00ffcc] font-mono tracking-widest bg-[#00ffcc]/10 px-2 rounded-sm border border-[#00ffcc]/20">DESKTOP LINK ACTIVE</span>
        ) : (
          <div className="flex flex-col items-end gap-1">
            <span className="text-[9px] text-[#ff4444] font-mono tracking-widest bg-[#ff4444]/10 px-2 rounded-sm border border-[#ff4444]/20 animate-pulse">BRIDGE ERROR (NO LINK)</span>
            <div className="flex gap-2">
              <span className="text-[8px] text-white/20">Status: {typeof window.electronAPI === 'undefined' ? 'OBJECT MISSING' : `VERSION MISMATCH (${String(window.electronAPI.ping?.()) || 'NO PING'})`}</span>
              <button 
                onClick={() => window.location.reload()}
                className="text-[8px] text-white/40 hover:text-white underline cursor-pointer"
              >
                Retry
              </button>
            </div>
          </div>
        )}
        <div 
          className="hextech-anchor pointer-events-auto shadow-[0_0_20px_rgba(200,170,110,0.6)] cursor-move group relative z-50 mt-1"
          style={{ WebkitAppRegion: 'drag' } as any}
          onMouseEnter={() => toggleClickThrough(false)}
          onMouseLeave={() => toggleClickThrough(false)}
        >
          <div className="w-9 h-9 rounded-full border-2 border-[#c8aa6e]/40 flex items-center justify-center animate-pulse group-hover:scale-110 transition-transform bg-[#010a13]">
            <Zap className="w-5 h-5 text-[#c8aa6e]" />
          </div>
        </div>
      </div>

      <AnimatePresence>
        {isVisible && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.3 }}
            onMouseEnter={() => toggleClickThrough(false)}
            onMouseLeave={() => toggleClickThrough(true)}
            className={cn(
              "w-full rounded-sm pointer-events-auto overflow-hidden bg-[#010a13]/80 hextech-glow",
              theme?.class || "theme-divine",
              theme?.border || "divine-border"
            )}
          >
            {/* Theme Specific Overlay Effects */}
            {activeChampId === 136 && <div className="absolute inset-0 star-field opacity-20 pointer-events-none" />}
            {activeChampId === 17 && <div className="absolute inset-0 bubble-glow pointer-events-none" />}

            {/* Header */}
            <div className="px-3 py-2 bg-[#091428]/90 border-b border-[#c8aa6e]/20 flex items-center justify-between relative z-10">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-[#c8aa6e] rotate-45 shadow-[0_0_5px_#c8aa6e]" />
                <span className="text-[10px] font-bold text-[#c8aa6e] uppercase tracking-[0.2em]">Werner Elite</span>
              </div>
              <div className="flex gap-2 text-[#c8aa6e]/40">
                <button onClick={() => setSimulation(!simulation)} className={cn("transition-colors", simulation && "text-[#008f91]")}>
                  <Cpu className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Content Area */}
            <div className="p-4 relative z-10">
              <div className="flex justify-between items-end mb-4">
                <div>
                  <div className="text-[9px] uppercase text-[#c8aa6e]/60 font-bold tracking-widest">Specialist</div>
                  <div className="text-lg font-bold text-[#f0e6d2] uppercase">{activeChamp}</div>
                </div>
                <div className={cn(
                  "px-2 py-0.5 rounded-sm border text-[9px] uppercase font-bold",
                  phase === 'DRAFT' ? "border-[#008f91] text-[#008f91]" : 
                  phase === 'GAME' ? "border-red-500 text-red-500" : "border-slate-800 text-slate-500"
                )}>
                  {phase}
                </div>
              </div>

              <div className="space-y-4">
                {/* Advice Section */}
                <AnimatePresence mode="wait">
                  {runeAdvice && phase === 'DRAFT' && (
                    <motion.div 
                      key="runes"
                      initial={{ opacity: 0, scale: 0.98 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.98 }}
                      className="advice-container border border-[#c8aa6e]/20"
                    >
                      <div className="flex items-center gap-1.5 mb-2 text-[#c8aa6e]">
                        <Zap className="w-3.5 h-3.5" />
                        <span className="text-[10px] font-bold uppercase tracking-wider">Strategic Tweak</span>
                      </div>
                      <p className="text-[11px] text-[#f0e6d2] italic leading-tight mb-3">
                        "{runeAdvice.reasoning}"
                      </p>
                      <button 
                        onClick={handleImport}
                        disabled={isImporting}
                        className="w-full py-2 bg-[#c8aa6e]/10 hover:bg-[#c8aa6e]/20 border border-[#c8aa6e]/40 text-[#c8aa6e] text-[9px] font-bold uppercase tracking-widest transition-all flex items-center justify-center gap-2"
                      >
                        {isImporting ? <RefreshCw className="w-3 h-3 animate-spin" /> : <ChevronRight className="w-3 h-3" />}
                        {isImporting ? 'Injecting...' : 'Equip Tweaks (F10)'}
                      </button>
                    </motion.div>
                  )}

                  {itemAdvice && phase === 'GAME' && (
                    <motion.div 
                      key="items"
                      initial={{ opacity: 0, scale: 0.98 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.98 }}
                      className="advice-container border border-[#008f91]/20"
                    >
                      <div className="flex items-center gap-1.5 mb-2 text-[#008f91]">
                        <Sword className="w-3.5 h-3.5" />
                        <span className="text-[10px] font-bold uppercase tracking-wider">Tactical Build</span>
                      </div>
                      <div className="text-xs font-bold text-[#f0e6d2] mb-1">{itemAdvice.itemName}</div>
                      <p className="text-[11px] text-[#f0e6d2]/80 leading-tight italic mb-3">
                        "{itemAdvice.reasoning}"
                      </p>
                      <div className="pt-2 border-t border-[#008f91]/20">
                         <span className="text-[9px] font-bold text-emerald-400 uppercase block mb-1">Combat Goal</span>
                         <p className="text-[10px] italic text-[#f0e6d2]/60 leading-tight">{itemAdvice.winCondition}</p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Win Condition (Draft) */}
                {runeAdvice && phase === 'DRAFT' && (
                   <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="p-2 border border-blue-400/20 bg-blue-400/5 rounded-sm flex gap-2"
                   >
                     <Trophy className="w-4 h-4 text-blue-400 shrink-0" />
                     <div>
                       <span className="text-[9px] font-bold text-blue-400 uppercase block">Victory Path</span>
                       <p className="text-[10px] text-blue-100/70 italic leading-tight">{runeAdvice.winCondition}</p>
                     </div>
                   </motion.div>
                )}
              </div>
            </div>

            {/* Telemetry Log */}
            <div className="px-3 py-2 bg-[#010a13] border-t border-[#c8aa6e]/10 relative z-10">
              <div className="space-y-1">
                {logs.map((log, i) => (
                  <div key={i} className="text-[8px] font-mono text-slate-500 flex items-center gap-1.5">
                    <div className="w-1 h-1 bg-[#c8aa6e]/40 rounded-full" />
                    {log}
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mt-3 text-[9px] text-[#c8aa6e]/40 text-center uppercase tracking-widest px-4 font-bold">
        {isVisible ? (
          <span className="flex items-center justify-center gap-2">
            <Eye className="w-3 h-3" /> F9 Hide
          </span>
        ) : (
          <span className="flex items-center justify-center gap-2">
            <Eye className="w-3 h-3" /> F9 Show
          </span>
        )}
      </div>
    </div>
  );
}
