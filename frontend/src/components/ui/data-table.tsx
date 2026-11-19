import * as React from "react";
import { MoveHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Where a column's value lands in the phone card. Desktop tables render every
 * column; the card view promotes one identity block, folds the rest into a
 * labelled grid and keeps the decision inside reach.
 */
export type DataTableMobileSlot = "primary" | "meta" | "action" | "hidden";

export interface DataTableColumn<T> {
  /** Stable key for column identity in both views. */
  id: string;
  header: React.ReactNode;
  cell: (row: T) => React.ReactNode;
  /** Extra desktop classes for the `<th>`. */
  headClassName?: string;
  /** Extra desktop classes for the `<td>`. */
  cellClassName?: string;
  /** Keep this column in view while the table scrolls sideways. */
  sticky?: "left" | "right";
  /**
   * Mirrors the row's hover background on a sticky cell, which must stay
   * opaque to cover the columns scrolling behind it.
   */
  stickyHoverClassName?: string;
  /**
   * The cell owns its own pointer and keyboard events (a select, a link).
   * DataTable stops them bubbling so a clickable row does not also fire.
   */
  interactive?: boolean;
  /** Card placement; defaults to `meta`. */
  mobile?: DataTableMobileSlot;
  /** Card label; defaults to `header` when it is a string. */
  mobileLabel?: React.ReactNode;
  /** Card width: two spans the full row. */
  mobileSpan?: 1 | 2;
}

export interface DataTableProps<T> {
  rows: readonly T[];
  columns: readonly DataTableColumn<T>[];
  getRowKey: (row: T) => string;
  /** Accessible name for the horizontally scrollable region. */
  scrollLabel: string;
  /** Desktop table minimum width; the scroll cue keys off the real overflow. */
  minWidth?: string;
  tableClassName?: string;
  headClassName?: string;
  headRowClassName?: string;
  rowClassName?: string | ((row: T) => string | undefined);
  /** Whole-row activation on desktop; phones use the explicit action column. */
  onRowClick?: (row: T) => void;
  isRowCurrent?: (row: T) => boolean;
  /** Opaque background for sticky cells; match the table surface. */
  stickySurfaceClassName?: string;
  loading?: boolean;
  loadingLabel?: string;
  loadingContent?: React.ReactNode;
  emptyContent?: React.ReactNode;
  /** Accessible name for the phone list. */
  mobileLabel?: string;
  className?: string;
  /** Extra classes for the desktop scroll region. */
  containerClassName?: string;
}

interface EdgeState {
  left: boolean;
  right: boolean;
}

const NO_EDGES: EdgeState = { left: false, right: false };

/** Keep a cell's own controls from also activating a clickable row. */
const stopPropagation = (event: React.SyntheticEvent) => event.stopPropagation();

/** Tracks whether more columns sit beyond either edge of the scroll region. */
function useHorizontalEdges() {
  const ref = React.useRef<HTMLDivElement>(null);
  const [edges, setEdges] = React.useState<EdgeState>(NO_EDGES);

  React.useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const update = () => {
      const max = element.scrollWidth - element.clientWidth;
      const next: EdgeState = {
        left: element.scrollLeft > 1,
        right: max > 1 && element.scrollLeft < max - 1,
      };
      setEdges((current) =>
        current.left === next.left && current.right === next.right ? current : next
      );
    };

    update();
    element.addEventListener("scroll", update, { passive: true });
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(element);
    return () => {
      element.removeEventListener("scroll", update);
      observer?.disconnect();
    };
  }, []);

  return { ref, edges };
}

/**
 * One console list: the same column definitions render a desktop table and a
 * phone card list. Desktop keeps the existing table look; phones keep the row
 * identity and its decision visible without a sideways scroll (C-19).
 */
