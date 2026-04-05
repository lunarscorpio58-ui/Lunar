import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Smile, Frown, Zap, Moon, Wind, Heart, Plus, History, X, Check } from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, addDoc, serverTimestamp, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { useAuth } from '../lib/AuthContext';
import { cn } from '../lib/utils';

type MoodType = 'happy' | 'sad' | 'anxious' | 'calm' | 'energetic' | 'tired';

interface MoodLog {
  id: string;
  mood: MoodType;
  timestamp: any;
  note?: string;
}

const MOODS: { type: MoodType; label: string; icon: any; color: string }[] = [
  { type: 'happy', label: 'Happy', icon: Smile, color: 'text-yellow-500' },
  { type: 'calm', label: 'Calm', icon: Wind, color: 'text-blue-400' },
  { type: 'energetic', label: 'Energetic', icon: Zap, color: 'text-orange-500' },
  { type: 'tired', label: 'Tired', icon: Moon, color: 'text-indigo-400' },
  { type: 'anxious', label: 'Anxious', icon: Heart, color: 'text-rose-400' },
  { type: 'sad', label: 'Sad', icon: Frown, color: 'text-blue-600' },
];

export default function MoodTracker() {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [moods, setMoods] = useState<MoodLog[]>([]);
  const [isLogging, setIsLogging] = useState(false);
  const [note, setNote] = useState('');
  const [selectedMood, setSelectedMood] = useState<MoodType | null>(null);

  useEffect(() => {
    if (!user) return;
    const moodsRef = collection(db, 'users', user.uid, 'moods');
    const q = query(moodsRef, orderBy('timestamp', 'desc'), limit(10));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const moodList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as MoodLog));
      setMoods(moodList);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `users/${user.uid}/moods`);
    });

    return () => unsubscribe();
  }, [user]);

  const logMood = async (mood: MoodType) => {
    if (!user) return;
    setIsLogging(true);
    try {
      const moodsRef = collection(db, 'users', user.uid, 'moods');
      await addDoc(moodsRef, {
        uid: user.uid,
        mood,
        timestamp: serverTimestamp(),
        note: note.trim() || null
      });
      setSelectedMood(null);
      setNote('');
      setIsOpen(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `users/${user.uid}/moods`);
    } finally {
      setIsLogging(false);
    }
  };

  return (
    <motion.div 
      drag
      dragConstraints={{ left: -300, right: 0, top: -500, bottom: 0 }}
      className="fixed bottom-20 right-4 z-40 flex flex-col items-end gap-3"
    >
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="bg-white rounded-3xl shadow-2xl border border-comfort-primary/10 p-6 w-72 overflow-hidden"
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-display font-bold text-comfort-text">How are you?</h3>
              <button 
                onClick={() => setShowHistory(!showHistory)}
                className="p-2 hover:bg-comfort-primary/5 rounded-full transition-colors text-comfort-primary"
              >
                {showHistory ? <Plus className="w-4 h-4" /> : <History className="w-4 h-4" />}
              </button>
            </div>

            {showHistory ? (
              <div className="space-y-3 max-h-64 overflow-y-auto pr-2 custom-scrollbar">
                {moods.length > 0 ? moods.map((log) => {
                  const moodInfo = MOODS.find(m => m.type === log.mood);
                  const Icon = moodInfo?.icon || Smile;
                  return (
                    <div key={log.id} className="flex items-center gap-3 p-3 bg-comfort-bg/30 rounded-2xl border border-comfort-primary/5">
                      <div className={cn("p-2 rounded-xl bg-white shadow-sm", moodInfo?.color)}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-bold text-comfort-text uppercase tracking-widest">{log.mood}</p>
                        <p className="text-[10px] text-comfort-text/40">
                          {log.timestamp?.toDate ? log.timestamp.toDate().toLocaleString() : 'Just now'}
                        </p>
                        {log.note && <p className="text-[10px] text-comfort-text/60 italic mt-1 truncate">"{log.note}"</p>}
                      </div>
                    </div>
                  );
                }) : (
                  <p className="text-center text-xs text-comfort-text/40 py-8">No mood logs yet.</p>
                )}
              </div>
            ) : (
              <div className="space-y-6">
                <div className="grid grid-cols-3 gap-3">
                  {MOODS.map((m) => (
                    <button
                      key={m.type}
                      onClick={() => setSelectedMood(m.type)}
                      className={cn(
                        "flex flex-col items-center gap-2 p-3 rounded-2xl border transition-all",
                        selectedMood === m.type 
                          ? "bg-comfort-primary/10 border-comfort-primary shadow-sm" 
                          : "bg-comfort-bg/30 border-transparent hover:border-comfort-primary/20"
                      )}
                    >
                      <m.icon className={cn("w-6 h-6", m.color)} />
                      <span className="text-[10px] font-bold text-comfort-text/60 uppercase tracking-tighter">{m.label}</span>
                    </button>
                  ))}
                </div>

                {selectedMood && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="space-y-3"
                  >
                    <textarea
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="Add a little note... (optional)"
                      className="w-full bg-comfort-bg/50 border border-comfort-primary/10 rounded-2xl px-4 py-3 text-xs focus:outline-none focus:ring-2 focus:ring-comfort-primary/30 transition-all resize-none"
                      rows={2}
                    />
                    <button
                      onClick={() => logMood(selectedMood)}
                      disabled={isLogging}
                      className="w-full bg-comfort-primary text-white py-3 rounded-2xl text-xs font-bold shadow-lg shadow-comfort-primary/20 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-2"
                    >
                      {isLogging ? (
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : (
                        <>
                          <Check className="w-4 h-4" />
                          Log Mood
                        </>
                      )}
                    </button>
                  </motion.div>
                )}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "p-3 rounded-2xl shadow-2xl transition-all hover:scale-110 active:scale-95 flex items-center justify-center group",
          isOpen ? "bg-comfort-text text-white" : "bg-white text-comfort-primary border border-comfort-primary/10"
        )}
      >
        <div className="relative">
          <Heart className={cn("w-5 h-5 transition-transform", isOpen && "scale-110")} />
          {!isOpen && (
            <motion.div 
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ repeat: Infinity, duration: 2 }}
              className="absolute -top-1 -right-1 w-1.5 h-1.5 bg-rose-400 rounded-full" 
            />
          )}
        </div>
        {isOpen && <X className="w-4 h-4 ml-2" />}
      </button>
    </motion.div>
  );
}
