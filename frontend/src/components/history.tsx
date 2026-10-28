"use client";
import { Download, History as HistoryIcon, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { clearHistory, useAppDispatch, useAppSelector } from "@/lib/store";

export const History: React.FC = ():React.JSX.Element => {
  const history = useAppSelector((s) => s.lab.history);
  const dispatch = useAppDispatch();
  const download = ():void => {
    const rows = [
      ["timestamp", "source", "expected_character", "predicted_character", "mode", "model_score", "latency_ms"],
      ...history.map((item) => [
        item.timestamp,
        item.source,
        item.expected ?? "",
        item.prediction,
        item.mode ?? "digits",
        item.confidence,
        item.latency_ms,
      ]),
    ];
    const csv = rows
      .map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(","))
      .join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "inklab-recognition-history.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="history-content space-y-6">
      <div className="section-intro">
        <div>
          <h2>Every mark has a story.</h2>
          <p>Your latest 50 predictions, cached locally in this browser session.</p>
        </div>
        <div className="tools">
          <Button
            variant="outline"
            onClick={download}
            disabled={!history.length}
            className="border-white/20 bg-black/40 hover:bg-black/60 text-white hover:border-emerald-400 gap-1.5 text-xs rounded-lg font-semibold"
          >
            <Download className="h-4 w-4 text-emerald-300" />
            Export CSV
          </Button>
          <Button
            variant="ghost"
            onClick={() => dispatch(clearHistory())}
            disabled={!history.length}
            className="text-slate-200 hover:text-rose-300 hover:bg-rose-950/30 gap-1.5 text-xs rounded-lg font-semibold"
          >
            <Trash2 className="h-4 w-4" />
            Clear history
          </Button>
        </div>
      </div>

      {history.length ? (
        <Card className="history-table table-scroll">
          <table>
            <thead>
              <tr>
                <th>Input</th>
                <th>Prediction</th>
                <th>Model score</th>
                <th>Source</th>
                <th>Expected</th>
                <th>Time</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {history.map((item) => (
                <tr key={item.id}>
                  <td>
                    <img src={item.image} alt="Original handwritten input" />
                  </td>
                  <td>
                    <span className="digit-chip">{item.prediction}</span>
                  </td>
                  <td>{(item.confidence * 100).toFixed(1)}%</td>
                  <td>{item.source}</td>
                  <td>{item.expected ?? "—"}</td>
                  <td>{item.latency_ms.toFixed(0)} ms</td>
                  <td>{new Date(item.timestamp).toLocaleTimeString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : (
        <Card className="empty-page border-white/15 bg-black/40">
          <HistoryIcon size={44} className="text-emerald-400" />
          <h2>A fresh page.</h2>
          <p>Recognize a character in the studio to start building your prediction history.</p>
        </Card>
      )}
    </div>
  );
}
