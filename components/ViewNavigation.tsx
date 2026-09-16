'use client';

import { AdminNavigation } from '@/components/AdminNavigation';
import { AppMobileNavigation } from '@/components/AppMobileNavigation';
import type { AdminView, AppView, PersonalAppView } from '@/lib/authz.js';

type Props = {
  current: AppView;
  vertical?: boolean;
  showSettings?: boolean;
};

const ADMIN_VIEWS = new Set<AppView>(['admin', 'users', 'gymAdmin']);

export function ViewNavigation({ current }: Props) {
  if (ADMIN_VIEWS.has(current)) return <AdminNavigation current={current as AdminView} />;
  return <AppMobileNavigation current={current as PersonalAppView} />;
}
