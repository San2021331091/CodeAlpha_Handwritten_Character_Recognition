"use client";
import { Download, FlaskConical, Layers3, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAppSelector } from "@/lib/store";
import { FC, JSX } from "react";

export const ModelLab: FC = (): JSX.Element => {
  const metrics = useAppSelector((s) => s.lab.metrics);

  if (!metrics) {
    return (
      <Card className="empty-page border-slate-800 bg-slate-900/60">
        <FlaskConical size={44} className="text-emerald-400" />
        <h2>Model metrics are unavailable.</h2>
        <p>
          Start the backend gateway and click Retry connection to load the
          trained CNN weights.
        </p>
      </Card>
    );
  }

  const pct = (v: number) => (v * 100).toFixed(2) + "%";

  const download = (): void => {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(metrics, null, 2)], {
        type: "application/json",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "inklab-emnist-character-metrics.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const max = Math.max(...metrics.confusion_matrix.flat());

  return (
    <div className="lab-content space-y-6">
      {/* Intro Heading & Download */}
      <div className="section-intro">
        <div>
          <span className="eyebrow flex items-center gap-1.5">
            <Sparkles className="h-3 w-3 text-emerald-400" />
            UNDER THE HOOD · Handwritten Digit &amp; Letter Recognition ·
            PyTorch CNN
          </span>
          <h2>Measured, not imagined.</h2>
          <p>
            Official EMNIST test results from the saved PyTorch CNN checkpoint
            across all {metrics.classes.length} character classes.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={download}
          className="border-white/20 bg-black/40 hover:bg-black/60 text-white hover:border-emerald-400 gap-1.5 text-xs rounded-lg font-semibold"
        >
          <Download className="h-4 w-4 text-emerald-300" />
          Export metrics
        </Button>
      </div>

      {/* Domain accuracy pills */}
      <div className="character-evaluation">
        <p>
          Letters A-Z Accuracy:{" "}
          <strong>
            {metrics.letter_accuracy === undefined
              ? "-"
              : pct(metrics.letter_accuracy)}
          </strong>
          {" · "}Digits 0-9 Accuracy:{" "}
          <strong>
            {metrics.digit_accuracy === undefined
              ? "-"
              : pct(metrics.digit_accuracy)}
          </strong>
          {" · "}Normalized Case-Insensitive Evaluation
        </p>
      </div>

      {/* Top 4 Stats Grid */}
      <div className="lab-stats">
        {[
          ["Test accuracy", pct(metrics.accuracy)],
          ["Macro F1", pct(metrics.macro_f1)],
          ["Trainable parameters", metrics.parameters.toLocaleString()],
          ["Training time", `${Math.round(metrics.training_seconds)} sec`],
        ].map(([label, value]) => (
          <Card className="lab-stat" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </Card>
        ))}
      </div>

      {/* Architecture & Epochs Grid */}
      <div className="lab-grid">
        <Card className="lab-panel">
          <h3>
            <Layers3 size={18} className="text-emerald-400" /> A small, capable
            CNN
          </h3>
          <p>
            Spatial features become a {metrics.classes.length}-class prediction
            distribution.
          </p>
          <div className="architecture">
            {metrics.architecture.map((layer, i) => (
              <div key={i}>
                <span>{String(i + 1).padStart(2, "0")}</span>
                {layer}
              </div>
            ))}
          </div>
          <div className="data-split">
            <strong>Reproducible evaluation split</strong>
            <p>
              {metrics.train_samples.toLocaleString()} train /{" "}
              {metrics.validation_samples.toLocaleString()} validation /{" "}
              {metrics.test_samples.toLocaleString()} test. Random seed{" "}
              {metrics.seed}. Best checkpoint selected by validation loss. The
              test split is held-out for final reporting.
            </p>
          </div>
        </Card>

        <Card className="lab-panel">
          <h3>Learning, one epoch at a time</h3>
          <p>
            Convergence of training accuracy vs held-out validation accuracy
            across training cycles.
          </p>
          <div className="chart-legend">
            <span /> Training <span /> Validation
          </div>
          <div className="epoch-chart">
            {metrics.history.map((epoch) => (
              <div className="epoch-column" key={epoch.epoch}>
                <div className="bar-pair">
                  <div
                    style={{ height: `${epoch.train_accuracy * 100}%` }}
                    title={`Training ${pct(epoch.train_accuracy)}`}
                  />
                  <div
                    style={{ height: `${epoch.validation_accuracy * 100}%` }}
                    title={`Validation ${pct(epoch.validation_accuracy)}`}
                  />
                </div>
                <span>Epoch {epoch.epoch}</span>
                <strong>{pct(epoch.validation_accuracy)}</strong>
              </div>
            ))}
          </div>
          <p className="chart-caption">
            Vertical axis: accuracy (0–100%). Peak validation accuracy reached:{" "}
            {pct(metrics.best_validation_accuracy)}.
          </p>
          <div className="data-split">
            <strong>What these results mean</strong>
            <p>
              EMNIST features isolated handwritten glyphs. The CNN distinguishes
              characters 0–9 and A–Z with robust spatial invariance.
              Multi-character words require sequence decoders (e.g. CRNN).
            </p>
          </div>
        </Card>
      </div>

      {/* Class Metrics & Confusion Matrix Grid */}
      <div className="lab-grid">
        <Card className="lab-panel">
          <h3>Per-character performance</h3>
          <p>Class-level precision, recall, and F1 on the official test set.</p>
          <div className="table-scroll class-table">
            <table>
              <thead>
                <tr>
                  <th>Character</th>
                  <th>Precision</th>
                  <th>Recall</th>
                  <th>F1</th>
                  <th>Support</th>
                </tr>
              </thead>
              <tbody>
                {metrics.per_class.map((c) => (
                  <tr key={c.label}>
                    <td>
                      <span className="digit-chip">{c.label}</span>
                    </td>
                    <td>{pct(c.precision)}</td>
                    <td>{pct(c.recall)}</td>
                    <td>{pct(c.f1)}</td>
                    <td>{c.support}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="lab-panel">
          <h3>Where the model gets confused</h3>
          <p>Rows: true label. Columns: predicted label. Hover for count.</p>
          <div className="confusion-scroll">
            <div
              className="confusion"
              style={{
                gridTemplateColumns: `26px repeat(${metrics.classes.length}, minmax(26px, 1fr))`,
              }}
              role="img"
              aria-label={`${metrics.classes.length} by ${metrics.classes.length} character confusion matrix`}
            >
              <span />
              {metrics.classes.map((label) => (
                <strong key={`h${label}`}>{label}</strong>
              ))}
              {metrics.confusion_matrix.map((row, i) => (
                <div className="confusion-row" key={i}>
                  <strong>{metrics.classes[i]}</strong>
                  {row.map((value, j) => (
                    <span
                      key={j}
                      title={`True ${metrics.classes[i]}, predicted ${metrics.classes[j]}: ${value}`}
                      style={{
                        background: `rgba(16, 185, 129, ${Math.max(0.06, value / max)})`,
                        color: value / max > 0.4 ? "#ffffff" : "#f1f5f9",
                      }}
                    >
                      {value}
                    </span>
                  ))}
                </div>
              ))}
            </div>
          </div>
          <p className="chart-caption">
            Darker emerald cells indicate high density. Correct predictions line
            up on the main diagonal.
          </p>
        </Card>
      </div>
    </div>
  );
};
