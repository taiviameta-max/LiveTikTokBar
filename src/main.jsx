import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';

const Page = lazy(() => (window.location.pathname === '/admin'
  ? import('./Admin.jsx')
  : import('./App.jsx')));

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Suspense fallback={null}>
      <Page />
    </Suspense>
  </StrictMode>,
);
