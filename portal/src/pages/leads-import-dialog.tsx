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

const LEAD_STATUSES = ["new", "contacted", "qualified", "lost"];

export type { ImportFieldDef };

/**
 * Header aliases are intentionally generous: exported sheets vary in casing,
 * punctuation and wording ("Phone/ Telepone #", "COMPANY NAME", "E-mail").
 */
export const IMPORT_FIELDS: ImportFieldDef[] = [
  { key: "companyName", label: "Company Name", required: true, aliases: ["company name", "company", "companyname", "client", "client name", "organization", "organisation", "firm", "business name"] },
  { key: "contactPerson", label: "Full Name", required: true, aliases: ["full name", "fullname", "contact person", "contactperson", "contact name", "contactname", "name", "contact"] },
  { key: "position", label: "Position", aliases: ["position", "job title", "designation", "title", "role"] },
  { key: "email", label: "Email Address", aliases: ["email address", "emailaddress", "email", "e-mail", "mail"] },
  { key: "phone", label: "Phone/Telephone #", aliases: ["phone/telephone #", "phone/telephone", "phone number", "telephone number", "phone", "telephone", "contact number", "mobile", "mobile number", "celphone"] },
  { key: "serviceInterest", label: "Service Interest", aliases: ["service interest", "serviceinterest", "service", "interest", "services", "service required"] },
  { key: "type", label: "Type", aliases: ["type", "company type", "unit", "business unit"] },
  { key: "status", label: "Status", aliases: ["status", "stage", "lead status"] },
  { key: "notes", label: "Remarks", aliases: ["remarks", "notes", "note", "comments"] },
  { key: "date", label: "Date", aliases: ["date", "created date", "created at", "date created", "lead date", "entry date", "date collected"] },
];

interface PreviewRow {
  index: number;
  rowNumber: number;
  lead: Record<string, string | null>;
  errors: string[];
  duplicate: boolean;
  duplicateOfExistingId: string | null;
  duplicateOfRowIndex: number | null;
}

interface PreviewResponse {
  rows: PreviewRow[];
  summary: { total: number; valid: number; invalid: number; duplicates: number };
}

export function downloadLeadsTemplate() {
  downloadImportTemplate("leads-template.xlsx", "Leads", IMPORT_FIELDS, {
    "Company Name": "Example Corporation",
    "Full Name": "Juan Dela Cruz",
    "Position": "Quality Manager",
    "Email Address": "juan@example.com",
    "Phone/Telephone #": "+63 917 000 0000",
    "Service Interest": "ISO 9001 Certification",
    "Type": "JMCS",
    "Status": "new",
    "Remarks": "",
    "Date": new Date(),
  });
}

export default function LeadsImportDialog({
  open,
  onOpenChange,
  onImported,
  defaultType,
  canImportJmcs,
  canImportSis,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onImported: () => void;
  defaultType: "JMCS" | "SIS";
  canImportJmcs: boolean;
  canImportSis: boolean;
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
      // The template pre-fills a date on every row, so untouched rows look
      // non-empty. Treat a row as blank unless it names a company or a contact.
      const hasContent = (item: Record<string, unknown>) =>
        String(item.companyName ?? "").trim() !== "" ||
        String(item.contactPerson ?? "").trim() !== "";

      const result = await readSheetIntoFields(file, IMPORT_FIELDS, hasContent);
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
      const { mapped: rows, headerMap, unmatched, skippedBlank } = result;

      if (rows.length === 0) {
        toast({
          title: "No leads found in that file",
          description: "Every row was blank - fill in at least a Company Name or Full Name.",
          variant: "destructive",
        });
        return;
      }

      const res = await fetch("/api/leads/import/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows, defaultType: targetType }),
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
        toast({ title: `Read ${rows.length} lead${rows.length === 1 ? "" : "s"}`, description: `${skippedBlank} blank row${skippedBlank === 1 ? "" : "s"} ignored.` });
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
      const res = await fetch("/api/leads/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // The preview returns normalized leads; leadDate already holds the parsed
        // YYYY-MM-DD, which coerceDate reads back on the server.
        body: JSON.stringify({
          rows: toImport.map((r) => ({ ...r.lead, date: r.lead.leadDate ?? "" })),
          defaultType: targetType,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Import failed");
      }
      const result = await res.json();
      toast({
        title: `Imported ${result.imported} lead${result.imported === 1 ? "" : "s"}`,
        description: result.errors.length ? `${result.errors.length} row(s) could not be imported.` : undefined,
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
          <DialogTitle>Import Leads from Excel</DialogTitle>
          <DialogDescription>
            Columns are matched automatically by header name. Company Name and Full Name are required.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-2">
              <Label>Default Type</Label>
              <Select value={targetType} onValueChange={(v) => { setTargetType(v as "JMCS" | "SIS"); setPreview(null); }}>
                <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {canImportJmcs && <SelectItem value="JMCS">JMCS</SelectItem>}
                  {canImportSis && <SelectItem value="SIS">SIS</SelectItem>}
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={loading || importing}>
              {loading ? <Icon name="loader-2" className="mr-2 animate-spin" size={16} /> : <Icon name="upload" className="mr-2" size={16} />}
              {loading ? "Reading..." : "Choose Excel File"}
            </Button>
            <Button variant="ghost" onClick={downloadLeadsTemplate} disabled={importing}>
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
                {IMPORT_FIELDS.filter((f) => headerMap[f.key]).map((f) => (
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
                      <TableHead className="min-w-[150px]">Company</TableHead>
                      <TableHead className="min-w-[130px]">Full Name</TableHead>
                      <TableHead className="min-w-[110px]">Position</TableHead>
                      <TableHead className="min-w-[160px]">Email</TableHead>
                      <TableHead className="min-w-[130px]">Phone</TableHead>
                      <TableHead className="min-w-[150px]">Service Interest</TableHead>
                      <TableHead className="w-[90px]">Type</TableHead>
                      <TableHead className="w-[100px]">Status</TableHead>
                      <TableHead className="w-[110px]">Date</TableHead>
                      <TableHead className="min-w-[170px]">Issues</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.rows.map((row) => {
                      const l = row.lead as Record<string, any>;
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
                          <TableCell className="font-medium text-sm">{l.companyName || "—"}</TableCell>
                          <TableCell className="text-sm">{l.contactPerson || "—"}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{l.position || "—"}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{l.email || "—"}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{l.phone || "—"}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{l.serviceInterest || "—"}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="font-mono text-[10px]">{l.type}</Badge>
                          </TableCell>
                          <TableCell className="capitalize text-sm">{l.status}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {format(
                              l.leadDate ? new Date(`${l.leadDate}T00:00:00`) : new Date(),
                              "MMM d, yyyy"
                            )}
                          </TableCell>
                          <TableCell className="text-xs">
                            {row.errors.length > 0 ? (
                              <span className="text-red-600">{row.errors.join("; ")}</span>
                            ) : row.duplicateOfExistingId ? (
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
            {importing ? "Importing..." : `Import ${willImport} Lead${willImport === 1 ? "" : "s"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}