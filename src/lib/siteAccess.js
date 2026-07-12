import { isUserBanned } from './userBan';

export const BAN_ALLOWED_PATHS = [
  '/banned',
  '/contact',
  '/privacy',
  '/terms',
  '/faq',
  '/links',
];

export function isPathAllowed(pathname = '', allowedPrefixes = []) {
  const path = String(pathname).replace(/\/+$/, '') || '/';
  return allowedPrefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

export function shouldRedirectBannedUser(user, pathname = '') {
  return isUserBanned(user) && !isPathAllowed(pathname, BAN_ALLOWED_PATHS);
}