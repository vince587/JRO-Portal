import { useState, useEffect, useRef } from "react";
import { useRoute, useLocation, Link } from "wouter";
import { format } from "date-fns";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useQueryClient, useMutation, useQuery } from "@tanstack/react-query";
import { Icon } from "@/components/ui/icon"

import { 
  useGetContract, 
  useUpdateContract, 
  useCreateContract,
  useDeleteContract,
  getGetContractQueryKey,
  getListContractsQueryKey,
  getGetContractsSummaryQueryKey
} from "@workspace/api-client-react";
import { 
  ContractType, 
  ContractStatus 
} from "@workspace/api-client-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
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
import { useToast } from "@/hooks/use-toast";
import { useUploadProgress } from "@/hooks/use-upload-progress";
import { UploadProgressOverlay } from "@/components/upload-progress";
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
import { UserAvatar } from "@/components/user-avatar";

const contractSchema = z.object({
  title: z.string().min(1, "Contract name is required"),
  type: z.enum(["SIS", "JMCS"] as const),
  serviceType: z.string().optional(),
  status: z.enum(["active", "pending", "completed", "expired"] as const),
  contractNumber: z.string().min(1, "Contract number is required"),
  clientName: z.string().min(1, "Client name is required"),
  startDate: z.string().min(1, "Start date is required"),
  endDate: z.string().min(1, "End date is required"),
  value: z.coerce.number().min(0, "Value must be positive"),
  description: z.string().optional().nullable(),
  assignedTo: z.string().optional().nullable(),
});

type ContractFormValues = z.infer<typeof contractSchema>;

function addYearsStr(dateStr: string, years: number): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  d.setFullYear(d.getFullYear() + years);
  return d.toISOString().split("T")[0];
}

