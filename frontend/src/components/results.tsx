"use client";
import { Activity, ArrowUpRight, Check, CircleHelp, Clock3, Layers3, Loader2, ScanLine, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { recognize, setCharacterType, useAppDispatch, useAppSelector } from "@/lib/store";

const percent = (n: number) => (n * 100).toFixed(1) + "%";

export const Results:React.FC = ():React.JSX.Element=> {
  const dispatch = useAppDispatch();
  const { result, status, error, metrics } = useAppSelector((s) => s.lab);
  return (
    <aside className="results-column space-y-6">
      <Card className="result-card">
        <div className="panel-heading">
          <div>
            <span className="eyebrow flex items-center gap-1.5">
              <Sparkles className="h-3 w-3 text-emerald-400" />
              02 / RECOGNITION
            </span>
            <h2>What the model sees</h2>
          </div>
          <ScanLine size={21} className="text-emerald-400 opacity-90" />
        </div>

        {status === "loading" ? (
          <div className="result-empty" role="status">
            <Loader2 className="spin text-emerald-400" size={36} />
            <h3 className="mt-4">Following your strokes…</h3>
            <p>Normalizing pixels and running the PyTorch CNN inference.</p>
          </div>
        ) : error ? (
          <div className="result-empty" role="alert">
            <CircleHelp size={34} className="text-rose-400" />
            <h3 className="mt-4">Let’s take another look.</h3>
            <p className="text-rose-300">{error}</p>
          </div>
        ) : result ? (
          <>
            <div className="prediction-block" aria-live="polite">
              <span className="prediction-digit" style={result.requires_type_choice ? {fontSize:"clamp(2rem, 4vw, 3.5rem)",letterSpacing:"-.04em"} : undefined}>
                {result.requires_type_choice ? result.ambiguous_labels?.join(" / ") : result.prediction}
              </span>
              <div>
                <span className="small-label">{result.requires_type_choice ? "NEEDS CHARACTER TYPE" : "PREDICTED CHARACTER"}</span>
                <strong>{percent(result.confidence)}</strong>
                <span className={result.uncertain ? "uncertain-label" : "confidence-label"}>
                  {result.uncertain ? "Ambiguous input" : "Model score"}
                </span>
              </div>
            </div>

            {result.ambiguity_reason && (
              <div className="mx-6 mb-5 rounded-xl border border-amber-400/30 bg-amber-950/30 p-4" role="status">
                <p className="text-sm leading-relaxed text-amber-100">{result.ambiguity_reason}</p>
                {result.requires_type_choice && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {([['digits','Read as digit'],['letters','Read as letter']] as const).map(([mode,label]) => (
                      <Button key={mode} variant="outline" onClick={() => {
                        dispatch(setCharacterType(mode));
                        void dispatch(recognize({image:result.image,source:result.source,expected:result.expected,mode}));
                      }}>{label}</Button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {result.expected !== undefined && (
              <div
                className={`sample-verdict ${
                  result.expected === result.prediction ? "correct" : "incorrect"
                }`}
              >
                {result.expected === result.prediction ? (
                  <Check size={14} className="text-emerald-400" />
                ) : (
                  <CircleHelp size={14} className="text-orange-400" />
                )}
                <span>
                  Sample label: <strong>{result.expected}</strong> ·{" "}
                  {result.requires_type_choice ? "Needs character type" : result.expected === result.prediction
                    ? "Correct prediction"
                    : "Different prediction"}
                </span>
              </div>
            )}

            <div className="ranking">
              <span className="small-label">TOP CANDIDATES</span>
              {result.probabilities.slice(0, 3).map((item, i) => (
                <div className="probability" key={item.label}>
                  <span className="candidate">{item.label}</span>
                  <div className="prob-track">
                    <span
                      style={{ width: percent(item.probability) }}
                      className={i === 0 ? "top" : ""}
                    />
                  </div>
                  <strong>{percent(item.probability)}</strong>
                </div>
              ))}
            </div>

            <div className="processed">
              <img
                src={result.processed_image}
                alt="The normalized 28 by 28 grayscale image sent to the CNN"
              />
              <div>
                <strong>The actual model input</strong>
                <span>28 × 28 · grayscale · centered</span>
              </div>
              <span className="latency">
                <Clock3 size={12} className="text-emerald-400" />
                {result.latency_ms.toFixed(0)} ms
              </span>
            </div>

            <p className="score-note">
              Scores are uncalibrated model probabilities from softmax activation. Output probabilities reflect character type constraints. Similar shapes (such as O/0 or I/1) may share probabilities.
            </p>
          </>
        ) : (
          <div className="result-empty">
            <div className="empty-icon">
              <ScanLine size={28} />
            </div>
            <h3>
              A small mark.
              <br />
              A whole alphabet of possibility.
            </h3>
            <p>
              Draw or upload a character, then hit
              <br />
              <strong>Recognize character</strong> to see the prediction.
            </p>
            <span className="waiting">
              <span />
              Waiting for your first character
            </span>
          </div>
        )}
      </Card>

      {/* Pipeline Steps Card */}
      <Card className="pipeline-card">
        <div className="mini-heading">
          <Layers3 size={18} className="text-emerald-400" />
          <h3>From ink to insight</h3>
          <span>THE PROCESS</span>
        </div>
        <div className="pipeline-steps">
          {[
            ["01", "Prepare", "Crop bounding box, aspect-preserve & center"],
            ["02", "Understand", "Extract spatial convolutional feature maps"],
            ["03", "Recognize", "Softmax score across 36 character classes"],
          ].map(([number, title, text]) => (
            <div className="pipeline-step" key={number}>
              <span>{number}</span>
              <div>
                <strong>{title}</strong>
                <p>{text}</p>
              </div>
              {number === "03" ? (
                <Sparkles size={16} className="text-emerald-400" />
              ) : (
                <ArrowUpRight size={16} />
              )}
            </div>
          ))}
        </div>
      </Card>

      {/* Model Note */}
      <div className="model-note">
        <Activity size={18} className="text-emerald-400 shrink-0 mt-0.5" />
        <div>
          <strong>A real model. Real predictions.</strong>
          <p>
            {metrics
              ? `${metrics.model} was trained on ${metrics.train_samples.toLocaleString()} handwritten characters from NIST Special Database 19. No mock inference.`
              : "Predictions come directly from a trained PyTorch convolutional neural network."}
          </p>
        </div>
      </div>
    </aside>
  );
}
