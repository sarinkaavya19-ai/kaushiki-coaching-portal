'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, Users, GraduationCap, ClipboardList, CalendarCheck,
  FileText, Settings, MessageSquare, PhoneCall, LogOut, ChevronLeft,
  BarChart3, BookOpen, StickyNote, Video, Library, Mail
} from 'lucide-react';

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
}

const STUDENT_NAV: NavItem[] = [
  { label: 'Overview', href: '/dashboard/student', icon: <LayoutDashboard className="w-4 h-4" /> },
  { label: 'My Batches', href: '/dashboard/student/batches', icon: <BookOpen className="w-4 h-4" /> },
  { label: 'Live Classes', href: '/dashboard/student/live-sessions', icon: <Video className="w-4 h-4" /> },
  { label: 'Tests & Quizzes', href: '/dashboard/student/tests', icon: <ClipboardList className="w-4 h-4" /> },
  { label: 'Test Scores', href: '/dashboard/student/scores', icon: <BarChart3 className="w-4 h-4" /> },
  { label: 'Attendance', href: '/dashboard/student/attendance', icon: <CalendarCheck className="w-4 h-4" /> },
  { label: 'Assignments', href: '/dashboard/student/assignments', icon: <StickyNote className="w-4 h-4" /> },
  { label: 'Resource Library', href: '/dashboard/student/resources', icon: <Library className="w-4 h-4" /> },
  { label: 'Doubt Queries', href: '/dashboard/student/doubts', icon: <MessageSquare className="w-4 h-4" /> },
  { label: 'Fees & Payments', href: '/dashboard/student/fees', icon: <FileText className="w-4 h-4" /> },
];

const PARENT_NAV: NavItem[] = [
  { label: 'Overview', href: '/dashboard/parent', icon: <LayoutDashboard className="w-4 h-4" /> },
];

const FACULTY_NAV: NavItem[] = [
  { label: 'Overview', href: '/dashboard/faculty', icon: <LayoutDashboard className="w-4 h-4" /> },
  { label: 'My Batches', href: '/dashboard/faculty/batches', icon: <BookOpen className="w-4 h-4" /> },
  { label: 'Live Classes', href: '/dashboard/faculty/live-sessions', icon: <Video className="w-4 h-4" /> },
  { label: 'Test Manager', href: '/dashboard/faculty/tests', icon: <ClipboardList className="w-4 h-4" /> },
  { label: 'Assignments', href: '/dashboard/faculty/assignments', icon: <StickyNote className="w-4 h-4" /> },
  { label: 'Resources', href: '/dashboard/faculty/resources', icon: <Library className="w-4 h-4" /> },
  { label: 'Doubt Inbox', href: '/dashboard/faculty/doubts', icon: <MessageSquare className="w-4 h-4" /> },
];

const ADMIN_NAV: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard/admin', icon: <LayoutDashboard className="w-4 h-4" /> },
  { label: 'Inquiries', href: '/dashboard/admin/inquiries', icon: <PhoneCall className="w-4 h-4" /> },
  { label: 'Batches', href: '/dashboard/admin/batches', icon: <BookOpen className="w-4 h-4" /> },
  { label: 'Students', href: '/dashboard/admin/students', icon: <GraduationCap className="w-4 h-4" /> },
  { label: 'Faculty', href: '/dashboard/admin/faculty', icon: <Users className="w-4 h-4" /> },
  { label: 'Assignments', href: '/dashboard/admin/assignments', icon: <StickyNote className="w-4 h-4" /> },
  { label: 'Payments', href: '/dashboard/admin/payments', icon: <FileText className="w-4 h-4" /> },
  { label: 'Schedule', href: '/dashboard/admin/schedule', icon: <CalendarCheck className="w-4 h-4" /> },
  { label: 'Live Sessions', href: '/dashboard/admin/live-sessions', icon: <Video className="w-4 h-4" /> },
  { label: 'Reports', href: '/dashboard/admin/reports', icon: <BarChart3 className="w-4 h-4" /> },
  { label: 'SMS Logs', href: '/dashboard/admin/sms-logs', icon: <MessageSquare className="w-4 h-4" /> },
  { label: 'Email Logs', href: '/dashboard/admin/email-logs', icon: <Mail className="w-4 h-4" /> },
  { label: 'Settings', href: '/dashboard/admin/settings', icon: <Settings className="w-4 h-4" /> },
];

const NAV_MAP: Record<string, NavItem[]> = {
  STUDENT: STUDENT_NAV,
  PARENT: PARENT_NAV,
  FACULTY: FACULTY_NAV,
  ADMIN: ADMIN_NAV,
};

interface Props {
  role: string;
  collapsed: boolean;
  onToggle: () => void;
}

export default function DashboardSidebar({ role, collapsed, onToggle }: Props) {
  const pathname = usePathname();
  const nav = NAV_MAP[role] || [];

  function handleLogout() {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    window.location.href = '/login';
  }

  return (
    <aside className={`fixed left-0 top-0 h-full bg-white border-r border-gray-200 z-40 transition-all duration-200 flex flex-col ${collapsed ? 'w-16' : 'w-60'}`}>
      <div className="flex items-center justify-between h-16 px-4 border-b border-gray-200">
        {!collapsed && <span className="font-bold text-lg text-gray-900">Kaushiki</span>}
        <button onClick={onToggle} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500">
          <ChevronLeft className={`w-4 h-4 transition-transform ${collapsed ? 'rotate-180' : ''}`} />
        </button>
      </div>

      <nav className="flex-1 py-4 space-y-1 overflow-y-auto">
        {(() => {
          const bestMatch = nav.reduce<NavItem | null>((best, item) => {
            if (pathname === item.href) return item;
            if (pathname.startsWith(item.href + '/') && (!best || item.href.length > best.href.length)) return item;
            return best;
          }, null);
          return nav.map(item => {
            const active = bestMatch?.href === item.href;
            return (
              <Link key={item.href} href={item.href}
                className={`flex items-center gap-3 mx-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors
                  ${active ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}`}>
                {item.icon}
                {!collapsed && <span>{item.label}</span>}
              </Link>
            );
          });
        })()}
      </nav>

      <div className="p-4 border-t border-gray-200">
        <button onClick={handleLogout}
          className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 transition-colors`}>
          <LogOut className="w-4 h-4" />
          {!collapsed && <span>Logout</span>}
        </button>
      </div>
    </aside>
  );
}