export default function ContractDetail() {
  const [, params] = useRoute("/contracts/:id");
  const [location, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  
  const idStr = params?.id;
  const isNew = !idStr || idStr === "new";
  const id = isNew ? "" : idStr;
  const contractId = Number(id);

  const uploadProgress = useUploadProgress();
  const urlParams = new URLSearchParams(window.location.search);
  const [isEditing, setIsEditing] = useState(isNew || urlParams.get("edit") === "true");

  const canManage = user?.roles?.some(r => ["admin", "ADMIN", "IT", "officer"].includes(r)) || ["admin", "ADMIN", "IT", "officer"].includes(user?.role ?? "") || (user as any)?.canManageContracts;
  const isJmcsRestricted = !canManage && user?.canAccessJmcs && !user?.canAccessSis;
  const isSisRestricted = !canManage && user?.canAccessSis && !user?.canAccessJmcs;
  const defaultType = isJmcsRestricted ? "JMCS" : isSisRestricted ? "SIS" : "JMCS";

  const { data: contract, isLoading: isContractLoading } = useGetContract(id as any, {
    query: {
      enabled: !isNew && !!id,
      queryKey: getGetContractQueryKey(id as any),
    }
  });

  const createMutation = useCreateContract();
  const updateMutation = useUpdateContract();
  const deleteMutation = useDeleteContract();

  const form = useForm<ContractFormValues>({
    resolver: zodResolver(contractSchema),
    defaultValues: {
      title: "",
      type: defaultType,
      serviceType: "",
      status: "pending",
      contractNumber: "",
      clientName: "",
      startDate: format(new Date(), "yyyy-MM-dd"),
      endDate: format(new Date(new Date().setFullYear(new Date().getFullYear() + 1)), "yyyy-MM-dd"),
      value: 0,
      description: "",
      assignedTo: "",
    },
  });

  const initRef = useRef<number | null>(null);

  const watchedType = form.watch("type");
  const watchedStart = form.watch("startDate");
  const isSis = watchedType === "SIS";

  useEffect(() => {
    if (isSis && watchedStart) {
      form.setValue("endDate", addYearsStr(watchedStart, 3), { shouldDirty: true });
    }
  }, [isSis, watchedStart, form]);

  useEffect(() => {
    if (contract && !isNew && initRef.current !== contract.id) {
      initRef.current = contract.id;
      form.reset({
        title: contract.title,
        type: contract.type as any,
        serviceType: contract.serviceType || "",
        status: contract.status as any,
        contractNumber: contract.contractNumber,
        clientName: contract.clientName || "",
        startDate: contract.startDate.split('T')[0],
        endDate: contract.endDate.split('T')[0],
        value: contract.value,
        description: contract.description || "",
        assignedTo: contract.assignedTo || "",
      });
    }
  }, [contract, isNew, form]);

  const onSubmit = (data: ContractFormValues) => {
    if (isNew) {
      createMutation.mutate({ data: data as any }, {
        onSuccess: (newContract) => {
          queryClient.invalidateQueries({ queryKey: getListContractsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetContractsSummaryQueryKey() });
          toast({ title: "Contract created successfully" });
          setLocation(`/contracts/${newContract.id}`);
        },
        onError: () => {
          toast({ title: "Error creating contract", variant: "destructive" });
        }
      });
    } else {
      updateMutation.mutate({ id: contractId, data: data as any }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetContractQueryKey(contractId) });
          queryClient.invalidateQueries({ queryKey: getListContractsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetContractsSummaryQueryKey() });
          toast({ title: "Contract updated successfully" });
          setIsEditing(false);
        },
        onError: () => {
          toast({ title: "Error updating contract", variant: "destructive" });
        }
      });
    }
  };

  const handleDelete = () => {
    if (isNew) return;
    deleteMutation.mutate({ id: contractId }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListContractsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetContractsSummaryQueryKey() });
        toast({ title: "Contract deleted" });
        setLocation("/contracts");
      },
      onError: () => {
        toast({ title: "Error deleting contract", variant: "destructive" });
      }
    });
  };

  const isLoading = !isNew && isContractLoading;

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

  if (!isNew && !contract) {
    return (
      <div className="flex flex-col items-center justify-center h-[50vh] text-center">
        <Icon name="alert-circle" className="text-destructive mb-4" size={48} />
        <h2 className="text-2xl font-bold">Contract Not Found</h2>
        <p className="text-muted-foreground mt-2">The contract you are looking for does not exist or sorry you dont have permission to view this contract</p>
        <Button variant="outline" className="mt-6" asChild>
          <Link href="/contracts">Back to Contracts</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-300 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon" asChild>
            <Link href="/contracts">
              <Icon name="arrow-left" size={16} />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              {isNew ? "New Contract" : contract?.title}
            </h1>
            {!isNew && (
              <p className="text-muted-foreground font-mono text-sm">
                {contract?.contractNumber}
              </p>
            )}
            {!isNew && (contract as any)?.createdByName && (
              <div className="flex items-center gap-1.5 mt-0.5 text-xs text-muted-foreground/60">
                <UserAvatar name={(contract as any).createdByName} photoUrl={(contract as any).createdByPhotoUrl} className="h-5 w-5" fallbackClassName="bg-primary/10 text-primary text-[9px] font-semibold" />
                Created by {(contract as any).createdByName}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!isNew && !isEditing && canManage && (
            <>
              <Button variant="outline" onClick={() => setIsEditing(true)}>
                Edit Contract
              </Button>
            </>
          )}
          {!isNew && isEditing && (
            <Button variant="ghost" onClick={() => setIsEditing(false)}>
              Cancel
            </Button>
          )}
          {!isNew && canManage && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="icon">
                  <Icon name="trash-2" size={16} />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This action cannot be undone. This will permanently delete the contract
                    and remove it from our servers.
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
            <CardHeader className="border-b border-border">
              <CardTitle className="text-lg flex items-center gap-2">
                <Icon name="file-text" className="text-primary" size={20} />
                Contract Details
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem className="md:col-span-2">
                      <FormLabel>Contract Name</FormLabel>
                      <FormControl>
                        <Input {...field} disabled={!isEditing} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="contractNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Contract Number</FormLabel>
                      <FormControl>
                        <Input {...field} disabled={!isEditing} className="font-mono" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="clientName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-2">
                        <Icon name="building" className="text-muted-foreground" size={16} />
                        Client Name
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
                  name="type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Type</FormLabel>
                      <Select 
                        disabled={!isEditing || isJmcsRestricted || isSisRestricted}
                        onValueChange={field.onChange} 
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="SIS">SIS</SelectItem>
                          <SelectItem value="JMCS">JMCS</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="serviceType"
                  render={({ field }) => {
                    const watchedType = form.watch("type");
                    const jmcsServices = [
                      { value: "iso_9001_training", label: "ISO 9001 Training" },
                      { value: "iso_14001_training", label: "ISO 14001 Training" },
                      { value: "iso_45001_training", label: "ISO 45001 Training" },
                      { value: "iso_27001_training", label: "ISO 27001 Training" },
                      { value: "ims_training", label: "IMS Training" },
                      { value: "lead_auditor", label: "Lead Auditor" },
                      { value: "iso_consultancy", label: "ISO Consultancy" },
                    ];
                    const sisServices = [
                      { value: "iso_9001_certification", label: "ISO 9001 Certification" },
                      { value: "iso_14001_certification", label: "ISO 14001 Certification" },
                      { value: "iso_45001_certification", label: "ISO 45001 Certification" },
                      { value: "iso_27001_certification", label: "ISO 27001 Certification" },
                    ];
                    const services = watchedType === "JMCS" ? jmcsServices : watchedType === "SIS" ? sisServices : [];
                    return (
                      <FormItem style={!watchedType ? { display: 'none' } : undefined}>
                        <FormLabel>Service Type</FormLabel>
                        <Select
                          disabled={!isEditing}
                          onValueChange={field.onChange}
                          defaultValue={field.value || undefined}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select service" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {services.map(s => (
                              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    );
                  }}
                />
                
                <FormField
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Status</FormLabel>
                      <Select 
                        disabled={!isEditing} 
                        onValueChange={field.onChange} 
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select status" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="pending">Pending</SelectItem>
                          <SelectItem value="completed">Completed</SelectItem>
                          <SelectItem value="expired">Expired</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="startDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-2">
                        <Icon name="calendar" className="text-muted-foreground" size={16} />
                        Start Date
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
                  name="endDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-2">
                        <Icon name="calendar" className="text-muted-foreground" size={16} />
                        {isSis ? "End Date (auto)" : "End Date"}
                      </FormLabel>
                      <FormControl>
                        {isSis ? (
                          <div className="h-10 px-3 flex items-center text-sm font-medium rounded-md border border-input bg-muted text-muted-foreground whitespace-nowrap overflow-hidden">
                            {field.value ? format(new Date(field.value), "MMM d, yyyy") : "—"}
                            <span className="ml-2 text-[11px] text-muted-foreground/80">(renewed after 3 yrs)</span>
                          </div>
                        ) : (
                          <Input type="date" {...field} disabled={!isEditing} />
                        )}
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="value"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Value (₱)</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          {...field} 
                          disabled={!isEditing} 
                          onChange={e => field.onChange(parseFloat(e.target.value))}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="assignedTo"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-2">
                        <Icon name="user" className="text-muted-foreground" size={16} />
                        Assigned To
                      </FormLabel>
                      <FormControl>
                        <Input {...field} value={field.value || ""} disabled={!isEditing} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem className="md:col-span-2">
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea 
                          {...field} 
                          value={field.value || ""}
                          disabled={!isEditing} 
                          className="min-h-[120px]"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>

          {isEditing && (
            <div className="flex justify-end gap-4 sticky bottom-6 bg-background/80 backdrop-blur-sm p-4 rounded-lg border shadow-md">
              <Button type="button" variant="outline" onClick={() => setIsEditing(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending} variant="success">
                {(createMutation.isPending || updateMutation.isPending) ? "Saving..." : "Save Contract"}
                <Icon name="save" className="ml-2" size={16} />
              </Button>
            </div>
          )}
        </form>
      </Form>

      {!isNew && contract && (
        <div className="space-y-6">
          <Card className="surface rounded-lg">
            <CardHeader className="border-b">
              <CardTitle className="text-base flex items-center gap-2">
                <Icon name="file-text" className="text-primary" size={16} />
                Contract Document
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <div className="space-y-3">
                <CurrentDocument contract={contract as any} />
                {canManage && <UploadButton contractId={contract.id} uploadProgress={uploadProgress} />}
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="surface rounded-lg">
              <CardHeader className="border-b">
                <CardTitle className="text-base flex items-center gap-2">
                  <Icon name="rotate-ccw" className="text-primary" size={16} />
                  Renew Contract
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4">
                <p className="text-sm text-muted-foreground mb-4">
                  Create a renewed copy of this contract with a new period starting the day after the current end date.
                </p>
                <RenewButton contractId={contract.id} />
              </CardContent>
            </Card>

            <Card className="surface rounded-lg">
              <CardHeader className="border-b">
                <CardTitle className="text-base flex items-center gap-2">
                  <Icon name="history" className="text-primary" size={16} />
                  Contract Timeline
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4 max-h-[300px] overflow-y-auto">
                <TimelineView contractId={contract.id} />
              </CardContent>
            </Card>
          </div>
        </div>
      )}
      <UploadProgressOverlay uploading={uploadProgress.uploading} progress={uploadProgress.progress} fileName={uploadProgress.fileName} fileSize={uploadProgress.fileSize} onCancel={uploadProgress.cancelUpload} />
    </div>
  );
}

function RenewButton({ contractId }: { contractId: number }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  const renewMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/contracts/${contractId}/renew`, { method: "POST" });
      if (!res.ok) throw new Error("Failed to renew");
      return res.json();
    },
    onSuccess: (newContract) => {
      queryClient.invalidateQueries({ queryKey: getListContractsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetContractsSummaryQueryKey() });
      toast({ title: "Contract renewed", description: `New contract ID: ${newContract.id}` });
      setLocation(`/contracts/${newContract.id}`);
    },
    onError: () => toast({ title: "Failed to renew contract", variant: "destructive" }),
  });

  return (
    <Button onClick={() => renewMutation.mutate()} disabled={renewMutation.isPending} variant="outline" className="w-full">
      <Icon name="rotate-ccw" className="mr-2" size={16} />
      {renewMutation.isPending ? "Renewing..." : "One-Click Renew"}
    </Button>
  );
}

function UploadButton({ contractId, uploadProgress }: { contractId: number; uploadProgress: ReturnType<typeof useUploadProgress> }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      uploadProgress.startUpload(file.name, file.size);
      const res = await uploadProgress.uploadWithProgress(`/api/upload/contract/${contractId}`, formData);
      if (!res.ok) throw new Error("Upload failed");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: getGetContractQueryKey(contractId as any) });
      toast({ title: "File uploaded", description: data.filename });
    },
    onError: (e: Error) => toast({ title: "Upload failed", description: e.message, variant: "destructive" }),
  });

  return (
    <div>
      <input type="file" ref={fileRef} className="hidden" onChange={(e) => {
        if (e.target.files?.[0]) uploadMutation.mutate(e.target.files[0]);
      }} accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.jpg,.png,.txt" />
      <Button onClick={() => fileRef.current?.click()} disabled={uploadMutation.isPending} variant="outline" className="w-full">
        <Icon name="file-up" className="mr-2" size={16} />
        {uploadProgress.uploading ? `${uploadProgress.progress}%` : "Choose File"}
      </Button>
    </div>
  );
}

function CurrentDocument({ contract }: { contract: { documentName?: string | null; documentUrl?: string | null } }) {
  const name = contract.documentName ?? null;
  const url = contract.documentUrl ?? null;

  if (!name || !url) {
    return <p className="text-sm text-muted-foreground">No document uploaded yet.</p>;
  }

  const ext = name.split(".").pop()?.toLowerCase();
  const isImage = ["jpg", "jpeg", "png", "gif", "webp", "bmp"].includes(ext ?? "");

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex items-center gap-3 rounded-lg border border-border p-3 hover:bg-muted/40 transition-colors"
      title={name}
    >
      {isImage ? (
        <img src={url} alt={name} className="h-12 w-12 shrink-0 rounded-md border border-border object-cover" />
      ) : (
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md border border-border bg-muted/40">
          <Icon name="file-text" size={20} className="text-muted-foreground" />
        </span>
      )}
      <div className="min-w-0">
        <p className="text-sm font-medium truncate">{name}</p>
        <p className="text-xs text-primary">Open document</p>
      </div>
    </a>
  );
}

function TimelineView({ contractId }: { contractId: number }) {
  const { data: timeline, isLoading } = useQuery({
    queryKey: ["contract-timeline", contractId],
    queryFn: async () => {
      const res = await fetch(`/api/contracts/${contractId}/timeline`);
      if (!res.ok) throw new Error("Failed to fetch timeline");
      return res.json();
    },
  });

  if (isLoading) return <div className="space-y-3">{Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>;
  if (!timeline || timeline.length === 0) return <p className="text-sm text-muted-foreground text-center py-4">No history recorded yet.</p>;

  return (
    <div className="space-y-0">
      {timeline.map((entry: any, i: number) => (
        <div key={entry.id} className="flex gap-3 pb-3 relative">
          {i < timeline.length - 1 && <div className="absolute left-[5px] top-4 bottom-0 w-px bg-border" />}
          <div className="mt-1 flex h-2.5 w-2.5 shrink-0 items-center justify-center rounded-full bg-primary" />
          <div className="flex-1 min-w-0">
            <p className="text-sm">{entry.description}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{format(new Date(entry.timestamp), "MMM d, yyyy h:mm a")}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
