import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { cn } from '@renderer/lib/cn'

interface LockedScreenLayoutProps {
  children: ReactNode
  contentClassName?: string
  topClassName?: string
  topContent: ReactNode
}

export function LockedScreenLayout({ children, contentClassName, topClassName, topContent }: LockedScreenLayoutProps) {
  const topRef = useRef<HTMLDivElement | null>(null)
  const [topHeight, setTopHeight] = useState(0)

  useLayoutEffect(() => {
    const node = topRef.current

    if (!node) {
      return undefined
    }

    const updateTopHeight = () => {
      setTopHeight(node.getBoundingClientRect().height)
    }

    updateTopHeight()

    const observer = new ResizeObserver(() => {
      updateTopHeight()
    })

    observer.observe(node)
    window.addEventListener('resize', updateTopHeight)

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', updateTopHeight)
    }
  }, [])

  return (
    <section className="h-full min-h-0">
      <div className="screen-scroll-area h-full overflow-y-auto overflow-x-hidden pr-1">
        <div
          className="grid h-full min-h-full min-w-0 grid-rows-[auto_minmax(0,1fr)]"
          style={topHeight > 0 ? { height: `calc(100% + ${topHeight}px)` } : undefined}
        >
          <div ref={topRef} className={cn('min-w-0', topClassName)}>
            {topContent}
          </div>
          <div className={cn('min-h-0 min-w-0', contentClassName)}>{children}</div>
        </div>
      </div>
    </section>
  )
}
