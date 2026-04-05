import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../lib/AuthContext';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, query, where, onSnapshot, addDoc, serverTimestamp, orderBy, limit, getDocs, doc, setDoc, updateDoc, arrayUnion, getDoc } from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';
import { Search, Plus, MessageCircle, User, Send, X, Users, ChevronLeft, Image as ImageIcon, File as FileIcon, Video, Phone, PhoneOff, MoreVertical, Mic, Square, Play, Pause } from 'lucide-react';
import { cn } from '../lib/utils';
import Markdown from 'react-markdown';
import VideoCall from './VideoCall';

interface Chat {
  id: string;
  name?: string;
  type: 'individual' | 'group';
  members: string[];
  lastMessage?: {
    text: string;
    senderId: string;
    timestamp: any;
  };
  createdAt: any;
}

interface Message {
  id: string;
  chatId: string;
  senderId: string;
  text: string;
  timestamp: any;
  image?: string;
  video?: string;
  audio?: string;
  file?: { name: string; url: string; type: string };
}

interface UserProfile {
  uid: string;
  displayName: string;
  displayName_lowercase?: string;
  photoURL: string;
  bio?: string;
  lastActive?: any;
}

export default function ChatManager({ onClose, initialFilter }: { onClose: () => void, initialFilter?: 'all' | 'groups' }) {
  const { user, profile } = useAuth();
  const [chats, setChats] = useState<Chat[]>([]);
  const [filter, setFilter] = useState<'all' | 'groups'>(initialFilter || 'all');
  const [chatProfiles, setChatProfiles] = useState<Record<string, UserProfile>>({});
  const [activeChat, setActiveChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UserProfile[]>([]);
  const [groupSearchResults, setGroupSearchResults] = useState<Chat[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const [activeCall, setActiveCall] = useState<{ id: string; isCaller: boolean; receiverProfile?: any } | null>(null);
  const [incomingCall, setIncomingCall] = useState<{ id: string; callerId: string; callerProfile?: any } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Listen to user's chats
  useEffect(() => {
    if (!user) return;
    const chatsRef = collection(db, 'chats');
    const q = query(chatsRef, where('members', 'array-contains', user.uid), orderBy('createdAt', 'desc'));
    
    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const chatList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Chat));
      setChats(chatList);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'chats');
    });

    return () => unsubscribe();
  }, [user]);

  // Listen to profiles of all members in user's chats for real-time status
  useEffect(() => {
    if (!user || chats.length === 0) return;
    const allMembers = Array.from(new Set(chats.flatMap(c => c.members)));
    const usersRef = collection(db, 'users');
    
    const unsubscribes: (() => void)[] = [];
    
    for (let i = 0; i < allMembers.length; i += 10) {
      const batch = allMembers.slice(i, i + 10);
      const qProfiles = query(usersRef, where('uid', 'in', batch));
      const unsubscribe = onSnapshot(qProfiles, (snap) => {
        const newProfiles: Record<string, UserProfile> = {};
        snap.docs.forEach(d => {
          const data = d.data() as UserProfile;
          newProfiles[data.uid] = data;
        });
        setChatProfiles(prev => ({ ...prev, ...newProfiles }));
      });
      unsubscribes.push(unsubscribe);
    }

    return () => unsubscribes.forEach(unsub => unsub());
  }, [user, chats.length]);

  // Listen to active chat messages
  useEffect(() => {
    if (!activeChat) {
      setMessages([]);
      return;
    }
    const messagesRef = collection(db, 'chats', activeChat.id, 'messages');
    const q = query(messagesRef, orderBy('timestamp', 'asc'), limit(50));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const messageList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Message));
      setMessages(messageList);
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `chats/${activeChat.id}/messages`);
    });

    return () => unsubscribe();
  }, [activeChat]);

  // Listen for incoming calls
  useEffect(() => {
    if (!user) return;
    const callsRef = collection(db, 'calls');
    const q = query(callsRef, where('receiverId', '==', user.uid), where('status', '==', 'ringing'));
    
    const unsubscribe = onSnapshot(q, async (snapshot) => {
      if (!snapshot.empty) {
        const callDoc = snapshot.docs[0];
        const callData = callDoc.data();
        
        // Fetch caller profile
        const callerSnap = await getDoc(doc(db, 'users', callData.callerId));
        const callerProfile = callerSnap.exists() ? callerSnap.data() : null;
        
        setIncomingCall({ 
          id: callDoc.id, 
          callerId: callData.callerId,
          callerProfile 
        });
      } else {
        setIncomingCall(null);
      }
    });

    return () => unsubscribe();
  }, [user?.uid]);

  const isUserActive = (profile?: UserProfile) => {
    if (!profile?.lastActive) return false;
    try {
      const lastActive = profile.lastActive.toDate();
      const now = new Date();
      const diff = now.getTime() - lastActive.getTime();
      return diff < 5 * 60 * 1000; // 5 minutes
    } catch (e) {
      return false;
    }
  };

  const isChatActive = (chat: Chat) => {
    if (chat.type === 'individual') {
      const otherId = chat.members.find(m => m !== user?.uid);
      return isUserActive(otherId ? chatProfiles[otherId] : undefined);
    } else {
      // For groups, check if any member (other than current user) is active
      return chat.members.some(memberId => {
        if (memberId === user?.uid) return false;
        return isUserActive(chatProfiles[memberId]);
      });
    }
  };

  const startVideoCall = async () => {
    if (!activeChat || activeChat.type === 'group' || !user) return;
    
    const otherId = activeChat.members.find(m => m !== user.uid);
    if (!otherId) return;

    try {
      const callId = `${user.uid}_${otherId}_${Date.now()}`;
      const callRef = doc(db, 'calls', callId);
      
      await setDoc(callRef, {
        id: callId,
        chatId: activeChat.id,
        callerId: user.uid,
        receiverId: otherId,
        status: 'ringing',
        createdAt: serverTimestamp()
      });

      setActiveCall({ 
        id: callId, 
        isCaller: true, 
        receiverProfile: chatProfiles[otherId] 
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'calls');
    }
  };

  const answerCall = () => {
    if (!incomingCall) return;
    setActiveCall({ 
      id: incomingCall.id, 
      isCaller: false,
      receiverProfile: incomingCall.callerProfile 
    });
    setIncomingCall(null);
  };

  const rejectCall = async () => {
    if (!incomingCall) return;
    try {
      await updateDoc(doc(db, 'calls', incomingCall.id), { status: 'rejected' });
      setIncomingCall(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'calls');
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    try {
      const searchLower = searchQuery.toLowerCase();
      
      // Search Users
      const usersRef = collection(db, 'users');
      const qUsers = query(
        usersRef, 
        where('displayName_lowercase', '>=', searchLower), 
        where('displayName_lowercase', '<=', searchLower + '\uf8ff'), 
        limit(10)
      );
      const userSnapshot = await getDocs(qUsers);
      const userResults = userSnapshot.docs
        .map(doc => doc.data() as UserProfile)
        .filter(u => u.uid !== user?.uid);
      setSearchResults(userResults);

      // Search Groups
      const chatsRef = collection(db, 'chats');
      const qGroups = query(
        chatsRef,
        where('type', '==', 'group'),
        where('name_lowercase', '>=', searchLower),
        where('name_lowercase', '<=', searchLower + '\uf8ff'),
        limit(10)
      );
      const groupSnapshot = await getDocs(qGroups);
      const groupResults = groupSnapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as Chat))
        .filter(c => !c.members.includes(user?.uid || ''));
      setGroupSearchResults(groupResults);

    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'search');
    } finally {
      setIsSearching(false);
    }
  };

  const startIndividualChat = async (otherUser: UserProfile) => {
    if (!user) return;
    
    // Check if chat already exists
    const existingChat = chats.find(c => c.type === 'individual' && c.members.includes(otherUser.uid));
    if (existingChat) {
      setActiveChat(existingChat);
      setSearchQuery('');
      setSearchResults([]);
      return;
    }

    try {
      const chatRef = collection(db, 'chats');
      const newChat = {
        type: 'individual',
        members: [user.uid, otherUser.uid],
        createdAt: serverTimestamp(),
      };
      const docRef = await addDoc(chatRef, newChat);
      setActiveChat({ id: docRef.id, ...newChat } as Chat);
      setSearchQuery('');
      setSearchResults([]);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'chats');
    }
  };

  const createGroupChat = async () => {
    if (!user || !groupName.trim()) return;
    try {
      const chatRef = collection(db, 'chats');
      const newChat = {
        name: groupName,
        name_lowercase: groupName.toLowerCase(),
        type: 'group',
        members: [user.uid, ...selectedMembers],
        createdAt: serverTimestamp(),
      };
      const docRef = await addDoc(chatRef, newChat);
      setActiveChat({ id: docRef.id, ...newChat } as Chat);
      setIsCreatingGroup(false);
      setGroupName('');
      setSelectedMembers([]);
      setSearchQuery('');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'chats');
    }
  };

  const joinGroup = async (group: Chat) => {
    if (!user) return;
    try {
      const chatRef = doc(db, 'chats', group.id);
      await updateDoc(chatRef, {
        members: arrayUnion(user.uid)
      });
      setActiveChat({ ...group, members: [...group.members, user.uid] });
      setSearchQuery('');
      setGroupSearchResults([]);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'chats');
    }
  };

  const sendMessage = async () => {
    if (!user || !activeChat || !inputText.trim()) return;
    setIsSending(true);
    try {
      const messagesRef = collection(db, 'chats', activeChat.id, 'messages');
      const newMessage = {
        chatId: activeChat.id,
        senderId: user.uid,
        text: inputText.trim(),
        timestamp: serverTimestamp(),
      };
      await addDoc(messagesRef, newMessage);
      
      // Update last message in chat
      const chatRef = doc(db, 'chats', activeChat.id);
      await updateDoc(chatRef, {
        lastMessage: {
          text: inputText.trim(),
          senderId: user.uid,
          timestamp: serverTimestamp(),
        }
      });
      
      setInputText('');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `chats/${activeChat.id}/messages`);
    } finally {
      setIsSending(false);
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
          await sendAudioMessage(base64Audio);
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

  const sendAudioMessage = async (base64Audio: string) => {
    if (!activeChat || !user) return;
    setIsSending(true);
    try {
      const messagesRef = collection(db, 'chats', activeChat.id, 'messages');
      const messageData = {
        chatId: activeChat.id,
        senderId: user.uid,
        text: 'Voice Memo',
        audio: base64Audio,
        timestamp: serverTimestamp()
      };
      await addDoc(messagesRef, messageData);
      
      const chatRef = doc(db, 'chats', activeChat.id);
      await updateDoc(chatRef, {
        lastMessage: {
          text: '🎤 Voice Memo',
          senderId: user.uid,
          timestamp: serverTimestamp()
        }
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `chats/${activeChat.id}/messages`);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-comfort-bg/80 backdrop-blur-sm"
    >
      <div className="bg-white w-full max-w-2xl h-[80vh] rounded-3xl shadow-2xl border border-comfort-primary/10 overflow-hidden flex">
        {/* Sidebar */}
        <div className={cn(
          "w-full sm:w-80 border-r border-comfort-primary/5 flex flex-col transition-all",
          activeChat && "hidden sm:flex"
        )}>
          {/* Sidebar Header */}
          <div className="p-6 border-b border-comfort-primary/5 bg-comfort-primary/5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-xl font-semibold text-comfort-text">Chats</h2>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => setIsCreatingGroup(!isCreatingGroup)}
                  className="p-2 hover:bg-comfort-primary/10 rounded-full transition-colors text-comfort-primary"
                  title="New Group"
                >
                  <Users className="w-5 h-5" />
                </button>
                <button 
                  onClick={onClose}
                  className="p-2 hover:bg-comfort-primary/10 rounded-full transition-colors text-comfort-text/40"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Search Bar */}
            <div className="relative flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-comfort-text/30" />
                <input 
                  type="text" 
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    if (!e.target.value.trim()) setSearchResults([]);
                  }}
                  onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                  placeholder="Search users or groups..."
                  className="w-full bg-white border border-comfort-primary/10 rounded-xl pl-9 pr-4 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-comfort-primary/30 transition-all"
                />
                {searchQuery && (
                  <button 
                    onClick={() => { setSearchQuery(''); setSearchResults([]); setGroupSearchResults([]); }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-comfort-primary/10 rounded-full text-comfort-text/40"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
              <button 
                onClick={handleSearch}
                disabled={isSearching || !searchQuery.trim()}
                className="p-2 bg-comfort-primary text-white rounded-xl disabled:opacity-50"
              >
                {isSearching ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Search className="w-4 h-4" />}
              </button>
            </div>

            {/* Filter Tabs */}
            {!isCreatingGroup && !searchQuery && (
              <div className="flex items-center gap-2 px-2 pb-2">
                <button
                  onClick={() => setFilter('all')}
                  className={cn(
                    "px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all",
                    filter === 'all' ? "bg-comfort-primary text-white shadow-sm" : "bg-comfort-primary/5 text-comfort-text/40 hover:bg-comfort-primary/10"
                  )}
                >
                  All Chats
                </button>
                <button
                  onClick={() => setFilter('groups')}
                  className={cn(
                    "px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all",
                    filter === 'groups' ? "bg-comfort-primary text-white shadow-sm" : "bg-comfort-primary/5 text-comfort-text/40 hover:bg-comfort-primary/10"
                  )}
                >
                  Groups
                </button>
              </div>
            )}
          </div>

          {/* Chat List / Search Results */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {isCreatingGroup ? (
              <div className="p-4 space-y-4">
                <input 
                  type="text" 
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  placeholder="Group Name"
                  className="w-full bg-comfort-bg/50 border border-comfort-primary/10 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-comfort-primary/30"
                />
                <div className="space-y-2">
                  <p className="text-[10px] font-bold text-comfort-text/40 uppercase tracking-widest">Select Members</p>
                  <div className="max-h-40 overflow-y-auto space-y-1">
                    {/* For simplicity, just show existing individual chat partners */}
                    {chats.filter(c => c.type === 'individual').map(chat => {
                      const otherId = chat.members.find(m => m !== user?.uid);
                      const otherProfile = otherId ? chatProfiles[otherId] : null;
                      return (
                        <button
                          key={chat.id}
                          onClick={() => {
                            if (otherId) {
                              setSelectedMembers(prev => 
                                prev.includes(otherId) ? prev.filter(id => id !== otherId) : [...prev, otherId]
                              );
                            }
                          }}
                          className={cn(
                            "w-full flex items-center gap-3 p-2 rounded-xl text-left transition-all",
                            otherId && selectedMembers.includes(otherId) ? "bg-comfort-primary/10" : "hover:bg-comfort-primary/5"
                          )}
                        >
                          <div className="w-8 h-8 rounded-lg bg-comfort-primary/20 flex items-center justify-center text-comfort-primary overflow-hidden">
                            {otherProfile?.photoURL ? <img src={otherProfile.photoURL} className="w-full h-full object-cover" /> : <User className="w-4 h-4" />}
                          </div>
                          <span className="text-xs font-medium text-comfort-text truncate">
                            {otherProfile?.displayName || `User ${otherId?.slice(0, 5)}`}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
                <button 
                  onClick={createGroupChat}
                  disabled={!groupName.trim()}
                  className="w-full bg-comfort-primary text-white py-2 rounded-xl text-xs font-bold shadow-lg shadow-comfort-primary/20 disabled:opacity-50"
                >
                  Create Group
                </button>
              </div>
            ) : (searchResults.length > 0 || groupSearchResults.length > 0) ? (
              <div className="space-y-1">
                {searchResults.length > 0 && (
                  <>
                    <p className="text-[10px] font-bold text-comfort-text/40 uppercase tracking-widest p-2">Users</p>
                    {searchResults.map((u) => (
                      <button
                        key={u.uid}
                        onClick={() => startIndividualChat(u)}
                        className="w-full flex items-center gap-3 p-3 rounded-2xl hover:bg-comfort-primary/5 transition-all text-left group"
                      >
                        <div className="w-10 h-10 rounded-xl bg-comfort-primary/10 border border-comfort-primary/10 overflow-hidden flex items-center justify-center">
                          {u.photoURL ? <img src={u.photoURL} alt="" className="w-full h-full object-cover" /> : <User className="w-5 h-5 text-comfort-primary/40" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="text-xs font-bold text-comfort-text truncate">{u.displayName}</h3>
                          <p className="text-[10px] text-comfort-text/40 truncate">{u.bio || 'No bio yet.'}</p>
                        </div>
                      </button>
                    ))}
                  </>
                )}
                
                {groupSearchResults.length > 0 && (
                  <>
                    <p className="text-[10px] font-bold text-comfort-text/40 uppercase tracking-widest p-2 mt-2">Public Groups</p>
                    {groupSearchResults.map((group) => (
                      <div
                        key={group.id}
                        className="w-full flex items-center gap-3 p-3 rounded-2xl hover:bg-comfort-primary/5 transition-all text-left group"
                      >
                        <div className="w-10 h-10 rounded-xl bg-comfort-primary/10 border border-comfort-primary/10 overflow-hidden flex items-center justify-center">
                          <Users className="w-5 h-5 text-comfort-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="text-xs font-bold text-comfort-text truncate">{group.name}</h3>
                          <p className="text-[10px] text-comfort-text/40 truncate">{group.members.length} members</p>
                        </div>
                        <button 
                          onClick={() => joinGroup(group)}
                          className="px-3 py-1.5 bg-comfort-primary text-white text-[10px] font-bold rounded-lg hover:bg-comfort-primary/80 transition-all"
                        >
                          Join
                        </button>
                      </div>
                    ))}
                  </>
                )}
              </div>
            ) : chats.length > 0 ? (
              chats
                .filter(chat => filter === 'all' || chat.type === 'group')
                .map((chat) => {
                  const otherId = chat.members.find(m => m !== user?.uid);
                const otherProfile = otherId ? chatProfiles[otherId] : null;
                return (
                  <button
                    key={chat.id}
                    onClick={() => setActiveChat(chat)}
                    className={cn(
                      "w-full flex items-center gap-3 p-3 rounded-2xl transition-all text-left group",
                      activeChat?.id === chat.id ? "bg-comfort-primary/10" : "hover:bg-comfort-primary/5"
                    )}
                  >
                    <div className="w-10 h-10 rounded-xl bg-comfort-primary/10 border border-comfort-primary/10 overflow-hidden flex items-center justify-center relative">
                      {chat.type === 'group' ? (
                        <Users className="w-5 h-5 text-comfort-primary" />
                      ) : (
                        otherProfile?.photoURL ? <img src={otherProfile.photoURL} className="w-full h-full object-cover" /> : <User className="w-5 h-5 text-comfort-primary/40" />
                      )}
                      {isChatActive(chat) && (
                        <div className="absolute bottom-0 right-0 w-3 h-3 bg-comfort-primary border-2 border-white rounded-full shadow-sm" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-xs font-bold text-comfort-text truncate">
                        {chat.type === 'group' ? chat.name : (otherProfile?.displayName || `Chat with ${otherId?.slice(0, 5)}`)}
                      </h3>
                      <p className="text-[10px] text-comfort-text/40 truncate">
                        {chat.lastMessage ? chat.lastMessage.text : 'No messages yet.'}
                      </p>
                    </div>
                  </button>
                );
              })
            ) : (
              <div className="flex flex-col items-center justify-center h-40 text-center p-6">
                <MessageCircle className="w-8 h-8 text-comfort-primary/20 mb-2" />
                <p className="text-xs text-comfort-text/40">No chats yet. Search for a friend to start talking!</p>
              </div>
            )}
          </div>
        </div>

        {/* Chat Room */}
        <div className={cn(
          "flex-1 flex flex-col bg-comfort-bg/30",
          !activeChat && "hidden sm:flex items-center justify-center"
        )}>
          {activeChat ? (
            <>
              {/* Chat Header */}
              <div className="p-4 border-b border-comfort-primary/5 bg-white flex items-center gap-3">
                <button 
                  onClick={() => setActiveChat(null)}
                  className="sm:hidden p-2 hover:bg-comfort-primary/10 rounded-full transition-colors text-comfort-primary"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <div className="w-10 h-10 rounded-xl bg-comfort-primary/10 flex items-center justify-center text-comfort-primary overflow-hidden">
                  {activeChat.type === 'group' ? (
                    <Users className="w-5 h-5" />
                  ) : (
                    (() => {
                      const otherId = activeChat.members.find(m => m !== user?.uid);
                      const otherProfile = otherId ? chatProfiles[otherId] : null;
                      return otherProfile?.photoURL ? <img src={otherProfile.photoURL} className="w-full h-full object-cover" /> : <User className="w-5 h-5" />;
                    })()
                  )}
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-bold text-comfort-text">
                    {activeChat.type === 'group' ? activeChat.name : (
                      (() => {
                        const otherId = activeChat.members.find(m => m !== user?.uid);
                        return chatProfiles[otherId || '']?.displayName || `Chat with ${otherId?.slice(0, 5)}`;
                      })()
                    )}
                  </h3>
                  <p className="text-[10px] text-comfort-primary font-medium uppercase tracking-widest">
                    {activeChat.type === 'group' ? `${activeChat.members.length} members` : 'Online'}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  {activeChat.type === 'individual' && (
                    <button 
                      onClick={startVideoCall}
                      className="p-2 hover:bg-comfort-primary/10 rounded-xl text-comfort-primary transition-colors"
                      title="Video Call"
                    >
                      <Video className="w-5 h-5" />
                    </button>
                  )}
                  <button className="p-2 hover:bg-comfort-primary/10 rounded-xl text-comfort-text/40 transition-colors">
                    <MoreVertical className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Messages Area */}
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {messages.map((msg) => (
                  <div 
                    key={msg.id}
                    className={cn(
                      "flex w-full gap-3",
                      msg.senderId === user?.uid ? "flex-row-reverse" : "flex-row"
                    )}
                  >
                    <div className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-1 overflow-hidden",
                      msg.senderId === user?.uid ? "bg-comfort-accent/20 text-comfort-accent" : "bg-comfort-primary/20 text-comfort-primary"
                    )}>
                      {msg.senderId === user?.uid ? (
                        profile?.photoURL ? <img src={profile.photoURL} className="w-full h-full object-cover" /> : <User className="w-4 h-4" />
                      ) : (
                        chatProfiles[msg.senderId]?.photoURL ? <img src={chatProfiles[msg.senderId].photoURL} className="w-full h-full object-cover" /> : <User className="w-4 h-4" />
                      )}
                    </div>
                    <div className={cn(
                      "max-w-[80%] px-4 py-2 rounded-2xl text-sm leading-relaxed shadow-sm",
                      msg.senderId === user?.uid 
                        ? "bg-comfort-primary text-white rounded-tr-none" 
                        : "bg-white text-comfort-text rounded-tl-none border border-comfort-primary/10"
                    )}>
                      {msg.audio && (
                        <div className="flex items-center gap-2 p-2 bg-comfort-primary/5 rounded-xl mb-2 border border-comfort-primary/10 min-w-[240px]">
                          <audio src={msg.audio} controls className="w-full h-8" />
                        </div>
                      )}
                      <p>{msg.text}</p>
                      <span className={cn(
                        "text-[10px] opacity-40 mt-1 block text-right",
                        msg.senderId === user?.uid ? "text-white/60" : "text-comfort-text/40"
                      )}>
                        {msg.timestamp?.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>

              {/* Chat Input */}
              <div className="p-4 bg-white border-t border-comfort-primary/5">
                <div className="relative flex items-center gap-2">
                  {isRecording ? (
                    <div className="flex-1 flex items-center gap-3 bg-rose-50 rounded-2xl px-4 py-3 border border-rose-100">
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
                        onClick={startRecording}
                        className="p-3 text-comfort-primary hover:bg-comfort-primary/10 rounded-2xl transition-colors"
                        title="Record Voice Memo"
                      >
                        <Mic className="w-5 h-5" />
                      </button>
                      <input 
                        type="text" 
                        value={inputText}
                        onChange={(e) => setInputText(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                        placeholder="Type a message..."
                        className="flex-1 bg-comfort-bg/50 border border-comfort-primary/10 rounded-2xl px-5 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-comfort-primary/30"
                      />
                    </>
                  )}
                  <button 
                    onClick={sendMessage}
                    disabled={(!inputText.trim() && !isRecording) || isSending}
                    className="p-3 bg-comfort-primary text-white rounded-2xl shadow-lg shadow-comfort-primary/20 disabled:opacity-50 active:scale-95 transition-all"
                  >
                    <Send className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center text-center p-12">
              <div className="w-20 h-20 rounded-3xl bg-comfort-primary/5 flex items-center justify-center mb-6">
                <MessageCircle className="w-10 h-10 text-comfort-primary/20" />
              </div>
              <h3 className="font-display text-xl font-semibold text-comfort-text mb-2">Select a Chat</h3>
              <p className="text-sm text-comfort-text/40 max-w-xs">
                Choose a conversation from the sidebar or start a new one to begin messaging.
              </p>
            </div>
          )}
        </div>
      </div>
      {/* Active Call Overlay */}
      <AnimatePresence>
        {activeCall && (
          <VideoCall 
            callId={activeCall.id}
            isCaller={activeCall.isCaller}
            receiverProfile={activeCall.receiverProfile}
            onClose={() => setActiveCall(null)}
          />
        )}
      </AnimatePresence>

      {/* Incoming Call Notification */}
      <AnimatePresence>
        {incomingCall && (
          <motion.div 
            initial={{ y: -100, opacity: 0 }}
            animate={{ y: 20, opacity: 1 }}
            exit={{ y: -100, opacity: 0 }}
            className="fixed top-0 left-1/2 -translate-x-1/2 z-[110] w-full max-w-sm px-4"
          >
            <div className="bg-white rounded-3xl shadow-2xl border border-comfort-primary/20 p-4 flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-comfort-primary/10 flex items-center justify-center overflow-hidden">
                {incomingCall.callerProfile?.photoURL ? (
                  <img src={incomingCall.callerProfile.photoURL} className="w-full h-full object-cover" />
                ) : (
                  <User className="w-6 h-6 text-comfort-primary" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-xs font-bold text-comfort-text truncate">
                  {incomingCall.callerProfile?.displayName || 'Incoming Call'}
                </h4>
                <p className="text-[10px] text-comfort-text/40">Video Call...</p>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={rejectCall}
                  className="p-3 bg-rose-500 text-white rounded-2xl hover:bg-rose-600 transition-all"
                >
                  <PhoneOff className="w-5 h-5" />
                </button>
                <button 
                  onClick={answerCall}
                  className="p-3 bg-comfort-primary text-white rounded-2xl hover:bg-comfort-primary/80 transition-all animate-pulse"
                >
                  <Phone className="w-5 h-5" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Active Call Overlay */}
      <AnimatePresence>
        {activeCall && (
          <VideoCall 
            callId={activeCall.id}
            isCaller={activeCall.isCaller}
            receiverProfile={activeCall.receiverProfile}
            onClose={() => setActiveCall(null)}
          />
        )}
      </AnimatePresence>

      {/* Incoming Call Notification */}
      <AnimatePresence>
        {incomingCall && (
          <motion.div 
            initial={{ y: -100, opacity: 0 }}
            animate={{ y: 20, opacity: 1 }}
            exit={{ y: -100, opacity: 0 }}
            className="fixed top-0 left-1/2 -translate-x-1/2 z-[110] w-full max-w-sm px-4"
          >
            <div className="bg-white rounded-3xl shadow-2xl border border-comfort-primary/20 p-4 flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-comfort-primary/10 flex items-center justify-center overflow-hidden">
                {incomingCall.callerProfile?.photoURL ? (
                  <img src={incomingCall.callerProfile.photoURL} className="w-full h-full object-cover" />
                ) : (
                  <User className="w-6 h-6 text-comfort-primary" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-xs font-bold text-comfort-text truncate">
                  {incomingCall.callerProfile?.displayName || 'Incoming Call'}
                </h4>
                <p className="text-[10px] text-comfort-text/40">Video Call...</p>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={rejectCall}
                  className="p-3 bg-rose-500 text-white rounded-2xl hover:bg-rose-600 transition-all"
                >
                  <PhoneOff className="w-5 h-5" />
                </button>
                <button 
                  onClick={answerCall}
                  className="p-3 bg-comfort-primary text-white rounded-2xl hover:bg-comfort-primary/80 transition-all animate-pulse"
                >
                  <Phone className="w-5 h-5" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
