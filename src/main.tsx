import { Component, StrictMode, Suspense, type ErrorInfo, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { isProjectorWindow } from './lib/projectorOutput'
import { OperatorApp, ProjectorOutputWindow } from './windowRoots'
import './styles/global.css'

const projectorWindow = isProjectorWindow()

class AppErrorBoundary extends Component<{ children: ReactNode; silent?: boolean }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('SermonSync render error', error, info);
    if (this.props.silent) {
      // Congregation output: retry instead of staying black until someone notices.
      window.setTimeout(() => this.setState({ error: null }), 2000);
    }
  }

  render() {
    if (this.state.error && this.props.silent) {
      // Never show an error dialog to the congregation; go to black instead.
      return <div style={{ position: 'fixed', inset: 0, background: '#000', cursor: 'none' }} />;
    }
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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary silent={projectorWindow}>
      <Suspense fallback={projectorWindow ? <div style={{ position: 'fixed', inset: 0, background: '#000' }} /> : null}>
        {projectorWindow ? <ProjectorOutputWindow /> : <OperatorApp />}
      </Suspense>
    </AppErrorBoundary>
  </StrictMode>,
)
