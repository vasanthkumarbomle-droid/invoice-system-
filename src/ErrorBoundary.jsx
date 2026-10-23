import { Component } from 'react'

export default class ErrorBoundary extends Component {
  state = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error, info) {
    console.error('LedgerFlow encountered a render error:', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <main
          role="alert"
          style={{
            minHeight: '100vh',
            display: 'grid',
            placeItems: 'center',
            padding: '24px',
            background: '#f6f8f6',
            color: '#25342b',
            fontFamily: 'system-ui, sans-serif',
          }}
        >
          <section style={{ maxWidth: '480px', background: '#fff', border: '1px solid #d9e2da', borderRadius: '16px', padding: '28px' }}>
            <h1 style={{ marginTop: 0 }}>LedgerFlow hit an unexpected error</h1>
            <p>The current screen could not be displayed. Your saved Supabase records have not been deleted by this error.</p>
            <button
              type="button"
              onClick={() => this.setState({ hasError: false })}
              style={{ border: 0, borderRadius: '8px', padding: '10px 16px', background: '#286747', color: '#fff', fontWeight: 700, cursor: 'pointer' }}
            >
              Try again
            </button>
          </section>
        </main>
      )
    }

    return this.props.children
  }
}
