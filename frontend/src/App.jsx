import { useState } from 'react';
import Home from "../pages/home";
import Record from '../pages/record';

export default function App() {
  const [modelReady, setModelReady] = useState(false);

  return modelReady
    ? <Record />
    : <Home onReady={() => setModelReady(true)} />;
}