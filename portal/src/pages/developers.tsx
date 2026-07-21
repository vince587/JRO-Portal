import { useState } from "react";
import { format } from "date-fns";
import { Icon } from "@/components/ui/icon"

import { useListUsers, useGetMe, getListUsersQueryKey } from "@workspace/api-client-react";
import { UserRole } from "@workspace/api-client-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { hasConfig as hasFirebase } from "@/lib/firebase";
import { useFirebaseUpload } from "@/hooks/use-firebase-upload";
import { UploadProgressOverlay } from "@/components/upload-progress";

const DEPARTMENTS = ["SIS", "JMCS", "Both"] as const;

const ALL_ROLES = ["staff", "manager", "IT", "ADMIN"] as const;

type UserFormData = {
  username: string;
  email: string;
  password: string;
  fullName: string;
  roles: string[];
  department: string;
  photoUrl: string;
  canAccessSis: boolean;
  canAccessJmcs: boolean;
  canEditCalendar: boolean;
  canEditTrainingProposal: boolean;
  canManageContracts: boolean;
  canManageCertificates: boolean;
  canAccessProjects: boolean;
  canAccessAdmin: boolean;
};

function guessGender(name: string): "male" | "female" {
  const first = name.trim().split(/\s+/)[0]?.toLowerCase() || "";
  if (!first) return "male";
  const feminine = [
    "mary", "maria", "jane", "anne", "ann", "joan", "joann", "diane", "rose", "grace",
    "joy", "joyce", "faith", "hope", "love", "princess", "princezz",
    "angela", "angeline", "catherine", "katherine", "kathryn", "elizabeth", "elisa",
    "isabel", "isabella", "jessica", "jennifer", "ashley", "julia", "julie",
    "samantha", "amanda", "stephanie", "nicole", "michelle", "danielle",
    "christine", "kristine", "tiffany", "megan", "lauren", "sarah", "sara",
    "rebecca", "rachel", "rachael", "kimberly", "kimberley", "emily", "emma",
    "olivia", "sophia", "sophie", "chloe", "mia", "charlotte", "amelia",
    "harper", "evelyn", "abigail", "ella", "avery", "scarlett", "victoria",
    "madison", "lily", "luna", "layla", "penelope", "zoey", "zoe",
    "hana", "hanna", "hannah", "gina", "tina", "cristina", "christina",
    "julie", "julia", "juliana", "liza", "lisa", "lena", "leila", "layla",
    "alexa", "alexandra", "alessandra", "andrea", "mae", "may", "june", "april",
    "lourdes", "concepcion", "consuelo", "esperanza", "mercedes", "dolores",
    "teresita", "teresa", "theresa", "guadalupe", "nieves", "luzviminda",
    "corazon", "pilar", "milagros", "caridad", "soledad", "rosario",
    "carmencita", "marcela", "marcelina", "francisca", "francine",
    "gabriela", "gabrielle", "danica", "dannica", "janice", "janine",
    "jocelyn", "joselyn", "geraldine", "jacqueline", "evangeline",
    "carmela", "carmen", "celia", "cecilia", "lucia", "lucila", "lucille",
    "estela", "estella", "esther", "nora", "norah", "norma", "nancy",
    "lindsay", "lindsey", "wendy", "melody", "mindy", "cindy", "lindy",
    "abby", "addie", "bonnie", "connie", "daisy", "ellie", "fanny", "gabby",
    "hazel", "ivy", "jade", "kay", "kaye", "lea", "leah", "lynn", "lynette",
    "malou", "maricel", "maricris", "marilou", "marivic", "myra", "myrna",
    "nenita", "ning", "nita", "riza", "rhea", "rovie", "rowena", "sheila",
    "shirley", "teresa", "trixie", "vilma", "virgie", "vivian", "yolly", "zenaida",
    "aisa", "aisha", "aysa", "bella", "belle", "carla", "carlo", "donna",
    "erica", "erika", "faye", "fiona", "flor", "flora", "florence",
    "gemma", "genevieve", "georgia", "glenda", "gloria", "gwendolyn",
    "iris", "irma", "jasmine", "jazmin", "jean", "jeanne", "jenna",
    "jill", "jillian", "jo", "jodie", "jody", "josefina", "josephine",
    "josie", "jude", "judith", "judy", "juliet", "karen", "karin",
    "karla", "kate", "kathy", "katrina", "kayla", "kelsey", "krista",
    "kristen", "kristina", "kylie", "lara", "laura", "laurie", "leslie",
    "lilian", "lillian", "linda", "lindsay", "lisa", "lorena", "lorenza",
    "louise", "lucy", "lydia", "lynn", "lynne", "maggie", "mamie",
    "mara", "marcia", "margaret", "margie", "mari", "marian", "mariana",
    "marianne", "maribel", "maricel", "marie", "mariel", "marilyn",
    "marina", "marissa", "martha", "marty", "mary", "maureen", "maxine",
    "may", "megan", "melanie", "melissa", "mercy", "meredith", "mia",
    "michaela", "michelle", "midori", "mildred", "millie", "minda",
    "miriam", "miranda", "molly", "mona", "monica", "monique",
  ];
  const masculine = [
    "john", "jhon", "juan", "joshua", "josue", "jose", "joseph", "joe",
    "james", "jim", "jimmy", "jesus", "julius", "julian", "justin",
    "michael", "micheal", "mike", "mark", "matthew", "matt", "mat",
    "david", "daniel", "dan", "danny", "dave", "donald", "dennis",
    "robert", "bob", "bobby", "rob", "robin", "roberto", "roy",
    "william", "will", "willy", "willie", "bill", "billy",
    "richard", "dick", "ricky", "richie", "rick",
    "thomas", "tom", "tommy", "tomas",
    "anthony", "tony", "antonio",
    "charles", "charlie", "chuck",
    "christopher", "chris", "christian", "cristian", "cristofer",
    "andrew", "andres", "andy", "drew",
    "steven", "stephen", "steve", "steven",
    "kevin", "kenneth", "ken", "kenny",
    "brian", "bryan", "ryan", "raymond", "raymund",
    "peter", "pete", "pedro", "pablo",
    "george", "jorge",
    "edward", "eddie", "ed", "eduardo", "edwin",
    "francis", "francisco", "frank", "franklin",
    "lawrence", "lawrence", "larry",
    "joseph", "joey",
    "jason", "jay",
    "adam", "albert", "alan", "allen", "allan",
    "bernard", "bernie", "benedict", "ben", "benito", "benjamin",
    "carlos", "carl", "calvin", "carlo",
    "cesar", "cedric", "cris", "crisostomo",
    "dante", "darwin", "derek", "domingo", "dominador", "dominico",
    "edgar", "edison", "edmundo", "elmer", "elpidio", "emerson", "emilio",
    "enrico", "enrique", "ernest", "ernesto", "eugene", "eugenio",
    "felipe", "felix", "ferdinand", "fernando", "florencio",
    "gabriel", "gab", "gabby", "genesis", "genaro", "gilbert", "gilberto",
    "gonzalo", "gregorio", "gregory", "greg",
    "harold", "harry", "henry", "herbert", "hermie", "hilario",
    "ignacio", "isagani", "ismael", "isidro",
    "jacob", "jaime", "jake", "jeff", "jeffrey", "jeffry",
    "jeremiah", "jeremy", "jerome", "jerry", "jessie", "joel",
    "johnny", "jonah", "jonas", "jonathan", "jonel", "jordan",
    "karl", "keith", "kyle",
    "lance", "laurence", "lee", "leo", "leonardo", "leonel", "leopoldo",
    "lester", "levi", "liam", "lino", "lionel", "lito", "lloyd",
    "louie", "louis", "lucas", "lucio", "ludwig", "luigi", "luis",
    "manuel", "marc", "marcelo", "marcus", "mario", "marlon", "marvin",
    "max", "maxim", "maximo", "melchor", "melvin", "michael", "miguel",
    "mike", "milton", "moises", "morgan", "moses",
    "nathan", "nathaniel", "nelly", "nelson", "neil", "nicholas", "nick",
    "nico", "nicolas", "nilo", "noah", "noel", "norberto", "norman",
    "oliver", "omar", "orlando", "oscar", "oswald", "otto",
    "patrick", "pat", "paul", "paulo",
    "percy", "perry", "philip", "phillip", "prince",
    "quinn", "quintin",
    "rafael", "ralph", "ramon", "randall", "randolph", "randy", "raphael",
    "raul", "raymond", "reggie", "renato", "rene", "reuben", "rex",
    "reynaldo", "rey", "rider", "rigoberto", "robert", "roberto",
    "roderick", "rodney", "rodolfo", "rodrigo", "rogelio", "roger",
    "rolando", "roman", "romeo", "ronald", "ron", "ronnie", "rory",
    "rosendo", "ruel", "russel", "russell",
    "salvador", "sam", "sammy", "samuel", "santiago", "santo",
    "scott", "sean", "sebastian", "serge", "sergio", "shane", "shaun",
    "sidney", "silverio", "simon", "solomon", "spencer", "stanley",
    "stephen", "steve", "steven", "stewart",
    "ted", "teddy", "terence", "terrence", "terry", "teodoro", "theo",
    "tim", "timmy", "timothy", "tito", "toby", "todd", "tom", "tomas",
    "tony", "tristan", "troy", "tyler",
    "ulysses", "uriel",
    "val", "valentin", "valentine", "van", "vaughn", "vic", "vicente",
    "victor", "vince", "vincent", "virgilio",
    "walter", "warren", "wayne", "wesley", "wilbert", "wilfred", "wilfredo",
    "william", "willie", "wilmer", "winston",
    "zachary", "zach",
  ];
  if (feminine.includes(first)) return "female";
  if (masculine.includes(first)) return "male";
  if (first.endsWith("a") || first.endsWith("i")) return "female";
  if (first.endsWith("o") || first.endsWith("or")) return "male";
  return "male";
}

