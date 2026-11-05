import {
  LayoutDashboard,
  ClipboardList,
  CalendarDays,
  Truck,
  Map,
  Users,
  FileText,
  FolderOpen,
  ChartNoAxesCombined,
  Package,
  ShoppingCart,
  Landmark,
  Network,
  Settings2,
  Sparkles,
  ScanLine,
  ShieldCheck,
  Route,
  Smartphone,
  Import,
  ArrowUpRight,
  Plus,
  Search,
  Bell,
  ChevronDown,
  ChevronRight,
  ArrowLeft,
  Download,
  X,
  Check,
  Clock,
  CircleAlert,
  Ellipsis,
  Menu,
  Send,
  RefreshCw,
  LogOut,
  type LucideIcon,
} from "lucide-react";
const icons: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  orders: ClipboardList,
  calendar: CalendarDays,
  truck: Truck,
  map: Map,
  users: Users,
  invoice: FileText,
  folder: FolderOpen,
  chart: ChartNoAxesCombined,
  box: Package,
  cart: ShoppingCart,
  finance: Landmark,
  building: Network,
  settings: Settings2,
  sparkles: Sparkles,
  scan: ScanLine,
  shield: ShieldCheck,
  route: Route,
  driver: Smartphone,
  import: Import,
  arrow: ArrowUpRight,
  plus: Plus,
  search: Search,
  bell: Bell,
  down: ChevronDown,
  right: ChevronRight,
  back: ArrowLeft,
  download: Download,
  close: X,
  check: Check,
  clock: Clock,
  alert: CircleAlert,
  more: Ellipsis,
  menu: Menu,
  send: Send,
  refresh: RefreshCw,
  logout: LogOut,
  plug: Network,
};
export function Icon({
  name,
  size = 18,
  className = "",
}: {
  name: string;
  size?: number;
  className?: string;
}) {
  const Component = icons[name] || ClipboardList;
  return (
    <Component
      size={size}
      strokeWidth={1.7}
      className={className}
      aria-hidden="true"
    />
  );
}
