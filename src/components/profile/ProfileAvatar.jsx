import { getProfileInitials } from '../../lib/profile';

const SIZE_CLASS = {
  xs: 'profile-avatar profile-avatar--xs',
  sm: 'profile-avatar profile-avatar--sm',
  md: 'profile-avatar profile-avatar--md',
  lg: 'profile-avatar profile-avatar--lg',
  xl: 'profile-avatar profile-avatar--xl',
};

export default function ProfileAvatar({
  name = '',
  email = '',
  avatarUrl = '',
  size = 'md',
  className = '',
}) {
  const classes = `${SIZE_CLASS[size] || SIZE_CLASS.md} ${className}`.trim();
  const initials = getProfileInitials(name, email);

  if (avatarUrl?.trim()) {
    return (
      <img
        src={avatarUrl}
        alt=""
        className={`${classes} profile-avatar--image`}
        loading="lazy"
        decoding="async"
      />
    );
  }

  return (
    <div className={`${classes} profile-avatar--fallback`} aria-hidden="true">
      {initials}
    </div>
  );
}