function hasRole(user: { role: string; roles?: string[] }, ...roles: string[]) {
  if (roles.includes(user.role)) return true;
  if (user.roles?.some(r => roles.includes(r))) return true;
  return false;
}

const EMPTY_USER_FORM: UserFormData = {
  username: "",
  email: "",
  password: "",
  fullName: "",
  roles: ["staff"],
  department: "",
  photoUrl: "",
  canAccessSis: false,
  canAccessJmcs: false,
  canEditCalendar: false,
  canEditTrainingProposal: false,
  canManageContracts: false,
  canManageCertificates: false,
  canAccessProjects: false,
  canAccessAdmin: false,
};

const PermissionSection = ({
  data,
  onChange,
}: {
  data: UserFormData;
  onChange: (d: UserFormData) => void;
}) => (
  <div className="space-y-4 border rounded-lg p-4 bg-muted/10">
    <div className="flex items-center gap-2 font-medium text-sm">
      <Icon name="lock" className="text-muted-foreground" size={16} />
      Module Access Permissions
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div className="flex items-center justify-between rounded-lg border p-3 bg-background">
        <div>
          <Label className="text-sm font-medium">SIS Contracts</Label>
          <p className="text-xs text-muted-foreground">Can view and edit SIS contracts</p>
        </div>
        <Switch checked={data.canAccessSis} onCheckedChange={v => onChange({ ...data, canAccessSis: v })} />
      </div>
      <div className="flex items-center justify-between rounded-lg border p-3 bg-background">
        <div>
          <Label className="text-sm font-medium">JMCS Contracts</Label>
          <p className="text-xs text-muted-foreground">Can view and edit JMCS contracts</p>
        </div>
        <Switch checked={data.canAccessJmcs} onCheckedChange={v => onChange({ ...data, canAccessJmcs: v })} />
      </div>
      <div className="flex items-center justify-between rounded-lg border p-3 bg-background">
        <div>
          <Label className="text-sm font-medium">Calendar</Label>
          <p className="text-xs text-muted-foreground">Can add and edit calendar events</p>
        </div>
        <Switch checked={data.canEditCalendar} onCheckedChange={v => onChange({ ...data, canEditCalendar: v })} />
      </div>
      <div className="flex items-center justify-between rounded-lg border p-3 bg-background">
        <div>
          <Label className="text-sm font-medium">Training Proposals</Label>
          <p className="text-xs text-muted-foreground">Can edit Training and Consultancy Proposals</p>
        </div>
        <Switch checked={data.canEditTrainingProposal} onCheckedChange={v => onChange({ ...data, canEditTrainingProposal: v })} />
      </div>
      <div className="flex items-center justify-between rounded-lg border p-3 bg-background">
        <div>
          <Label className="text-sm font-medium">Manage Contracts</Label>
          <p className="text-xs text-muted-foreground">Can create and edit contracts (Officer-level)</p>
        </div>
        <Switch checked={data.canManageContracts} onCheckedChange={v => onChange({ ...data, canManageContracts: v })} />
      </div>
      <div className="flex items-center justify-between rounded-lg border p-3 bg-background">
        <div>
          <Label className="text-sm font-medium">Manage Certificates</Label>
          <p className="text-xs text-muted-foreground">Can create, edit, and delete certificates</p>
        </div>
        <Switch checked={data.canManageCertificates} onCheckedChange={v => onChange({ ...data, canManageCertificates: v })} />
      </div>
      <div className="flex items-center justify-between rounded-lg border p-3 bg-background">
        <div>
          <Label className="text-sm font-medium">Projects</Label>
          <p className="text-xs text-muted-foreground">Can view and manage projects</p>
        </div>
        <Switch checked={data.canAccessProjects} onCheckedChange={v => onChange({ ...data, canAccessProjects: v })} />
      </div>
      <div className="flex items-center justify-between rounded-lg border p-3 bg-background">
        <div>
          <Label className="text-sm font-medium">Company Admin</Label>
          <p className="text-xs text-muted-foreground">Can access the Company Admin page</p>
        </div>
        <Switch checked={data.canAccessAdmin} onCheckedChange={v => onChange({ ...data, canAccessAdmin: v })} />
      </div>
    </div>
  </div>
);

