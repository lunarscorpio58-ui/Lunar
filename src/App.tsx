import { useState, useRef, useEffect } from 'react';
import { GoogleGenAI, FunctionDeclaration, Type, ThinkingLevel, Modality } from "@google/genai";
import { motion, AnimatePresence } from "motion/react";
import { Send, Heart, Sparkles, MessageCircle, User, Moon, Wind, Camera, Image as ImageIcon, X, BookOpen, GraduationCap, Headphones, Settings, LogIn, Volume2, VolumeX, Users, Mic, Square, Zap, MoreVertical } from "lucide-react";
import Markdown from 'react-markdown';
import { cn } from './lib/utils';
import CalmingExercises from './components/CalmingExercises';
import { collection, query, where, onSnapshot, orderBy, limit, addDoc, serverTimestamp } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';
import { AuthProvider, useAuth } from './lib/AuthContext';
import { ThemeProvider, useTheme } from './lib/ThemeContext';
import Profile from './components/Profile';
import ChatManager from './components/ChatManager';
import MoodTracker from './components/MoodTracker';

type Mode = 'listener' | 'research' | 'mentor' | 'gaming_comfort_study';

interface Message {
  id: string;
  role: 'user' | 'bot';
  text: string;
  timestamp: Date;
  image?: string;
  video?: string;
  audio?: string;
  file?: { name: string; url: string; type: string };
}

const GET_SYSTEM_INSTRUCTION = (mode: Mode) => {
  const base = `You are ZomeAi, a helpful, direct, and empathetic AI companion. 
Your goal is to be efficient and supportive, like ChatGPT but with Zome's signature warmth. 
Be friendly and kind, but avoid being overly sentimental or repetitive in your caring. 
Acknowledge feelings briefly, then focus on providing high-quality assistance.
Avoid being robotic; maintain a natural, conversational flow.

**CRITICAL: Provide detailed, thorough, and explanative responses.** 
Do not be overly brief. Take the time to explain concepts in depth, provide context, and offer comprehensive support. Your responses should be substantial and informative, aiming for a high level of detail.

**IMAGE GENERATION:** You can generate images for the user. When they request an image, you MUST first provide a vivid, poetic description of what you are creating for them, and then the system will handle the actual image generation. Your text response should build anticipation and comfort.`;

  const modes = {
    listener: `You are in LISTENER mode. Your focus is purely on empathy and validation. Don't offer advice unless asked. Just be there for them.`,
    research: `You are in RESEARCH mode. You are analytical and informative. You can help solve complex problems and equations. If the user provides an image of an equation, solve it step-by-step but still maintain your warm ZomeAi personality.`,
    mentor: `You are in MENTOR mode. You are encouraging and guiding. Help the user learn and grow. Explain concepts simply and provide actionable steps for their personal or academic goals.`,
    gaming_comfort_study: `You are in 'Zome AI - Gaming + Comfort + Study' mode. 
Your goal is to provide helpful, empathetic, and informative responses related to gaming, emotional comfort, and academic study.
You MUST respond in a valid JSON format with the following structure:
{
  "answer": "A direct answer to the user's question or a supportive statement.",
  "explanation": "A detailed explanation or additional context for the answer.",
  "mode": "Zome AI - Gaming + Comfort + Study",
  "confidence": "High/Medium/Low based on your certainty"
}
Maintain your warm, empathetic ZomeAi personality even within this structured format.`
  };

  const tools = `
If the user seems stressed, anxious, overwhelmed, or having trouble sleeping, you should offer to guide them through a calming exercise.
You have access to a tool called 'suggest_calming_exercise' which can open a specific exercise for the user.
Available exercises:
- 'box-breathing': Good for immediate stress reset.
- '478-breathing': Good for relaxation and sleep.
- 'muscle-relaxation': Good for physical tension.
- 'mindfulness': Good for grounding when feeling scattered.

When suggesting an exercise, explain briefly why it might help them based on what they said.
You are not a therapist, but a kind friend who is always there to listen.`;

  return `${base}\n\n${modes[mode]}\n\n${tools}`;
};

