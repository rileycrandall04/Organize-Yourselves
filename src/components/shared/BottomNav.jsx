import { NavLink } from 'react-router-dom';
import { LayoutDashboard, CheckSquare, Calendar, Inbox, MoreHorizontal } from 'lucide-react';
import { useInbox } from '../../hooks/useDb';

const TABS = [
  { path: '/', label: 'Home', Icon: LayoutDashboard },
  { path: '/actions', label: 'Actions', Icon: CheckSquare },
  { path: '/meetings', label: 'Meetings', Icon: Calendar },
  { path: '/inbox', label: 'Inbox', Icon: Inbox, showBadge: true },
  { path: '/more', label: 'More', Icon: MoreHorizontal },
];

export default function BottomNav() {
  const { items: inboxItems } = useInbox();
  const inboxCount = inboxItems.length;

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-40">
      <div className="flex items-center justify-around max-w-lg mx-auto">
        {TABS.map(({ path, label, Icon, showBadge }) => (
          <NavLink
            key={path}
            to={path}
            end={path === '/'}
            className={({ isActive }) =>
              `flex flex-col items-center py-2 px-3 text-xs transition-colors
              ${isActive ? 'text-primary-700' : 'text-gray-400'}`
            }
          >
            <div className="relative">
              <Icon size={22} />
              {showBadge && inboxCount > 0 && (
                <span className="absolute -top-1 -right-2 bg-red-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                  {inboxCount > 9 ? '9+' : inboxCount}
                </span>
              )}
            </div>
            <span className="mt-0.5">{label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
