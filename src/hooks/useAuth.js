import { useState, useEffect } from 'react';
import { onAuthChange, signInWithGoogle, signOutUser } from '../utils/firebase';

export function useAuth() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthChange((firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);
      // Store uid for offline access
      if (firebaseUser) {
        localStorage.setItem('organize_uid', firebaseUser.uid);
      } else {
        localStorage.removeItem('organize_uid');
      }
    });
    return unsubscribe;
  }, []);

  return {
    user,
    loading,
    signIn: signInWithGoogle,
    signOut: signOutUser,
  };
}
