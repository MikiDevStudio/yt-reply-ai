import './style.css';
import ReactDOM from 'react-dom/client';
import { App } from './App';

// Extension pages are our own documents, so the theme goes on <html> as usual —
// unlike injected UI, which has to carry it inside a shadow root.
document.documentElement.dataset.theme = window.matchMedia('(prefers-color-scheme: dark)').matches
  ? 'replyai-dark'
  : 'replyai-light';

ReactDOM.createRoot(document.getElementById('root')!).render(<App />);
