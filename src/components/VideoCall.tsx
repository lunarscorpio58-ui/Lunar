import { useState, useEffect, useRef } from 'react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { 
  doc, 
  setDoc, 
  onSnapshot, 
  collection, 
  addDoc, 
  getDoc, 
  updateDoc, 
  deleteDoc,
  serverTimestamp 
} from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';
import { Phone, PhoneOff, Mic, MicOff, Video, VideoOff, Maximize2, Minimize2 } from 'lucide-react';
import { cn } from '../lib/utils';

interface VideoCallProps {
  callId: string;
  isCaller: boolean;
  onClose: () => void;
  receiverProfile?: { displayName: string; photoURL: string };
}

const servers = {
  iceServers: [
    {
      urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'],
    },
  ],
  iceCandidatePoolSize: 10,
};

export default function VideoCall({ callId, isCaller, onClose, receiverProfile }: VideoCallProps) {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [status, setStatus] = useState<'connecting' | 'ringing' | 'active' | 'ended'>('connecting');

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const pc = useRef<RTCPeerConnection>(new RTCPeerConnection(servers));
  const localStreamRef = useRef<MediaStream | null>(null);
  const isCleanedUp = useRef(false);

  const cleanup = () => {
    if (isCleanedUp.current) return;
    isCleanedUp.current = true;
    
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
    }
    if (pc.current) {
      pc.current.close();
    }
    onClose();
  };

  useEffect(() => {
    const startCall = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        setLocalStream(stream);
        localStreamRef.current = stream;
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;

        stream.getTracks().forEach((track) => {
          pc.current.addTrack(track, stream);
        });

        pc.current.ontrack = (event) => {
          event.streams[0].getTracks().forEach((track) => {
            const remote = new MediaStream();
            remote.addTrack(track);
            setRemoteStream(remote);
            if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remote;
          });
        };

        const callDoc = doc(db, 'calls', callId);
        const offerCandidates = collection(callDoc, 'offerCandidates');
        const answerCandidates = collection(callDoc, 'answerCandidates');

        pc.current.onicecandidate = (event) => {
          if (event.candidate) {
            addDoc(isCaller ? offerCandidates : answerCandidates, event.candidate.toJSON());
          }
        };

        if (isCaller) {
          const offerDescription = await pc.current.createOffer();
          await pc.current.setLocalDescription(offerDescription);

          const offer = {
            sdp: offerDescription.sdp,
            type: offerDescription.type,
          };

          await updateDoc(callDoc, { offer });

          onSnapshot(callDoc, (snapshot) => {
            const data = snapshot.data();
            if (!pc.current.currentRemoteDescription && data?.answer) {
              const answerDescription = new RTCSessionDescription(data.answer);
              pc.current.setRemoteDescription(answerDescription);
              setStatus('active');
            }
            if (data?.status === 'ended' || data?.status === 'rejected') {
              cleanup();
            }
          });

          onSnapshot(answerCandidates, (snapshot) => {
            snapshot.docChanges().forEach((change) => {
              if (change.type === 'added') {
                const data = change.doc.data();
                pc.current.addIceCandidate(new RTCIceCandidate(data));
              }
            });
          });
        } else {
          const callData = (await getDoc(callDoc)).data();
          if (callData?.offer) {
            const offerDescription = new RTCSessionDescription(callData.offer);
            await pc.current.setRemoteDescription(offerDescription);

            const answerDescription = await pc.current.createAnswer();
            await pc.current.setLocalDescription(answerDescription);

            const answer = {
              type: answerDescription.type,
              sdp: answerDescription.sdp,
            };

            await updateDoc(callDoc, { answer, status: 'active' });
            setStatus('active');
          }

          onSnapshot(offerCandidates, (snapshot) => {
            snapshot.docChanges().forEach((change) => {
              if (change.type === 'added') {
                const data = change.doc.data();
                pc.current.addIceCandidate(new RTCIceCandidate(data));
              }
            });
          });

          onSnapshot(callDoc, (snapshot) => {
            const data = snapshot.data();
            if (data?.status === 'ended') {
              cleanup();
            }
          });
        }
      } catch (error) {
        console.error('Error starting video call:', error);
        cleanup();
      }
    };

    startCall();

    return () => cleanup();
  }, [callId, isCaller]);

  const endCall = async () => {
    await updateDoc(doc(db, 'calls', callId), { status: 'ended' });
    cleanup();
  };

  const toggleMute = () => {
    if (localStream) {
      localStream.getAudioTracks().forEach(track => track.enabled = isMuted);
      setIsMuted(!isMuted);
    }
  };

  const toggleVideo = () => {
    if (localStream) {
      localStream.getVideoTracks().forEach(track => track.enabled = isVideoOff);
      setIsVideoOff(!isVideoOff);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      className={cn(
        "fixed inset-0 z-[100] flex flex-col bg-black overflow-hidden transition-all duration-500",
        isFullScreen ? "p-0" : "p-4 md:p-8"
      )}
    >
      {/* Remote Video (Full Screen) */}
      <div className="relative flex-1 rounded-3xl overflow-hidden bg-zinc-900">
        <video 
          ref={remoteVideoRef} 
          autoPlay 
          playsInline 
          className="w-full h-full object-cover"
        />
        
        {!remoteStream && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-white/60">
            <div className="w-24 h-24 rounded-full bg-comfort-primary/20 flex items-center justify-center mb-4 animate-pulse">
              <Video className="w-10 h-10" />
            </div>
            <p className="text-sm font-medium uppercase tracking-widest">
              {isCaller ? 'Ringing...' : 'Connecting...'}
            </p>
            {receiverProfile && (
              <h2 className="text-xl font-bold text-white mt-4">{receiverProfile.displayName}</h2>
            )}
          </div>
        )}

        {/* Local Video (Picture-in-Picture) */}
        <motion.div 
          drag
          dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
          className="absolute top-6 right-6 w-32 md:w-48 aspect-video rounded-2xl overflow-hidden border-2 border-white/20 shadow-2xl bg-black cursor-move z-10"
        >
          <video 
            ref={localVideoRef} 
            autoPlay 
            muted 
            playsInline 
            className="w-full h-full object-cover"
          />
          {isVideoOff && (
            <div className="absolute inset-0 flex items-center justify-center bg-zinc-900">
              <VideoOff className="w-6 h-6 text-white/40" />
            </div>
          )}
        </motion.div>

        {/* Controls Overlay */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-4 md:gap-6 px-8 py-4 bg-black/40 backdrop-blur-xl rounded-full border border-white/10">
          <button 
            onClick={toggleMute}
            className={cn(
              "p-4 rounded-full transition-all",
              isMuted ? "bg-rose-500 text-white" : "bg-white/10 text-white hover:bg-white/20"
            )}
          >
            {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
          </button>
          
          <button 
            onClick={toggleVideo}
            className={cn(
              "p-4 rounded-full transition-all",
              isVideoOff ? "bg-rose-500 text-white" : "bg-white/10 text-white hover:bg-white/20"
            )}
          >
            {isVideoOff ? <VideoOff className="w-6 h-6" /> : <Video className="w-6 h-6" />}
          </button>

          <button 
            onClick={endCall}
            className="p-4 bg-rose-500 text-white rounded-full hover:bg-rose-600 transition-all shadow-lg shadow-rose-500/20"
          >
            <PhoneOff className="w-6 h-6" />
          </button>

          <button 
            onClick={() => setIsFullScreen(!isFullScreen)}
            className="p-4 bg-white/10 text-white rounded-full hover:bg-white/20 transition-all"
          >
            {isFullScreen ? <Minimize2 className="w-6 h-6" /> : <Maximize2 className="w-6 h-6" />}
          </button>
        </div>

        {/* Info Overlay */}
        <div className="absolute top-8 left-8 flex items-center gap-3">
          <div className="px-3 py-1 bg-comfort-primary text-white text-[10px] font-bold uppercase tracking-widest rounded-full">
            Live
          </div>
          {status === 'active' && (
            <div className="text-white/60 text-xs font-medium">
              Securely Connected
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
