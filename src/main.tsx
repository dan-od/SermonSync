import { Component, StrictMode, type ErrorInfo, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import { ProjectorOutput } from './components/ProjectorOutput.tsx'
import './styles/global.css'

class AppErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('SermonSync render error', error, info);
  }

  render() {
    if (this.state.error) {
      return <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, boxSizing: 'border-box', background: '#181818', color: '#f4f7ff', fontFamily: 'system-ui, sans-serif' }}>
        <section style={{ maxWidth: 620, width: '100%', padding: 24, border: '1px solid #664c85', borderRadius: 12, background: '#24202c' }}>
          <h1 style={{ marginTop: 0, fontSize: 20 }}>SermonSync recovered from a display error</h1>
          <p style={{ color: '#c8c1d5' }}>A saved template or media item could not be rendered. Remove or replace that media after restarting the app.</p>
          <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', color: '#ff9ebd', fontSize: 12 }}>{this.state.error.message}</pre>
          <button type="button" onClick={() => window.location.reload()} style={{ padding: '9px 14px', cursor: 'pointer' }}>Reload app</button>
        </section>
      </main>;
    }
    return this.props.children;
  }
}

const isProjectorOutput = new URLSearchParams(window.location.search).get('window') === 'projector';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary>{isProjectorOutput ? <ProjectorOutput /> : <App />}</AppErrorBoundary>
  </StrictMode>,
)
