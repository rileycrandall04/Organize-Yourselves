import { NavLink } from 'react-router-dom';
import { LayoutDashboard, CheckSquare, Calendar, BookOpen, MoreHorizontal } from 'lucide-react';

const TABS = [
  { path: '/', label: 'Home', Icon: LayoutDashboard },
  { path: '/actions', label: 'Tasks', Icon: CheckSquare },
  { path: '/meetings', label: 'Meetings', Icon: Calendar },
  { path: '/journal', label: 'Journal', Icon: BookOpen },
  { path: '/more', label: 'More', Icon: MoreHorizontal },
];

export default function BottomNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-40">
      <div className="flex items-center justify-around max-w-lg mx-auto">
        {TABS.map(({ path, label, Icon }) => (
          <NavLink
            key={path}
            to={path}
            end={path === '/'}
            className={({ isActive }) =>
              `flex flex-col items-center py-2 px-3 text-xs transition-colors
              ${isActive ? 'text-primary-700' : 'text-gray-400'}`
            }
          >
            <Icon size={22} />
            <span className="mt-0.5">{label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
