import { useEffect } from 'react';
import { useGameStore } from '@/stores/gameStore';

/**
 * Phase 5 #10 — global keyboard shortcuts for game controls.
 * - Space: toggle pause
 * - 1 / 2 / 3 / 4: set game speed 0.5× / 1× / 2× / 4×
 *
 * Ignored while the user is typing into an input/textarea/contenteditable,
 * or while a modifier key is held (so it doesn't clash with browser shortcuts).
 */
export function useKeyboardShortcuts(): void {
  useEffect(() => {
    const speedMap: Record<string, number> = { '1': 0.5, '2': 1, '3': 2, '4': 4 };

    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        if (target.isContentEditable) return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        (useGameStore.getState() as any).togglePause?.();
        return;
      }
      if (speedMap[e.key] !== undefined) {
        e.preventDefault();
        (useGameStore.getState() as any).setGameSpeed?.(speedMap[e.key]);
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
}
