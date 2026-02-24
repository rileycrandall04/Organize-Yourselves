import { useState } from 'react';
import {
  LayoutDashboard, GitBranch, Calendar, CheckSquare, Settings,
  ChevronRight, ChevronLeft, X,
} from 'lucide-react';

const TUTORIAL_KEY = 'tutorial_completed';

export function isTutorialCompleted() {
  return localStorage.getItem(TUTORIAL_KEY) === 'true';
}

export function markTutorialCompleted() {
  localStorage.setItem(TUTORIAL_KEY, 'true');
}

const STEPS = [
  {
    icon: LayoutDashboard,
    color: 'bg-primary-100 text-primary-700',
    title: 'Welcome to Organize Yourselves',
    description: 'This app helps you manage your Church calling with confidence. Track callings, run meetings, and stay on top of action items — all in one place.',
  },
  {
    icon: LayoutDashboard,
    color: 'bg-blue-100 text-blue-700',
    title: 'Your Dashboard',
    description: 'The Home tab is your command center. See service alerts, open positions, and quick stats for your organization at a glance.',
  },
  {
    icon: GitBranch,
    color: 'bg-purple-100 text-purple-700',
    title: 'Calling Pipeline',
    description: 'Track callings from initial discussion through setting apart. Advance callings through stages, manage candidates, and start release processes.',
  },
  {
    icon: Calendar,
    color: 'bg-teal-100 text-teal-700',
    title: 'Meetings & Agendas',
    description: 'Manage your meetings with auto-generated agendas. Take notes, tag items for other meetings, and track focus families. Calling items automatically appear on your agenda.',
  },
  {
    icon: CheckSquare,
    color: 'bg-green-100 text-green-700',
    title: 'Action Items',
    description: 'Stay organized with prioritized action items. Items are auto-created as callings advance. Filter by context — phone calls, visits, at church, or at home.',
  },
  {
    icon: Settings,
    color: 'bg-gray-100 text-gray-700',
    title: 'Get Started',
    description: 'Head to Settings (in the More tab) to select your calling. The app auto-configures your org chart, meetings, and visibility based on your role. You can also set up AI features with your own API key.',
  },
];

export default function Tutorial({ onComplete }) {
  const [step, setStep] = useState(0);
  const current = STEPS[step];
  const Icon = current.icon;
  const isLast = step === STEPS.length - 1;

  function handleNext() {
    if (isLast) {
      markTutorialCompleted();
      onComplete();
    } else {
      setStep(s => s + 1);
    }
  }

  function handleSkip() {
    markTutorialCompleted();
    onComplete();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden">
        {/* Skip button */}
        <div className="flex justify-end p-3 pb-0">
          <button
            onClick={handleSkip}
            className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-0.5"
          >
            Skip <X size={12} />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 pb-6 text-center">
          <div className={`w-16 h-16 rounded-2xl ${current.color} flex items-center justify-center mx-auto mb-4`}>
            <Icon size={32} />
          </div>
          <h2 className="text-lg font-bold text-gray-900 mb-2">{current.title}</h2>
          <p className="text-sm text-gray-600 leading-relaxed">{current.description}</p>
        </div>

        {/* Progress dots + navigation */}
        <div className="px-6 pb-6">
          {/* Dots */}
          <div className="flex justify-center gap-1.5 mb-4">
            {STEPS.map((_, i) => (
              <div
                key={i}
                className={`w-2 h-2 rounded-full transition-colors ${
                  i === step ? 'bg-primary-600' : i < step ? 'bg-primary-300' : 'bg-gray-200'
                }`}
              />
            ))}
          </div>

          {/* Navigation */}
          <div className="flex gap-3">
            {step > 0 && (
              <button
                onClick={() => setStep(s => s - 1)}
                className="btn-secondary flex-1 flex items-center justify-center gap-1"
              >
                <ChevronLeft size={16} />
                Back
              </button>
            )}
            <button
              onClick={handleNext}
              className="btn-primary flex-1 flex items-center justify-center gap-1"
            >
              {isLast ? "Let's Go!" : 'Next'}
              {!isLast && <ChevronRight size={16} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
