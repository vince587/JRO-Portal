import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { type EmployeeFormData } from "@/lib/hooks/use-hris";

const STATUS_OPTIONS = ["Regular", "Probationary", "Contractual", "Part-Time", "Intern"] as const;

interface EmployeeFormProps {
  data: EmployeeFormData;
  onChange: (data: EmployeeFormData) => void;
  users: Array<{ id: string; fullName?: string | null; username?: string; email?: string }>;
}

export function EmployeeForm({ data, onChange, users }: EmployeeFormProps) {
  const set = (key: keyof EmployeeFormData, value: string) =>
    onChange({ ...data, [key]: value });

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3 py-1">
      <div className="space-y-1.5">
        <Label>User Account *</Label>
        <Select value={data.userId} onValueChange={v => set("userId", v)}>
          <SelectTrigger>
            <SelectValue placeholder="Select user" />
          </SelectTrigger>
          <SelectContent>
            {users.map(u => (
              <SelectItem key={u.id} value={u.id}>
                {u.fullName || u.username || u.email || u.id}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label>Employee ID *</Label>
        <Input value={data.employeeId} onChange={e => set("employeeId", e.target.value)} placeholder="EMP-001" />
      </div>

      <div className="space-y-1.5">
        <Label>Position *</Label>
        <Input value={data.position} onChange={e => set("position", e.target.value)} placeholder="Software Engineer" />
      </div>

      <div className="space-y-1.5">
        <Label>Date Hired *</Label>
        <Input type="date" value={data.dateHired} onChange={e => set("dateHired", e.target.value)} />
      </div>

      <div className="space-y-1.5">
        <Label>Employment Status</Label>
        <Select value={data.employmentStatus} onValueChange={v => set("employmentStatus", v)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map(s => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label>Contact Number</Label>
        <Input value={data.contactNumber} onChange={e => set("contactNumber", e.target.value)} placeholder="+63..." />
      </div>

      <div className="space-y-1.5 sm:col-span-2">
        <Label>Address</Label>
        <Input value={data.address} onChange={e => set("address", e.target.value)} placeholder="Street, City" />
      </div>

      <div className="space-y-1.5">
        <Label>Emergency Contact</Label>
        <Input value={data.emergencyContact} onChange={e => set("emergencyContact", e.target.value)} />
      </div>

      <div className="space-y-1.5">
        <Label>Emergency #</Label>
        <Input value={data.emergencyContactNumber} onChange={e => set("emergencyContactNumber", e.target.value)} />
      </div>

      <div className="space-y-1.5 sm:col-span-2">
        <Label>Educational Attainment</Label>
        <Input value={data.educationalAttainment} onChange={e => set("educationalAttainment", e.target.value)} />
      </div>

      <div className="space-y-1.5">
        <Label>SSS Number</Label>
        <Input value={data.sssNumber} onChange={e => set("sssNumber", e.target.value)} />
      </div>

      <div className="space-y-1.5">
        <Label>TIN Number</Label>
        <Input value={data.tinNumber} onChange={e => set("tinNumber", e.target.value)} />
      </div>

      <div className="space-y-1.5">
        <Label>PhilHealth Number</Label>
        <Input value={data.philhealthNumber} onChange={e => set("philhealthNumber", e.target.value)} />
      </div>

      <div className="space-y-1.5">
        <Label>Pag-IBIG Number</Label>
        <Input value={data.pagibigNumber} onChange={e => set("pagibigNumber", e.target.value)} />
      </div>
    </div>
  );
}

export default EmployeeForm;
