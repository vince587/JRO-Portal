import { cn } from "@/lib/utils";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Award,
  BadgeCheck,
  Ban,
  BarChart,
  BarChart2,
  Bell,
  Briefcase,
  Building,
  Building2,
  Calendar,
  CalendarDays,
  Check,
  CheckCircle,
  CheckSquare,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Circle,
  ClipboardList,
  Clock,
  Code,
  Copy,
  Download,
  Edit,
  ExternalLink,
  Eye,
  EyeOff,
  FileClock,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileUp,
  Filter,
  Folder,
  FolderOpen,
  FolderPlus,
  Globe,
  GraduationCap,
  GripVertical,
  Hash,
  Heart,
  History,
  KeyRound,
  Landmark,
  LayoutDashboard,
  Library,
  Link2,
  ListTodo,
  Loader2,
  Lock,
  LogIn,
  LogOut,
  Mail,
  MapPin,
  Maximize2,
  Megaphone,
  MessageCircle,
  Minimize2,
  Minus,
  Monitor,
  Moon,
  MoreHorizontal,
  Palette,
  PanelLeft,
  Paperclip,
  PartyPopper,
  Pencil,
  Phone,
  PieChart,
  Plus,
  PlusCircle,
  Presentation,
  Printer,
  QrCode,
  Receipt,
  RefreshCw,
  RotateCcw,
  Save,
  ScanLine,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Square,
  Sun,
  Target,
  Trash2,
  TrendingUp,
  Unlock,
  Upload,
  User,
  Users,
  Wallet,
  X,
  XCircle,
  ChevronsUpDown,
  ChevronsLeftRight,
  Menu,
  Database,
  Server,
  Cloud,
  Wifi,
  WifiOff,
  Wrench,
  Battery,
  Cpu,
  HardDrive,
  MemoryStick,
  MonitorSmartphone,
  Tablet,
  Smartphone,
  Headphones,
  Camera,
  Mic,
  MicOff,
  Speaker,
  Volume2,
  VolumeX,
  Bluetooth,
  BluetoothOff,
  Usb,
  Mouse,
  Keyboard,
  Joystick,
  Gamepad2,
  Disc,
  Disc2,
  Disc3,
  HelpCircle,
} from "lucide-react";

export type IconName =
  | "activity"
  | "alert-circle"
  | "alert-triangle"
  | "arrow-left"
  | "arrow-right"
  | "arrow-up-right"
  | "award"
  | "badge-check"
  | "ban"
  | "bar-chart"
  | "bar-chart-2"
  | "bell"
  | "briefcase"
  | "building"
  | "building-2"
  | "calendar"
  | "calendar-days"
  | "check"
  | "check-circle"
  | "check-square"
  | "chevron-down"
  | "chevron-left"
  | "chevron-right"
  | "chevron-up"
  | "circle"
  | "clipboard-list"
  | "clock"
  | "code"
  | "copy"
  | "download"
  | "edit"
  | "external-link"
  | "eye"
  | "eye-off"
  | "file-clock"
  | "file-image"
  | "file-spreadsheet"
  | "file-text"
  | "file-up"
  | "filter"
  | "folder"
  | "folder-open"
  | "folder-plus"
  | "globe"
  | "graduation-cap"
  | "grip-vertical"
  | "hash"
  | "heart"
  | "history"
  | "key-round"
  | "landmark"
  | "layout-dashboard"
  | "library"
  | "link-2"
  | "list-todo"
  | "loader-2"
  | "lock"
  | "log-in"
  | "log-out"
  | "mail"
  | "map-pin"
  | "maximize-2"
  | "megaphone"
  | "message-circle"
  | "minimize-2"
  | "minus"
  | "monitor"
  | "moon"
  | "more-horizontal"
  | "palette"
  | "panel-left"
  | "paperclip"
  | "party-popper"
  | "pencil"
  | "phone"
  | "pie-chart"
  | "plus"
  | "plus-circle"
  | "presentation"
  | "printer"
  | "qr-code"
  | "receipt"
  | "refresh-cw"
  | "rotate-ccw"
  | "save"
  | "scan-line"
  | "search"
  | "shield"
  | "shield-alert"
  | "shield-check"
  | "square"
  | "sun"
  | "target"
  | "trash-2"
  | "trending-up"
  | "unlock"
  | "upload"
  | "user"
  | "users"
  | "wallet"
  | "x"
  | "x-circle"
  | "chevrons-up-down"
  | "chevrons-left-right"
  | "menu"
  | "database"
  | "server"
  | "cloud"
  | "wifi"
  | "wifi-off"
  | "wrench"
  | "battery"
  | "cpu"
  | "hard-drive"
  | "memory-stick"
  | "monitor-smartphone"
  | "tablet"
  | "smartphone"
  | "headphones"
  | "camera"
  | "mic"
  | "mic-off"
  | "speaker"
  | "volume-2"
  | "volume-x"
  | "bluetooth"
  | "bluetooth-off"
  | "usb"
  | "mouse"
  | "keyboard"
  | "joystick"
  | "gamepad-2"
  | "disc"
  | "disc-2"
  | "disc-3";