export function DataTable<T>({
  rows,
  columns,
  getRowKey,
  scrollLabel,
  minWidth = "880px",
  tableClassName,
  headClassName,
  headRowClassName,
  rowClassName,
  onRowClick,
  isRowCurrent,
  stickySurfaceClassName = "bg-card",
  loading = false,
  loadingLabel = "Loading…",
  loadingContent,
  emptyContent,
  mobileLabel,
  className,
  containerClassName,
}: DataTableProps<T>) {
  const { ref, edges } = useHorizontalEdges();

  const rowClassFor = (row: T) =>
    typeof rowClassName === "function" ? rowClassName(row) : rowClassName;

  const stickyClass = (column: DataTableColumn<T>) =>
    column.sticky === "left"
      ? cn(
          "sticky left-0 z-[1]",
          stickySurfaceClassName,
          column.stickyHoverClassName
        )
      : column.sticky === "right"
        ? cn(
            "sticky right-0 z-[1]",
            stickySurfaceClassName,
            column.stickyHoverClassName
          )
        : undefined;

  const primaryColumns = columns.filter((column) => column.mobile === "primary");
  const metaColumns = columns.filter(
    (column) => (column.mobile ?? "meta") === "meta"
  );
  const actionColumns = columns.filter((column) => column.mobile === "action");

  const activateRow = (row: T) => onRowClick?.(row);
  const showEmpty = rows.length === 0;
  const statusRow = loading && showEmpty ? loadingContent : emptyContent;

  return (
    <div className={cn("relative", className)}>
      {edges.right ? (
        <p className="mb-2 hidden items-center gap-1.5 text-xs text-muted-foreground md:flex">
          <MoveHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
          Scroll sideways for the remaining columns.
        </p>
      ) : null}

      <div className="relative hidden md:block">
        <div
          ref={ref}
          role="region"
          aria-label={scrollLabel}
          tabIndex={0}
          className={cn(
            "w-full overflow-x-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            containerClassName
          )}
        >
          <table
            className={cn("w-full text-left text-sm", tableClassName)}
            style={{ minWidth }}
          >
            <thead className={headClassName}>
              <tr className={headRowClassName}>
                {columns.map((column) => (
                  <th
                    key={column.id}
                    scope="col"
                    className={cn(column.headClassName, stickyClass(column))}
                  >
                    {column.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {showEmpty ? (
                <tr>
                  <td colSpan={columns.length}>{statusRow}</td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr
                    key={getRowKey(row)}
                    className={cn(
                      "group",
                      rowClassFor(row),
                      onRowClick &&
                        "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                    )}
                    tabIndex={onRowClick ? 0 : undefined}
                    aria-current={isRowCurrent?.(row) ? "true" : undefined}
                    onClick={onRowClick ? () => activateRow(row) : undefined}
                    onKeyDown={
                      onRowClick
                        ? (event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              activateRow(row);
                            }
                          }
                        : undefined
                    }
                  >
                    {columns.map((column) => (
                      <td
                        key={column.id}
                        className={cn(column.cellClassName, stickyClass(column))}
                        onClick={column.interactive ? stopPropagation : undefined}
                        onKeyDown={column.interactive ? stopPropagation : undefined}
                      >
                        {column.cell(row)}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {edges.left ? (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-card to-transparent"
          />
        ) : null}
        {edges.right ? (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-card to-transparent"
          />
        ) : null}
      </div>

      {/* Phone cards. The identity sits at the top, the decision stays in the
          header row, and everything else becomes a labelled pair. */}
      <div className="md:hidden">
        <h3 className="sr-only">{mobileLabel ?? scrollLabel}</h3>
        {showEmpty ? (
          <div>{statusRow}</div>
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((row) => (
              <li key={getRowKey(row)} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-1">
                    {primaryColumns.length > 0 ? (
                      primaryColumns.map((column) => (
                        <div key={column.id} className="min-w-0">
                          {column.cell(row)}
                        </div>
                      ))
                    ) : (
                      <p className="text-xs font-semibold text-muted-foreground">
                        {scrollLabel}
                      </p>
                    )}
                  </div>
                  {actionColumns.length > 0 ? (
                    <div className="flex shrink-0 items-center gap-1">
                      {actionColumns.map((column) => (
                        <div key={column.id}>{column.cell(row)}</div>
                      ))}
                    </div>
                  ) : null}
                </div>

                {metaColumns.length > 0 ? (
                  <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5 text-xs">
                    {metaColumns.map((column) => (
                      <div
                        key={column.id}
                        className={cn(
                          "min-w-0",
                          column.mobileSpan === 2 && "col-span-2"
                        )}
                      >
                        <dt className="truncate text-muted-foreground">
                          {column.mobileLabel ??
                            (typeof column.header === "string" ? column.header : column.id)}
                        </dt>
                        <dd className="mt-0.5 min-w-0 break-words text-foreground">
                          {column.cell(row)}
                        </dd>
                      </div>
                    ))}
                  </dl>
                ) : null}

                {onRowClick && actionColumns.length === 0 && primaryColumns.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => activateRow(row)}
                    className="mt-3 inline-flex h-9 items-center rounded-lg px-2 text-xs font-semibold text-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    Open
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {loading && showEmpty ? (
          <p className="px-4 pb-4 text-center text-xs text-muted-foreground">
            {loadingLabel}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export default DataTable;
