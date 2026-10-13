import { useState, useEffect, useRef } from "react";
import { useRoute, useLocation, Link } from "wouter";
import { format } from "date-fns";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useQueryClient } from "@tanstack/react-query";
import { Icon } from "@/components/ui/icon"
import QRCode from "qrcode";

/** Load an image and resolve once it's ready to draw to canvas */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * Generate a QR code with the JMCS logo composited in the center.
 * Uses errorCorrectionLevel "H" (~30% tolerance) since covering the
 * center with a logo obscures part of the code — without "H" the QR
 * would become unreliable to scan.
 */
// Base URL for the certificate verification site. The rest of the JMCS
// certificate tooling (CertificatePage, CertificateFormPage,
// CertificateDetailPage) all resolve their QR codes to
// `${CERT_VERIFY_BASE_URL}/?code=<verificationCode>` on certvrfy.jro-jmcs.com.
// This must match that same site/format, or a certificate generated here
// won't verify against the same database of codes as everything else.
const CERT_VERIFY_BASE_URL =
  (import.meta as any)?.env?.VITE_CERT_VERIFY_URL || "https://certvrfy.jro-jmcs.com";

function getQrUrl(code: string): string {
  return `${CERT_VERIFY_BASE_URL}/?code=${encodeURIComponent(code)}`;
}

async function generateQRWithLogo(data: string, logoSrc = "/Picture12.jpg", size = 300): Promise<string> {
  const qrDataUrl = await QRCode.toDataURL(data, {
    width: size,
    margin: 4, // wider quiet zone = more reliable scans, especially once printed
    errorCorrectionLevel: "H",
  });

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return qrDataUrl;

  const qrImage = await loadImage(qrDataUrl);
  ctx.drawImage(qrImage, 0, 0, size, size);

  try {
    const logoImage = await loadImage(logoSrc);
    // Keep the logo at ~22% of the QR width — large enough to read, small
    // enough to stay inside the safe margin that "H" error correction covers.
    const logoSize = size * 0.22;
    const logoX = (size - logoSize) / 2;
    const logoY = (size - logoSize) / 2;

    // White rounded backdrop so the logo stays legible against the QR pattern
    const padding = logoSize * 0.15;
    ctx.fillStyle = "#ffffff";
    roundRect(ctx, logoX - padding, logoY - padding, logoSize + padding * 2, logoSize + padding * 2, 8);
    ctx.fill();

    ctx.drawImage(logoImage, logoX, logoY, logoSize, logoSize);
  } catch (e) {
    console.error("[debug] QR logo image failed to load:", logoSrc, e);
  }

  return canvas.toDataURL("image/png");
}

import { 
  useGetCertificate, 
  useUpdateCertificate, 
  useCreateCertificate,
  useDeleteCertificate,
  useListCertificates,
  getGetCertificateQueryKey,
  getListCertificatesQueryKey,
  getGetDashboardStatsQueryKey
} from "@workspace/api-client-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { hasConfig as hasFirebase } from "@/lib/firebase";
import { useFirebaseUpload } from "@/hooks/use-firebase-upload";
import { UploadProgressOverlay } from "@/components/upload-progress";

const ISO_STANDARDS = ["ISO 9001", "ISO 14001", "ISO 45001", "ISO 27001"];

function safeDatePart(value: string | undefined | null): string {
  if (!value) return "";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "";
  return d.toISOString().split("T")[0];
}
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

const certificateSchema = z.object({
  title: z.string().min(1, "Title is required"),
  company: z.string().optional().nullable(),
  recipientName: z.string().min(1, "Recipient name is required"),
  recipientEmail: z.string().email("Invalid email").optional().or(z.literal("")),
  issuedBy: z.string().min(1, "Issuing authority is required"),
  issueDate: z.string().min(1, "Issue date is required"),
  expiryDate: z.string().min(1, "Expiry date is required"),
  certificateNumber: z.string().optional().nullable(),
  category: z.string().optional().nullable(),
  standard: z.string().optional().nullable(),
  trainingType: z.string().optional().nullable(),
  fileUrl: z.string().optional().nullable(),
  qrCodeUrl: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  result: z.enum(["passed", "attended"]).optional().nullable(),
  hours: z.string().optional().nullable(),
  trainingDate: z.string().optional().nullable(),
});

type CertificateFormValues = z.infer<typeof certificateSchema>;

