import './style.css';
import ReactDOM from 'react-dom/client';
import { HashRouter, Navigate, Route, Routes } from 'react-router';
import { App } from './App';
import { About } from './sections/About';
import { Account } from './sections/Account';
import { Generation } from './sections/Generation';
import { Models } from './sections/Models';
import { Pro } from './sections/Pro';
import { Soul } from './sections/Soul';
import { Licence } from './sections/Licence';

// Extension pages are our own documents, so the theme goes on <html> as usual —
// unlike injected UI, which has to carry it inside a shadow root.
document.documentElement.dataset.theme = window.matchMedia('(prefers-color-scheme: dark)').matches
  ? 'replyai-dark'
  : 'replyai-light';

/**
 * Hash routing, not history routing.
 *
 * The page is served from `chrome-extension://<id>/options.html`, a real file
 * with no server behind it: a pushed path like `/soul` would 404 on reload.
 * Keeping the section in the hash also gives the popup something to link to —
 * `options.html#/account` opens straight on that section.
 */
ReactDOM.createRoot(document.getElementById('root')!).render(
  <HashRouter>
    <Routes>
      <Route element={<App />}>
        <Route index element={<Navigate to="/account" replace />} />
        <Route path="/account" element={<Account />} />
        <Route path="/soul" element={<Soul />} />
        <Route path="/generation" element={<Generation />} />
        <Route path="/models" element={<Models />} />
        <Route path="/licence" element={<Licence />} />
        <Route path="/pro" element={<Pro />} />
        <Route path="/about" element={<About />} />
        {/* A stale bookmark should land somewhere, not on a blank page. */}
        <Route path="*" element={<Navigate to="/account" replace />} />
      </Route>
    </Routes>
  </HashRouter>,
);
