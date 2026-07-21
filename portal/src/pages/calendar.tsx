import { useState, useEffect } from "react";
import { format, parseISO, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, isToday } from "date-fns";
import { Icon } from "@/components/ui/icon"
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";

import { useListEvents, getListEventsQueryKey } from "@workspace/api-client-react";
import { CalendarEventEventType, CalendarEventStatus } from "@workspace/api-client-react";
import type { CalendarEvent } from "@workspace/api-client-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { useAuth } from "@/lib/auth-context";
import { SaveProgressIndicator } from "@/components/upload-progress";

function toLocalDateStr(d: string) {
  const p = parseISO(d);
  return format(p, "yyyy-MM-dd");
}
function toLocalTimeStr(d: string) {
  return format(parseISO(d), "HH:mm");
}

const eventSchema = z.object({
  title: z.string().min(1, "Title is required"),
  eventType: z.enum(["meeting", "deadline", "training", "review", "other"] as const),
  status: z.enum(["confirmed", "tentative", "cancelled"] as const),
  date: z.string().min(1, "Date is required"),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  allDay: z.boolean(),
  location: z.string().optional(),
  description: z.string().optional(),
});

type EventFormValues = z.infer<typeof eventSchema>;

function EventDialog({ open, onOpenChange, defaultDate, editingEvent, onSuccess, canEdit }: { open: boolean; onOpenChange: (v: boolean) => void; defaultDate?: string; editingEvent?: CalendarEvent | null; onSuccess: () => void; canEdit: boolean }) {
  const { toast } = useToast();
  const isEditing = !!editingEvent;

  const form = useForm<EventFormValues>({
    resolver: zodResolver(eventSchema),
    defaultValues: {
      title: "",
      eventType: "meeting",
      status: "confirmed",
      date: format(new Date(), "yyyy-MM-dd"),
      startTime: "09:00",
      endTime: "10:00",
      allDay: false,
      location: "",
      description: "",
    },
  });

  useEffect(() => {
    if (!open) return;
    if (editingEvent) {
      form.reset({
        title: editingEvent.title,
        eventType: editingEvent.eventType,
        status: (editingEvent.status as "confirmed" | "tentative" | "cancelled") || "confirmed",
        date: toLocalDateStr(editingEvent.startDate),
        startTime: editingEvent.allDay ? "09:00" : toLocalTimeStr(editingEvent.startDate),
        endTime: editingEvent.endDate ? (editingEvent.allDay ? "10:00" : toLocalTimeStr(editingEvent.endDate)) : "10:00",
        allDay: editingEvent.allDay || false,
        location: editingEvent.location || "",
        description: editingEvent.description || "",
      });
    } else {
      form.reset({
        title: "",
        eventType: "meeting",
        status: "confirmed",
        date: defaultDate || format(new Date(), "yyyy-MM-dd"),
        startTime: "09:00",
        endTime: "10:00",
        allDay: false,
        location: "",
        description: "",
      });
    }
  }, [open, editingEvent, defaultDate, form]);

  const saveMutation = useMutation({
    mutationFn: async (data: EventFormValues) => {
      const startDate = data.allDay ? data.date : `${data.date}T${data.startTime}:00`;
      const endDate = data.allDay ? data.date : `${data.date}T${data.endTime}:00`;
      const body = { title: data.title, description: data.description, eventType: data.eventType, status: data.status, startDate, endDate, allDay: data.allDay, location: data.location };
      if (isEditing) {
        const res = await fetch(`/api/events/${editingEvent.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error("Failed to update event");
        return res.json();
      } else {
        const res = await fetch("/api/events", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error("Failed to create event");
        return res.json();
      }
    },
    onSuccess: () => {
      toast({ title: isEditing ? "Event updated" : "Event created" });
      onOpenChange(false);
      onSuccess();
    },
    onError: () => toast({ title: `Failed to ${isEditing ? "update" : "create"} event`, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/events/${editingEvent?.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete event");
    },
    onSuccess: () => {
      toast({ title: "Event deleted" });
      onOpenChange(false);
      onSuccess();
    },
    onError: () => toast({ title: "Failed to delete event", variant: "destructive" }),
  });

  const onSubmit = (data: EventFormValues) => {
    saveMutation.mutate(data);
  };

  const allDay = form.watch("allDay");

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Event" : `New Event${defaultDate ? ` — ${format(parseISO(defaultDate), "MMM d, yyyy")}` : ""}`}</DialogTitle>
          <DialogDescription>{isEditing ? "Update or delete this event." : "Create a new calendar event."}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-2">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Title *</FormLabel>
                  <FormControl><Input {...field} placeholder="Event title" disabled={!canEdit} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="eventType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Type</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value} disabled={!canEdit}>
                    <FormControl>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="meeting">Meeting</SelectItem>
                      <SelectItem value="deadline">Deadline</SelectItem>
                      <SelectItem value="training">Training</SelectItem>
                      <SelectItem value="review">Review</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                   </Select>
                   <FormMessage />
                 </FormItem>
               )}
             />
             <FormField
               control={form.control}
               name="status"
               render={({ field }) => (
                 <FormItem>
                   <FormLabel>Status</FormLabel>
                     <Select onValueChange={field.onChange} value={field.value} disabled={!canEdit}>
                     <FormControl>
                       <SelectTrigger><SelectValue /></SelectTrigger>
                     </FormControl>
                     <SelectContent>
                       <SelectItem value="confirmed">Confirmed</SelectItem>
                       <SelectItem value="tentative">Tentative</SelectItem>
                       <SelectItem value="cancelled">Cancelled</SelectItem>
                     </SelectContent>
                   </Select>
                   <FormMessage />
                 </FormItem>
               )}
             />
            <FormField
              control={form.control}
              name="allDay"
              render={({ field }) => (
                <FormItem className="flex items-center gap-2">
                  <FormControl>
                    <input type="checkbox" checked={field.value} onChange={e => field.onChange(e.target.checked)} disabled={!canEdit} className="h-4 w-4 rounded border-gray-300" />
                  </FormControl>
                  <FormLabel className="m-0">All day</FormLabel>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Date *</FormLabel>
                   <FormControl><Input type="date" {...field} disabled={!canEdit} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {!allDay && (
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="startTime"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Start Time</FormLabel>
                   <FormControl><Input type="time" {...field} disabled={!canEdit} /></FormControl>
                   <FormMessage />
                 </FormItem>
               )}
             />
             <FormField
               control={form.control}
               name="endTime"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>End Time</FormLabel>
                   <FormControl><Input type="time" {...field} disabled={!canEdit} /></FormControl>
                   <FormMessage />
                 </FormItem>
               )}
                />
              </div>
            )}
            <FormField
              control={form.control}
              name="location"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Location</FormLabel>
                   <FormControl><Input {...field} placeholder="Room / link" disabled={!canEdit} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                   <FormControl><Textarea {...field} placeholder="Optional description" disabled={!canEdit} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter className={isEditing ? "justify-between !mt-6" : "!mt-6"}>
              {canEdit ? (
                isEditing ? (
                  <>
                    <Button type="button" variant="outline" className="text-red-500 border-red-200 hover:bg-red-50 dark:hover:bg-red-950" onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending}>
                      <Icon name="trash-2" className="mr-1" size={16} /> {deleteMutation.isPending ? "Deleting..." : "Delete"}
                    </Button>
                    <div className="flex gap-2">
                      <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                      <Button type="submit" disabled={saveMutation.isPending}>
                        {saveMutation.isPending ? "Saving..." : "Save"}
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button type="submit" disabled={saveMutation.isPending}>
                      {saveMutation.isPending ? "Creating..." : "Create"}
                    </Button>
                  </>
                )
              ) : (
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
              )}
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
    <SaveProgressIndicator saving={saveMutation.isPending} label="Saving event..." />
    </>
  );
}

export default function Calendar() {
  const { user } = useAuth();
  const isAdmin = user?.roles?.some(r => ["admin", "ADMIN", "IT", "manager"].includes(r)) || ["admin", "ADMIN", "IT", "manager"].includes(user?.role ?? "");
  const canEdit = isAdmin || !!user?.canEditCalendar;
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<"grid" | "list">("grid");
  const [eventDialogOpen, setEventDialogOpen] = useState(false);
  const [eventDialogDate, setEventDialogDate] = useState<string | undefined>(undefined);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const queryClient = useQueryClient();

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  
  const fromStr = startOfWeek(monthStart).toISOString();
  const toStr = endOfWeek(monthEnd).toISOString();

  const { data: events, isLoading } = useListEvents({
    from: fromStr,
    to: toStr
  });

  const refetchEvents = () => {
    queryClient.invalidateQueries({ queryKey: getListEventsQueryKey() });
  };

  const nextMonth = () => setCurrentDate(addMonths(currentDate, 1));
  const prevMonth = () => setCurrentDate(subMonths(currentDate, 1));
  const today = () => setCurrentDate(new Date());

  const openNewEvent = (date?: string) => {
    setEditingEvent(null);
    setEventDialogDate(date);
    setEventDialogOpen(true);
  };

  const openEditEvent = (event: CalendarEvent) => {
    setEditingEvent(event);
    setEventDialogDate(undefined);
    setEventDialogOpen(true);
  };

  const getEventTypeColor = (type: CalendarEventEventType) => {
    switch (type) {
      case "meeting": return "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800";
      case "deadline": return "bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800";
      case "training": return "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800";
      case "review": return "bg-indigo-100 text-indigo-800 border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-300 dark:border-indigo-800";
      default: return "bg-slate-100 text-slate-800 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700";
    }
  };

  const getStatusColor = (status?: string | null) => {
    switch (status) {
      case "confirmed": return "bg-emerald-500 text-white border-emerald-500";
      case "tentative": return "bg-amber-500 text-white border-amber-500";
      case "cancelled": return "bg-rose-500 text-white border-rose-500 line-through";
      default: return "bg-slate-400 text-white border-slate-400";
    }
  };

  const getStatusLabel = (status?: string | null) => {
    switch (status) {
      case "confirmed": return "Confirmed";
      case "tentative": return "Tentative";
      case "cancelled": return "Cancelled";
      default: return "Unconfirmed";
    }
  };

  const renderGrid = () => {
    const startDate = startOfWeek(monthStart);
    const endDate = endOfWeek(monthEnd);
    const days = eachDayOfInterval({ start: startDate, end: endDate });
    const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    return (
      <div className="neu rounded-2xl overflow-hidden">
        <div className="grid grid-cols-7 border-b neu-inset rounded-xl">
          {weekDays.map(day => (
            <div key={day} className="py-2 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              {day}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 bg-border gap-px">
            {days.map(day => {
              const dayKey = format(day, "yyyy-MM-dd");
              const dayEvents = events?.filter(e => isSameDay(parseISO(e.startDate), day)) || [];
              const isCurrentMonth = isSameMonth(day, currentDate);
              const isCurrentDay = isToday(day);

              return (
                <Tooltip key={day.toString()}>
                  <TooltipTrigger asChild>
                     <div 
                       onClick={() => { if (canEdit) openNewEvent(dayKey); }}
                       className={`min-h-[120px] bg-card p-2 transition-colors ${canEdit ? 'cursor-pointer hover:bg-muted/10' : ''} ${!isCurrentMonth ? 'opacity-50 bg-muted/5' : ''}`}
                     >
                      <div className="flex justify-between items-start">
                        <span className={`text-sm font-medium w-7 h-7 flex items-center justify-center rounded-full ${isCurrentDay ? 'bg-primary text-primary-foreground shadow-sm' : ''}`}>
                          {format(day, 'd')}
                        </span>
                        {dayEvents.length > 0 && (
                          <span className="text-[10px] text-muted-foreground font-medium">{dayEvents.length}</span>
                        )}
                      </div>
                      
                      <div className="mt-2 flex flex-col gap-1.5">
                        {isLoading ? (
                          <Skeleton className="h-5 w-full rounded" />
                        ) : (
                          dayEvents.slice(0, 4).map(event => (
                             <div 
                               key={event.id} 
                                onClick={e => { e.stopPropagation(); if (canEdit) openEditEvent(event); }}
                               className={`text-[10px] px-1.5 py-1 rounded border font-medium break-words whitespace-normal leading-tight ${canEdit ? 'cursor-pointer hover:opacity-80' : ''} ${getStatusColor(event.status)}`}
                               title={`${event.title} — ${getStatusLabel(event.status)}`}
                             >
                              {!event.allDay && <span className="mr-1 opacity-70">{format(parseISO(event.startDate), 'HH:mm')}</span>}
                              {event.title}
                            </div>
                          ))
                        )}
                        {dayEvents.length > 4 && (
                          <div className="text-[10px] font-medium text-muted-foreground pl-1">
                            +{dayEvents.length - 4} more
                          </div>
                        )}
                      </div>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">
                    View schedule for {format(day, "MMM d")}
                  </TooltipContent>
                </Tooltip>
              );
            })}
         </div>
      </div>
    );
  };

  const renderList = () => {
    if (isLoading) {
      return (
        <div className="space-y-4">
          {Array(4).fill(0).map((_, i) => (
            <Card key={i} className="neu rounded-2xl">
              <CardContent className="p-4 flex gap-4">
                <Skeleton className="h-16 w-16 rounded" />
                <div className="space-y-2 flex-1">
                  <Skeleton className="h-5 w-1/3" />
                  <Skeleton className="h-4 w-1/4" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      );
    }

    const currentMonthEvents = events?.filter(e => isSameMonth(parseISO(e.startDate), currentDate))
      .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime()) || [];

    if (currentMonthEvents.length === 0) {
      return (
        <Card className="neu rounded-2xl">
          <CardContent className="h-64 flex flex-col items-center justify-center text-center">
            <Icon name="calendar" className="text-muted-foreground/30 mb-4" size={48} />
            <p className="text-lg font-medium">No events this month</p>
            <p className="text-muted-foreground mt-1">There are no scheduled events for {format(currentDate, "MMMM yyyy")}.</p>
          </CardContent>
        </Card>
      );
    }

    return (
      <div className="space-y-4">
        {currentMonthEvents.map(event => {
          const startDate = parseISO(event.startDate);
           return (
              <Card key={event.id} className={`neu rounded-2xl overflow-hidden ${canEdit ? 'cursor-pointer hover:bg-muted/10 transition-colors' : ''}`} onClick={() => { if (canEdit) openEditEvent(event); }}>
              <div className="flex flex-col sm:flex-row">
                <div className="w-full sm:w-32 bg-muted/30 p-4 flex sm:flex-col items-center justify-center border-b sm:border-b-0 sm:border-r gap-2 sm:gap-0">
                  <span className="text-sm font-bold text-muted-foreground uppercase">{format(startDate, 'MMM')}</span>
                  <span className="text-3xl font-bold">{format(startDate, 'dd')}</span>
                  <span className="text-xs font-medium text-muted-foreground">{format(startDate, 'EEEE')}</span>
                </div>
                <div className="flex-1 p-5">
                  <div className="flex justify-between items-start mb-2 gap-2">
                    <h3 className="text-lg font-semibold">{event.title}</h3>
                    <div className="flex gap-2 shrink-0">
                      <Badge variant="outline" className={`capitalize ${getStatusColor(event.status)}`}>
                        {getStatusLabel(event.status)}
                      </Badge>
                      <Badge variant="outline" className={`capitalize ${getEventTypeColor(event.eventType)}`}>
                        {event.eventType}
                      </Badge>
                    </div>
                  </div>
                  {event.description && (
                    <p className="text-sm text-muted-foreground mb-4">{event.description}</p>
                  )}
                  <div className="flex flex-wrap gap-4 text-sm font-medium text-muted-foreground mt-auto pt-2 border-t">
                    <div className="flex items-center gap-1.5">
                      <Icon name="clock" size={16} />
                      {event.allDay ? "All Day" : format(startDate, 'h:mm a')}
                      {event.endDate && !event.allDay && ` - ${format(parseISO(event.endDate), 'h:mm a')}`}
                    </div>
                    {event.location && (
                      <div className="flex items-center gap-1.5">
                        <Icon name="map-pin" size={16} />
                        {event.location}
                      </div>
                    )}
                    {event.relatedTo && (
                      <div className="flex items-center gap-1.5">
                        <Icon name="list-todo" size={16} />
                        {event.relatedTo}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    );
  };

  const statusLegend = [
    { key: "confirmed", label: "Confirmed", cls: getStatusColor("confirmed") },
    { key: "tentative", label: "Tentative", cls: getStatusColor("tentative") },
    { key: "cancelled", label: "Cancelled", cls: getStatusColor("cancelled") },
  ] as const;

  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-6xl mx-auto" id="calendar-page">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Icon name="calendar" className="text-emerald-500" size={28} />
            Calendar
          </h1>
          <p className="text-muted-foreground mt-1">
            Schedule and track organizational events and deadlines.
          </p>
        </div>
        <div className="no-print flex items-center gap-2">
          {canEdit && (
            <Button onClick={() => openNewEvent()}>
              <Icon name="plus" className="mr-2" size={16} />
              New Event
            </Button>
          )}
          <Button variant="outline" onClick={async () => { try { await (window as any).electronAPI?.print?.(); } catch { window.print(); } }}>
            <Icon name="printer" className="mr-2" size={16} /> Print
          </Button>
        </div>
        <EventDialog open={eventDialogOpen} onOpenChange={setEventDialogOpen} defaultDate={eventDialogDate} editingEvent={editingEvent} onSuccess={refetchEvents} canEdit={canEdit} />
      </div>

      <div className="flex flex-wrap items-center gap-2 no-print">
        {statusLegend.map(s => (
          <span key={s.key} className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-md border ${s.cls}`}>
            <span className="h-2 w-2 rounded-full bg-white opacity-80" />
            {s.label}
          </span>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row justify-between items-center gap-4 bg-card p-4 rounded-2xl border neu no-print">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={prevMonth}>
            <Icon name="chevron-left" size={16} />
          </Button>
          <Button variant="outline" onClick={today}>Today</Button>
          <Button variant="outline" size="icon" onClick={nextMonth}>
            <Icon name="chevron-right" size={16} />
          </Button>
          <h2 className="text-xl font-bold ml-4 min-w-[150px]">
            {format(currentDate, "MMMM yyyy")}
          </h2>
        </div>
        
        <Tabs value={view} onValueChange={(v) => setView(v as any)}>
          <TabsList>
            <TabsTrigger value="grid" className="flex gap-2">
              <Icon name="calendar" size={16} /> Grid
            </TabsTrigger>
            <TabsTrigger value="list" className="flex gap-2">
              <Icon name="list-todo" size={16} /> List
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {view === "grid" ? renderGrid() : renderList()}

      <style>{`
        @media print {
          html, body { background: #fff !important; }
          .no-print { display: none !important; }
          [data-sidebar], header, nav, aside, footer { display: none !important; }
          [role="dialog"], [data-radix-popper-content-wrapper] { display: none !important; }
          #calendar-page { max-width: 100% !important; margin: 0 !important; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          .border { border-color: #cbd5e1 !important; }
        }
      `}</style>
    </div>
  );
}
