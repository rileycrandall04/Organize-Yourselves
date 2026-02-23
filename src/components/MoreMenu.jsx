import { useNavigate } from 'react-router-dom';
import { useUserCallings } from '../hooks/useDb';
import { Settings, BookOpen, Users, ClipboardList, ChevronRight, GitBranch, Heart } from 'lucide-react';

export default function MoreMenu() {
  const navigate = useNavigate();
  const { callings } = useUserCallings();

  // Show ministering link for EQ pres, RS pres, and bishopric callings
  const ministeringCallings = ['eq_president', 'rs_president', 'bishop', 'bishopric_1st', 'bishopric_2nd'];
  const showMinistering = callings.some(c => ministeringCallings.includes(c.callingKey));

  return (
    <div className="px-4 pt-6 pb-4 max-w-lg mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">More</h1>

      <div className="space-y-2">
        <MenuItem icon={ClipboardList} label="Responsibilities" subtitle="View and manage responsibilities" onPress={() => navigate('/responsibilities')} />
        <MenuItem icon={GitBranch} label="Calling Pipeline" subtitle="Track calling changes" onPress={() => navigate('/pipeline')} />
        {showMinistering && (
          <MenuItem icon={Heart} label="Ministering" subtitle="Manage ministering assignments" onPress={() => navigate('/ministering')} />
        )}
        <MenuItem icon={BookOpen} label="Journal" subtitle="Spiritual impressions" onPress={() => navigate('/journal')} />
        <MenuItem icon={Users} label="People" subtitle="Manage contacts" onPress={() => navigate('/people')} />
        <MenuItem icon={Settings} label="Settings" subtitle="Backup, restore, and manage data" onPress={() => navigate('/settings')} />
      </div>

      <p className="text-xs text-gray-300 text-center mt-8">Organize Yourselves v0.3.0</p>
    </div>
  );
}

function MenuItem({ icon: Icon, label, subtitle, onPress }) {
  return (
    <button
      onClick={onPress}
      className="w-full card flex items-center gap-3 text-left hover:border-primary-200 transition-colors"
    >
      <div className="p-2 rounded-lg bg-gray-50">
        <Icon size={20} className="text-gray-600" />
      </div>
      <div className="flex-1">
        <p className="text-sm font-medium text-gray-900">{label}</p>
        <p className="text-xs text-gray-500">{subtitle}</p>
      </div>
      {onPress && <ChevronRight size={16} className="text-gray-300 flex-shrink-0" />}
    </button>
  );
}
