import { useRef, useState } from "react";
import { format } from "date-fns";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  downloadImportTemplate,
  readSheetIntoFields,
  type ImportFieldDef,
} from "@/lib/excel-columns";

const CONTRACT_STATUSES = ["active", "pending", "completed", "expired"];

/**
 * Header aliases are intentionally generous: exported sheets vary in casing,
 * punctuation and wording ("Contract No.", "CLIENT", "Start (inclusive)").
 */
export const CONTRACT_IMPORT_FIELDS: ImportFieldDef[] = [
  { key: "contractNumber", label: "Reference Number", required: true, aliases: ["reference number", "ref#", "ref no", "ref number", "contract number", "contract no", "contractno", "contractnumber", "number", "cn"] },
  { key: "clientName", label: "Company Name", required: true, aliases: ["company name", "company", "client name", "client", "customer"] },
  { key: "title", label: "Services", aliases: ["services", "service", "contract name", "contract", "title", "name", "training", "description of services"] },
  { key: "contactPerson", label: "Contact Person", aliases: ["contact person", "contact", "person", "contact name", "representative"] },
  { key: "designation", label: "Designation", aliases: ["designation", "position", "title", "role", "job title"] },
  { key: "contactEmail", label: "Email Address", aliases: ["email address", "email", "e-mail", "mail"] },
  { key: "contactNumber", label: "Contact Number", aliases: ["contact number", "contact no", "contact #", "phone", "telephone", "mobile", "phone number", "tel no", "tel #"] },
  { key: "value", label: "Price/ Rates", aliases: ["price/ rates", "price / rates", "price/rates", "price", "rates", "rate", "value", "contract value", "amount", "total", "fee", "cost"] },
  { key: "salesInCharge", label: "Sales In Charge", aliases: ["sales in charge", "sales in-charge", "sales", "in charge", "assigned to", "agent", "account executive", "rep"] },
  { key: "type", label: "Type", aliases: ["type", "business unit", "unit", "company type"] },
  { key: "status", label: "Status", aliases: ["status", "stage", "contract status"] },
  { key: "startDate", label: "Start Date", aliases: ["start date", "startdate", "start", "date start", "effective date", "from"] },
  { key: "endDate", label: "End Date", aliases: ["end date", "enddate", "end", "expiry", "expiration", "expiration date", "until", "to"] },
  { key: "description", label: "Remarks", aliases: ["remarks", "description", "notes", "note", "comments", "terms"] },
];

interface PreviewRow {
  index: number;
  rowNumber: number;
  contract: {
    title: string;
    contractNumber: string;
    clientName: string;
    type: string;
    status: string;
    startDate: string;
    endDate: string;
    value: number | null;
    contactPerson?: string | null;
    designation?: string | null;
    contactNumber?: string | null;
    contactEmail?: string | null;
    salesInCharge?: string | null;
  };
  errors: string[];
  duplicate: boolean;
  duplicateOfExisting: boolean;
  duplicateOfRowIndex: number | null;
}

interface PreviewResponse {
  rows: PreviewRow[];
  summary: { total: number; valid: number; invalid: number; duplicates: number };
}

export function downloadContractsTemplate() {
  downloadImportTemplate("contracts-template.xlsx", "Contracts", CONTRACT_IMPORT_FIELDS, {
    "Reference Number": "Ref# 2026-0106-01",
    "Company Name": "Example Corporation",
    "Services": "ISO 9001:2026 Overview Training Course",
    "Contact Person": "MS. AIZA GUERINA",
    "Designation": "DOCUMENTATION OFFICER",
    "Email Address": "aiza@example.com",
    "Contact Number": "8521-4975",
    "Price/ Rates": 30000,
    "Sales In Charge": "Alexa",
    "Type": "JMCS",
    "Status": "active",
    "Start Date": new Date(),
    "End Date": new Date(),
    "Remarks": "",
  });
}

