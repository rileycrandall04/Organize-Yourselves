import { useState, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useOnboardingComplete } from './hooks/useDb';
import { useAuth } from './hooks/useAuth';
import { initCloudSync, waitForCloudSync } from './utils/cloudSync';
import BottomNav from './components/shared/BottomNav';
import AuthScreen from './components/AuthScreen';
import Onboarding from './components/Onboarding';
import Dashboard from './components/Dashboard';
import ActionItems from './components/ActionItems';
import Meetings from './components/Meetings';
import InboxView from './components/InboxView';
import MoreMenu from './components/MoreMenu';
import Responsibilities from './components/Responsibilities';
import Journal from './components/Journal';
import Settings from './components/Settings';
import People from './components/People';
import CallingPipeline from './components/CallingPipeline';
import Ministering from './components/Ministering';
import CalendarPage from './components/CalendarPage';
import Tutorial, { isTutorialCompleted } from './components/Tutorial';

export default function App() {
  const { user, loading: authLoading, signIn } = useAuth();
  const { ready, loading } = useOnboardingComplete();
  const [tutorialDone, setTutorialDone] = useState(isTutorialCompleted);
  const [cloudSyncDone, setCloudSyncDone] = useState(false);

  // Initialize cloud sync when user is authenticated
  // MUST complete before we check onboarding status to prevent data loss
  useEffect(() => {
    if (user?.uid) {
      setCloudSyncDone(false);

      // Failsafe: never block the app for more than 8 seconds
      const timeout = setTimeout(() => {
        console.warn('[App] Cloud sync timed out — proceeding without sync');
        setCloudSyncDone(true);
      }, 8000);

      initCloudSync(user.uid)
        .then(() => waitForCloudSync())
        .then(() => setCloudSyncDone(true))
        .catch((err) => {
          console.warn('[App] Cloud sync failed — proceeding offline:', err?.message);
          setCloudSyncDone(true);
        })
        .finally(() => clearTimeout(timeout));
    } else {
      setCloudSyncDone(false);
    }
  }, [user?.uid]);

  // Auth loading
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-primary-700 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-gray-400 mt-3">Loading...</p>
        </div>
      </div>
    );
  }

  // Not authenticated — show auth screen
  if (!user) {
    return <AuthScreen onSignIn={signIn} />;
  }

  // Wait for cloud sync to complete before checking onboarding
  // This prevents showing onboarding when cloud data exists but hasn't been pulled yet
  if (!cloudSyncDone || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-primary-700 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-gray-400 mt-3">{!cloudSyncDone ? 'Syncing your data...' : 'Loading...'}</p>
        </div>
      </div>
    );
  }

  // Not onboarded yet — show onboarding flow
  if (!ready) {
    return <Onboarding />;
  }

  // Main app with bottom nav
  return (
    <div className="min-h-screen bg-gray-50 pb-16">
      {!tutorialDone && <Tutorial onComplete={() => setTutorialDone(true)} />}
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/actions" element={<ActionItems />} />
        <Route path="/meetings" element={<Meetings />} />
        <Route path="/inbox" element={<InboxView />} />
        <Route path="/more" element={<MoreMenu />} />
        <Route path="/responsibilities" element={<Responsibilities onBack={() => window.history.back()} />} />
        <Route path="/journal" element={<Journal onBack={() => window.history.back()} />} />
        <Route path="/settings" element={<Settings onBack={() => window.history.back()} />} />
        <Route path="/people" element={<People onBack={() => window.history.back()} />} />
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="/pipeline" element={<CallingPipeline />} />
        <Route path="/ministering" element={<Ministering onBack={() => window.history.back()} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <BottomNav />
    </div>
  );
}
