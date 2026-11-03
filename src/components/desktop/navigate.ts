import type { Href, useRouter } from 'expo-router';

type AppRouter = ReturnType<typeof useRouter>;

/** Go to a top-level place from anywhere: close pages opened on top, then navigate. */
export function goTo(router: AppRouter, href: Href): void {
  if (router.canDismiss()) router.dismissAll();
  router.navigate(href);
}
