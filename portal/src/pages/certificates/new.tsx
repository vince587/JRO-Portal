import { useState } from "react";
import { useLocation } from "wouter";
import { Icon } from "@/components/ui/icon"
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

const ISO_STANDARDS = ["ISO 9001", "ISO 14001", "ISO 45001", "ISO 27001"];
const TRAINING_TYPES = [
  "ISO 9001:2015 Internal Auditor Training Course",
  "ISO 9001:2015 Lead Auditor Training Course",
  "ISO 14001:2015 Internal Auditor Training Course",
  "ISO 14001:2015 Lead Auditor Training Course",
  "ISO 45001:2018 Internal Auditor Training Course",
  "ISO 45001:2018 Lead Auditor Training Course",
  "ISO 27001:2022 Internal Auditor Training Course",
  "ISO 27001:2022 Lead Auditor Training Course",
  "IMS (ISO 9001:2015, 14001:2026, 45001:2018)",
  "Data Privacy Act Awareness Training",
  "Data Privacy Act Compliance Training",
  "Occupational Safety and Health Training",
  "Fire Safety and Emergency Response Training",
  "First Aid and Basic Life Support Training",
  "Environmental Management System Awareness",
  "Risk Management and Assessment Training",
  "Quality Management System Awareness",
  "Internal Quality Audit Training",
  "Supply Chain Management Training",
  "Business Continuity Planning Training",
  "Leadership and Management Skills Training",
];

const EMPTY = {
  title: "",
  recipientName: "",
  recipientEmail: "",
  issuedBy: "",
  issueDate: "",
  expiryDate: "",
  certificateNumber: "",
  trainingType: "",
  category: "training",
  standard: "",
  result: "attended",
  hours: "",
  trainingDate: "",
  fileUrl: "",
  notes: "",
};

export default function CertificateNew() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [form, setForm] = useState<typeof EMPTY>(EMPTY);
  const [submitting, setSubmitting] = useState(false);

  const set = (key: keyof typeof EMPTY, value: string) =>
    setForm(prev => ({ ...prev, [key]: value }));

  const handleSubmit = async () => {
    if (!form.title || !form.recipientName || !form.issuedBy || !form.issueDate || !form.expiryDate) {
      toast({ title: "Missing fields", description: "Title, recipient, issued by, issue date, and expiry date are required.", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/certificates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || "Failed to create certificate");
      }
      const created = await res.json();
      toast({ title: "Certificate created" });
      setLocation(`/certificates/${created.id}`);
    } catch (e: any) {
      toast({ title: "Failed to create", description: e.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-3xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/certificates")}>
          <Icon name="arrow-left" size={16} />
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Icon name="shield-check" className="text-amber-500" size={28} />
            Add Certificate
          </h1>
          <p className="text-muted-foreground mt-1">Create a new ISO or training certificate record.</p>
        </div>
      </div>

      <Card className="neu rounded-2xl">
        <CardHeader>
          <CardTitle className="text-lg">Certificate Details</CardTitle>
          <CardDescription>Fill in the information below to issue a certificate.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2 sm:col-span-2">
              <Label>Title *</Label>
              <Input value={form.title} onChange={e => set("title", e.target.value)} placeholder="Certificate title" />
            </div>

            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={form.category} onValueChange={v => set("category", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="training">Training</SelectItem>
                  <SelectItem value="iso">ISO</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Certificate Number</Label>
              <Input value={form.certificateNumber} onChange={e => set("certificateNumber", e.target.value)} placeholder="CERT-001" />
            </div>

            <div className="space-y-2">
              <Label>Recipient Name *</Label>
              <Input value={form.recipientName} onChange={e => set("recipientName", e.target.value)} placeholder="Juan Dela Cruz" />
            </div>

            <div className="space-y-2">
              <Label>Recipient Email</Label>
              <Input value={form.recipientEmail} onChange={e => set("recipientEmail", e.target.value)} placeholder="email@company.com" />
            </div>

            <div className="space-y-2">
              <Label>Issued By *</Label>
              <Input value={form.issuedBy} onChange={e => set("issuedBy", e.target.value)} placeholder="JMCS" />
            </div>

            {form.category === "iso" ? (
              <div className="space-y-2">
                <Label>Standard</Label>
                <Select value={form.standard} onValueChange={v => set("standard", v)}>
                  <SelectTrigger><SelectValue placeholder="Select standard" /></SelectTrigger>
                  <SelectContent>
                    {ISO_STANDARDS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-2">
                <Label>Training Type</Label>
                <Select value={form.trainingType} onValueChange={v => set("trainingType", v)}>
                  <SelectTrigger><SelectValue placeholder="Select training type" /></SelectTrigger>
                  <SelectContent className="max-h-64">
                    {TRAINING_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            {form.category !== "iso" && (
              <>
                <div className="space-y-2">
                  <Label>Result</Label>
                  <Select value={form.result} onValueChange={v => set("result", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="attended">Attended</SelectItem>
                      <SelectItem value="passed">Passed (completed exam)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Training Hours</Label>
                  <Select value={form.hours} onValueChange={v => set("hours", v)}>
                    <SelectTrigger><SelectValue placeholder="Select duration" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="8">8 hrs (1 day)</SelectItem>
                      <SelectItem value="16">16 hrs (2 days)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Training Date</Label>
                  <Input type="date" value={form.trainingDate} onChange={e => set("trainingDate", e.target.value)} />
                </div>
              </>
            )}

            {form.category === "iso" && (
              <div className="space-y-2">
                <Label>Audit Date</Label>
                <Input type="date" value={form.trainingDate} onChange={e => set("trainingDate", e.target.value)} />
              </div>
            )}

            <div className="space-y-2">
              <Label>Issue Date *</Label>
              <Input type="date" value={form.issueDate} onChange={e => set("issueDate", e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label>Expiry Date *</Label>
              <Input type="date" value={form.expiryDate} onChange={e => set("expiryDate", e.target.value)} />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label>File URL</Label>
              <Input value={form.fileUrl} onChange={e => set("fileUrl", e.target.value)} placeholder="https://..." />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={e => set("notes", e.target.value)} rows={3} />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setLocation("/certificates")}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? <Icon name="loader-2" className="animate-spin mr-2" size={16} /> : <Icon name="save" className="mr-2" size={16} />}
              Create Certificate
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
