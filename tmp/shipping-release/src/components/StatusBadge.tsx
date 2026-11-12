import { clsx } from 'clsx';

type StatusBadgeProps = {
  status: 'active' | 'expired' | 'open' | 'closed' | 'pending';
  label: string;
};

export function StatusBadge({ status, label }: StatusBadgeProps) {
  return <span className={clsx('status-badge', `status-${status}`)}>{label}</span>;
}
