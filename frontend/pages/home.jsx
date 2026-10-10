import { useEffect, useState } from 'react';
import { initModel } from "../src/model"

export default function Home({ onReady }) {
  const [status, setStatus] = useState('Initializing...');
  const [percent, setPercent] = useState(0);

  useEffect(() => {
    initModel(({ status, percent }) => {
      setStatus(status);
      setPercent(percent);
    })
      .then(() => onReady())
      .catch(err => setStatus(`Error: ${err.message}`));
  }, [onReady]);

  return (
    <div style={styles.container}>
      <h1>Touch Grass Birder</h1>
      <p>{status}</p>
      {percent > 0 && percent < 100 && (
        <div style={styles.progressBar}>
          <div style={{ ...styles.progressFill, width: `${percent}%` }} />
        </div>
      )}
    </div>
  );
}

const styles = {
  container: { padding: '2rem', textAlign: 'center', fontFamily: 'sans-serif' },
  progressBar: { width: '300px', height: '8px', background: '#333', borderRadius: '4px', margin: '1rem auto' },
  progressFill: { height: '100%', background: '#22c55e', borderRadius: '4px', transition: 'width 0.3s' }
};