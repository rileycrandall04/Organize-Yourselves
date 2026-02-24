import { useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useOnboardingComplete } from './hooks/useDb';
import BottomNav from './components/shared/BottomNav';
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
import Tutorial, { isTutorialCompleted } from './components/Tutorial';

export default function App() {
  const { ready, loading } = useOnboardingComplete();
  const [tutorialDone, setTutorialDone] = useState(isTutorialCompleted);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-primary-700 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-gray-400 mt-3">Loading...</p>
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
        <Route path="/pipeline" element={<CallingPipeline />} />
        <Route path="/ministering" element={<Ministering onBack={() => window.history.back()} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <BottomNav />
    </div>
  );
}