const suggestCalmingExerciseTool: FunctionDeclaration = {
  name: "suggest_calming_exercise",
  description: "Opens a calming exercise module for the user.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      exerciseId: {
        type: Type.STRING,
        description: "The ID of the exercise to suggest (box-breathing, 478-breathing, muscle-relaxation, mindfulness).",
        enum: ["box-breathing", "478-breathing", "muscle-relaxation", "mindfulness"]
      }
    },
    required: ["exerciseId"]
  }
};

const COMFORT_STARTERS = [
  { text: "I'm feeling a bit overwhelmed today.", icon: <Sparkles className="w-4 h-4" /> },
  { text: "I just need someone to listen.", icon: <MessageCircle className="w-4 h-4" /> },
  { text: "Can you tell me something comforting?", icon: <Heart className="w-4 h-4" /> },
  { text: "I'm having trouble sleeping.", icon: <Moon className="w-4 h-4" /> },
];

export default function App() {
  return (
    <AuthProvider>
      <ThemeProvider>
        <ZomeApp />
      </ThemeProvider>
    </AuthProvider>
  );
}

function ZomeApp() {
  const { user, profile, loading, signIn, updateProfile } = useAuth();
  const { theme } = useTheme();
  const [messages, setMessages] = useState<Message[]>([]);
  const greetingAdded = useRef(false);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [showExercises, setShowExercises] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [chatFilter, setChatFilter] = useState<'all' | 'groups'>('all');
  const [userGroups, setUserGroups] = useState<any[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const [activeExerciseId, setActiveExerciseId] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('listener');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<{ data: string; name: string; type: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [ai, setAi] = useState<GoogleGenAI | null>(null);
  const [speculativeResponse, setSpeculativeResponse] = useState<string | null>(null);
  const [speculativeInput, setSpeculativeInput] = useState<string | null>(null);
  const [isSpeculating, setIsSpeculating] = useState(false);
  const speculationTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    if (process.env.GEMINI_API_KEY) {
      setAi(new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }));
    }
  }, []);

  useEffect(() => {
    if (profile && !greetingAdded.current) {
      setMessages([
        {
          id: '1',
          role: 'bot',
          text: `Hello there, ${profile.displayName}. I'm ZomeAi. I'm here for you, whatever is on your mind. How are you feeling in this moment?`,
          timestamp: new Date(),
        }
      ]);
      greetingAdded.current = true;
    }
  }, [profile]);

  useEffect(() => {
    if (!ai || input.length < 150 || isLoading) {
      setSpeculativeResponse(null);
      setSpeculativeInput(null);
      setIsSpeculating(false);
      return;
    }

    if (speculationTimeoutRef.current) clearTimeout(speculationTimeoutRef.current);

    speculationTimeoutRef.current = setTimeout(async () => {
      setIsSpeculating(true);
      try {
        const response = await ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: [
            { role: 'user', parts: [{ text: `The user is currently typing a long message. Here is what they have so far: "${input}". Based on this context, what would be your most likely response? Provide a helpful, empathetic draft response. Keep it concise.` }] }
          ],
          config: {
            systemInstruction: "You are ZomeAi, a comforting and empathetic companion. You are predicting a response to a message that is still being typed. Be warm and supportive."
          }
        });
        
        if (response.text) {
          setSpeculativeResponse(response.text);
          setSpeculativeInput(input);
        }
      } catch (error) {
        console.error("Speculation error:", error);
      } finally {
        setIsSpeculating(false);
      }
    }, 2000);

    return () => {
      if (speculationTimeoutRef.current) clearTimeout(speculationTimeoutRef.current);
    };
  }, [input, ai, isLoading]);

  useEffect(() => {
    if (!user) {
      setUserGroups([]);
      return;
    }
    const chatsRef = collection(db, 'chats');
    const q = query(
      chatsRef, 
      where('members', 'array-contains', user.uid),
      where('type', '==', 'group'),
      orderBy('createdAt', 'desc')
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const groups = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setUserGroups(groups);
    }, (error) => {
      // If index is missing, it will fail silently or log error
      console.error("Error fetching groups:", error);
    });

    return () => unsubscribe();
  }, [user]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const playAudio = async (base64Data: string) => {
    return new Promise<void>((resolve, reject) => {
      try {
        if (!audioContextRef.current) {
          audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        }
        const audioContext = audioContextRef.current;
        const binaryString = atob(base64Data);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        
        const buffer = audioContext.createBuffer(1, len / 2, 24000);
        const channelData = buffer.getChannelData(0);
        const view = new DataView(bytes.buffer);
        for (let i = 0; i < len / 2; i++) {
          channelData[i] = view.getInt16(i * 2, true) / 32768;
        }
        
        const source = audioContext.createBufferSource();
        source.buffer = buffer;
        source.connect(audioContext.destination);
        source.onended = () => resolve();
        source.start();
        // Resolve immediately when it starts for smoother transition as requested
        resolve();
      } catch (e) {
        console.error("Audio playback error:", e);
        reject(e);
      }
    });
  };

  const generateSpeech = async (text: string, voiceNameOverride?: string) => {
    if (!ai || (!profile?.voiceEnabled && !voiceNameOverride) || !text) return;
    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: (voiceNameOverride || profile?.voiceName || 'Kore') as any },
              },
          },
        },
      });
      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (base64Audio) {
        await playAudio(base64Audio);
      }
    } catch (e) {
      console.error("Speech generation error:", e);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = async () => {
          const base64Audio = reader.result as string;
          handleSend(undefined, base64Audio);
        };
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } catch (err) {
      console.error("Error accessing microphone:", err);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-comfort-bg">
        <motion.div 
          animate={{ scale: [1, 1.2, 1], rotate: [0, 180, 360] }}
          transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
          className="w-12 h-12 rounded-2xl bg-comfort-primary flex items-center justify-center text-white shadow-2xl"
        >
          <Sparkles className="w-6 h-6" />
        </motion.div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-comfort-bg p-6 text-center">
        <motion.div 
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="w-24 h-24 rounded-[2.5rem] bg-comfort-primary flex items-center justify-center text-white shadow-2xl mb-8"
        >
          <Sparkles className="w-12 h-12" />
        </motion.div>
        <h1 className="font-display text-4xl font-bold text-comfort-text mb-4 tracking-tight">ZomeAi</h1>
        <p className="text-comfort-text/60 max-w-xs mb-12 leading-relaxed">
          Step into your neon sanctuary. A space for comfort, growth, and connection.
        </p>
        <button 
          onClick={signIn}
          className="flex items-center gap-3 bg-white text-comfort-text px-8 py-4 rounded-2xl font-bold shadow-xl shadow-comfort-primary/10 hover:scale-105 active:scale-95 transition-all border border-comfort-primary/10"
        >
          <LogIn className="w-5 h-5 text-comfort-primary" />
          Enter the Zome
        </button>
      </div>
    );
  }

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        if (file.type.startsWith('image/')) {
          setSelectedImage(result);
          setSelectedFile(null);
        } else {
          setSelectedFile({ data: result, name: file.name, type: file.type });
          setSelectedImage(null);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSend = async (text: string = input, audioBase64?: string) => {
    if ((!text.trim() && !selectedImage && !selectedFile && !audioBase64) || isLoading || !ai) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      text: audioBase64 ? 'Voice Memo' : text.trim(),
      timestamp: new Date(),
      image: selectedImage || undefined,
      video: selectedFile?.type.startsWith('video/') ? selectedFile.data : undefined,
      audio: audioBase64 || undefined,
      file: selectedFile && !selectedFile.type.startsWith('video/') ? { name: selectedFile.name, url: selectedFile.data, type: selectedFile.type } : undefined,
    };

    setMessages(prev => [...prev, userMessage]);
    const currentInput = text.trim();
    const currentImage = selectedImage;
    const currentFile = selectedFile;
    setInput('');
    setSelectedImage(null);
    setSelectedFile(null);
    setIsLoading(true);

    // Check for speculative response
    if (speculativeResponse && speculativeInput && currentInput.startsWith(speculativeInput.slice(0, -10))) {
      const botMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'bot',
        text: speculativeResponse,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, botMessage]);
      setIsLoading(false);
      setSpeculativeResponse(null);
      setSpeculativeInput(null);
      generateSpeech(speculativeResponse);
      return;
    }

    try {
      const chatHistory = messages.map(m => {
        const parts: any[] = [{ text: m.text }];
        if (m.image) {
          parts.push({
            inlineData: {
              data: m.image.split(',')[1],
              mimeType: "image/png"
            }
          });
        }
        if (m.audio) {
          parts.push({
            inlineData: {
              data: m.audio.split(',')[1],
              mimeType: "audio/webm"
            }
          });
        }
        return {
          role: m.role === 'user' ? 'user' : 'model',
          parts
        };
      });

      const currentParts: any[] = [{ text: audioBase64 ? "Voice Memo" : (currentInput || "Please look at this.") }];
      if (currentImage) {
        currentParts.push({
          inlineData: {
            data: currentImage.split(',')[1],
            mimeType: "image/png"
          }
        });
      }
      if (currentFile) {
        currentParts.push({
          inlineData: {
            data: currentFile.data.split(',')[1],
            mimeType: currentFile.type
          }
        });
      }
      if (audioBase64) {
        currentParts.push({
          inlineData: {
            data: audioBase64.split(',')[1],
            mimeType: 'audio/webm'
          }
        });
      }

      // Use gemini-2.5-flash-image if user asks for an image, otherwise standard flash
      const isImageGen = currentInput.toLowerCase().includes('generate') || currentInput.toLowerCase().includes('draw') || currentInput.toLowerCase().includes('image of');
      if (isImageGen) setIsGeneratingImage(true);
      const modelName = isImageGen ? "gemini-2.5-flash-image" : "gemini-3-flash-preview";

      const response = await ai.models.generateContent({
        model: modelName,
        contents: [
          ...chatHistory,
          { role: 'user', parts: currentParts }
        ],
        config: {
          systemInstruction: GET_SYSTEM_INSTRUCTION(mode),
          temperature: 0.7,
          topP: 0.95,
          ...(modelName.startsWith('gemini-3') ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } } : {}),
          responseMimeType: mode === 'gaming_comfort_study' ? "application/json" : "text/plain",
          tools: isImageGen ? [] : [{ functionDeclarations: [suggestCalmingExerciseTool] }]
        },
      });

      // Check for function calls
      const functionCalls = response.functionCalls;
      if (functionCalls && functionCalls.length > 0) {
        const call = functionCalls[0];
        if (call.name === 'suggest_calming_exercise') {
          const { exerciseId } = call.args as { exerciseId: string };
          setActiveExerciseId(exerciseId);
          setShowExercises(true);
          
          const botMessage: Message = {
            id: (Date.now() + 1).toString(),
            role: 'bot',
            text: `I've opened the **${exerciseId.replace('-', ' ')}** exercise for you. I thought it might help you feel a bit more grounded right now. Shall we try it together?`,
            timestamp: new Date(),
          };
          
          if (profile?.voiceEnabled) {
            await generateSpeech(botMessage.text);
          }
          setMessages(prev => [...prev, botMessage]);
        }
      } else {
        let botText = "";
        let botImage = undefined;

        for (const part of response.candidates?.[0]?.content?.parts || []) {
          if (part.text) {
            if (mode === 'gaming_comfort_study') {
              try {
                const data = JSON.parse(part.text);
                botText = `**${data.answer}**\n\n${data.explanation}\n\n*Mode: ${data.mode} | Confidence: ${data.confidence}*`;
              } catch (e) {
                botText += part.text;
              }
            } else {
              botText += part.text;
            }
          }
          if (part.inlineData) {
            botImage = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
          }
        }

        const botMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'bot',
          text: botText || (botImage ? "" : "I'm here for you, but I'm having a little trouble finding the right words right now. Could you tell me more?"),
          image: botImage,
          timestamp: new Date(),
        };
        
        if (botMessage.text && profile?.voiceEnabled) {
          await generateSpeech(botMessage.text);
        }
        setMessages(prev => [...prev, botMessage]);
      }
    } catch (error) {
      console.error("Error calling Gemini:", error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'bot',
        text: "I'm so sorry, I'm feeling a bit disconnected right now. Could we try again in a moment? I'm still here for you.",
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
      setIsGeneratingImage(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col max-w-2xl mx-auto p-4 md:p-6">
      {/* Header */}
      <header className="flex items-center justify-between mb-8 pt-4">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setShowProfile(true)}
            className="w-12 h-12 rounded-2xl bg-comfort-primary border-2 border-comfort-primary/20 overflow-hidden flex items-center justify-center text-white shadow-lg shadow-comfort-primary/20 hover:scale-105 transition-transform"
          >
            {profile?.photoURL ? (
              <img src={profile.photoURL} alt="Me" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            ) : (
              <User className="w-6 h-6" />
            )}
          </button>
          <div>
            <h1 className="font-display text-lg font-bold tracking-tight text-comfort-text leading-none mb-1">
              {profile?.displayName || 'Friend'}
            </h1>
            {userGroups.length > 0 ? (
              <button 
                onClick={() => {
                  setChatFilter('groups');
                  setShowChat(true);
                }}
                className="flex items-center gap-1 text-[10px] text-comfort-primary font-bold uppercase tracking-widest hover:opacity-80 transition-opacity"
              >
                <Users className="w-3 h-3" />
                {userGroups.length === 1 ? userGroups[0].name : `${userGroups.length} Groups`}
              </button>
            ) : (
              <p className="text-[10px] text-comfort-primary font-bold uppercase tracking-widest">Zome Companion</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => {
              setChatFilter('all');
              setShowChat(true);
            }}
            className="p-2.5 text-comfort-primary hover:bg-comfort-primary/10 rounded-xl transition-colors bg-white shadow-sm border border-comfort-primary/5"
            title="Past Chats"
          >
            <MoreVertical className="w-5 h-5" />
          </button>
          <button 
            onClick={() => {
              setActiveExerciseId(null);
              setShowExercises(true);
            }}
            className="p-2.5 text-comfort-primary hover:bg-comfort-primary/10 rounded-xl transition-colors bg-white shadow-sm border border-comfort-primary/5"
            title="Calming Exercises"
          >
            <Wind className="w-5 h-5" />
          </button>
          <button 
            onClick={() => setShowProfile(true)}
            className="p-2.5 text-comfort-primary hover:bg-comfort-primary/10 rounded-xl transition-colors bg-white shadow-sm border border-comfort-primary/5"
            title="Profile Settings"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Chat Area */}
      <main className="flex-1 overflow-y-auto mb-6 space-y-6 pr-2 scrollbar-thin scrollbar-thumb-comfort-primary/20">
        <AnimatePresence initial={false}>
          {messages.map((message) => (
            <motion.div
              key={message.id}
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              className={cn(
                "flex w-full gap-3",
                message.role === 'user' ? "flex-row-reverse" : "flex-row"
              )}
            >
              <div className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-1 overflow-hidden",
                message.role === 'user' ? "bg-comfort-accent/20 text-comfort-accent" : "bg-comfort-primary text-white font-display font-bold text-lg"
              )}>
                {message.role === 'user' ? (
                  profile?.photoURL ? <img src={profile.photoURL} className="w-full h-full object-cover" /> : <User className="w-4 h-4" />
                ) : "o"}
              </div>
              <div className={cn(
                "max-w-[85%] px-4 py-3 rounded-2xl text-sm leading-relaxed shadow-sm",
                message.role === 'user' 
                  ? "bg-comfort-accent/10 text-comfort-text rounded-tr-none border border-comfort-accent/10" 
                  : "bg-white text-comfort-text rounded-tl-none border border-comfort-primary/10"
              )}>
                {message.image && (
                  <img 
                    src={message.image} 
                    alt="Media" 
                    className="max-w-full rounded-lg mb-2 border border-comfort-primary/10" 
                    referrerPolicy="no-referrer"
                  />
                )}
                {message.video && (
                  <video 
                    src={message.video} 
                    controls 
                    className="max-w-full rounded-lg mb-2 border border-comfort-primary/10"
                  />
                )}
                {message.file && (
                  <div className="flex items-center gap-3 p-3 bg-comfort-primary/5 rounded-xl mb-2 border border-comfort-primary/10">
                    <div className="p-2 bg-comfort-primary text-white rounded-lg">
                      <ImageIcon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{message.file.name}</p>
                      <p className="text-[10px] opacity-40 uppercase">{message.file.type.split('/')[1]}</p>
                    </div>
                    <a 
                      href={message.file.url} 
                      download={message.file.name}
                      className="p-1.5 hover:bg-comfort-primary/10 rounded-full transition-colors text-comfort-primary"
                    >
                      <Send className="w-4 h-4 rotate-90" />
                    </a>
                  </div>
                )}
                <div className="markdown-body prose prose-sm max-w-none">
                  {message.audio && (
                    <div className="flex items-center gap-2 p-2 bg-comfort-primary/5 rounded-xl mb-2 border border-comfort-primary/10 min-w-[200px]">
                      <audio src={message.audio} controls className="w-full h-8" />
                    </div>
                  )}
                  <Markdown>{message.text}</Markdown>
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        
        {isLoading && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex gap-3"
          >
            <div className="w-8 h-8 rounded-full bg-comfort-primary text-white font-display font-bold text-lg flex items-center justify-center shrink-0">
              o
            </div>
            <div className="bg-white px-4 py-3 rounded-2xl rounded-tl-none border border-comfort-primary/10 flex gap-1 items-center">
              {isGeneratingImage ? (
                <span className="text-[10px] font-bold text-comfort-primary uppercase tracking-widest animate-pulse">o o o</span>
              ) : (
                <>
                  <motion.span animate={{ opacity: [0.4, 1, 0.4] }} transition={{ repeat: Infinity, duration: 1.5, delay: 0 }} className="text-comfort-primary font-bold">o</motion.span>
                  <motion.span animate={{ opacity: [0.4, 1, 0.4] }} transition={{ repeat: Infinity, duration: 1.5, delay: 0.2 }} className="text-comfort-primary font-bold">o</motion.span>
                  <motion.span animate={{ opacity: [0.4, 1, 0.4] }} transition={{ repeat: Infinity, duration: 1.5, delay: 0.4 }} className="text-comfort-primary font-bold">o</motion.span>
                </>
              )}
            </div>
          </motion.div>
        )}
        <div ref={messagesEndRef} />
      </main>

      {/* Quick Starters */}
      {messages.length === 1 && !isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
          {COMFORT_STARTERS.map((starter, i) => (
            <motion.button
              key={i}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              onClick={() => handleSend(starter.text)}
              className="flex items-center gap-3 p-4 bg-white hover:bg-comfort-primary/5 border border-comfort-primary/10 rounded-2xl text-left text-sm transition-all hover:shadow-md group"
            >
              <div className="p-2 bg-comfort-primary/10 rounded-xl text-comfort-primary group-hover:bg-comfort-primary group-hover:text-white transition-colors">
                {starter.icon}
              </div>
              <span className="font-medium text-comfort-text/80">{starter.text}</span>
            </motion.button>
          ))}
        </div>
      )}

      {/* Mode Switcher */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-2 scrollbar-none">
        {[
          { id: 'listener', label: 'Listener', icon: <Headphones className="w-4 h-4" /> },
          { id: 'research', label: 'Research', icon: <BookOpen className="w-4 h-4" /> },
          { id: 'mentor', label: 'Mentor', icon: <GraduationCap className="w-4 h-4" /> },
          { id: 'gaming_comfort_study', label: 'Gaming + Comfort + Study', icon: <Zap className="w-4 h-4" /> },
        ].map((m) => (
          <button
            key={m.id}
            onClick={() => setMode(m.id as Mode)}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-full text-xs font-medium transition-all whitespace-nowrap",
              mode === m.id 
                ? "bg-comfort-primary text-white shadow-md shadow-comfort-primary/20" 
                : "bg-white text-comfort-text/60 border border-comfort-primary/10 hover:bg-comfort-primary/5"
            )}
          >
            {m.icon}
            {m.label}
          </button>
        ))}
      </div>

      {/* Input Area */}
      <footer className="relative">
        <AnimatePresence>
          {isSpeculating && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="absolute -top-8 left-4 flex items-center gap-2 text-[10px] text-comfort-primary font-bold uppercase tracking-widest"
            >
              <div className="flex gap-0.5">
                <motion.span animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1, delay: 0 }}>o</motion.span>
                <motion.span animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1, delay: 0.2 }}>o</motion.span>
                <motion.span animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1, delay: 0.4 }}>o</motion.span>
              </div>
              Thinking ahead
            </motion.div>
          )}
          {(selectedImage || selectedFile) && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="absolute bottom-full mb-4 left-0 p-2 bg-white rounded-2xl border border-comfort-primary/10 shadow-xl flex items-center gap-3"
            >
              {selectedImage ? (
                <img src={selectedImage} alt="Selected" className="w-12 h-12 rounded-lg object-cover" referrerPolicy="no-referrer" />
              ) : (
                <div className="w-12 h-12 rounded-lg bg-comfort-primary/10 flex items-center justify-center text-comfort-primary">
                  <ImageIcon className="w-6 h-6" />
                </div>
              )}
              <div className="flex-1">
                <p className="text-[10px] font-bold text-comfort-primary uppercase tracking-widest">File Ready</p>
                <p className="text-[10px] text-comfort-text/40 truncate max-w-[150px]">{selectedImage ? 'Image' : selectedFile?.name}</p>
              </div>
              <button 
                onClick={() => { setSelectedImage(null); setSelectedFile(null); }}
                className="p-1.5 bg-comfort-bg text-comfort-text/40 hover:text-comfort-text rounded-full transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="relative flex items-center gap-2">
          {isRecording ? (
            <div className="flex-1 flex items-center gap-3 bg-rose-50 rounded-2xl px-4 py-3 border border-rose-100 shadow-lg">
              <div className="w-2 h-2 bg-rose-500 rounded-full animate-pulse" />
              <span className="text-xs font-bold text-rose-500 uppercase tracking-widest flex-1">
                Recording... {Math.floor(recordingTime / 60)}:{(recordingTime % 60).toString().padStart(2, '0')}
              </span>
              <button 
                onClick={stopRecording}
                className="p-1.5 bg-rose-500 text-white rounded-lg hover:bg-rose-600 transition-all"
              >
                <Square className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <>
              <button
                onClick={() => {
                  updateProfile({ voiceEnabled: !profile?.voiceEnabled });
                }}
                className={cn(
                  "p-3 rounded-2xl transition-all shadow-lg",
                  profile?.voiceEnabled ? "bg-comfort-primary text-white" : "bg-white text-comfort-primary border border-comfort-primary/20"
                )}
                title={profile?.voiceEnabled ? "Disable Voice" : "Enable Voice"}
              >
                {profile?.voiceEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
              </button>
              <button 
                onClick={startRecording}
                className="p-3 bg-white text-comfort-primary border border-comfort-primary/20 rounded-2xl transition-all shadow-lg hover:bg-comfort-primary/5"
                title="Record Voice Memo"
              >
                <Mic className="w-5 h-5" />
              </button>
              <div className="relative flex-1">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSend()}
                  placeholder={mode === 'research' ? "Ask a question or solve an equation..." : "Tell me what's on your mind..."}
                  className="w-full bg-white border border-comfort-primary/20 rounded-2xl px-5 py-4 pr-14 text-sm focus:outline-none focus:ring-2 focus:ring-comfort-primary/30 shadow-lg shadow-comfort-primary/5 transition-all placeholder:text-comfort-text/30"
                />
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                  <input 
                    type="file" 
                    accept="image/*,video/*,application/pdf,text/*" 
                    className="hidden" 
                    ref={fileInputRef} 
                    onChange={handleImageUpload}
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="p-2 text-comfort-primary/40 hover:text-comfort-primary transition-colors"
                    title="Upload File"
                  >
                    <ImageIcon className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => handleSend()}
                    disabled={(!input.trim() && !selectedImage && !selectedFile) || isLoading}
                    className="p-2.5 bg-comfort-primary text-white rounded-xl disabled:opacity-50 disabled:cursor-not-allowed hover:bg-comfort-primary/90 transition-all shadow-md active:scale-95"
                  >
                    <Send className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
        <p className="text-[10px] text-center mt-4 text-comfort-text/40 font-medium">
          ZomeAi is here to listen. You're not alone.
        </p>
      </footer>

      {/* Modals */}
      <AnimatePresence>
        {showExercises && (
          <CalmingExercises 
            onClose={() => setShowExercises(false)} 
            initialExerciseId={activeExerciseId}
          />
        )}
        {showProfile && (
          <Profile 
            onClose={() => setShowProfile(false)} 
            onVoiceSelect={(voiceId) => generateSpeech("Hey, I'm Zome AI, your AI companion. What's on your mind today?", voiceId)}
          />
        )}
        {showChat && (
          <ChatManager 
            onClose={() => setShowChat(false)} 
            initialFilter={chatFilter}
          />
        )}
        <MoodTracker />
      </AnimatePresence>
    </div>
  );
}
