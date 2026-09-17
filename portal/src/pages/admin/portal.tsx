import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Icon } from "@/components/ui/icon"
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { statusColor } from "./shared";
import * as XLSX from "xlsx";

const COMPANY_OPTIONS = ["JMCS", "SIS Certification and Inspection Philippines OPC"] as const;
const REMITTANCE_TYPES = ["BIR", "PhilHealth", "Pag-IBIG", "SSS"] as const;

function useTableData<T>(endpoint: string) {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await fetch(endpoint, { credentials: "include" }); if (r.ok) setData(await r.json()); }
    catch {} finally { setLoading(false); }
  }, [endpoint]);
  useEffect(() => { load(); }, [load]);
  return { data, setData, loading, refetch: load };
}

type GridColumn = {
  key: string;
  name: string;
  width?: number;
  editable?: boolean;
  type?: "text" | "number" | "date" | "select";
  options?: readonly string[];
  required?: boolean;
  align?: "left" | "center" | "right";
};

interface ExcelToolbarProps {
  endpoint: string;
  columns: GridColumn[];
  data: any[];
  onImported: () => void;
  filename: string;
}

function ExcelToolbar({ endpoint, columns, data, onImported, filename }: ExcelToolbarProps) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0, importing: false });

  const handleExport = () => {
    const ws = XLSX.utils.json_to_sheet(data.map(r => {
      const row: any = {};
      columns.forEach(c => { row[c.name] = r[c.key]; });
      return row;
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    XLSX.writeFile(wb, `${filename}.xlsx`);
    toast({ title: "Exported", description: `${data.length} rows downloaded.` });
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<any>(ws);
      const keyByHeader: Record<string, string> = {};
      columns.forEach(c => { keyByHeader[c.name.toLowerCase()] = c.key; });
      const payload = rows.map(r => {
        const item: any = {};
        Object.keys(r).forEach(h => {
          const k = keyByHeader[h.toLowerCase()];
          if (k) item[k] = r[h];
        });
        return item;
      }).filter(r => Object.keys(r).length > 0);
      if (payload.length === 0) { toast({ title: "No rows found", variant: "destructive" }); return; }
      setImportProgress({ current: 0, total: payload.length, importing: true });
      let ok = 0;
      for (let i = 0; i < payload.length; i++) {
        setImportProgress({ current: i + 1, total: payload.length, importing: true });
        const r = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload[i]) });
        if (r.ok) ok++;
      }
      toast({ title: "Imported", description: `${ok} of ${payload.length} rows added.` });
      onImported();
    } catch (err: any) {
      toast({ title: "Import failed", description: err.message, variant: "destructive" });
    } finally {
      setImportProgress({ current: 0, total: 0, importing: false });
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="flex flex-wrap gap-2 mb-3">
      <Button size="sm" variant="outline" onClick={handleExport}>
        <Icon name="download" className="mr-2" size={16} /> Export Excel
      </Button>
      <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={importProgress.importing}>
        {importProgress.importing ? <Icon name="loader-2" className="mr-2 animate-spin" size={16} /> : <Icon name="upload" className="mr-2" size={16} />} {importProgress.importing ? `Importing ${importProgress.current}/${importProgress.total}...` : "Import Excel"}
      </Button>
      <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImport} />
      {importProgress.importing && (
        <div className="mt-2">
          <div className="neu-inset rounded-full h-2 overflow-hidden">
            <div 
              className="h-full bg-primary rounded-full transition-all duration-300" 
              style={{ width: `${(importProgress.current / importProgress.total) * 100}%` }} 
            />
          </div>
          <p className="text-xs text-muted-foreground mt-1">{importProgress.current} / {importProgress.total} rows</p>
        </div>
      )}
      <Button size="sm" variant="ghost" onClick={() => {
        const ws = XLSX.utils.json_to_sheet(columns.map(c => ({ Column: c.name })));
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Template");
        XLSX.writeFile(wb, `${filename}-template.xlsx`);
      }} title="Download empty template">
        <Icon name="file-spreadsheet" className="mr-2" size={16} /> Template
      </Button>
    </div>
  );
}

let rowSeq = 0;
function newId() { return `__new_${Date.now()}_${rowSeq++}`; }

