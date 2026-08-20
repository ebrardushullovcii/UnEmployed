import { Button } from "@renderer/components/ui/button";

export const COLLECTION_PAGE_SIZE = 40;
export const APPLICATION_CRM_PAGE_SIZE = 50;

interface CollectionPaginationProps {
  itemLabel: string;
  page: number;
  pageSize: number;
  totalCount: number;
  onPageChange: (page: number) => void;
}

/**
 * Keeps large local collections cheap to mount without changing their search
 * or selection semantics. The list itself remains the scroll container; this
 * footer is outside it so it cannot cover the last row.
 */
export function CollectionPagination({
  itemLabel,
  page,
  pageSize,
  totalCount,
  onPageChange,
}: CollectionPaginationProps) {
  const pageCount = Math.max(1, Math.ceil(totalCount / pageSize));
  if (pageCount <= 1) {
    return null;
  }

  const currentPage = Math.min(Math.max(page, 1), pageCount);
  const firstItem = (currentPage - 1) * pageSize + 1;
  const lastItem = Math.min(currentPage * pageSize, totalCount);

  return (
    <nav
      aria-label={`${itemLabel} pagination`}
      className="flex flex-none flex-wrap items-center justify-between gap-3 border-t border-(--surface-panel-border) px-5 py-3"
    >
      <p
        aria-live="polite"
        className="text-(length:--text-small) text-foreground-muted"
      >
        Showing {firstItem}–{lastItem} of {totalCount} {itemLabel}
      </p>
      <div className="flex items-center gap-2">
        <Button
          aria-label="Previous page"
          disabled={currentPage === 1}
          onClick={() => onPageChange(currentPage - 1)}
          size="sm"
          type="button"
          variant="ghost"
        >
          Previous
        </Button>
        <span
          aria-current="page"
          className="min-w-20 text-center text-sm text-foreground-soft"
        >
          Page {currentPage} of {pageCount}
        </span>
        <Button
          aria-label="Next page"
          disabled={currentPage === pageCount}
          onClick={() => onPageChange(currentPage + 1)}
          size="sm"
          type="button"
          variant="ghost"
        >
          Next
        </Button>
      </div>
    </nav>
  );
}
