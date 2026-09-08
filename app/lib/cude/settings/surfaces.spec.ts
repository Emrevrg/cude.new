/**
 * Cude.new - settings surface definitions.
 *
 * These guard the panel's information architecture: every surface belongs to a
 * group, every id the panel can open is defined, and grouping never produces a
 * heading with nothing under it.
 */

import { describe, it, expect } from 'vitest';
import {
  SURFACES,
  SURFACE_GROUPS,
  getSurface,
  surfaceIds,
  surfacesInGroup,
  groupSurfaces,
  type SurfaceId,
} from './surfaces';

describe('surface definitions', () => {
  it('gives every surface a label and a description', () => {
    for (const surface of SURFACES) {
      expect(surface.label, surface.id).toBeTruthy();
      expect(surface.description, surface.id).toBeTruthy();
    }
  });

  it('has no duplicate ids', () => {
    const ids = SURFACES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('puts every surface in a declared group', () => {
    const groups = new Set(SURFACE_GROUPS.map((g) => g.id));

    for (const surface of SURFACES) {
      expect(groups.has(surface.group), `${surface.id} -> ${surface.group}`).toBe(true);
    }
  });

  it('leaves no group empty', () => {
    for (const group of SURFACE_GROUPS) {
      expect(surfacesInGroup(group.id).length, group.id).toBeGreaterThan(0);
    }
  });

  it('looks a surface up by id', () => {
    expect(getSurface('event-logs')?.group).toBe('pipeline');
    expect(getSurface('nope' as SurfaceId)).toBeUndefined();
  });

  it('lists ids in display order', () => {
    expect(surfaceIds()).toEqual(SURFACES.map((s) => s.id));
  });

  it('groups providers under the engine, not among integrations', () => {
    // Provider access is what Cude builds with; a deploy target is not.
    expect(getSurface('cloud-providers')?.group).toBe('engine');
    expect(getSurface('netlify')?.group).toBe('project');
  });
});

describe('grouping for display', () => {
  it('returns only the surfaces that are visible', () => {
    const grouped = groupSurfaces(['cloud-providers', 'profile']);

    expect(grouped.flatMap((g) => g.surfaces.map((s) => s.id))).toEqual(['cloud-providers', 'profile']);
  });

  it('drops a group whose surfaces are all hidden', () => {
    // An "Engine" heading with nothing under it is worse than no heading.
    const grouped = groupSurfaces(['profile']);

    expect(grouped.map((g) => g.id)).toEqual(['you']);
  });

  it('returns nothing when everything is hidden', () => {
    expect(groupSurfaces([])).toEqual([]);
  });

  it('keeps groups in their declared order', () => {
    const grouped = groupSurfaces(surfaceIds());

    expect(grouped.map((g) => g.id)).toEqual(SURFACE_GROUPS.map((g) => g.id));
  });

  it('ignores an id this build does not ship', () => {
    const grouped = groupSurfaces(['profile', 'retired-surface' as SurfaceId]);

    expect(grouped.flatMap((g) => g.surfaces.map((s) => s.id))).toEqual(['profile']);
  });
});
