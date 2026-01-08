import createIntlMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

export default createIntlMiddleware(routing);

export const config = {
  // Skip all paths that should not be internationalized
  matcher: ['/((?!api|_next|.*\\..*).*)']
};