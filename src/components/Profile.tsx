import { useState, useRef } from 'react';
import { useAuth } from '../lib/AuthContext';
import { useTheme } from '../lib/ThemeContext';
import { motion } from 'motion/react';
import { X, Camera, Save, LogOut, User, Palette, Info, Volume2, VolumeX } from 'lucide-react';
import { cn } from '../lib/utils';

interface ProfileProps {
  onClose: () => void;
  onVoiceSelect?: (voiceId: string) => void;
}

export default function Profile({ onClose, onVoiceSelect }: ProfileProps) {
  const { profile, updateProfile, signOut } = useAuth();
  const { theme, setTheme } = useTheme();
  const [displayName, setDisplayName] = useState(profile?.displayName || '');
  const [bio, setBio] = useState(profile?.bio || '');
  const [photoURL, setPhotoURL] = useState(profile?.photoURL || '');
  const [voiceName, setVoiceName] = useState(profile?.voiceName || 'Kore');
  const [voiceEnabled, setVoiceEnabled] = useState(profile?.voiceEnabled || false);
  const [isSaving, setIsSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSave = async () => {
    setIsSaving(true);
    await updateProfile({ displayName, bio, photoURL, theme, voiceName, voiceEnabled });
    setIsSaving(false);
    onClose();
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhotoURL(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const themes: { id: 'light' | 'dark' | 'sepia' | 'rose' | 'black', label: string, color: string }[] = [
    { id: 'light', label: 'Neon Purple', color: '#A855F7' },
    { id: 'dark', label: 'Deep Purple', color: '#581C87' },
    { id: 'sepia', label: 'Sepia', color: '#8D7B68' },
    { id: 'rose', label: 'Rose', color: '#E29587' },
    { id: 'black', label: 'True Black', color: '#000000' },
  ];

  const voices = [
    { id: 'Puck', label: 'Puck (Cheerful)' },
    { id: 'Charon', label: 'Charon (Deep)' },
    { id: 'Kore', label: 'Kore (Warm)' },
    { id: 'Fenrir', label: 'Fenrir (Calm)' },
    { id: 'Zephyr', label: 'Zephyr (Gentle)' },
  ];

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-comfort-bg/80 backdrop-blur-sm"
    >
      <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl border border-comfort-primary/10 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-6 border-b border-comfort-primary/5 flex items-center justify-between bg-comfort-primary/5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-comfort-primary text-white flex items-center justify-center">
              <User className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-display text-xl font-semibold text-comfort-text">Your Profile</h2>
              <p className="text-xs text-comfort-text/60">Customize your Zome experience.</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-comfort-primary/10 rounded-full transition-colors text-comfort-text/40"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          {/* Avatar Section */}
          <div className="flex flex-col items-center">
            <div className="relative group">
              <div className="w-24 h-24 rounded-3xl bg-comfort-primary/10 border-2 border-comfort-primary/20 overflow-hidden flex items-center justify-center">
                {photoURL ? (
                  <img src={photoURL} alt="Avatar" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  <User className="w-12 h-12 text-comfort-primary/40" />
                )}
              </div>
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="absolute -bottom-2 -right-2 p-2 bg-comfort-primary text-white rounded-xl shadow-lg hover:scale-110 transition-transform"
              >
                <Camera className="w-4 h-4" />
              </button>
              <input 
                type="file" 
                accept="image/*" 
                className="hidden" 
                ref={fileInputRef} 
                onChange={handleImageUpload}
              />
            </div>
            <p className="text-[10px] text-comfort-text/40 mt-4 font-bold uppercase tracking-widest">Profile Picture</p>
          </div>

          {/* Form Section */}
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-comfort-text/60 uppercase tracking-widest ml-1">Display Name</label>
              <div className="relative">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-comfort-text/30" />
                <input 
                  type="text" 
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="What should we call you?"
                  className="w-full bg-comfort-bg/50 border border-comfort-primary/10 rounded-2xl px-11 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-comfort-primary/30 transition-all"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-comfort-text/60 uppercase tracking-widest ml-1">Bio</label>
              <div className="relative">
                <Info className="absolute left-4 top-4 w-4 h-4 text-comfort-text/30" />
                <textarea 
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="Tell us a bit about yourself..."
                  rows={3}
                  className="w-full bg-comfort-bg/50 border border-comfort-primary/10 rounded-2xl px-11 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-comfort-primary/30 transition-all resize-none"
                />
              </div>
            </div>
          </div>

          {/* Voice Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-comfort-text/60 uppercase tracking-widest ml-1 flex items-center gap-2">
                <Volume2 className="w-3 h-3" />
                Voice Output
              </label>
              <button 
                onClick={() => setVoiceEnabled(!voiceEnabled)}
                className={cn(
                  "relative w-10 h-5 rounded-full transition-colors",
                  voiceEnabled ? "bg-comfort-primary" : "bg-comfort-text/20"
                )}
              >
                <div className={cn(
                  "absolute top-1 w-3 h-3 bg-white rounded-full transition-all",
                  voiceEnabled ? "left-6" : "left-1"
                )} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {voices.map((v) => (
                <button
                  key={v.id}
                  onClick={() => {
                    setVoiceName(v.id);
                    onVoiceSelect?.(v.id);
                  }}
                  className={cn(
                    "px-4 py-2 rounded-xl text-xs font-medium border transition-all",
                    voiceName === v.id 
                      ? "bg-comfort-primary text-white border-comfort-primary shadow-sm" 
                      : "bg-white text-comfort-text border-comfort-primary/5 hover:bg-comfort-primary/5"
                  )}
                >
                  {v.label}
                </button>
              ))}
            </div>
          </div>

          {/* Theme Section */}
          <div className="space-y-3">
            <label className="text-xs font-bold text-comfort-text/60 uppercase tracking-widest ml-1 flex items-center gap-2">
              <Palette className="w-3 h-3" />
              Theme Customization
            </label>
            <div className="grid grid-cols-2 gap-3">
              {themes.map((t) => (
                <button
                  key={t.id}
                  onClick={() => {
                    setTheme(t.id);
                  }}
                  className={cn(
                    "flex items-center gap-3 p-3 rounded-2xl border transition-all text-left",
                    theme === t.id 
                      ? "bg-comfort-primary/10 border-comfort-primary shadow-sm" 
                      : "bg-white border-comfort-primary/5 hover:bg-comfort-primary/5"
                  )}
                >
                  <div className="w-6 h-6 rounded-lg" style={{ backgroundColor: t.color }} />
                  <span className="text-xs font-medium text-comfort-text">{t.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 bg-comfort-primary/5 flex items-center gap-3">
          <button 
            onClick={signOut}
            className="flex items-center gap-2 px-4 py-3 rounded-2xl text-xs font-bold text-rose-500 hover:bg-rose-50 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
          <button 
            onClick={handleSave}
            disabled={isSaving}
            className="flex-1 flex items-center justify-center gap-2 bg-comfort-primary text-white px-4 py-3 rounded-2xl text-xs font-bold shadow-lg shadow-comfort-primary/20 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50"
          >
            {isSaving ? (
              <motion.span 
                animate={{ rotate: 360 }} 
                transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                className="inline-block font-bold"
              >
                o
              </motion.span>
            ) : (
              <>
                <Save className="w-4 h-4" />
                Save Changes
              </>
            )}
          </button>
        </div>
      </div>
    </motion.div>
  );
}
