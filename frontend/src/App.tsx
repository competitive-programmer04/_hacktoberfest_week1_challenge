import {useRef, useState, useEffect} from "react";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";
const MAX_RECORD_SECONDS = 6;
const MAX_UPLOAD_SECONDS = 30;

type Result = {
  species: string;
  confidence: number;
  alternative?: {species: string; confidence: number}[]
};

type Status = "idle"|"recording"|"uploading"|"analyzing"|"done"|"error";

export default function App(){
  const [status, setStatus] = useState<Status>("idle");
  const [result, setResult] = useState<Result|null>(null);
  const [error, setError] = useState<string|null>(null);
  const [countdown, setCountdown] = useState(MAX_RECORD_SECONDS);

  const mediaRecorderRef = useRef<MediaRecorder|null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream|null>(null);
  const timerRef = useRef<number|null>(null);

  // Cleanup on unmount
  useEffect(()=>{
    return ()=>{
      streamRef.current?.getTracks().forEach((t)=>t.stop());
      if(timerRef.current) window.clearInterval(timerRef.current);
    };
  }, []);

  async function getGeolocation(): Promise<{lat?: number; lon?: number}>{
    return new Promise((resolve)=>{
      if(!navigator.geolocation) return resolve({});
      navigator.geolocation.getCurrentPosition(
        (pos)=>resolve({lat: pos.coords.latitude, lon: pos.coords.longitude}),
        ()=>resolve({}),
        {timeout: 3000}
      );
    });
  }

  function weekOfYear(): number{
    const now = new Date();
    const start = new Date(now.getFullYear(),0, 1);
    const days = Math.floor((now.getTime()-start.getTime())/86400000);
    return Math.min(48, Math.max(1, Math.ceil((days + start.getDay() + 1)/7)));
  }

  async function sendAudio(blob: Blob, filename: string){
    setStatus("uploading");
    setError(null);
    setResult(null);

    try{
      const {lat, lon} = await getGeolocation();
      const form = new FormData();
      form.append("audio_file", blob, filename);
      if(lat != null && lon != null){
        form.append("lat", String(lat));
        form.append("lon", String(lon));
        form.append("week", String(weekOfYear()));
      }
      setStatus("analyzing");
      const res = await fetch(`${API_URL}/api/identify`,{
        method: "POST",
        body: form,
      });
      if(!res.ok){
        const msg = await res.text();
        throw new Error(msg || `Server error ${res.status}`);
      }
      const data: Result = await res.json();
      setResult(data);
      setStatus("done");
    }catch(e: any){
      setError(e.message ?? "Something went wrong");
      setStatus("error");
    }
  }

  async function startRecording(){
    setError(null);
    setResult(null);
    try{
      const stream = await navigator.mediaDevices.getUserMedia({
        audio:{
          channelCount: 1,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      streamRef.current = stream;
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm";
      const recorder = new MediaRecorder(stream, {mimeType: mime});
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];
      recorder.onstop = async ()=>{
        stream.getTracks().forEach((t)=>t.stop());
        streamRef.current = null;
        const blob = new Blob(chunksRef.current, {type: mime});
        await sendAudio(blob, "recording.webm");
      };

      recorder.start();
      setStatus("recording");
      setCountdown(MAX_RECORD_SECONDS);
      const started = Date.now();
      timerRef.current = window.setInterval(()=>{
        const elapsed = (Date.now() - started)/1000;
        const remaining = Math.max(0, MAX_RECORD_SECONDS-elapsed);
        setCountdown(Math.ceil(remaining));
        if(remaining <= 0){
          if(timerRef.current) window.clearInterval(timerRef.current);
          timerRef.current = null;
          recorder.stop();
        }
      }, 100);
    }catch(e: any){
      setError("Microphone access denied or unavailable.");
      setStatus("error");
    }
  }

  async function onFileSelected(e: React.ChangeEvent<HTMLInputElement>){
    const file = e.target.files?.[0];
    if(!file) return;
    
    // validate the duration of file in client side
    const duration = await getAudioDuration(file);
    if(duration > MAX_UPLOAD_SECONDS){
      setError(`File is ${duration.toFixed(1)}s. Max is ${MAX_UPLOAD_SECONDS}s.`);
      setStatus("error");
      e.target.value = "";
      return;
    }
    await sendAudio(file, file.name);
    e.target.value = "";
  }

  function reset(){
    setStatus("idle");
    setResult(null);
    setError(null);
  }

   return (
    <main style={styles.main}>
      <header style={styles.header}>
        <h1 style={styles.title}>🐦 Touch Grass Birder</h1>
        <p style={styles.subtitle}>
          Point. Listen. Look up. Put your phone away.
        </p>
      </header>

      {status === "idle" && (
        <section style={styles.card}>
          <button style={styles.primaryBtn} onClick={startRecording}>
            🎙️ Record {MAX_RECORD_SECONDS}s
          </button>

          <div style={styles.divider}>or</div>

          <label style={styles.uploadLabel}>
            📁 Upload audio (max {MAX_UPLOAD_SECONDS}s)
            <input
              type="file"
              accept="audio/*"
              onChange={onFileSelected}
              style={{ display: "none" }}
            />
          </label>

          <p style={styles.hint}>
            Tip: allow location access for far fewer false positives.
          </p>
        </section>
      )}

      {status === "recording" && (
        <section style={styles.card}>
          <div style={styles.bigCount}>{countdown}</div>
          <p style={styles.hint}>Recording… stay still.</p>
        </section>
      )}

      {(status === "uploading" || status === "analyzing") && (
        <section style={styles.card}>
          <div style={styles.spinner} />
          <p style={styles.hint}>
            {status === "uploading" ? "Uploading audio…" : "Identifying species…"}
          </p>
        </section>
      )}

      {status === "done" && result && (
        <section style={styles.card}>
          <p style={styles.hint}>Best match</p>
          <h2 style={styles.species}>{prettyName(result.species)}</h2>
          <p style={styles.confidence}>
            {(result.confidence * 100).toFixed(1)}% confidence
          </p>

          {result.alternative && result.alternative.length > 0 && (
            <details style={styles.details}>
              <summary style={styles.summary}>Other possibilities</summary>
              <ul style={styles.list}>
                {result.alternative.map((a) => (
                  <li key={a.species} style={styles.listItem}>
                    {prettyName(a.species)} — {(a.confidence * 100).toFixed(1)}%
                  </li>
                ))}
              </ul>
            </details>
          )}

          <div style={styles.pocketBox}>
            <p style={styles.pocketText}>
              📵 Now look up. Pocket your phone and find it.
            </p>
          </div>

          <button style={styles.secondaryBtn} onClick={reset}>
            Identify another
          </button>
        </section>
      )}

      {status === "error" && (
        <section style={styles.card}>
          <p style={styles.errorText}>⚠️ {error}</p>
          <button style={styles.secondaryBtn} onClick={reset}>
            Try again
          </button>
        </section>
      )}
    </main>
  );
}

function prettyName(raw: string): string{
  // BirdNET returns "Poecile atricapillus_Black-capped Chickadee"
  const parts = raw.split("_");
  return parts.length > 1 ? parts[1]: raw;
}

function getAudioDuration(file: File): Promise<number>{
  return new Promise((resolve)=>{
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    audio.preload = "metadata";
    audio.onloadedmetadata = ()=>{
      URL.revokeObjectURL(url);
      resolve(isFinite(audio.duration)?audio.duration: 0);
    };
    audio.onerror = ()=>{
      URL.revokeObjectURL(url);
      resolve(0);
    };
    audio.src = url;
  });
}

const styles: Record<string, React.CSSProperties> = {
  main: {
    minHeight: "100vh",
    background: "linear-gradient(180deg, #0f172a 0%, #1e293b 100%)",
    color: "#e2e8f0",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "2rem 1rem",
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  },
  header: { textAlign: "center", marginBottom: "2rem" },
  title: { fontSize: "1.8rem", margin: 0 },
  subtitle: { color: "#94a3b8", marginTop: "0.5rem" },
  card: {
    background: "#1e293b",
    border: "1px solid #334155",
    borderRadius: "16px",
    padding: "2rem",
    width: "100%",
    maxWidth: "420px",
    display: "flex",
    flexDirection: "column",
    gap: "1rem",
    alignItems: "center",
    boxShadow: "0 10px 30px rgba(0,0,0,0.3)",
  },
  primaryBtn: {
    background: "#22c55e",
    color: "#052e16",
    border: "none",
    borderRadius: "12px",
    padding: "1rem 2rem",
    fontSize: "1.1rem",
    fontWeight: 600,
    cursor: "pointer",
    width: "100%",
  },
  secondaryBtn: {
    background: "transparent",
    color: "#94a3b8",
    border: "1px solid #475569",
    borderRadius: "10px",
    padding: "0.6rem 1.2rem",
    cursor: "pointer",
    marginTop: "0.5rem",
  },
  uploadLabel: {
    background: "#334155",
    color: "#e2e8f0",
    borderRadius: "12px",
    padding: "1rem 2rem",
    fontSize: "1rem",
    cursor: "pointer",
    width: "100%",
    textAlign: "center",
  },
  divider: { color: "#64748b", fontSize: "0.85rem" },
  hint: { color: "#94a3b8", fontSize: "0.85rem", textAlign: "center", margin: 0 },
  bigCount: { fontSize: "5rem", fontWeight: 700, color: "#22c55e" },
  spinner: {
    width: "40px",
    height: "40px",
    border: "4px solid #334155",
    borderTop: "4px solid #22c55e",
    borderRadius: "50%",
    animation: "spin 1s linear infinite",
  },
  species: { fontSize: "1.6rem", margin: 0, textAlign: "center" },
  confidence: { color: "#22c55e", margin: 0, fontWeight: 600 },
  details: { width: "100%", marginTop: "0.5rem" },
  summary: { cursor: "pointer", color: "#94a3b8", fontSize: "0.9rem" },
  list: { paddingLeft: "1.2rem", marginTop: "0.5rem" },
  listItem: { color: "#cbd5e1", fontSize: "0.9rem", marginBottom: "0.25rem" },
  pocketBox: {
    background: "#0f172a",
    border: "1px dashed #22c55e",
    borderRadius: "10px",
    padding: "1rem",
    width: "100%",
    marginTop: "0.5rem",
  },
  pocketText: { margin: 0, textAlign: "center", color: "#22c55e" },
  errorText: { color: "#f87171", textAlign: "center", margin: 0 },
};