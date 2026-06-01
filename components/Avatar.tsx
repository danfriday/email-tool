'use client';

import { generateAvatarInitials, getAvatarColor } from '@/lib/utils';

interface AvatarProps {
  name: string;
}

export default function Avatar({ name }: AvatarProps) {
  const initials = generateAvatarInitials(name);
  const color = getAvatarColor(name);

  return (
    <div
      style={{
        width: 32,
        height: 32,
        borderRadius: '50%',
        background: color + '22',
        border: `1px solid ${color}44`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 11,
        fontWeight: 600,
        color,
        flexShrink: 0,
        fontFamily: "'DM Mono', monospace",
      }}
    >
      {initials}
    </div>
  );
}
