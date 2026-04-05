import { createContext, useContext, useEffect, useState } from 'react';
import { auth, db, signIn, signOut, handleFirestoreError, OperationType } from '../firebase';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { doc, onSnapshot, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';

interface UserProfile {
  uid: string;
  displayName: string;
  displayName_lowercase?: string;
  photoURL: string;
  theme: 'light' | 'dark' | 'sepia' | 'rose' | 'black';
  bio: string;
  lastActive?: any;
  voiceName?: string;
  voiceEnabled?: boolean;
}

interface AuthContextType {
  user: FirebaseUser | null;
  profile: UserProfile | null;
  loading: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  updateProfile: (updates: Partial<UserProfile>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      
      if (firebaseUser) {
        // Listen to profile changes
        const profileRef = doc(db, 'users', firebaseUser.uid);
        
        // Check if profile exists, if not create it
        const profileSnap = await getDoc(profileRef);
        if (!profileSnap.exists()) {
          const newProfile: UserProfile = {
            uid: firebaseUser.uid,
            displayName: firebaseUser.displayName || 'New Friend',
            displayName_lowercase: (firebaseUser.displayName || 'New Friend').toLowerCase(),
            photoURL: firebaseUser.photoURL || '',
            theme: 'light',
            bio: '',
            lastActive: serverTimestamp(),
            voiceName: 'Kore',
            voiceEnabled: true
          };
          await setDoc(profileRef, newProfile);
        }

        // Update lastActive immediately on login
        await setDoc(profileRef, { lastActive: serverTimestamp() }, { merge: true });

        // Periodically update lastActive
        const activeInterval = setInterval(async () => {
          try {
            await setDoc(profileRef, { lastActive: serverTimestamp() }, { merge: true });
          } catch (e) {
            console.error("Failed to update lastActive", e);
          }
        }, 60000); // Every minute

        const unsubscribeProfile = onSnapshot(profileRef, (doc) => {
          if (doc.exists()) {
            setProfile(doc.data() as UserProfile);
          }
          setLoading(false);
        }, (error) => {
          handleFirestoreError(error, OperationType.GET, `users/${firebaseUser.uid}`);
        });

        return () => {
          clearInterval(activeInterval);
          unsubscribeProfile();
        };
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => unsubscribeAuth();
  }, []);

  const handleUpdateProfile = async (updates: Partial<UserProfile>) => {
    if (!user) return;
    try {
      const profileRef = doc(db, 'users', user.uid);
      const finalUpdates = { ...updates };
      if (updates.displayName) {
        finalUpdates.displayName_lowercase = updates.displayName.toLowerCase();
      }
      await setDoc(profileRef, finalUpdates, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
    }
  };

  const handleSignIn = async () => {
    try {
      await signIn();
    } catch (error) {
      console.error("Sign in failed:", error);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error("Sign out failed:", error);
    }
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      profile, 
      loading, 
      signIn: handleSignIn, 
      signOut: handleSignOut, 
      updateProfile: handleUpdateProfile 
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
