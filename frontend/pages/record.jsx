import { useState } from 'react';
import { decodeToAudioBuffer, resample, chunkAudio } from '../src/audio';
import { analyzeChunks } from '../src/model';

const CONFIDENCE_THRESHOLD = 0.25;

export default function Record() {
  const [recording, setRecording] = useState(false);
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [birdImage, setBirdImage] = useState(null);
  const [error, setError] = useState(null);

  async function startRecording() {
    setError(null);
    setResults(null);
    setBirdImage(null);

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      setError('Microphone access denied. Please allow mic access and try again.');
      return;
    }

    setRecording(true);
    const recorder = new MediaRecorder(stream);
    const chunks = [];

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    recorder.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      setRecording(false);

      // Empty recording check
      const totalSize = chunks.reduce((sum, c) => sum + c.size, 0);
      if (totalSize < 1000) {
        setError('No audio detected. Make sure your microphone is working and try again.');
        return;
      }

      const blob = new Blob(chunks, { type: 'audio/webm' });
      if (blob.size < 1000) {
        setError('No audio detected. Try recording again.');
        return;
      }

      setLoading(true);
try {
  const audioBuffer = await decodeToAudioBuffer(blob);
  const resampled = await resample(audioBuffer, 48000);

  // Silence check via RMS
  let sumSquares = 0;
  for (let i = 0; i < resampled.length; i++) {
    sumSquares += resampled[i] * resampled[i];
  }
  const rms = Math.sqrt(sumSquares / resampled.length);
  console.log('RMS:', rms);

  const SILENCE_RMS_THRESHOLD = 0.005;
  if (rms < SILENCE_RMS_THRESHOLD) {
    setError('No sound detected. Make sure a bird is actually calling, then try again.');
    setLoading(false);
    return;
  }

  const audioChunks = chunkAudio(resampled, 48000);

  if (audioChunks.length === 0) {
    setError('Recording was too short. Try again.');
    setLoading(false);
    return;
  }
  
  const chunkResults = await Promise.all(
          audioChunks.map((chunk, i) => analyzeChunks(chunk, i))
        );

        // Aggregate — max confidence per species
        const speciesScores = {};
        for (const result of chunkResults) {
          for (let i = 0; i < result.confidences.length; i++) {
            const name = result.labels[i];
            const conf = result.confidences[i];
            if (!speciesScores[name] || conf > speciesScores[name]) {
              speciesScores[name] = conf;
            }
          }
        }

        const ranked = Object.entries(speciesScores)
          .map(([species, confidence]) => ({ species, confidence }))
          .sort((a, b) => b.confidence - a.confidence);

        const best = {
          species: ranked[0]?.species ?? '',
          confidence: ranked[0]?.confidence ?? 0,
          alternatives: ranked.slice(1, 6),
        };

        setResults(best);

        if (best.confidence >= CONFIDENCE_THRESHOLD && best.species) {
          const commonName = best.species.split('_')[1] || best.species;
          try {
            const imgRes = await fetch(
              `https://api.inaturalist.org/v1/observations?taxon_name=${encodeURIComponent(commonName)}&quality_grade=research&per_page=1`
            );
            if (!imgRes.ok) throw new Error('Offline');
            const imgData = await imgRes.json();
           if (imgData.results?.[0]?.photos?.[0]?.url) {
            setBirdImage(imgData.results[0].photos[0].url);
          }
        } catch (e) {
          // Offline or fetch failed — leave birdImage null, no broken image
          console.log('Image fetch skipped (offline or failed):', e.message);
  }
        }
      } catch (err) {
        console.error(err);
        setError('Something went wrong analyzing the audio. Try again.');
      } finally {
        setLoading(false);
      }
    };

    recorder.start();
    setTimeout(() => recorder.stop(), 6000);
  }

  function reset() {
    setResults(null);
    setBirdImage(null);
    setError(null);
  }

  const highConfidence = results && results.confidence >= CONFIDENCE_THRESHOLD;
  const lowConfidence = results && results.confidence < CONFIDENCE_THRESHOLD;

  return (
    <div style={styles.page}>
      <div style={styles.leafTopLeft}>🍃</div>
      <div style={styles.leafTopRight}>🌿</div>

      <header style={styles.header}>
        <h1 style={styles.title}>Touch Grass Birder</h1>
        <p style={styles.subtitle}>
          Record a bird call. Put your phone away. Go find it.
        </p>
      </header>

      <main style={styles.card}>
        {!recording && !loading && !results && !error && (
          <div style={styles.center}>
            <div style={styles.iconCircle}>🎙️</div>
            <button style={styles.primaryButton} onClick={startRecording}>
              Record 6 seconds
            </button>
            <p style={styles.hint}>
              Works offline. Audio never leaves your device.
            </p>
          </div>
        )}

        {recording && (
          <div style={styles.center}>
            <div style={styles.pulse} />
            <p style={styles.recordingText}>Listening…</p>
            <p style={styles.hint}>
              Stay still. Point toward the sound.
            </p>
          </div>
        )}

        {loading && (
          <div style={styles.center}>
            <div style={styles.spinner} />
            <p style={styles.recordingText}>Identifying…</p>
          </div>
        )}

        {error && (
          <div style={styles.center}>
            <div style={styles.iconCircleWarn}>⚠️</div>
            <p style={styles.errorText}>{error}</p>
            <button style={styles.secondaryButton} onClick={reset}>
              Try again
            </button>
          </div>
        )}

        {highConfidence && (
          <div style={styles.center}>
            {birdImage && (
              <img
                src={birdImage}
                alt={results.species}
                style={styles.birdImage}
              />
            )}
            <p style={styles.matchLabel}>Best match</p>
            <h2 style={styles.speciesName}>
              {results.species.split('_')[1] || results.species}
            </h2>
            <p style={styles.scientificName}>
              {results.species.split('_')[0]}
            </p>
            <div style={styles.confidenceBadge}>
              {(results.confidence * 100).toFixed(1)}% confidence
            </div>

            <div style={styles.pocketBox}>
              <p style={styles.pocketText}>
                📵 Look up. Pocket your phone. Find the bird.
              </p>
            </div>

            {results.alternatives.length > 0 && (
              <details style={styles.details}>
                <summary style={styles.summary}>Other possibilities</summary>
                <ul style={styles.list}>
                  {results.alternatives.map((alt, i) => (
                    <li key={i} style={styles.listItem}>
                      {alt.species.split('_')[1] || alt.species} —{' '}
                      {(alt.confidence * 100).toFixed(1)}%
                    </li>
                  ))}
                </ul>
              </details>
            )}

            <button style={styles.secondaryButton} onClick={reset}>
              Record another
            </button>
          </div>
        )}

        {lowConfidence && (
          <div style={styles.center}>
            <div style={styles.iconCircleWarn}>🔍</div>
            <p style={styles.matchLabel}>No confident match</p>
            <p style={styles.hint}>
              The model wasn't sure. Try again in a quieter spot, closer to the bird, or when the bird is actively calling.
            </p>

            <div style={styles.lowConfBox}>
              <p style={styles.lowConfLabel}>Closest guesses (low confidence):</p>
              <ul style={styles.list}>
                {results.alternatives.slice(0, 3).map((alt, i) => (
                  <li key={i} style={styles.listItem}>
                    {alt.species.split('_')[1] || alt.species} —{' '}
                    {(alt.confidence * 100).toFixed(1)}%
                  </li>
                ))}
              </ul>
            </div>

            <button style={styles.secondaryButton} onClick={reset}>
              Try again
            </button>
          </div>
        )}
      </main>

      <footer style={styles.footer}>
        Runs entirely on your device · Open model · No cloud
      </footer>
    </div>
  );
}

