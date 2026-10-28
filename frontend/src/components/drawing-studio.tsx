"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, Eraser, ImageUp, Loader2, PenLine, RotateCcw, Undo2, Upload, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { RecognitionMode } from "@/lib/types";
import { clearResult, recognize, setCharacterType as selectCharacterType, useAppDispatch, useAppSelector } from "@/lib/store";
const SIZE = 560;
const HEIGHT = 400;

export const DrawingStudio: React.FC =():React.JSX.Element => {
  const dispatch = useAppDispatch();
  const { samples, status, metrics } = useAppSelector((s) => s.lab);
  const canvas = useRef<HTMLCanvasElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const drawing = useRef<boolean>(false);
  const snapshots = useRef<ImageData[]>([]);
  const revision = useRef(0);
  const [hasInk, setHasInk] = useState<boolean>(false);
  const [brush, setBrush] = useState<number>(24);
  const [erase, setErase] = useState<boolean>(false);
  const [undoCount, setUndoCount] = useState<number>(0);
  const [mode, setMode] = useState<"draw" | "upload">("draw");
  const [source, setSource] = useState<string>("Drawing");
  const [expected, setExpected] = useState<string | undefined>();
  const [fileError, setFileError] = useState<string | null>(null);
  const [imageLoading, setImageLoading] = useState<boolean>(false);
  const [variant, setVariant] = useState<number>(0);
  const characterType = useAppSelector((state) => state.lab.characterType);
  const setCharacterType = (value: RecognitionMode) => dispatch(selectCharacterType(value));

  const visibleClasses = (metrics?.classes ?? []).filter((label) =>
    characterType === "all" ||
    (characterType === "letters" ? /^[A-Z]$/.test(label) : /^[0-9]$/.test(label))
  );

  const busy = status === "loading" || imageLoading;

  const clear = useCallback(() => {
    revision.current++;
    const ctx = canvas.current?.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, SIZE, HEIGHT);
    }
    snapshots.current = [];
    setUndoCount(0);
    setHasInk(false);
    setExpected(undefined);
    setSource("Drawing");
    setFileError(null);
    dispatch(clearResult());
  }, [dispatch]);

  useEffect(() => {
    clear();
  }, [clear]);

  const saveSnapshot = () => {
    const ctx = canvas.current?.getContext("2d");
    if (ctx) {
      snapshots.current.push(ctx.getImageData(0, 0, SIZE, HEIGHT));
      if (snapshots.current.length > 20) snapshots.current.shift();
      setUndoCount(snapshots.current.length);
    }
  };

  function undo() {
    const ctx = canvas.current?.getContext("2d");
    const last = snapshots.current.pop();
    if (ctx && last) {
      ctx.putImageData(last, 0, 0);
      setHasInk(last.data.some((value, i) => i % 4 === 0 && value < 240));
      setUndoCount(snapshots.current.length);
      setExpected(undefined);
      dispatch(clearResult());
    }
  }

  function point(event: React.PointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) * SIZE) / rect.width,
      y: ((event.clientY - rect.top) * HEIGHT) / rect.height,
    };
  }

  function start(event: React.PointerEvent<HTMLCanvasElement>) {
    if (busy || mode !== "draw") return;
    event.preventDefault();
    saveSnapshot();
    drawing.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    const ctx = event.currentTarget.getContext("2d")!;
    const p = point(event);
    ctx.strokeStyle = erase ? "#ffffff" : "#202631";
    ctx.fillStyle = ctx.strokeStyle;
    ctx.lineWidth = erase ? brush * 2 : brush;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.arc(p.x, p.y, ctx.lineWidth / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    setHasInk(true);
    setSource("Drawing");
    setExpected(undefined);
    dispatch(clearResult());
  }

  function move(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const ctx = event.currentTarget.getContext("2d")!;
    const p = point(event);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }

  function stop() {
    drawing.current = false;
  }

  function loadImage(value: string, sourceName: string, label?: string) {
    const currentRevision = ++revision.current;
    setImageLoading(true);
    setFileError(null);
    dispatch(clearResult());
    const image = new Image();
    image.onload = () => {
      if (currentRevision !== revision.current) return;
      const ctx = canvas.current?.getContext("2d");
      if (ctx) {
        saveSnapshot();
        ctx.fillStyle = "white";
        ctx.fillRect(0, 0, SIZE, HEIGHT);
        const scale = Math.min((SIZE - 40) / image.width, (HEIGHT - 40) / image.height);
        ctx.drawImage(
          image,
          (SIZE - image.width * scale) / 2,
          (HEIGHT - image.height * scale) / 2,
          image.width * scale,
          image.height * scale
        );
        setHasInk(true);
        setSource(sourceName);
        setExpected(label);
      }
      setImageLoading(false);
    };
    image.onerror = () => {
      if (currentRevision === revision.current) {
        setImageLoading(false);
        setFileError("Could not load this image.");
      }
    };
    image.src = value;
  }

  function upload(file?: File) {
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setFileError("Choose a PNG, JPEG, or WebP image.");
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      setFileError("Choose an image smaller than 4 MB.");
      return;
    }
    setFileError(null);
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        if (image.width * image.height > 4_000_000) {
          setFileError("Choose an image with at most 4 million pixels.");
          return;
        }
        loadImage(reader.result as string, "Upload");
      };
      image.onerror = () => setFileError("Could not decode this image.");
      image.src = reader.result as string;
    };
    reader.onerror = () => setFileError("Could not read this file.");
    reader.readAsDataURL(file);
  }

  return (
    <div className="studio-column space-y-6">
      <Card className="drawing-card">
        <div className="panel-heading">
          <div>
            <span className="eyebrow flex items-center gap-1.5">
              <Sparkles className="h-3 w-3 text-emerald-400" />
              01 / INPUT STUDIO
            </span>
            <h2>Your handwriting, decoded.</h2>
          </div>
          <span className="small-label hidden sm:inline-block">CNN</span>
        </div>

        {/* Input Mode Selector */}
        <div className="mode-tabs" aria-label="Input mode">
          <button
            className={mode === "draw" ? "selected" : ""}
            onClick={() => setMode("draw")}
            disabled={busy}
          >
            <PenLine size={15} /> Draw a character
          </button>
          <button
            className={mode === "upload" ? "selected" : ""}
            onClick={() => setMode("upload")}
            disabled={busy}
          >
            <Upload size={15} /> Upload image
          </button>
        </div>

        {/* Vocabulary filter */}
        <fieldset className="character-type">
          <legend>Character vocabulary &amp; filter</legend>
          <div>
            {(
              [
                ["all", "Letters + digits"],
                ["letters", "Letters A-Z"],
                ["digits", "Digits 0-9"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={characterType === value}
                disabled={busy}
                onClick={() => {
                  setCharacterType(value);
                  dispatch(clearResult());
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <p>
            Letter case is normalized to uppercase. Choose a vocabulary mode to distinguish similar shapes such as O/0 and I/1.
          </p>
        </fieldset>

        {/* Interactive Canvas */}
        <div
          className="canvas-wrap"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            if (!busy) {
              setMode("upload");
              upload(event.dataTransfer.files[0]);
            }
          }}
        >
          <span className="corner tl" />
          <span className="corner tr" />
          <span className="corner bl" />
          <span className="corner br" />
          <canvas
            ref={canvas}
            width={SIZE}
            height={HEIGHT}
            onPointerDown={start}
            onPointerMove={move}
            onPointerUp={stop}
            onPointerCancel={stop}
            onLostPointerCapture={stop}
            aria-label="Handwriting canvas. Draw a character using your mouse, pen, or touch. You can also upload an image or choose a sample."
          />
          {!hasInk && (
            <div className="canvas-placeholder">
              {mode === "draw" ? (
                <>
                  <span className="scribble">A</span>
                  <p>Make your mark.</p>
                  <span>Draw a letter A-Z or a digit 0-9 in the box</span>
                </>
              ) : (
                <>
                  <ImageUp size={44} className="text-emerald-400 mb-2" />
                  <p>Bring your own handwriting.</p>
                  <span>Drop an image here or choose a file from your computer</span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-white/20 bg-black/40 text-white hover:bg-black/60 hover:border-emerald-400 font-semibold"
                    onClick={() => input.current?.click()}
                  >
                    Choose image
                  </Button>
                </>
              )}
            </div>
          )}
          <span className="canvas-caption">
            {hasInk ? source : "CANVAS READY"} <span>560 × 400 PX</span>
          </span>
        </div>

        <input
          ref={input}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="sr-only"
          aria-label="Upload handwriting image"
          onChange={(event) => {
            upload(event.target.files?.[0]);
            event.target.value = "";
          }}
        />

        {/* Drawing Tools */}
        <div className="canvas-toolbar">
          <div className="tools">
            <Button
              variant={erase ? "ghost" : "secondary"}
              size="icon"
              disabled={busy || mode !== "draw"}
              onClick={() => setErase(false)}
              aria-label="Pen"
              aria-pressed={!erase}
            >
              <PenLine />
            </Button>
            <Button
              variant={erase ? "secondary" : "ghost"}
              size="icon"
              disabled={busy || mode !== "draw"}
              onClick={() => setErase(true)}
              aria-label="Eraser"
              aria-pressed={erase}
            >
              <Eraser />
            </Button>
            <span className="divider" />
            <label className="brush">
              Stroke{" "}
              <input
                type="range"
                min="12"
                max="40"
                value={brush}
                onChange={(event) => setBrush(Number(event.target.value))}
                disabled={busy || mode !== "draw"}
              />
            </label>
          </div>
          <div className="tools">
            <Button
              variant="ghost"
              size="icon"
              onClick={undo}
              disabled={!undoCount || busy}
              aria-label="Undo"
            >
              <Undo2 />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={clear}
              disabled={busy}
              aria-label="Clear canvas"
            >
              <RotateCcw />
            </Button>
            {mode === "upload" && (
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => input.current?.click()}
                className="border-slate-700 bg-slate-900/60 hover:bg-slate-800 text-xs text-slate-200"
              >
                Choose file
              </Button>
            )}
          </div>
        </div>

        {fileError && <p role="alert" className="inline-error">{fileError}</p>}

        {/* Recognition Button Row */}
        <div className="recognize-row">
          <p>
            A little messy is okay.
            <span>Keep it centered, with some breathing room.</span>
          </p>
          <Button
            size="lg"
            disabled={!hasInk || busy || !metrics}
            onClick={() => {
              const image = canvas.current?.toDataURL("image/png");
              if (image) void dispatch(recognize({ image, source, expected, mode: characterType }));
            }}
          >
            {busy ? (
              <>
                <Loader2 className="spin" /> Reading ink…
              </>
            ) : (
              <>
                Recognize character <ArrowRight />
              </>
            )}
          </Button>
        </div>
      </Card>

      {/* Benchmark EMNIST Samples */}
      <Card className="samples-card">
        <div className="sample-heading">
          <div>
            <h3>EMNIST Benchmark Dataset</h3>
            <p>Real handwriting from the NIST EMNIST test set. Letters are case-insensitive.</p>
          </div>
          <button
            className="text-link"
            onClick={() => setVariant((variant + 1) % 3)}
            disabled={!samples.length || busy}
          >
            Shuffle samples <RotateCcw size={12} />
          </button>
        </div>
        <div className="sample-grid">
          {visibleClasses.map((label) => {
            const sample = samples.find((s) => s.id === `${label}-${variant}`);
            return (
              <button
                key={label}
                className="sample"
                aria-label={`Load EMNIST sample character ${label}`}
                disabled={!sample || busy}
                onClick={() => sample && loadImage(sample.image, "EMNIST sample", sample.label)}
              >
                {sample ? <img src={sample.image} alt="" /> : <span>{label}</span>}
                <small>{label}</small>
              </button>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
