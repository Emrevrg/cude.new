import { beforeEach, describe, expect, it } from 'vitest';
import { closeSidebar, openSidebarTransiently, setSidebarEdgeOpen, sidebarEdgeOpen, sidebarOpen } from './sidebar';

describe('sidebar edge opening preference', () => {
  beforeEach(() => {
    sidebarOpen.set(false);
    setSidebarEdgeOpen(true);
  });

  it('opens transiently by default', () => {
    openSidebarTransiently();
    expect(sidebarOpen.get()).toBe(true);
  });

  it('can disable edge opening without disabling the header toggle', () => {
    setSidebarEdgeOpen(false);
    openSidebarTransiently();
    expect(sidebarEdgeOpen.get()).toBe(false);
    expect(sidebarOpen.get()).toBe(false);
  });

  it('close resets the transient pin', () => {
    closeSidebar();
    expect(sidebarOpen.get()).toBe(false);
  });
});