const UserForm = ({
  data,
  onChange,
  isEdit,
  photoUrl,
  setPhotoUrl,
  photoUploading,
  setPhotoUploading,
}: {
  data: UserFormData;
  onChange: (d: UserFormData) => void;
  isEdit?: boolean;
  photoUrl: string | null;
  setPhotoUrl: (url: string | null) => void;
  photoUploading: boolean;
  setPhotoUploading: (uploading: boolean) => void;
}) => {
  const { toast } = useToast();
  const { progress: uploadProgress, uploading: firebaseUploading, fileName: uploadFileName, fileSize: uploadFileSize, upload } = useFirebaseUpload();
  return (
    <div className="space-y-4 py-2">
      {!isEdit && (
        <div className="space-y-2">
          <Label>Username</Label>
          <Input value={data.username} onChange={e => onChange({ ...data, username: e.target.value })} placeholder="jdoe" />
        </div>
      )}
      <div className="space-y-2">
        <Label>Full Name</Label>
        <Input value={data.fullName} onChange={e => onChange({ ...data, fullName: e.target.value })} placeholder="Jane Doe" />
      </div>
      <div className="space-y-2">
        <Label>Email</Label>
        <Input type="email" value={data.email} onChange={e => onChange({ ...data, email: e.target.value })} placeholder="jane@example.com" />
      </div>
      {!isEdit && (
        <div className="space-y-2">
          <Label>Password</Label>
          <Input type="password" value={data.password} onChange={e => onChange({ ...data, password: e.target.value })} placeholder="Min 6 characters" />
        </div>
      )}
      <div className="space-y-2">
        <Label>Role</Label>
        <Select value={data.roles[0]} onValueChange={v => onChange({ ...data, roles: [v] })}>
          <SelectTrigger><SelectValue placeholder="Select role" /></SelectTrigger>
          <SelectContent>
            {ALL_ROLES.map(role => (
              <SelectItem key={role} value={role}>{role === "ADMIN" ? role : role.charAt(0).toUpperCase() + role.slice(1)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Company</Label>
        <Select value={data.department || ""} onValueChange={v => {
          const canSis = v === "SIS" || v === "Both";
          const canJmcs = v === "JMCS" || v === "Both";
          onChange({ ...data, department: v, canAccessSis: canSis, canAccessJmcs: canJmcs });
        }}>
          <SelectTrigger><SelectValue placeholder="Select company" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="SIS">SIS</SelectItem>
            <SelectItem value="JMCS">JMCS</SelectItem>
            <SelectItem value="Both">Both</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {hasFirebase && (
        <div className="space-y-2">
          <Label>Profile Photo</Label>
          <div className="flex items-center gap-3">
            <Button type="button" variant="outline" size="sm" disabled={firebaseUploading} onClick={async () => {
              const input = document.createElement("input");
              input.type = "file";
              input.accept = "image/*";
              input.onchange = async () => {
                const file = input.files?.[0];
                if (!file) return;
                try {
                  const path = `employees/${data.username || "new"}/${Date.now()}_${file.name}`;
                  const url = await upload(file, path);
                  setPhotoUrl(url);
                  onChange({ ...data, photoUrl: url });
                  toast({ title: "Photo uploaded" });
                } catch (e: any) {
                  toast({ title: "Upload failed", description: e.message, variant: "destructive" });
                }
              };
              input.click();
            }}>
              <Icon name="upload" className="mr-1" size={16} />
              {firebaseUploading ? `${uploadProgress}%` : "Upload Photo"}
            </Button>
            {photoUrl && <span className="text-xs text-muted-foreground truncate max-w-[200px]">Photo saved</span>}
          </div>
        </div>
      )}
      <PermissionSection data={data} onChange={onChange} />
      <UploadProgressOverlay uploading={firebaseUploading} progress={uploadProgress} fileName={uploadFileName} fileSize={uploadFileSize} />
    </div>
  );
};

export default function Developers() {
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [deptFilter, setDeptFilter] = useState("");
  const { data: currentUser } = useGetMe();
  const { data: users, isLoading } = useListUsers();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editUser, setEditUser] = useState<any>(null);
  const [formData, setFormData] = useState<UserFormData>({ ...EMPTY_USER_FORM });
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const payload = { ...data, role: data.roles?.[0] || "staff" };
      if (!payload.photoUrl && payload.fullName) {
        payload.photoUrl = guessGender(payload.fullName) === "female" ? "/w.png" : "/hi.png";
      }
      const res = await fetch("/api/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || `Failed to create user (${res.status})`);
      }
      return res.json();
    },
    onSuccess: async (newUser) => {
      queryClient.setQueryData(getListUsersQueryKey(), (old: any) => {
        if (!Array.isArray(old)) return [newUser];
        return [newUser, ...old];
      });
      await queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
      setAddDialogOpen(false);
      setFormData({ ...EMPTY_USER_FORM });
      setPhotoUrl(null);
      toast({ title: "User created" });
    },
    onError: (e: Error) => toast({ title: "Failed to create user", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const res = await fetch(`/api/users/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || `Failed to update user (${res.status})`);
      }
      return res.json();
    },
    onSuccess: async (updatedUser) => {
      const targetId = String(updatedUser.id);
      queryClient.setQueryData(getListUsersQueryKey(), (old: any) => {
        if (!Array.isArray(old)) return [updatedUser];
        let matched = false;
        const next = old.map((u: any) => {
          if (String(u.id) === targetId) {
            matched = true;
            return updatedUser;
          }
          return u;
        });
        return matched ? next : [...next, updatedUser];
      });
      await queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
      setEditDialogOpen(false);
      setEditUser(null);
      setPhotoUrl(null);
      toast({ title: "User updated" });
    },
    onError: (e: Error) => toast({ title: "Failed to update user", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/users/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
      return id;
    },
    onSuccess: async (deletedId) => {
      const targetId = String(deletedId);
      queryClient.setQueryData(getListUsersQueryKey(), (old: any) => {
        if (!Array.isArray(old)) return old;
        return old.filter((u: any) => String(u.id) !== targetId);
      });
      await queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
      setDeleteConfirm(null);
      toast({ title: "User deleted" });
    },
    onError: () => toast({ title: "Failed to delete user", variant: "destructive" }),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: number; isActive: boolean }) => {
      const res = await fetch(`/api/users/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isActive }) });
      if (!res.ok) throw new Error("Failed to toggle status");
      return { id, isActive };
    },
    onSuccess: async ({ id, isActive }) => {
      const targetId = String(id);
      queryClient.setQueryData(getListUsersQueryKey(), (old: any) => {
        if (!Array.isArray(old)) return old;
        return old.map((u: any) => (String(u.id) === targetId ? { ...u, isActive } : u));
      });
      await queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
      toast({ title: "User status updated" });
    },
    onError: () => toast({ title: "Failed to update status", variant: "destructive" }),
  });

  const filteredUsers = users?.filter(user => {
    if (!searchTerm && !roleFilter && !deptFilter) return true;
    const q = searchTerm.toLowerCase();
    const matchesSearch = !searchTerm || [user.username, user.email, user.fullName, user.department].some(f => f?.toLowerCase().includes(q));
    const matchesRole = !roleFilter || hasRole(user, roleFilter);
    const matchesDept = !deptFilter || (user.department || "").toLowerCase() === deptFilter.toLowerCase();
    return matchesSearch && matchesRole && matchesDept;
  });

  const departments = [...new Set(users?.map(u => u.department).filter(Boolean))] as string[];

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'ADMIN': return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 flex items-center gap-1 dark:bg-red-900/20 dark:text-red-400 dark:border-red-900/50"><Icon name="shield-alert" size={12} /> ADMIN</Badge>;
      case 'IT': return <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200 flex items-center gap-1 dark:bg-purple-900/20 dark:text-purple-400 dark:border-purple-900/50"><Icon name="code" size={12} /> IT</Badge>;
      case 'admin': return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 flex items-center gap-1 dark:bg-red-900/20 dark:text-red-400 dark:border-red-900/50"><Icon name="shield-alert" size={12} /> Admin</Badge>;
      case 'manager': return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 flex items-center gap-1 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-900/50"><Icon name="shield" size={12} /> Officer</Badge>;
      case 'staff': return <Badge variant="outline" className="bg-slate-50 text-slate-700 border-slate-200 flex items-center gap-1 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700"><Icon name="user" size={12} /> Staff</Badge>;
      default: return <Badge variant="outline">{role}</Badge>;
    }
  };
  const getRolesDisplay = (user: { role: string; roles?: string[] }) => {
    const roles = user.roles?.length ? user.roles : [user.role];
    return <div className="flex gap-1 flex-wrap">{roles.map(r => <span key={r}>{getRoleBadge(r)}</span>)}</div>;
  };

  const getInitials = (name?: string | null) => {
    if (!name) return "U";
    return name.split(" ").map((n) => n[0]).join("").toUpperCase().substring(0, 2);
  };

  if (currentUser && !(["IT", "ADMIN", "admin"].includes(currentUser.role) || currentUser.roles?.some(r => ["IT", "ADMIN", "admin"].includes(r)))) {
    return (
      <div className="flex flex-col items-center justify-center h-[50vh] text-center">
        <Icon name="shield-alert" className="text-destructive mb-4" size={48} />
        <h2 className="text-2xl font-bold">Access Denied</h2>
        <p className="text-muted-foreground mt-2">You do not have developer privileges to view this page.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Icon name="code" className="text-primary" size={28} />
            Developers
          </h1>
          <p className="text-muted-foreground mt-1">Manage system access, user accounts, and employee permissions.</p>
        </div>
        <Dialog open={addDialogOpen} onOpenChange={(open) => {
          setAddDialogOpen(open);
          if (open) {
            setFormData({ ...EMPTY_USER_FORM });
            setPhotoUrl(null);
          }
        }}>
          <DialogTrigger asChild>
            <Button className="flex items-center"><Icon name="plus" className="mr-2" size={16} />Add User</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create User</DialogTitle>
              <DialogDescription>Add a new user to the system.</DialogDescription>
            </DialogHeader>
            <UserForm
              data={formData}
              onChange={setFormData}
              photoUrl={photoUrl}
              setPhotoUrl={setPhotoUrl}
              photoUploading={photoUploading}
              setPhotoUploading={setPhotoUploading}
            />
            <DialogFooter>
              <Button variant="outline" onClick={() => setAddDialogOpen(false)}>Cancel</Button>
              <Button onClick={() => createMutation.mutate(formData)} disabled={createMutation.isPending || !formData.username || !formData.email || !formData.password}>
                {createMutation.isPending ? "Creating..." : "Create User"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="md:col-span-2 neu rounded-2xl">
          <CardContent className="p-0">
            <div className="p-4 border-b bg-muted/20 neu-inset rounded-xl">
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
                  <Input placeholder="Search users..." className="pl-9 bg-background w-full" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                </div>
                <Select value={roleFilter} onValueChange={setRoleFilter}>
                  <SelectTrigger className="w-[140px] bg-background"><SelectValue placeholder="All Roles" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All Roles</SelectItem>
                    <SelectItem value="ADMIN">ADMIN</SelectItem>
                    <SelectItem value="IT">IT</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="manager">Officer</SelectItem>
                    <SelectItem value="staff">Staff</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={deptFilter} onValueChange={setDeptFilter}>
                  <SelectTrigger className="w-[160px] bg-background"><SelectValue placeholder="All Departments" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All Departments</SelectItem>
                    {departments.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/10 hover:bg-muted/10">
                    <TableHead>User</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead className="hidden sm:table-cell">Department</TableHead>
                    <TableHead>Access</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? Array(5).fill(0).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell><div className="flex items-center gap-3"><Skeleton className="h-10 w-10 rounded-full" /><div className="space-y-2"><Skeleton className="h-4 w-32" /><Skeleton className="h-3 w-24" /></div></div></TableCell>
                      <TableCell><Skeleton className="h-5 w-20 rounded-full" /></TableCell>
                      <TableCell className="hidden sm:table-cell"><Skeleton className="h-4 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
                      <TableCell><Skeleton className="h-8 w-8 rounded-md" /></TableCell>
                    </TableRow>
                  )) : filteredUsers?.map((user) => (
                    <TableRow key={user.id} className="group">
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-10 w-10 border border-border">
                            <AvatarImage src={user.photoUrl || undefined} alt={user.fullName || user.username} className="object-cover" />
                            <AvatarFallback className="bg-primary/10 text-primary font-semibold">{getInitials(user.fullName || user.username)}</AvatarFallback>
                          </Avatar>
                          <div>
                            <div className="font-medium text-foreground">
                              {user.fullName || user.username}
                              {currentUser?.id === user.id && <span className="ml-2 text-[10px] bg-primary/20 text-primary px-1.5 py-0.5 rounded uppercase font-bold tracking-wider">You</span>}
                            </div>
                            <div className="text-xs text-muted-foreground">{user.email}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>{getRolesDisplay(user)}</TableCell>
                      <TableCell className="hidden sm:table-cell font-medium text-sm text-muted-foreground">{user.department === "Both" ? "SIS & JMCS" : (user.department || "—")}</TableCell>
                      <TableCell>
                        <div className="flex gap-1 flex-wrap">
                          {user.canAccessSis && <Badge variant="outline" className="text-[10px] h-5 bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400">SIS</Badge>}
                          {user.canAccessJmcs && <Badge variant="outline" className="text-[10px] h-5 bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400">JMCS</Badge>}
                          {user.canEditCalendar && <Badge variant="outline" className="text-[10px] h-5 bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-900/20 dark:text-purple-400">Cal</Badge>}
                          {user.canEditTrainingProposal && <Badge variant="outline" className="text-[10px] h-5 bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400">TP</Badge>}
                          {user.canManageContracts && <Badge variant="outline" className="text-[10px] h-5 bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-900/20 dark:text-rose-400">MC</Badge>}
                          {user.canManageCertificates && <Badge variant="outline" className="text-[10px] h-5 bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-900/20 dark:text-violet-400">MCert</Badge>}
                          {user.canAccessProjects && <Badge variant="outline" className="text-[10px] h-5 bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-900/20 dark:text-indigo-400">Proj</Badge>}
                          {user.canAccessAdmin && <Badge variant="outline" className="text-[10px] h-5 bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/20 dark:text-orange-400">Admin</Badge>}
                          {!user.canAccessSis && !user.canAccessJmcs && !user.canEditCalendar && !user.canEditTrainingProposal && !user.canManageContracts && !user.canManageCertificates && !user.canAccessProjects && !user.canAccessAdmin && (
                            <span className="text-xs text-muted-foreground">None</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {user.isActive ? (
                          <span className="flex items-center gap-1.5 text-sm font-medium text-emerald-600 dark:text-emerald-400"><Icon name="check-circle-2" size={16} /> Active</span>
                        ) : (
                          <span className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground"><Icon name="x-circle" size={16} /> Inactive</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity"><span className="sr-only">Menu</span><Icon name="more-horizontal" size={16} /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="cursor-pointer" onClick={() => {
                              setEditUser(user);
                              setFormData({
                                username: user.username,
                                email: user.email,
                                password: "",
                                fullName: user.fullName || "",
                                roles: [user.roles?.[0] ? (user.roles[0] === "admin" ? "ADMIN" : user.roles[0]) : (user.role === "admin" ? "ADMIN" : user.role)],
                                department: user.department || "",
                                photoUrl: user.photoUrl || "",
                                canAccessSis: user.canAccessSis ?? false,
                                canAccessJmcs: user.canAccessJmcs ?? false,
                                canEditCalendar: user.canEditCalendar ?? false,
                                canEditTrainingProposal: user.canEditTrainingProposal ?? false,
                                canManageContracts: user.canManageContracts ?? false,
                                canManageCertificates: user.canManageCertificates ?? false,
                                canAccessProjects: user.canAccessProjects ?? false,
                                canAccessAdmin: user.canAccessAdmin ?? false,
                              });
                              setPhotoUrl(null);
                              setEditDialogOpen(true);
                            }}>
                              <Icon name="edit" className="mr-2" size={16} /> Edit Profile
                            </DropdownMenuItem>
                            <DropdownMenuItem className="cursor-pointer" onClick={() => toggleActiveMutation.mutate({ id: user.id, isActive: !user.isActive })}>
                              {user.isActive ? <Icon name="x-circle" className="mr-2" size={16} /> : <Icon name="check-circle-2" className="mr-2" size={16} />}
                              {user.isActive ? "Deactivate" : "Activate"}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-destructive focus:bg-destructive/10 cursor-pointer" disabled={currentUser?.id === user.id} onClick={() => setDeleteConfirm(user.id)}>
                              <Icon name="trash-2" className="mr-2" size={16} /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="neu rounded-2xl">
            <CardHeader className="pb-3 border-b">
              <CardTitle className="text-base font-semibold">Security Policies</CardTitle>
            </CardHeader>
            <CardContent className="pt-4 space-y-4 text-sm">
              <div className="space-y-1">
                <p className="font-medium text-foreground">Password Requirements</p>
                <p className="text-muted-foreground">Minimum 6 characters.</p>
              </div>
              <div className="space-y-1">
                <p className="font-medium text-foreground">Session Timeout</p>
                <p className="text-muted-foreground">Automatic logout after 30 minutes of inactivity.</p>
              </div>
              <div className="space-y-1">
                <p className="font-medium text-foreground">Access Auditing</p>
                <p className="text-muted-foreground">All operations are logged permanently to the activity audit log.</p>
              </div>
              <Button variant="outline" className="w-full mt-2" asChild><a href="/activity">Review Activity Log</a></Button>
            </CardContent>
          </Card>
          <Card className="bg-primary text-primary-foreground border-none neu rounded-2xl">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold flex items-center gap-2"><Icon name="shield-alert" size={16} /> IT Notice</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-primary-foreground/80 leading-relaxed">
              User role changes take effect immediately. Ensure proper authorization before elevating users to Officer, IT, or ADMIN roles.
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={editDialogOpen} onOpenChange={(open) => {
        setEditDialogOpen(open);
        if (!open) {
          setEditUser(null);
          setPhotoUrl(null);
        }
      }}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>Update user profile, role, and module permissions.</DialogDescription>
          </DialogHeader>
          <UserForm
            data={formData}
            onChange={setFormData}
            isEdit
            photoUrl={photoUrl}
            setPhotoUrl={setPhotoUrl}
            photoUploading={photoUploading}
            setPhotoUploading={setPhotoUploading}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>Cancel</Button>
              <Button onClick={() => {
                const updateData: any = {
                  email: formData.email,
                  fullName: formData.fullName,
                  roles: formData.roles,
                  department: formData.department,
                  canAccessSis: formData.canAccessSis,
                  canAccessJmcs: formData.canAccessJmcs,
                  canEditCalendar: formData.canEditCalendar,
                  canEditTrainingProposal: formData.canEditTrainingProposal,
                  canManageContracts: formData.canManageContracts,
                  canManageCertificates: formData.canManageCertificates,
                  canAccessProjects: formData.canAccessProjects,
                  canAccessAdmin: formData.canAccessAdmin,
                };
                if (photoUrl) {
                  updateData.photoUrl = photoUrl;
                } else if (!formData.photoUrl && formData.fullName) {
                  updateData.photoUrl = guessGender(formData.fullName) === "female" ? "/w.png" : "/hi.png";
                }
                updateMutation.mutate({ id: editUser?.id, data: updateData });
              }} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteConfirm} onOpenChange={o => { if (!o) setDeleteConfirm(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete User</DialogTitle>
            <DialogDescription>This action cannot be undone. The user will lose all access.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleteConfirm && deleteMutation.mutate(deleteConfirm)} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? "Deleting..." : "Delete User"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
