interface Props {
  header: string[];
  labelRow: string[] | null;
  rows: string[][];
  recordCount: number;
  previewCount: number;
}

export default function PreviewTable({ header, labelRow, rows, recordCount, previewCount }: Props) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
        Preview ({previewCount} of {recordCount} record{recordCount === 1 ? '' : 's'})
      </h3>
      <div className="overflow-auto max-h-72 rounded-lg border border-slate-200 dark:border-slate-700">
        <table className="text-xs w-full">
          <thead className="bg-slate-50 dark:bg-slate-800 sticky top-0">
            <tr>
              {header.map((col, i) => (
                <th key={i} className="text-left font-semibold px-2.5 py-1.5 whitespace-nowrap border-b border-slate-200 dark:border-slate-700">
                  {col}
                </th>
              ))}
            </tr>
            {labelRow && (
              <tr>
                {labelRow.map((label, i) => (
                  <th
                    key={i}
                    className="text-left italic font-normal text-slate-400 dark:text-slate-500 px-2.5 py-1 whitespace-nowrap border-b border-slate-200 dark:border-slate-700"
                  >
                    {i === 0 ? '' : label}
                  </th>
                ))}
              </tr>
            )}
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-b border-slate-100 dark:border-slate-800 last:border-0">
                {row.map((cell, j) => (
                  <td key={j} className="px-2.5 py-1.5 max-w-[220px] truncate" title={cell}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