export default function ContractsImportDialog({
  open,
  onOpenChange,
  onImported,
  defaultType,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onImported: () => void;
  defaultType: "JMCS" | "SIS";
}) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [targetType, setTargetType] = useState<"JMCS" | "SIS">(defaultType);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [headerMap, setHeaderMap] = useState<Record<string, string>>({});
  const [unmatched, setUnmatched] = useState<string[]>([]);
  const [skip, setSkip] = useState<Set<number>>(new Set());
  const [skippedBlank, setSkippedBlank] = useState(0);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);

  const reset = () => {
    setFileName(null);
    setPreview(null);
    setHeaderMap({});
    setUnmatched([]);
    setSkip(new Set());
    setSkippedBlank(0);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    setPreview(null);
    try {
      // A row is valid once it has a reference number or company name, skipping month banner rows.
      const isMonthHeader = (item: Record<string, unknown>) => {
        const months = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"];
        const num = String(item.contractNumber ?? "").trim().toUpperCase();
        return months.some(m => num.startsWith(m)) && String(item.clientName ?? "").trim() === "";
      };
      const hasContent = (item: Record<string, unknown>) => {
        if (isMonthHeader(item)) return false;
        return (
          String(item.clientName ?? "").trim() !== "" ||
          String(item.title ?? "").trim() !== "" ||
          String(item.contractNumber ?? "").trim() !== ""
        );
      };

      const result = await readSheetIntoFields(file, CONTRACT_IMPORT_FIELDS, hasContent);
      if ("empty" in result) {
        toast({ title: "No rows found in that file", variant: "destructive" });
        return;
      }
      if ("missingRequired" in result) {
        toast({
          title: `Missing required column: ${result.missingRequired[0].label}`,
          description: "Download the template to see the expected columns.",
          variant: "destructive",
        });
        return;
      }
      const { mapped, headerMap, unmatched, skippedBlank } = result;

      if (mapped.length === 0) {
        toast({
          title: "No contracts found in that file",
          description: "Every row was blank - fill in at least a Contract Name or Client Name.",
          variant: "destructive",
        });
        return;
      }

      const res = await fetch("/api/contracts/import/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: mapped, defaultType: targetType }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to read file");
      }
      const data: PreviewResponse = await res.json();
      const dupes = new Set(data.rows.filter((r) => r.duplicate).map((r) => r.index));
      setFileName(file.name);
      setHeaderMap(headerMap);
      setUnmatched(unmatched);
      setSkip(dupes);
      setSkippedBlank(skippedBlank);
      setPreview(data);
      if (skippedBlank > 0) {
        toast({ title: `Read ${mapped.length} contract${mapped.length === 1 ? "" : "s"}`, description: `${skippedBlank} blank row${skippedBlank === 1 ? "" : "s"} ignored.` });
      }
    } catch (err: any) {
      toast({ title: "Import failed", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const toggleSkip = (index: number) => {
    setSkip((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index); else next.add(index);
      return next;
    });
  };

  const willImport = preview
    ? preview.rows.filter((r) => r.errors.length === 0 && !skip.has(r.index)).length
    : 0;

  const handleImport = async () => {
    if (!preview) return;
    const toImport = preview.rows.filter((r) => r.errors.length === 0 && !skip.has(r.index));
    if (toImport.length === 0) return;
    setImporting(true);
    try {
      const res = await fetch("/api/contracts/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: toImport.map((r) => r.contract), defaultType: targetType }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Import failed");
      }
      const result = await res.json();
      toast({
        title: `Imported ${result.imported} contract${result.imported === 1 ? "" : "s"}`,
        description: result.errors?.length ? `${result.errors.length} row(s) could not be imported.` : undefined,
      });
      onImported();
      onOpenChange(false);
      reset();
    } catch (err: any) {
      toast({ title: "Import failed", description: err.message, variant: "destructive" });
    } finally {
      setImporting(false);
    }
  };

  const money = (v: number | null) =>
    v === null ? "—" : `₱${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v && !importing) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="sm:max-w-5xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import Contracts from Excel</DialogTitle>
          <DialogDescription>
            Columns are matched automatically by header name. Contract Name, Contract Number, Client Name
            and Value are required. Existing contract numbers are skipped.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-2">
              <Label>Default Type</Label>
              <Select value={targetType} onValueChange={(v) => { setTargetType(v as "JMCS" | "SIS"); setPreview(null); }}>
                <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="JMCS">JMCS</SelectItem>
                  <SelectItem value="SIS">SIS</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={loading || importing}>
              {loading ? <Icon name="loader-2" className="mr-2 animate-spin" size={16} /> : <Icon name="upload" className="mr-2" size={16} />}
              {loading ? "Reading..." : "Choose Excel File"}
            </Button>
            <Button variant="ghost" onClick={downloadContractsTemplate} disabled={importing}>
              <Icon name="file-spreadsheet" className="mr-2" size={16} /> Download Template
            </Button>
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFile} />
          </div>

          {fileName && (
            <div className="flex items-center gap-2 text-sm">
              <Icon name="file-spreadsheet" className="text-green-600" size={16} />
              <span className="font-medium">{fileName}</span>
              {preview && (
                <Badge variant="outline" className="font-mono text-[10px]">
                  {preview.summary.total} row{preview.summary.total === 1 ? "" : "s"} read
                </Badge>
              )}
            </div>
          )}

          {Object.keys(headerMap).length > 0 && (
            <div className="rounded-lg border p-3 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Column Mapping</p>
              <div className="flex flex-wrap gap-1.5">
                {CONTRACT_IMPORT_FIELDS.filter((f) => headerMap[f.key]).map((f) => (
                  <Badge key={f.key} variant="outline" className="font-normal">
                    {headerMap[f.key]} <Icon name="arrow-right" className="mx-1" size={11} /> {f.label}
                  </Badge>
                ))}
                {unmatched.map((h) => (
                  <Badge key={h} variant="outline" className="font-normal text-muted-foreground line-through">
                    {h}
                  </Badge>
                ))}
              </div>
              {unmatched.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Struck-through columns were not recognised and will be ignored.
                </p>
              )}
            </div>
          )}

          {preview && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Badge variant="outline" className="tone-success">
                  {willImport} to import
                </Badge>
                {preview.summary.invalid > 0 && (
                  <Badge variant="outline" className="tone-danger">
                    {preview.summary.invalid} invalid
                  </Badge>
                )}
                {preview.summary.duplicates > 0 && (
                  <Badge variant="outline" className="tone-warning">
                    {preview.summary.duplicates} duplicate{preview.summary.duplicates === 1 ? "" : "s"} skipped
                  </Badge>
                )}
                {skippedBlank > 0 && (
                  <Badge variant="outline" className="text-muted-foreground">
                    {skippedBlank} blank row{skippedBlank === 1 ? "" : "s"} ignored
                  </Badge>
                )}
              </div>

              <div className="rounded-lg border overflow-auto" style={{ maxHeight: "min(45vh, 380px)" }}>
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/10">
                      <TableHead className="w-[40px]"></TableHead>
                      <TableHead className="w-[50px]">Row</TableHead>
                      <TableHead className="min-w-[130px]">Ref No.</TableHead>
                      <TableHead className="min-w-[170px]">Company Name</TableHead>
                      <TableHead className="min-w-[180px]">Services</TableHead>
                      <TableHead className="min-w-[140px]">Contact Person</TableHead>
                      <TableHead className="min-w-[130px]">Designation</TableHead>
                      <TableHead className="w-[110px] text-right">Price / Rates</TableHead>
                      <TableHead className="w-[120px]">Sales In Charge</TableHead>
                      <TableHead className="w-[85px]">Status</TableHead>
                      <TableHead className="min-w-[160px]">Issues</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.rows.map((row) => {
                      const c = row.contract;
                      const disabled = row.errors.length > 0;
                      const skipped = skip.has(row.index);
                      return (
                        <TableRow key={row.index} className={disabled || skipped ? "opacity-50" : ""}>
                          <TableCell>
                            <Checkbox
                              checked={!disabled && !skipped}
                              disabled={disabled}
                              onCheckedChange={() => toggleSkip(row.index)}
                              aria-label={`Include row ${row.rowNumber}`}
                            />
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">{row.rowNumber}</TableCell>
                          <TableCell className="font-mono text-xs font-semibold">{c.contractNumber || "—"}</TableCell>
                          <TableCell className="text-sm font-medium">{c.clientName || "—"}</TableCell>
                          <TableCell className="text-sm">{c.title || <span className="text-muted-foreground italic">General Services</span>}</TableCell>
                          <TableCell className="text-xs">{c.contactPerson || "—"}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{c.designation || "—"}</TableCell>
                          <TableCell className="text-right text-sm tabular-nums font-medium">{money(c.value)}</TableCell>
                          <TableCell className="text-xs">{c.salesInCharge || "—"}</TableCell>
                          <TableCell className="capitalize text-xs">{c.status}</TableCell>
                          <TableCell className="text-xs">
                            {row.errors.length > 0 ? (
                              <span className="text-red-600">{row.errors.join("; ")}</span>
                            ) : row.duplicateOfExisting ? (
                              <span className="text-amber-600">Already exists — skipped</span>
                            ) : row.duplicateOfRowIndex !== null ? (
                              <span className="text-amber-600">Duplicate of row {row.duplicateOfRowIndex + 2}</span>
                            ) : skipped ? (
                              <span className="text-muted-foreground">Skipped</span>
                            ) : null}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onOpenChange(false); }} disabled={importing}>
            Cancel
          </Button>
          <Button onClick={handleImport} disabled={!preview || willImport === 0 || importing}>
            {importing ? <Icon name="loader-2" className="mr-2 animate-spin" size={16} /> : null}
            {importing ? "Importing..." : `Import ${willImport} Contract${willImport === 1 ? "" : "s"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export { CONTRACT_STATUSES };
