"use client";
import { PenTool, LayoutDashboard, FlaskConical, History as HistoryIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { setTab, useAppDispatch, useAppSelector } from "@/lib/store";
import { FC, JSX } from "react";

export const Navbar: FC = ():JSX.Element => {
  const { tab, history } = useAppSelector((s) => s.lab);
  const dispatch = useAppDispatch();

  interface NavItem {
    id: "studio" | "lab" | "history";
    label: string;
    Icon: React.ElementType;
    badge?: number;
  }

  const navItems: NavItem[] = [
    { id: "studio", label: "Recognition studio", Icon: LayoutDashboard },
    { id: "lab", label: "Model lab", Icon: FlaskConical },
    { id: "history", label: "Prediction history", Icon: HistoryIcon, badge: history.length },
  ];

  return (
    <header className="sticky top-0 z-50 w-full border-b border-white/15 bg-black/40 backdrop-blur-xl">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-3 py-3 md:h-16 md:flex-row md:items-center md:justify-between md:py-0">
          {/* Brand */}
          <div className="flex items-center justify-between md:justify-start gap-3">
            <button
              type="button"
              onClick={() => dispatch(setTab("studio"))}
              className="flex items-center gap-3 text-left group transition-transform active:scale-95"
              aria-label="InkLab home"
            >
              <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 via-teal-500 to-emerald-700 shadow-lg shadow-emerald-950/40 ring-1 ring-emerald-300/40">
                <PenTool className="h-5 w-5 text-white" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-base font-bold tracking-tight text-white group-hover:text-emerald-300 transition-colors">
                    InkLab<span className="text-emerald-400">.</span>ai
                  </span>
                </div>
                <span className="block text-[11px] font-medium text-slate-200">
                  Handwritten Character Recognition
                </span>
              </div>
            </button>
          </div>

          {/* Navigation Tabs */}
          <nav
            aria-label="Main navigation"
            className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0"
          >
            {navItems.map(({ id, label, Icon, badge }) => {
              const active = tab === id;
              return (
                <Button
                  key={id}
                  type="button"
                  aria-label={label}
                  aria-current={active ? "page" : undefined}
                  onClick={() => dispatch(setTab(id))}
                  variant={active ? "secondary" : "ghost"}
                  size="sm"
                  className={`relative flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs sm:text-sm font-semibold transition-all ${
                    active
                      ? "bg-emerald-500/30 text-white border border-emerald-400/60 shadow-md shadow-emerald-950/30"
                      : "text-slate-200 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  <Icon
                    className={`h-4 w-4 shrink-0 transition-colors ${
                      active ? "text-emerald-300" : "text-slate-300"
                    }`}
                  />
                  <span>{label}</span>
                  {badge !== undefined && badge > 0 && (
                    <span className="ml-1 inline-flex items-center justify-center rounded-full bg-emerald-500/30 px-1.5 py-0.2 text-[10px] font-mono font-bold text-emerald-200 border border-emerald-400/50">
                      {badge}
                    </span>
                  )}
                </Button>
              );
            })}
          </nav>
        </div>
      </div>
    </header>
  );
}