const iconMap: Record<IconName, React.ComponentType<React.SVGProps<SVGSVGElement> & { size?: number; strokeWidth?: number }>> = {
  activity: Activity,
  "alert-circle": AlertCircle,
  "alert-triangle": AlertTriangle,
  "arrow-left": ArrowLeft,
  "arrow-right": ArrowRight,
  "arrow-up-right": ArrowUpRight,
  award: Award,
  "badge-check": BadgeCheck,
  ban: Ban,
  "bar-chart": BarChart,
  "bar-chart-2": BarChart2,
  bell: Bell,
  briefcase: Briefcase,
  building: Building,
  "building-2": Building2,
  calendar: Calendar,
  "calendar-days": CalendarDays,
  check: Check,
  "check-circle": CheckCircle,
  "check-square": CheckSquare,
  "chevron-down": ChevronDown,
  "chevron-left": ChevronLeft,
  "chevron-right": ChevronRight,
  "chevron-up": ChevronUp,
  circle: Circle,
  "clipboard-list": ClipboardList,
  clock: Clock,
  code: Code,
  copy: Copy,
  download: Download,
  edit: Edit,
  "external-link": ExternalLink,
  eye: Eye,
  "eye-off": EyeOff,
  "file-clock": FileClock,
  "file-image": FileImage,
  "file-spreadsheet": FileSpreadsheet,
  "file-text": FileText,
  "file-up": FileUp,
  filter: Filter,
  folder: Folder,
  "folder-open": FolderOpen,
  "folder-plus": FolderPlus,
  globe: Globe,
  "graduation-cap": GraduationCap,
  "grip-vertical": GripVertical,
  hash: Hash,
  heart: Heart,
  history: History,
  "key-round": KeyRound,
  landmark: Landmark,
  "layout-dashboard": LayoutDashboard,
  library: Library,
  "link-2": Link2,
  "list-todo": ListTodo,
  "loader-2": Loader2,
  lock: Lock,
  "log-in": LogIn,
  "log-out": LogOut,
  mail: Mail,
  "map-pin": MapPin,
  "maximize-2": Maximize2,
  megaphone: Megaphone,
  "message-circle": MessageCircle,
  "minimize-2": Minimize2,
  minus: Minus,
  monitor: Monitor,
  moon: Moon,
  "more-horizontal": MoreHorizontal,
  palette: Palette,
  "panel-left": PanelLeft,
  paperclip: Paperclip,
  "party-popper": PartyPopper,
  pencil: Pencil,
  phone: Phone,
  "pie-chart": PieChart,
  plus: Plus,
  "plus-circle": PlusCircle,
  presentation: Presentation,
  printer: Printer,
  "qr-code": QrCode,
  receipt: Receipt,
  "refresh-cw": RefreshCw,
  "rotate-ccw": RotateCcw,
  save: Save,
  "scan-line": ScanLine,
  search: Search,
  shield: Shield,
  "shield-alert": ShieldAlert,
  "shield-check": ShieldCheck,
  square: Square,
  sun: Sun,
  target: Target,
  "trash-2": Trash2,
  "trending-up": TrendingUp,
  unlock: Unlock,
  upload: Upload,
  user: User,
  users: Users,
  wallet: Wallet,
  x: X,
  "x-circle": XCircle,
  "chevrons-up-down": ChevronsUpDown,
  "chevrons-left-right": ChevronsLeftRight,
  menu: Menu,
  database: Database,
  server: Server,
  cloud: Cloud,
  wifi: Wifi,
  "wifi-off": WifiOff,
  wrench: Wrench,
  battery: Battery,
  cpu: Cpu,
  "hard-drive": HardDrive,
  "memory-stick": MemoryStick,
  "monitor-smartphone": MonitorSmartphone,
  tablet: Tablet,
  smartphone: Smartphone,
  headphones: Headphones,
  camera: Camera,
  mic: Mic,
  "mic-off": MicOff,
  speaker: Speaker,
  "volume-2": Volume2,
  "volume-x": VolumeX,
  bluetooth: Bluetooth,
  "bluetooth-off": BluetoothOff,
  usb: Usb,
  mouse: Mouse,
  keyboard: Keyboard,
  joystick: Joystick,
  "gamepad-2": Gamepad2,
  disc: Disc,
  "disc-2": Disc2,
  "disc-3": Disc3,
};

interface IconProps extends React.SVGAttributes<SVGSVGElement> {
  name: IconName | (string & {});
  size?: number;
  strokeWidth?: number;
  className?: string;
}

export function Icon({ name, className, size = 16, strokeWidth = 2, ...rest }: IconProps) {
  const LucideIcon = iconMap[name as IconName] || HelpCircle;
  return (
    <LucideIcon
      className={cn("inline-flex shrink-0", className)}
      size={size}
      strokeWidth={strokeWidth}
      aria-hidden="true"
      {...rest}
    />
  );
}