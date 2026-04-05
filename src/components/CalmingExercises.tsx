import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from "motion/react";
import { X, Wind, Zap, Brain, ChevronRight, Play, Pause, RotateCcw } from "lucide-react";
import { cn } from '../lib/utils';

interface Exercise {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  type: 'breathing' | 'muscle' | 'mindfulness';
  steps: { text: string; duration: number; action?: string }[];
}

const EXERCISES: Exercise[] = [
  {
    id: 'box-breathing',
    title: 'Box Breathing',
    description: 'A simple technique to reset your nervous system.',
    icon: <Wind className="w-5 h-5" />,
    type: 'breathing',
    steps: [
      { text: 'Inhale slowly...', duration: 4000, action: 'expand' },
      { text: 'Hold your breath...', duration: 4000, action: 'hold' },
      { text: 'Exhale completely...', duration: 4000, action: 'contract' },
      { text: 'Hold...', duration: 4000, action: 'hold' },
    ]
  },
  {
    id: '478-breathing',
    title: '4-7-8 Relaxing Breath',
    description: 'A natural tranquilizer for the nervous system.',
    icon: <Wind className="w-5 h-5" />,
    type: 'breathing',
    steps: [
      { text: 'Inhale through your nose...', duration: 4000, action: 'expand' },
      { text: 'Hold your breath...', duration: 7000, action: 'hold' },
      { text: 'Exhale through your mouth...', duration: 8000, action: 'contract' },
    ]
  },
  {
    id: 'muscle-relaxation',
    title: 'Muscle Release',
    description: 'Release tension from your body, step by step.',
    icon: <Zap className="w-5 h-5" />,
    type: 'muscle',
    steps: [
      { text: 'Tense your shoulders up to your ears...', duration: 5000 },
      { text: 'Now drop them and feel the release...', duration: 5000 },
      { text: 'Squeeze your hands into tight fists...', duration: 5000 },
      { text: 'Open them wide and let the tension go...', duration: 5000 },
      { text: 'Curl your toes tightly...', duration: 5000 },
      { text: 'Relax your feet completely...', duration: 5000 },
    ]
  },
  {
    id: 'mindfulness',
    title: '5-4-3-2-1 Grounding',
    description: 'Connect with your surroundings to calm your mind.',
    icon: <Brain className="w-5 h-5" />,
    type: 'mindfulness',
    steps: [
      { text: 'Acknowledge 5 things you see around you.', duration: 8000 },
      { text: 'Acknowledge 4 things you can touch.', duration: 8000 },
      { text: 'Acknowledge 3 things you hear.', duration: 8000 },
      { text: 'Acknowledge 2 things you can smell.', duration: 8000 },
      { text: 'Acknowledge 1 thing you can taste.', duration: 8000 },
    ]
  }
];

interface CalmingExercisesProps {
  onClose: () => void;
  initialExerciseId?: string | null;
}