export default function CertificateDetail() {
  const [, params] = useRoute("/certificates/:id");
  const [location, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  
  const idStr = params?.id;
  const isNew = !idStr || idStr === "new";
  const id: string = isNew ? "" : idStr!

  const urlParams = new URLSearchParams(window.location.search);
  const [isEditing, setIsEditing] = useState(isNew || urlParams.get("edit") === "true");
  const [fileUploading, setFileUploading] = useState(false);
  const [qrGenerating, setQrGenerating] = useState(false);
  const { progress: uploadProgress, uploading: firebaseUploading, fileName: uploadFileName, fileSize: uploadFileSize, upload } = useFirebaseUpload();

  const isJmcsOnly = user?.canAccessJmcs && !user?.canAccessSis;
  const isSisOnly = user?.canAccessSis && !user?.canAccessJmcs;

  const { data: certificate, isLoading: isCertificateLoading } = useGetCertificate(id as any, {
    query: {
      enabled: !isNew && !!id,
      queryKey: getGetCertificateQueryKey(id as any),
    }
  });

  const { data: allCerts } = useListCertificates();

  const { data: trainingCerts } = useListCertificates(
    { category: "training" },
    { query: { enabled: isNew, queryKey: getListCertificatesQueryKey({ category: "training" }) } }
  );

  const createMutation = useCreateCertificate();
  const updateMutation = useUpdateCertificate();
  const deleteMutation = useDeleteCertificate();

  function getNextTrainingNumber(): string {
    const source = (trainingCerts && trainingCerts.length ? trainingCerts : allCerts) || [];
    const numbers = source
      .map(c => c.certificateNumber)
      .filter((n): n is string => !!n);
    if (numbers.length === 0) return "JMCS-07832";
    // Numeric (not lexicographic) sort so e.g. JMCS-100 comes after JMCS-07832.
    const latest = numbers
      .map(n => {
        const m = n.match(/^JMCS-(\d+)$/);
        return m ? { raw: n, num: parseInt(m[1], 10) } : { raw: n, num: -1 };
      })
      .sort((a, b) => b.num - a.num)[0];
    if (latest.num < 0) return "JMCS-07832";
    const next = latest.num + 1;
    return `JMCS-${String(next).padStart(5, "0")}`;
  }

  const form = useForm<CertificateFormValues>({
    resolver: zodResolver(certificateSchema),
    defaultValues: {
      title: "",
      company: "",
      recipientName: "",
      recipientEmail: "",
      issuedBy: "",
      issueDate: format(new Date(), "yyyy-MM-dd"),
      expiryDate: format(new Date(new Date().setFullYear(new Date().getFullYear() + 1)), "yyyy-MM-dd"),
      certificateNumber: "",
      category: "training",
      standard: "",
      trainingType: "",
      fileUrl: "",
      qrCodeUrl: "",
      notes: "",
      result: "attended",
      hours: "",
      trainingDate: "",
    },
  });

  const category = form.watch("category");

  const initRef = useRef<number | null>(null);

  useEffect(() => {
    if (certificate && !isNew && initRef.current !== certificate.id) {
      initRef.current = certificate.id;
      form.reset({
        title: certificate.title ?? "",
        company: certificate.company || "",
        recipientName: certificate.recipientName ?? "",
        recipientEmail: certificate.recipientEmail || "",
        issuedBy: certificate.issuedBy ?? "",
        issueDate: safeDatePart(certificate.issueDate),
        expiryDate: safeDatePart(certificate.expiryDate),
        certificateNumber: certificate.certificateNumber || "",
        category: certificate.category || "training",
        standard: certificate.standard || "",
        trainingType: certificate.trainingType || "",
        fileUrl: certificate.fileUrl || "",
        qrCodeUrl: certificate.qrCodeUrl || "",
        notes: certificate.notes || "",
        result: (certificate.result as "passed" | "attended") || "attended",
        hours: certificate.hours || "",
        trainingDate: certificate.trainingDate || "",
      });
    }
  }, [certificate, isNew, form]);

  // Tracks the last value we auto-filled, so we only ever overwrite/clear
  // values that WE set — never something the user typed in themselves.
  const lastAutoValueRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isNew) return;
    if (category === "training") {
      if (!trainingCerts && !allCerts) return;
      const currentVal = form.getValues("certificateNumber");
      // Only auto-fill if the field is empty or still holds our previous
      // auto-generated value (never clobber a manually entered number).
      if (!currentVal || currentVal === lastAutoValueRef.current) {
        const next = getNextTrainingNumber();
        lastAutoValueRef.current = next;
        form.setValue("certificateNumber", next);
      }
    } else if (category === "iso") {
      const currentVal = form.getValues("certificateNumber");
      // ISO certificates should never be pre-filled — only Training numbers
      // are auto-generated. Clear any leftover auto-filled training number.
      if (!currentVal || currentVal === lastAutoValueRef.current) {
        lastAutoValueRef.current = null;
        form.setValue("certificateNumber", "");
      }
    }
  }, [isNew, trainingCerts, form, category]);

  const onSubmit = (data: CertificateFormValues) => {
    const payload: any = { ...data };
    if (payload.category !== "iso") {
      payload.standard = "";
    } else {
      // ISO certificates don't use result / training hours
      delete payload.result;
      delete payload.hours;
    }
    if (isNew) {
      createMutation.mutate({ data: payload as any }, {
        onSuccess: (newCert) => {
          queryClient.invalidateQueries({ queryKey: getListCertificatesQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetDashboardStatsQueryKey() });
          toast({ title: "Certificate recorded successfully" });
          setLocation(`/certificates/${newCert.id}`);
        },
        onError: () => {
          toast({ title: "Error creating record", variant: "destructive" });
        }
      });
    } else {
      updateMutation.mutate({ id: id as any, data: payload as any }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetCertificateQueryKey(id as any) });
          queryClient.invalidateQueries({ queryKey: getListCertificatesQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetDashboardStatsQueryKey() });
          toast({ title: "Certificate updated successfully" });
          setIsEditing(false);
        },
        onError: () => {
          toast({ title: "Error updating record", variant: "destructive" });
        }
      });
    }
  };

  const handleDelete = () => {
    if (isNew) return;
    deleteMutation.mutate({ id: id as any }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListCertificatesQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetDashboardStatsQueryKey() });
        toast({ title: "Certificate deleted" });
        setLocation("/certificates");
      },
      onError: () => {
        toast({ title: "Error deleting certificate", variant: "destructive" });
      }
    });
  };

  async function handleFileUpload() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".pdf,.doc,.docx";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const path = `certificates/${Date.now()}-${file.name}`;
        const url = await upload(file, path);
        form.setValue("fileUrl", url);
        toast({ title: `"${file.name}" uploaded` });
      } catch (e: any) {
        toast({ title: "Upload failed", description: e.message, variant: "destructive" });
      }
    };
    input.click();
  }

  async function handleGenerateQR() {
    const code = form.getValues("certificateNumber")?.trim();
    if (!code) {
      toast({
        title: "Certificate / ID Number is required",
        description: "The verification site looks certificates up by this code — fill it in before generating the QR.",
        variant: "destructive",
      });
      return;
    }
    const qrData = getQrUrl(code);
    setQrGenerating(true);
    try {
      const dataUrl = await generateQRWithLogo(qrData);
      form.setValue("qrCodeUrl", dataUrl);
      toast({ title: "QR Code generated" });
    } catch (e: any) {
      toast({ title: "QR generation failed", description: e.message, variant: "destructive" });
    } finally {
      setQrGenerating(false);
    }
  }

  const isLoading = !isNew && isCertificateLoading;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <div className="space-y-2">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
        <Card className="surface rounded-lg">
          <CardContent className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {Array(6).fill(0).map((_, i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!isNew && !certificate) {
    return (
      <div className="flex flex-col items-center justify-center h-[50vh] text-center">
        <Icon name="alert-circle" className="text-destructive mb-4" size={48} />
        <h2 className="text-2xl font-bold">Record Not Found</h2>
        <p className="text-muted-foreground mt-2">The certificate you are looking for does not exist.</p>
        <Button variant="outline" className="mt-6" asChild>
          <Link href="/certificates">Back to Certificates</Link>
        </Button>
      </div>
    );
  }

  const certList = allCerts || [];
  const currentIdx = certList.findIndex(c => String(c.id) === String(id));
  const found = currentIdx !== -1;
  const prevCert = found && currentIdx > 0 ? certList[currentIdx - 1] : null;
  const nextCert = found && currentIdx < certList.length - 1 ? certList[currentIdx + 1] : null;

  const qrCodeUrl = form.watch("qrCodeUrl");
  const fileUrl = form.watch("fileUrl");
  const certificateNumber = form.watch("certificateNumber");
  const canGenerateQr = !!certificateNumber?.trim();

  return (
    <div className="space-y-6 animate-in fade-in duration-300 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" asChild>
            <Link href="/certificates">
              <Icon name="arrow-left" size={16} />
            </Link>
          </Button>
          {!isNew && certList.length > 0 && (
            <div className="flex items-center border-l pl-2 ml-1 gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                disabled={!prevCert}
                onClick={() => prevCert && setLocation(`/certificates/${prevCert.id}`)}
                title={prevCert ? `Previous: ${prevCert.title}` : "No previous"}
              >
                <Icon name="chevron-left" size={16} />
              </Button>
              {found && (
                <span className="text-xs text-muted-foreground tabular-nums min-w-[4ch] text-center">
                  {currentIdx + 1}/{certList.length}
                </span>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                disabled={!nextCert}
                onClick={() => nextCert && setLocation(`/certificates/${nextCert.id}`)}
                title={nextCert ? `Next: ${nextCert.title}` : "No next"}
              >
                <Icon name="chevron-right" size={16} />
              </Button>
            </div>
          )}
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              {isNew ? "New Record" : certificate?.title}
            </h1>
            {!isNew && (
              <p className="text-muted-foreground font-medium text-sm">
                For: {certificate?.recipientName}
                <Badge variant="outline" className="ml-2 capitalize">{certificate?.category || "training"}</Badge>
              </p>
            )}
            {!isNew && certificate?.company && (
              <p className="text-xs text-muted-foreground/60 mt-0.5">
                <Icon name="building" className="inline mr-1" size={12} />
                {certificate.company}
              </p>
            )}
            {!isNew && (certificate as any)?.createdByName && (
              <p className="text-xs text-muted-foreground/60 mt-0.5">
                Created by {(certificate as any).createdByName}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!isNew && !isEditing && (
            <Button variant="outline" onClick={() => setIsEditing(true)}>
              Edit Record
            </Button>
          )}
          {!isNew && isEditing && (
            <Button variant="ghost" onClick={() => setIsEditing(false)}>
              Cancel
            </Button>
          )}
          {!isNew && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="icon">
                  <Icon name="trash-2" size={16} />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete this record?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete the certificate record for {certificate?.recipientName}.
                    This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <Card className="surface rounded-lg">
            <CardHeader className="border-b surface-sunken rounded-lg">
              <CardTitle className="text-lg flex items-center gap-2">
                <Icon name="shield-check" className="text-amber-500" size={20} />
                Certificate Information
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem className="md:col-span-2">
                      <FormLabel>Title</FormLabel>
                      <FormControl>
                        <Input {...field} disabled={!isEditing} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="category"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Category</FormLabel>
                      <FormControl>
                        <Tabs value={field.value || "training"} onValueChange={field.onChange} className="w-full">
                          <TabsList className="grid w-full grid-cols-2">
                            <TabsTrigger value="iso" disabled={!isEditing || isJmcsOnly}>ISO Certificate</TabsTrigger>
                            <TabsTrigger value="training" disabled={!isEditing || isSisOnly}>Training</TabsTrigger>
                          </TabsList>
                        </Tabs>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {category === "iso" ? (
                  <FormField
                    control={form.control}
                    name="standard"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Standard</FormLabel>
                        <Select disabled={!isEditing} value={field.value || ""} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select ISO standard" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {ISO_STANDARDS.map(s => (
                              <SelectItem key={s} value={s}>{s}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ) : (
                  <FormField
                    control={form.control}
                    name="trainingType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Training Type</FormLabel>
                        <Select disabled={!isEditing} value={field.value || ""} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select training type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent className="max-h-64">
                            {TRAINING_TYPES.map(t => (
                              <SelectItem key={t} value={t}>{t}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                {category !== "iso" && (
                  <FormField
                    control={form.control}
                    name="result"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Result</FormLabel>
                        <Select disabled={!isEditing} value={field.value || "attended"} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select result" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="attended">Attended</SelectItem>
                            <SelectItem value="passed">Passed (completed exam)</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                {category !== "iso" && (
                  <FormField
                    control={form.control}
                    name="hours"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Training Hours</FormLabel>
                        <Select disabled={!isEditing} value={field.value || ""} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select duration" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="8">8 hrs (1 day)</SelectItem>
                            <SelectItem value="16">16 hrs (2 days)</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                <FormField
                  control={form.control}
                  name="trainingDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{category === "iso" ? "Audit Date" : "Training Date"}</FormLabel>
                      <FormControl>
                        <Input type="date" disabled={!isEditing} value={field.value || ""} onChange={field.onChange} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="company"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-2">
                        <Icon name="building" className="text-muted-foreground" size={16} />
                        Company Name
                      </FormLabel>
                      <FormControl>
                        <Input {...field} value={field.value || ""} disabled={!isEditing} placeholder="e.g. JMCS Training Center" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="recipientName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-2">
                        <Icon name="user" className="text-muted-foreground" size={16} />
                        Recipient Name
                      </FormLabel>
                      <FormControl>
                        <Input {...field} disabled={!isEditing} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="recipientEmail"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Recipient Email</FormLabel>
                      <FormControl>
                        <Input type="email" {...field} value={field.value || ""} disabled={!isEditing} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="issuedBy"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-2">
                        <Icon name="building" className="text-muted-foreground" size={16} />
                        Issuing Authority
                      </FormLabel>
                      <FormControl>
                        <Input {...field} disabled={!isEditing} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="certificateNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        Certificate / ID Number
                        {category === "training" && (
                          <span className="ml-2 text-xs font-normal text-muted-foreground">(auto-generated)</span>
                        )}
                      </FormLabel>
                      <FormControl>
                        {isEditing ? (
                          <Input
                            {...field}
                            value={field.value || ""}
                            disabled={false}
                            placeholder={category === "iso" ? "Enter ISO certificate number" : undefined}
                            className="font-mono"
                          />
                        ) : (
                          <span className="font-mono">{field.value || "N/A"}</span>
                        )}
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="issueDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-2">
                        <Icon name="calendar" className="text-muted-foreground" size={16} />
                        Issue Date
                      </FormLabel>
                      <FormControl>
                        <Input type="date" {...field} disabled={!isEditing} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="expiryDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-2">
                        <Icon name="calendar" className="text-muted-foreground" size={16} />
                        Expiry Date
                      </FormLabel>
                      <FormControl>
                        <Input type="date" {...field} disabled={!isEditing} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem className="md:col-span-2">
                      <FormLabel>Additional Notes</FormLabel>
                      <FormControl>
                        <Textarea 
                          {...field} 
                          value={field.value || ""}
                          disabled={!isEditing} 
                          className="min-h-[100px]"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>

          <Card className="surface rounded-lg">
            <CardHeader className="border-b surface-sunken rounded-lg">
              <CardTitle className="text-lg flex items-center gap-2">
                <Icon name={category === "iso" ? "file-text" : "qr-code"} className="text-primary" size={20} />
                {category === "iso" ? "Attachments" : "QR Code & Attachments"}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              {category !== "iso" && (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
                    <div className="md:col-span-2 flex flex-col items-center text-center border rounded-lg p-4 bg-muted/10">
                      {qrCodeUrl ? (
                        <>
                          <div className="relative group">
                            <img
                              src={qrCodeUrl}
                              alt="QR Code"
                              className="w-40 h-40 border rounded-lg bg-white"
                            />
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 rounded-lg transition-colors" />
                          </div>
                          <a
                            href={getQrUrl(certificateNumber || "")}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-3 text-xs text-muted-foreground flex items-center gap-1 hover:text-primary transition-colors"
                          >
                            <Icon name="external-link" size={12} />
                            {CERT_VERIFY_BASE_URL.replace(/^https?:\/\//, "")}/?code={certificateNumber}
                          </a>
                        </>
                      ) : (
                        <div className="flex flex-col items-center gap-2 py-6">
                          <Icon name="scan-line" className="text-muted-foreground/30" size={48} />
                          <p className="text-sm text-muted-foreground/60 font-medium">No QR code yet</p>
                          <p className="text-xs text-muted-foreground/40 max-w-[200px]">
                            {isEditing
                              ? "Enter a certificate number below, then generate the QR code"
                              : "QR code will appear once generated"}
                          </p>
                        </div>
                      )}
                    </div>

                    <div className="md:col-span-3 space-y-4">
                      <div className="flex flex-wrap items-center gap-3">
                        {isEditing && (
                          <Button
                            type="button"
                            variant="default"
                            size="sm"
                            onClick={handleGenerateQR}
                            disabled={qrGenerating || !canGenerateQr}
                            title={!canGenerateQr ? "Enter a Certificate / ID Number first" : undefined}
                          >
                            <Icon name="qr-code" className="mr-1.5" size={16} />
                            {qrGenerating ? "Generating..." : "Generate QR Code"}
                          </Button>
                        )}
                        {qrCodeUrl && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              const a = document.createElement("a");
                              a.href = qrCodeUrl;
                              a.download = `qr-${certificateNumber || "certificate"}.png`;
                              a.click();
                            }}
                          >
                            <Icon name="download" className="mr-1.5" size={16} />
                            Download
                          </Button>
                        )}
                      </div>

                      {isEditing && !canGenerateQr && (
                        <p className="text-xs text-muted-foreground">
                          <Icon name="alert-circle" className="inline mr-1" size={12} />
                          Enter a <strong>Certificate / ID Number</strong> in the form above first
                        </p>
                      )}
                    </div>
                  </div>

                  <Separator className="my-6" />
                </>
              )}

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <Icon name="file-text" size={16} />
                    Attachments
                  </h4>
                  {isEditing && hasFirebase && (
                    <Button type="button" variant="outline" size="sm" onClick={handleFileUpload} disabled={firebaseUploading}>
                      <Icon name="upload" className="mr-1.5" size={16} />
                      {firebaseUploading ? `${uploadProgress}%` : "Upload PDF / Word"}
                    </Button>
                  )}
                </div>

                {fileUrl ? (
                  <div className="flex items-center gap-3 p-3 border rounded-lg bg-muted/10">
                    <div className="p-2 rounded-md bg-muted">
                      <Icon name="file-text" className="text-muted-foreground" size={20} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <a
                        href={fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-medium text-primary underline-offset-2 hover:underline truncate block"
                      >
                        {decodeURIComponent(fileUrl.split("/").pop()?.replace(/^\d+-/, "") || "View file")}
                      </a>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Click to open in new tab
                      </p>
                    </div>
                    <Button variant="ghost" size="icon" asChild>
                      <a href={fileUrl} target="_blank" rel="noopener noreferrer">
                        <Icon name="external-link" size={16} />
                      </a>
                    </Button>
                  </div>
                ) : (
                  <div className="text-center py-6 border border-dashed rounded-lg">
                    <Icon name="file-text" className="mx-auto text-muted-foreground/30" size={32} />
                    <p className="text-sm text-muted-foreground/60 mt-2">No attachments uploaded</p>
                    <p className="text-xs text-muted-foreground/40 mt-1">
                      {isEditing && hasFirebase ? "Upload a PDF or Word document above" : "N/A"}
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {isEditing && (
            <div className="flex justify-end gap-4 bg-background/80 backdrop-blur-sm p-4 rounded-lg border shadow-md">
              <Button type="button" variant="outline" onClick={() => setIsEditing(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                {(createMutation.isPending || updateMutation.isPending) ? "Saving..." : "Save Record"}
                <Icon name="save" className="ml-2" size={16} />
              </Button>
            </div>
          )}
        </form>
      </Form>

      {!isNew && certList.length > 1 && (
        <div className="flex items-center justify-between border-t pt-4 mt-2">
          <Button
            variant="ghost"
            size="sm"
            disabled={!prevCert}
            onClick={() => prevCert && setLocation(`/certificates/${prevCert.id}`)}
            className="gap-1"
          >
            <Icon name="chevron-left" size={16} />
            <span className="truncate max-w-[200px]">{prevCert?.title || "Previous"}</span>
          </Button>
          <span className="text-xs text-muted-foreground tabular-nums">
            {found ? `${currentIdx + 1} of ${certList.length}` : `— of ${certList.length}`}
          </span>
          <Button
            variant="ghost"
            size="sm"
            disabled={!nextCert}
            onClick={() => nextCert && setLocation(`/certificates/${nextCert.id}`)}
            className="gap-1"
          >
            <span className="truncate max-w-[200px]">{nextCert?.title || "Next"}</span>
            <Icon name="chevron-right" size={16} />
          </Button>
        </div>
      )}
      <UploadProgressOverlay uploading={firebaseUploading} progress={uploadProgress} fileName={uploadFileName} fileSize={uploadFileSize} />
    </div>
  );
}
