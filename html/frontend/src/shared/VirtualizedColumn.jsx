import { useState, useRef, useEffect, useCallback } from 'react';

export default function VirtualizedColumn({ items, itemHeight = 80, renderItem, overscan = 3 }) {
  const containerRef = useRef(null);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);

  const onScroll = useCallback(() => {
    if (!containerRef.current) return;
    setScrollTop(containerRef.current.scrollTop);
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const handleResize = () => {
      setViewportHeight(el.clientHeight);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  const totalHeight = items.length * itemHeight;
  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
  const visibleCount = viewportHeight > 0 ? Math.ceil(viewportHeight / itemHeight) + overscan * 2 : items.length;
  const endIndex = Math.min(items.length, startIndex + visibleCount);
  const offsetY = startIndex * itemHeight;

  const visibleItems = items.slice(startIndex, endIndex);

  return (
    <div
      ref={containerRef}
      onScroll={onScroll}
      className="flex-1 overflow-y-auto custom-scrollbar relative"
    >
      <div style={{ height: totalHeight, position: 'relative' }}>
        <div style={{ position: 'absolute', top: offsetY, left: 0, right: 0 }}>
          {visibleItems.map((item, index) => {
            const realIndex = startIndex + index;
            return (
              <div key={item.id ?? realIndex} style={{ height: itemHeight }}>
                {renderItem(item, realIndex)}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