export default function CalmingExercises({ onClose, initialExerciseId }: CalmingExercisesProps) {
  const [selectedExercise, setSelectedExercise] = useState<Exercise | null>(
    initialExerciseId ? EXERCISES.find(e => e.id === initialExerciseId) || null : null
  );
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isActive, setIsActive] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isActive && selectedExercise) {
      const step = selectedExercise.steps[currentStepIndex];
      const startTime = Date.now();
      
      interval = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const newProgress = Math.min((elapsed / step.duration) * 100, 100);
        setProgress(newProgress);

        if (newProgress >= 100) {
          clearInterval(interval);
          setTimeout(() => {
            setCurrentStepIndex((prev) => (prev + 1) % selectedExercise.steps.length);
            setProgress(0);
          }, 500);
        }
      }, 50);
    }
    return () => clearInterval(interval);
  }, [isActive, currentStepIndex, selectedExercise]);

  const toggleActive = () => setIsActive(!isActive);
  const resetExercise = () => {
    setIsActive(false);
    setCurrentStepIndex(0);
    setProgress(0);
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-comfort-bg/80 backdrop-blur-sm"
    >
      <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl border border-comfort-primary/10 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-6 border-b border-comfort-primary/5 flex items-center justify-between bg-comfort-primary/5">
          <div>
            <h2 className="font-display text-xl font-semibold text-comfort-text">
              {selectedExercise ? selectedExercise.title : 'Calming Exercises'}
            </h2>
            <p className="text-xs text-comfort-text/60 mt-1">
              {selectedExercise ? selectedExercise.description : 'Take a moment for yourself.'}
            </p>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-comfort-primary/10 rounded-full transition-colors text-comfort-text/40"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {!selectedExercise ? (
            <div className="space-y-3">
              {EXERCISES.map((exercise) => (
                <button
                  key={exercise.id}
                  onClick={() => setSelectedExercise(exercise)}
                  className="w-full flex items-center gap-4 p-4 rounded-2xl border border-comfort-primary/10 hover:bg-comfort-primary/5 transition-all group text-left"
                >
                  <div className="w-10 h-10 rounded-xl bg-comfort-primary/10 text-comfort-primary flex items-center justify-center group-hover:bg-comfort-primary group-hover:text-white transition-colors">
                    {exercise.icon}
                  </div>
                  <div className="flex-1">
                    <h3 className="font-medium text-comfort-text">{exercise.title}</h3>
                    <p className="text-xs text-comfort-text/50">{exercise.description}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-comfort-text/20" />
                </button>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8">
              {/* Animation Area */}
              <div className="relative w-48 h-48 flex items-center justify-center mb-12">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={currentStepIndex}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ 
                      opacity: 1, 
                      scale: selectedExercise.steps[currentStepIndex].action === 'expand' ? 1.2 : 
                             selectedExercise.steps[currentStepIndex].action === 'contract' ? 0.8 : 1
                    }}
                    transition={{ duration: selectedExercise.steps[currentStepIndex].duration / 1000, ease: "easeInOut" }}
                    className={cn(
                      "absolute inset-0 rounded-full border-4 border-comfort-primary/20",
                      isActive && "bg-comfort-primary/5"
                    )}
                  />
                </AnimatePresence>
                
                {/* Inner Pulse */}
                <motion.div 
                  animate={isActive ? {
                    scale: [1, 1.05, 1],
                    opacity: [0.3, 0.6, 0.3]
                  } : {}}
                  transition={{ repeat: Infinity, duration: 4 }}
                  className="w-32 h-32 rounded-full bg-comfort-primary/10 flex items-center justify-center"
                />

                {/* Progress Ring */}
                <svg className="absolute inset-0 w-full h-full -rotate-90">
                  <circle
                    cx="96"
                    cy="96"
                    r="90"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="4"
                    strokeDasharray={565}
                    strokeDashoffset={565 - (565 * progress) / 100}
                    className="text-comfort-primary transition-all duration-75 ease-linear"
                  />
                </svg>

                <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-4">
                  <span className="text-sm font-medium text-comfort-primary uppercase tracking-widest mb-1">
                    {selectedExercise.steps[currentStepIndex].action || 'Focus'}
                  </span>
                </div>
              </div>

              {/* Step Text */}
              <div className="text-center mb-12 min-h-[3rem]">
                <AnimatePresence mode="wait">
                  <motion.p
                    key={currentStepIndex}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="text-lg font-medium text-comfort-text"
                  >
                    {selectedExercise.steps[currentStepIndex].text}
                  </motion.p>
                </AnimatePresence>
                <p className="text-xs text-comfort-text/40 mt-2">
                  Step {currentStepIndex + 1} of {selectedExercise.steps.length}
                </p>
              </div>

              {/* Controls */}
              <div className="flex items-center gap-4">
                <button
                  onClick={resetExercise}
                  className="p-3 rounded-full bg-comfort-bg text-comfort-text/60 hover:text-comfort-text transition-colors"
                  title="Reset"
                >
                  <RotateCcw className="w-5 h-5" />
                </button>
                <button
                  onClick={toggleActive}
                  className="w-16 h-16 rounded-full bg-comfort-primary text-white flex items-center justify-center shadow-lg shadow-comfort-primary/20 hover:scale-105 transition-transform active:scale-95"
                >
                  {isActive ? <Pause className="w-6 h-6 fill-current" /> : <Play className="w-6 h-6 fill-current ml-1" />}
                </button>
                <button
                  onClick={() => {
                    resetExercise();
                    setSelectedExercise(null);
                  }}
                  className="p-3 rounded-full bg-comfort-bg text-comfort-text/60 hover:text-comfort-text transition-colors"
                  title="Change Exercise"
                >
                  <Brain className="w-5 h-5" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {selectedExercise && (
          <div className="p-4 bg-comfort-primary/5 text-center">
            <p className="text-[10px] text-comfort-text/40 font-medium uppercase tracking-widest">
              Focus on your breath. You are safe.
            </p>
          </div>
        )}
      </div>
    </motion.div>
  );
}