function SpreadsheetGrid({
  endpoint,
  columns,
  blankRow,
  filename,
  selectOptions,
}: {
  endpoint: string;
  columns: GridColumn[];
  blankRow: () => Record<string, any>;
  filename: string;
  selectOptions?: Record<string, readonly string[]>;
}) {
  const { data, setData, loading, refetch } = useTableData<any>(endpoint);
  const { toast } = useToast();
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const dataRef = useRef(data);
  dataRef.current = data;
  const persistTimers = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const inFlight = useRef<Set<string>>(new Set());

  useEffect(() => {
    return () => {
      persistTimers.current.forEach(t => clearTimeout(t));
      persistTimers.current.clear();
    };
  }, []);

  const normalize = (item: any) => {
    const r: any = { ...item };
    columns.forEach(c => {
      if (c.type === "number") r[c.key] = item[c.key] === "" || item[c.key] == null ? 0 : Number(item[c.key]);
      else r[c.key] = item[c.key] ?? "";
    });
    return r;
  };

  const doPersist = useCallback(async (row: any) => {
    const isNew = String(row.id).startsWith("__new_");
    const missing = columns.filter(c => c.required && (row[c.key] === "" || row[c.key] == null)).map(c => c.name);
    if (isNew && missing.length > 0) return;
    if (inFlight.current.has(row.id)) return;
    inFlight.current.add(row.id);
    const payload = { ...row };
    const tempId = row.id;
    delete payload.id;
    delete payload.__dirty;
    delete payload.createdAt;
    delete payload.updatedAt;
    setSavingIds(prev => new Set(prev).add(tempId));
    try {
      const r = await fetch(isNew ? endpoint : `${endpoint}/${tempId}`, {
        method: isNew ? "POST" : "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) {
        const errBody = await r.text().catch(() => "");
        let msg = `${r.status} ${r.statusText}`;
        try { const j = JSON.parse(errBody); if (j?.error) msg = `${r.status}: ${j.error}`; } catch { if (errBody) msg = `${r.status}: ${errBody}`; }
        throw new Error(msg);
      }
      if (isNew) {
        const created = await r.json();
        if (created?.id) {
          setData(prev => prev.map(item => item.id === tempId ? { ...item, id: created.id } : item));
        }
      }
      toast({ title: isNew ? "Added" : "Saved" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      inFlight.current.delete(tempId);
      setSavingIds(prev => { const n = new Set(prev); n.delete(tempId); return n; });
    }
  }, [endpoint, toast, columns, setData]);

  const updateCell = (id: string, key: string, value: any) => {
    setData(prev => prev.map(r => {
      if (r.id !== id) return r;
      return { ...r, [key]: value, __dirty: true };
    }));
    const existing = persistTimers.current.get(id);
    if (existing) clearTimeout(existing);
    persistTimers.current.set(id, setTimeout(() => {
      const row = dataRef.current.find(r => r.id === id);
      if (row) doPersist({ ...row, [key]: value });
    }, 400));
  };

  const handleAddRow = () => {
    setData(prev => [...prev, { ...normalize(blankRow()), id: newId(), __dirty: true }]);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this row?")) return;
    try {
      const r = await fetch(`${endpoint}/${id}`, { method: "DELETE", credentials: "include" });
      if (!r.ok) throw new Error("Delete failed");
      toast({ title: "Deleted" });
      refetch();
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  };

  const cellClass = "ss-cell";
  const totals = useMemo(() => {
    if (data.length === 0) return null;
    const t: Record<string, number> = {};
    columns.forEach(c => {
      if (c.type === "number") {
        t[c.key] = data.reduce((sum, row) => sum + (Number(row[c.key]) || 0), 0);
      }
    });
    return t;
  }, [data, columns]);

  if (loading) {
    return <div className="text-center py-8 text-muted-foreground">Loading...</div>;
  }

  return (
    <div className="space-y-3">
      <ExcelToolbar endpoint={endpoint} columns={columns} data={data} onImported={refetch} filename={filename} />
      <div className="flex justify-between items-center">
        <Button size="sm" variant="outline" onClick={handleAddRow}>
          <Icon name="plus" className="mr-2" size={16} /> Add Row
        </Button>
        {savingIds.size > 0 && (
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Icon name="loader-2" className="animate-spin" size={12} /> Saving...
          </span>
        )}
      </div>
      <div className="ss-grid border border-gray-300 rounded-md overflow-auto" style={{ maxHeight: "min(70vh, 640px)" }}>
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-secondary">
            <tr>
              <th className="ss-th w-10 text-center">#</th>
              {columns.map(c => {
                const headAlign = c.align === "center" ? " text-center" : c.align === "right" ? " text-right" : " text-left";
                return <th key={c.key} className={"ss-th" + headAlign} style={{ minWidth: c.width ?? 150 }}>{c.name}</th>;
              })}
              <th className="ss-th w-12 text-center">Del</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row, idx) => (
              <tr key={row.id} className="ss-row">
                <td className="ss-cell text-center text-muted-foreground tabular-nums">{idx + 1}</td>
                {columns.map(c => {
                  const opts = c.options ?? selectOptions?.[c.key] ?? [];
                  const cellAlign = c.align === "center" ? " text-center" : c.align === "right" ? " text-right" : "";
                  if (c.type === "select") {
                    return (
                      <td key={c.key} className={cellClass + cellAlign}>
                        <select
                          className="ss-input"
                          value={row[c.key] ?? ""}
                          onChange={e => updateCell(row.id, c.key, e.target.value)}
                        >
                          <option value="" disabled>—</option>
                          {opts.map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                      </td>
                    );
                  }
                  if (c.type === "date") {
                    return (
                      <td key={c.key} className={cellClass}>
                        <input
                          type="date"
                          className="ss-input"
                          value={row[c.key] ?? ""}
                          onChange={e => updateCell(row.id, c.key, e.target.value)}
                        />
                      </td>
                    );
                  }
                  return (
                    <td key={c.key} className={cellClass + cellAlign}>
                      <input
                        type={c.type === "number" ? "number" : "text"}
                        className="ss-input"
                        value={row[c.key] ?? ""}
                        onChange={e => updateCell(row.id, c.key, c.type === "number" ? Number(e.target.value) : e.target.value)}
                      />
                    </td>
                  );
                })}
                <td className="ss-cell text-center">
                  {row.id && !String(row.id).startsWith("__new_") && (
                    <button className="text-red-500 hover:text-red-700 p-1" title="Delete row" onClick={() => handleDelete(row.id)}>
                      <Icon name="trash-2" size={16} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {data.length === 0 && (
              <tr><td colSpan={columns.length + 2} className="ss-cell text-center text-muted-foreground py-8">
                No rows yet. Click “Add Row” or “Import Excel”.
              </td></tr>
            )}
          </tbody>
          {totals && (
            <tfoot className="sticky bottom-0 z-10 bg-gray-50 border-t-2 border-gray-300">
              <tr>
                <td className="ss-cell text-center font-semibold text-xs text-muted-foreground">TOTAL</td>
                {columns.map(c => {
                  if (c.type === "number" && totals[c.key] !== undefined) {
                    return (
                      <td key={c.key} className="ss-cell font-semibold tabular-nums">
                        ₱{totals[c.key].toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                    );
                  }
                  return <td key={c.key} className="ss-cell" />;
                })}
                <td className="ss-cell" />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

function TabLegalFiles() {
  const columns: GridColumn[] = [
    { key: "title", name: "Title", width: 200, required: true },
    { key: "company", name: "Company", width: 180, type: "select", options: COMPANY_OPTIONS, required: true },
    { key: "type", name: "Type", width: 160, required: true, align: "center" },
    { key: "fileUrl", name: "File URL", width: 160 },
    { key: "expiryDate", name: "Expiry", width: 140, type: "date" },
    { key: "notes", name: "Notes", width: 200 },
  ];
  return (
    <SpreadsheetGrid
      endpoint="/api/admin/legal-files"
      filename="legal-files"
      columns={columns}
      blankRow={() => ({ company: "JMCS", title: "", type: "", fileUrl: "", expiryDate: "", notes: "" })}
    />
  );
}

function TabInvoices() {
  const columns: GridColumn[] = [
    { key: "invoiceNo", name: "Invoice #", width: 130, required: true },
    { key: "company", name: "Company", width: 180, type: "select", options: COMPANY_OPTIONS, required: true },
    { key: "clientName", name: "Client", width: 160, required: true },
    { key: "amount", name: "Amount", width: 120, type: "number" },
    { key: "status", name: "Status", width: 120, type: "select", options: ["draft", "sent", "paid", "cancelled"] },
    { key: "issueDate", name: "Issue Date", width: 130, type: "date" },
    { key: "dueDate", name: "Due Date", width: 130, type: "date" },
    { key: "paidDate", name: "Paid Date", width: 130, type: "date" },
    { key: "notes", name: "Notes", width: 200 },
  ];
  return (
    <SpreadsheetGrid
      endpoint="/api/admin/invoices"
      filename="invoices"
      columns={columns}
      blankRow={() => ({ company: "JMCS", invoiceNo: "", clientName: "", amount: 0, status: "draft", issueDate: "", dueDate: "", paidDate: "", notes: "" })}
    />
  );
}

function TabExpenses() {
  const columns: GridColumn[] = [
    { key: "category", name: "Category", width: 150, required: true },
    { key: "company", name: "Company", width: 180, type: "select", options: COMPANY_OPTIONS, required: true },
    { key: "description", name: "Description", width: 220, required: true },
    { key: "amount", name: "Amount", width: 120, type: "number" },
    { key: "date", name: "Date", width: 130, type: "date" },
    { key: "receiptUrl", name: "Receipt URL", width: 160 },
    { key: "notes", name: "Notes", width: 200 },
  ];
  return (
    <SpreadsheetGrid
      endpoint="/api/admin/expenses"
      filename="expenses"
      columns={columns}
      blankRow={() => ({ company: "JMCS", category: "", amount: 0, description: "", date: "", receiptUrl: "", notes: "" })}
    />
  );
}

function TabRemittances() {
  const columns: GridColumn[] = [
    { key: "type", name: "Type", width: 130, type: "select", options: REMITTANCE_TYPES, required: true },
    { key: "company", name: "Company", width: 180, type: "select", options: COMPANY_OPTIONS, required: true },
    { key: "amount", name: "Amount", width: 120, type: "number" },
    { key: "dueDate", name: "Due Date", width: 130, type: "date" },
    { key: "status", name: "Status", width: 120, type: "select", options: ["pending", "paid", "overdue"] },
    { key: "paidDate", name: "Paid Date", width: 130, type: "date" },
    { key: "referenceNo", name: "Reference #", width: 140 },
    { key: "notes", name: "Notes", width: 200 },
  ];
  return (
    <SpreadsheetGrid
      endpoint="/api/admin/remittances"
      filename="remittances"
      columns={columns}
      blankRow={() => ({ company: "JMCS", type: "BIR", amount: 0, dueDate: "", status: "pending", paidDate: "", referenceNo: "", notes: "" })}
    />
  );
}

const SALES_STATUSES = ["prospect", "quotation", "won", "lost"] as const;

function TabBillingInvoices() {
  const columns: GridColumn[] = [
    { key: "invoiceNo", name: "Invoice #", width: 130, required: true },
    { key: "company", name: "Company", width: 180, type: "select", options: COMPANY_OPTIONS, required: true },
    { key: "clientName", name: "Client", width: 160, required: true },
    { key: "amount", name: "Amount", width: 120, type: "number" },
    { key: "status", name: "Status", width: 120, type: "select", options: ["draft", "sent", "paid", "cancelled"] },
    { key: "issueDate", name: "Issue Date", width: 130, type: "date" },
    { key: "dueDate", name: "Due Date", width: 130, type: "date" },
    { key: "paidDate", name: "Paid Date", width: 130, type: "date" },
    { key: "notes", name: "Notes", width: 200 },
  ];
  return (
    <SpreadsheetGrid
      endpoint="/api/admin/billing-invoices"
      filename="billing-invoices"
      columns={columns}
      blankRow={() => ({ company: "JMCS", invoiceNo: "", clientName: "", amount: 0, status: "draft", issueDate: "", dueDate: "", paidDate: "", notes: "" })}
    />
  );
}

function TabSales() {
  const columns: GridColumn[] = [
    { key: "company", name: "Company", width: 180, type: "select", options: COMPANY_OPTIONS, required: true },
    { key: "clientName", name: "Client", width: 160, required: true },
    { key: "projectName", name: "Project", width: 200, required: true },
    { key: "amount", name: "Amount", width: 120, type: "number" },
    { key: "status", name: "Status", width: 120, type: "select", options: SALES_STATUSES },
    { key: "date", name: "Date", width: 130, type: "date" },
    { key: "notes", name: "Notes", width: 200 },
  ];
  return (
    <SpreadsheetGrid
      endpoint="/api/admin/sales"
      filename="sales"
      columns={columns}
      blankRow={() => ({ company: "JMCS", clientName: "", projectName: "", amount: 0, status: "prospect", date: "", notes: "" })}
    />
  );
}

function TabServiceInvoices() {
  const columns: GridColumn[] = [
    { key: "invoiceNo", name: "Invoice #", width: 130, required: true },
    { key: "company", name: "Company", width: 180, type: "select", options: COMPANY_OPTIONS, required: true },
    { key: "clientName", name: "Client", width: 160, required: true },
    { key: "serviceDescription", name: "Service", width: 200, required: true },
    { key: "amount", name: "Amount", width: 120, type: "number" },
    { key: "status", name: "Status", width: 120, type: "select", options: ["draft", "sent", "paid", "cancelled"] },
    { key: "issueDate", name: "Issue Date", width: 130, type: "date" },
    { key: "dueDate", name: "Due Date", width: 130, type: "date" },
    { key: "paidDate", name: "Paid Date", width: 130, type: "date" },
    { key: "notes", name: "Notes", width: 200 },
  ];
  return (
    <SpreadsheetGrid
      endpoint="/api/admin/service-invoices"
      filename="service-invoices"
      columns={columns}
      blankRow={() => ({ company: "JMCS", invoiceNo: "", clientName: "", serviceDescription: "", amount: 0, status: "draft", issueDate: "", dueDate: "", paidDate: "", notes: "" })}
    />
  );
}

function TabCalendar() {
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    (async () => {
      try { const r = await fetch("/api/admin/compliance-calendar"); if (r.ok) setEvents(await r.json()); }
      catch {} finally { setLoading(false); }
    })();
  }, []);
  return (
    <Card className="neu rounded-lg">
      <CardHeader><CardTitle className="text-base">Upcoming Deadlines & Expiries</CardTitle><CardDescription>All compliance events sorted by urgency.</CardDescription></CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <div className="text-center py-12 text-muted-foreground">Loading...</div>
        ) : events.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Icon name="calendar-days" className="mx-auto mb-2 opacity-50" size={32} />
            <p>No upcoming deadlines.</p>
          </div>
        ) : (
          <div className="divide-y">
            {events.map((e: any, i: number) => (
              <div key={`${e.type}-${e.id}-${i}`} className="flex items-center gap-4 px-6 py-4 text-sm hover:bg-muted/30">
                <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${e.daysUntil <= 0 ? "bg-red-500" : e.daysUntil <= 7 ? "bg-amber-500" : "bg-emerald-500"}`} />
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{e.title}</p>
                  <p className="text-xs text-muted-foreground">{e.company} — {e.type === "remittance" ? "Payment" : "Legal File"}{e.amount ? ` — ₱${(e.amount || 0).toLocaleString()}` : ""}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className={`font-medium ${e.daysUntil <= 0 ? "text-red-600" : e.daysUntil <= 7 ? "text-amber-600" : ""}`}>
                    {e.daysUntil <= 0 ? "Overdue" : `${e.daysUntil} day${e.daysUntil === 1 ? "" : "s"} left`}
                  </p>
                  <p className="text-xs text-muted-foreground">{e.dueDate}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function AdminPortal() {
  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center gap-4">
        <Button variant="ghost" asChild><Link href="/admin"><Icon name="arrow-left" className="mr-2" size={16} /> Back</Link></Button>
        <div><h1 className="text-2xl font-bold tracking-tight">Admin Portal</h1></div>
      </div>

      <Tabs defaultValue="legal-files">
        <TabsList className="flex-wrap">
          <TabsTrigger value="legal-files"><Icon name="file-text" className="mr-2" size={16} />Legal Files</TabsTrigger>
          <TabsTrigger value="invoices"><Icon name="receipt" className="mr-2" size={16} />Invoices</TabsTrigger>
          <TabsTrigger value="expenses"><Icon name="wallet" className="mr-2" size={16} />Expenses</TabsTrigger>
          <TabsTrigger value="remittances"><Icon name="landmark" className="mr-2" size={16} />Remittances</TabsTrigger>
          <TabsTrigger value="billing-invoices"><Icon name="receipt" className="mr-2" size={16} />Billing Invoices</TabsTrigger>
          <TabsTrigger value="sales"><Icon name="trending-up" className="mr-2" size={16} />Sales</TabsTrigger>
          <TabsTrigger value="service-invoices"><Icon name="file-signature" className="mr-2" size={16} />Service Invoices</TabsTrigger>
          <TabsTrigger value="calendar"><Icon name="calendar-days" className="mr-2" size={16} />Calendar</TabsTrigger>
        </TabsList>
        <TabsContent value="legal-files"><TabLegalFiles /></TabsContent>
        <TabsContent value="invoices"><TabInvoices /></TabsContent>
        <TabsContent value="expenses"><TabExpenses /></TabsContent>
        <TabsContent value="remittances"><TabRemittances /></TabsContent>
        <TabsContent value="billing-invoices"><TabBillingInvoices /></TabsContent>
        <TabsContent value="sales"><TabSales /></TabsContent>
        <TabsContent value="service-invoices"><TabServiceInvoices /></TabsContent>
        <TabsContent value="calendar"><TabCalendar /></TabsContent>
      </Tabs>
    </div>
  );
}
