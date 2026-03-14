import React from "react";

function buildPages(page, pageCount) {
  if (pageCount <= 5) {
    return Array.from({ length: pageCount }, (_, index) => index + 1);
  }

  const pages = new Set([1, pageCount, page - 1, page, page + 1]);
  return [...pages]
    .filter((value) => value >= 1 && value <= pageCount)
    .sort((a, b) => a - b);
}

export default function PagedListFooter({
  showingCount,
  totalCount,
  itemLabel,
  page,
  pageCount,
  pageSize,
  onPageChange,
  onPageSizeChange,
  className = "",
}) {
  const pages = pageSize === "all" ? [] : buildPages(page, pageCount);

  return (
    <div className={`listFooter cardSectionFooter ${className}`.trim()}>
      <div className="listFooterSummary muted">
        Showing {showingCount} of {totalCount} {itemLabel}
      </div>

      {pageSize !== "all" && pageCount > 1 ? (
        <div className="listPagination" aria-label={`Pagination for ${itemLabel}`}>
          <button type="button" className="secondary" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
            {"< Prev"}
          </button>
          {pages.map((value, index) => {
            const previous = pages[index - 1];
            const showGap = previous && value - previous > 1;
            return (
              <React.Fragment key={value}>
                {showGap ? <span className="listPaginationGap">...</span> : null}
                <button
                  type="button"
                  className={`pageNumberButton ${value === page ? "active" : ""}`.trim()}
                  onClick={() => onPageChange(value)}
                  aria-current={value === page ? "page" : undefined}
                >
                  {value}
                </button>
              </React.Fragment>
            );
          })}
          <button type="button" className="secondary" disabled={page >= pageCount} onClick={() => onPageChange(page + 1)}>
            {"Next >"}
          </button>
        </div>
      ) : (
        <div />
      )}

      <label className="inlinePageSizeControl">
        <span>Show</span>
        <select value={pageSize} onChange={(event) => onPageSizeChange(event.target.value)}>
          <option value="20">20</option>
          <option value="50">50</option>
          <option value="100">100</option>
          <option value="all">All</option>
        </select>
      </label>
    </div>
  );
}
