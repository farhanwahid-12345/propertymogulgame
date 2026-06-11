import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { registerPwa, bumpSessionCount } from './lib/pwa'

bumpSessionCount();
registerPwa();

createRoot(document.getElementById("root")!).render(<App />);
