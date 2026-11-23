interface TabPanes {
  sessionId: string;
  splitSessionId?: string;
}

/**
 * How many tabs have a program running in one of their panes. A check that fails counts as idle,
 * the same call closing a tab makes: an unknown state must not nag.
 */
export async function countBusyTabs(
  tabs: TabPanes[],
  isBusy: (sessionId: string) => Promise<boolean>,
): Promise<number> {
  const safe = (id: string) => isBusy(id).catch(() => false);
  const busy = await Promise.all(
    tabs.map(async (t) => {
      const panes = await Promise.all([t.sessionId, ...(t.splitSessionId ? [t.splitSessionId] : [])].map(safe));
      return panes.some(Boolean);
    }),
  );
  return busy.filter(Boolean).length;
}