const styles = {
  page: {
    minHeight: '100vh',
    background: 'linear-gradient(180deg, #0b1f14 0%, #142b1e 50%, #1a2f1f 100%)',
    color: '#e8f0e5',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '2rem 1rem',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    position: 'relative',
    overflow: 'hidden',
  },
  leafTopLeft: {
    position: 'absolute',
    top: '1rem',
    left: '1rem',
    fontSize: '3rem',
    opacity: 0.15,
  },
  leafTopRight: {
    position: 'absolute',
    top: '1rem',
    right: '1rem',
    fontSize: '3rem',
    opacity: 0.15,
  },
  header: {
    textAlign: 'center',
    marginBottom: '2rem',
    zIndex: 1,
  },
  title: {
    fontSize: '1.6rem',
    margin: 0,
    color: '#a8d5a0',
    letterSpacing: '0.02em',
  },
  subtitle: {
    color: '#7ba874',
    marginTop: '0.5rem',
    fontSize: '0.9rem',
  },
  card: {
    background: 'rgba(20, 43, 30, 0.85)',
    border: '1px solid rgba(168, 213, 160, 0.2)',
    borderRadius: '20px',
    padding: '2.5rem 1.5rem',
    width: '100%',
    maxWidth: '440px',
    boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
    backdropFilter: 'blur(10px)',
    zIndex: 1,
  },
  center: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '1rem',
    textAlign: 'center',
  },
  iconCircle: {
    width: '80px',
    height: '80px',
    borderRadius: '50%',
    background: 'rgba(168, 213, 160, 0.1)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '2.5rem',
    marginBottom: '0.5rem',
  },
  iconCircleWarn: {
    width: '80px',
    height: '80px',
    borderRadius: '50%',
    background: 'rgba(217, 151, 89, 0.15)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '2.5rem',
    marginBottom: '0.5rem',
  },
  primaryButton: {
    background: '#a8d5a0',
    color: '#0b1f14',
    border: 'none',
    borderRadius: '12px',
    padding: '1rem 2rem',
    fontSize: '1.05rem',
    fontWeight: 600,
    cursor: 'pointer',
    width: '100%',
    transition: 'transform 0.15s',
  },
  secondaryButton: {
    background: 'transparent',
    color: '#a8d5a0',
    border: '1px solid rgba(168, 213, 160, 0.4)',
    borderRadius: '10px',
    padding: '0.7rem 1.5rem',
    cursor: 'pointer',
    marginTop: '0.5rem',
    fontSize: '0.95rem',
  },
  hint: {
    color: '#7ba874',
    fontSize: '0.85rem',
    margin: 0,
    lineHeight: 1.5,
  },
  pulse: {
    width: '80px',
    height: '80px',
    borderRadius: '50%',
    background: '#a8d5a0',
    animation: 'pulse 1.2s ease-in-out infinite',
  },
  spinner: {
    width: '48px',
    height: '48px',
    border: '4px solid rgba(168, 213, 160, 0.2)',
    borderTop: '4px solid #a8d5a0',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
  recordingText: {
    fontSize: '1.2rem',
    color: '#a8d5a0',
    margin: 0,
  },
  birdImage: {
    width: '180px',
    height: '180px',
    objectFit: 'cover',
    borderRadius: '16px',
    marginBottom: '0.5rem',
    border: '2px solid rgba(168, 213, 160, 0.3)',
  },
  matchLabel: {
    color: '#7ba874',
    fontSize: '0.8rem',
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
    margin: 0,
  },
  speciesName: {
    fontSize: '1.5rem',
    color: '#e8f0e5',
    margin: 0,
  },
  scientificName: {
    fontStyle: 'italic',
    color: '#7ba874',
    fontSize: '0.9rem',
    margin: 0,
  },
  confidenceBadge: {
    background: 'rgba(168, 213, 160, 0.15)',
    color: '#a8d5a0',
    padding: '0.4rem 1rem',
    borderRadius: '20px',
    fontSize: '0.9rem',
    fontWeight: 600,
  },
  pocketBox: {
    background: 'rgba(11, 31, 20, 0.8)',
    border: '1px dashed #a8d5a0',
    borderRadius: '12px',
    padding: '0.9rem',
    width: '100%',
    marginTop: '0.5rem',
  },
  pocketText: {
    margin: 0,
    color: '#a8d5a0',
    fontSize: '0.9rem',
  },
  details: {
    width: '100%',
    marginTop: '0.5rem',
  },
  summary: {
    cursor: 'pointer',
    color: '#7ba874',
    fontSize: '0.9rem',
  },
  list: {
    paddingLeft: '1.2rem',
    marginTop: '0.5rem',
    textAlign: 'left',
  },
  listItem: {
    color: '#c8d8c3',
    fontSize: '0.9rem',
    marginBottom: '0.3rem',
  },
  errorText: {
    color: '#e8a87c',
    fontSize: '0.95rem',
    margin: 0,
    lineHeight: 1.5,
  },
  lowConfBox: {
    background: 'rgba(217, 151, 89, 0.08)',
    border: '1px solid rgba(217, 151, 89, 0.3)',
    borderRadius: '12px',
    padding: '1rem',
    width: '100%',
  },
  lowConfLabel: {
    color: '#d99759',
    fontSize: '0.85rem',
    margin: '0 0 0.5rem 0',
    fontWeight: 600,
  },
  footer: {
    marginTop: '2rem',
    color: '#5a7d55',
    fontSize: '0.8rem',
    zIndex: 1,
  },
};