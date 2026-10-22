import { useState, useEffect, useRef, useMemo, useCallback } from 'react';

/**
 * useRoadmapVirtualizer
 * Custom high-performance virtualizer tailored for fixed row height (48px) Gantt tables.
 * Employs passive requestAnimationFrame scroll listening and threshold throttling to
 * eliminate unnecessary React rerenders during high-speed scrolling.
 */
export function useRoadmapVirtualizer({
  itemCount,
  itemHeight = 48,
  overscan = 6,
  scrollContainerRef,
  enabledThreshold = 15, // Only virtualize if count exceeds this threshold
}) {
  const isVirtual = itemCount > enabledThreshold;

  const [scrollState, setScrollState] = useState(() => ({
    scrollTop: 0,
    viewportHeight: 600,
  }));

  const rafIdRef = useRef(null);
  const lastRangesRef = useRef({ startIndex: 0, endIndex: 0 });

  // Passive, RAF-coordinated scroll handler
  const handleScroll = useCallback(() => {
    if (rafIdRef.current) return;

    rafIdRef.current = requestAnimationFrame(() => {
      rafIdRef.current = null;
      const el = scrollContainerRef.current;
      if (!el) return;

      const scrollTop = el.scrollTop;
      const viewportHeight = el.clientHeight;

      // Calculate indices
      const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
      const endIndex = Math.min(itemCount - 1, Math.ceil((scrollTop + viewportHeight) / itemHeight) + overscan);

      // Only update React state if the visible range actually changed
      if (
        startIndex !== lastRangesRef.current.startIndex ||
        endIndex !== lastRangesRef.current.endIndex
      ) {
        lastRangesRef.current = { startIndex, endIndex };
        setScrollState({ scrollTop, viewportHeight });
      }
    });
  }, [scrollContainerRef, itemHeight, overscan, itemCount]);

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el || !isVirtual) return;

    // Initial measurement
    setScrollState({
      scrollTop: el.scrollTop,
      viewportHeight: el.clientHeight || 600,
    });

    el.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleScroll, { passive: true });

    return () => {
      el.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleScroll);
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, [scrollContainerRef, handleScroll, isVirtual]);

  const { virtualRows, totalHeight, startIndex, endIndex } = useMemo(() => {
    const totalHeight = itemCount * itemHeight;

    if (!isVirtual) {
      // Natural rendering for small datasets without virtualization overhead
      const allRows = [];
      for (let i = 0; i < itemCount; i++) {
        allRows.push({
          index: i,
          start: i * itemHeight,
          size: itemHeight,
        });
      }
      return {
        virtualRows: allRows,
        totalHeight,
        startIndex: 0,
        endIndex: itemCount - 1,
      };
    }

    const { scrollTop, viewportHeight } = scrollState;
    const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
    const endIndex = Math.min(itemCount - 1, Math.ceil((scrollTop + viewportHeight) / itemHeight) + overscan);

    const rows = [];
    for (let i = startIndex; i <= endIndex; i++) {
      rows.push({
        index: i,
        start: i * itemHeight,
        size: itemHeight,
      });
    }

    return {
      virtualRows: rows,
      totalHeight,
      startIndex,
      endIndex,
    };
  }, [itemCount, itemHeight, overscan, isVirtual, scrollState]);

  return {
    virtualRows,
    totalHeight,
    startIndex,
    endIndex,
    isVirtual,
  };
}

