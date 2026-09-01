import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

/**
 * Pages and API routes need different failure modes.
 *
 * A signed-out person opening the dashboard should land on the sign-in page.
 * A signed-out API call should get a JSON 401 it can act on — not Clerk's
 * default 404, which is designed to hide route existence but is unhelpful for
 * an API whose routes are documented anyway.
 *
 * So API routes are deliberately not protected here. `requireUserId()` throws
 * `UnauthorizedError` inside the handler and `toErrorResponse` maps it to 401,
 * which keeps the shape consistent with every other error the API returns.
 */
// `/offline` is served by the service worker when there is no network, so it
// must render without a session — a redirect to sign-in would need the very
// connection that is missing.
const isPublicPage = createRouteMatcher(['/sign-in(.*)', '/sign-up(.*)', '/offline']);
const isApiRoute = createRouteMatcher(['/api/(.*)']);

export default clerkMiddleware(async (auth, request) => {
  if (isApiRoute(request) || isPublicPage(request)) return;

  // Deny by default: any page not listed above requires a session.
  const { userId, redirectToSignIn } = await auth();
  if (!userId) return redirectToSignIn();
});

export const config = {
  matcher: [
    // Skip Next internals and static files, unless found in search params.
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes, so `auth()` has a session to read.
    '/(api|trpc)(.*)',
  ],
};
