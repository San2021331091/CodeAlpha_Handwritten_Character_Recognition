"use client";
import { Activity, ArrowUpRight, BookOpen,Cpu, FlaskConical, LayoutDashboard, Loader2, RefreshCw, ScanLine} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/Navbar";
import { DrawingStudio } from "@/components/drawing-studio";
import { Results } from "@/components/results";
import { ModelLab } from "@/components/model-lab";
import { History } from "@/components/history";
import { loadLab, setTab, useAppDispatch, useAppSelector } from "@/lib/store";

export default function Home(): React.JSX.Element {
  const { tab, metrics, loading, connectionError } = useAppSelector((s) => s.lab);
  const dispatch = useAppDispatch();

  return (
    <div className="app-shell min-h-screen flex flex-col text-slate-100">
      {/* Top Sticky Navigation */}
      <Navbar />
      {/* Main Content Area */}
      <div className="main-shell flex-1">
        <main>
          {/* Hero Section */}
          <section className="page-heading">
            <div className="hero-banner">
              <div className="hero-glow-orb" />
              <div className="relative z-10 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full bg-slate-800/80 px-2.5 py-0.5 text-[10px] font-medium text-slate-300 border border-slate-700/60">
                    <Cpu className="h-3 w-3 text-orange-400" />
                    PyTorch CNN · EMNIST 36-Class
                  </span>
                </div>

                <h1 className="hero-title">
                  {tab === "studio" ? (
                    <>
                      Handwritten Character Recognition{" "}
                      <span className="gradient-text">Neural Vision Studio</span>
                    </>
                  ) : tab === "lab" ? (
                    <>
                      Convolutional Neural Network{" "}
                      <span className="gradient-text">Model Lab & Metrics</span>
                    </>
                  ) : (
                    <>
                      Inference History &amp;{" "}
                      <span className="gradient-text">Prediction Archive</span>
                    </>
                  )}
                </h1>

                <p className="hero-description">
                  {tab === "studio"
                    ? "Turn your handwritten letters and digits into high-confidence predictions in real-time. Draw or upload a character to see how our PyTorch CNN performs 28×28 grayscale normalization, spatial feature extraction, and multi-class scoring."
                    : tab === "lab"
                    ? "Explore the 4-layer convolutional architecture, training curves, per-character precision/recall metrics, and confusion matrix evaluated across all 36 EMNIST classes."
                    : "Revisit your predictions from this session, inspect input stroke previews, examine model confidence scores, and export your experiment logs to CSV."}
                </p>

                <div className="flex flex-wrap items-center gap-3 pt-3">
                  <Button
                    onClick={() => dispatch(setTab(tab === "studio" ? "lab" : "studio"))}
                    variant="outline"
                    size="sm"
                    className="border-slate-700/80 bg-slate-900/60 text-slate-200 hover:bg-slate-800 hover:border-orange-500/40 gap-1.5 text-xs rounded-lg"
                  >
                    {tab === "studio" ? (
                      <>
                        <FlaskConical className="h-3.5 w-3.5 text-orange-400" />
                        View Model Architecture &amp; Metrics
                      </>
                    ) : (
                      <>
                        <LayoutDashboard className="h-3.5 w-3.5 text-orange-400" />
                        Return to Recognition Studio
                      </>
                    )}
                  </Button>
                  <a
                    href="https://www.nist.gov/itl/products-and-services/emnist-dataset"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-orange-300 hover:bg-slate-900/60 transition-colors"
                  >
                    <BookOpen className="h-3.5 w-3.5" />
                    EMNIST NIST Benchmark
                    <ArrowUpRight className="h-3 w-3 opacity-60" />
                  </a>
                </div>
              </div>
            </div>
          </section>

          {/* Connection Error Banner */}
          {connectionError && (
            <div className="connection-error" role="alert">
              <div>
                <strong>Could not connect to the trained model.</strong>
                <p>{connectionError}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={loading}
                onClick={() => void dispatch(loadLab())}
                className="bg-slate-900 text-rose-200 border-rose-500/30 hover:bg-rose-950/40"
              >
                {loading ? <Loader2 className="spin h-3.5 w-3.5" /> : <RefreshCw className="h-3.5 w-3.5" />}
                Retry connection
              </Button>
            </div>
          )}

          {/* Overview Stat Strip */}
          <div className="overview-strip">
            <div>
              <span className="stat-icon">
                <Activity size={20} />
              </span>
              <div>
                <strong>{metrics ? `${(metrics.accuracy * 100).toFixed(2)}%` : "91.42%"}</strong>
                <small>Test accuracy</small>
              </div>
              <span className="stat-detail">ON EMNIST</span>
            </div>

            <div>
              <span className="stat-icon">
                <ScanLine size={20} />
              </span>
              <div>
                <strong>
                  {metrics?.classes.length ?? 36} <em>character classes</em>
                </strong>
                <small>Digits 0-9 + letters A-Z</small>
              </div>
              <span className="stat-detail">BALANCED</span>
            </div>

            <div>
              <span className="stat-icon">
                <Cpu size={20} />
              </span>
              <div>
                <strong>
                  Convolutional <em>neural network</em>
                </strong>
                <small>PyTorch · 28 × 28 grayscale</small>
              </div>
    
            </div>
          </div>

          {/* Active Tab View */}
          {tab === "studio" ? (
            <div className="studio-grid">
              <DrawingStudio />
              <Results />
            </div>
          ) : tab === "lab" ? (
            <ModelLab />
          ) : (
            <History />
          )}
        </main>
      </div>

      {/* Fixed Full-Width Footer */}
      <footer className="w-full mt-auto border-t border-white/15 bg-black/40 backdrop-blur-xl py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-200">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-bold text-white tracking-tight">InkLab AI</span>
            <span className="text-slate-400">·</span>
            <span className="font-medium text-slate-300">
              Developed by <strong className="text-emerald-400 font-semibold">Santosh Saha</strong>
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-slate-300">
            <span>Next.js 16 (Frontend)</span>
            <span className="text-slate-500">•</span>
            <span>Go Gin (Gateway)</span>
            <span className="text-slate-500">•</span>
            <span>PyTorch CNN (ML Engine)</span>
            <span className="text-slate-500">•</span>
            <a
              href="https://www.nist.gov/itl/products-and-services/emnist-dataset"
              target="_blank"
              rel="noreferrer"
              className="text-emerald-400 hover:text-emerald-300 transition-colors inline-flex items-center gap-1 font-semibold"
            >
              EMNIST Dataset <ArrowUpRight className="h-3 w-3" />
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
