import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/globals.css'
import './styles/tokens.css'

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null
    };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({
      errorInfo: errorInfo
    });

    console.error('Error caught by boundary:', error);
    console.error('Component stack:', errorInfo.componentStack);
    if (React.captureOwnerStack) {
      console.error('Owner stack:', React.captureOwnerStack());
    }
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div style={{
          padding: '20px',
          margin: '20px',
          backgroundColor: '#fee',
          border: '1px solid #fcc',
          borderRadius: '4px',
          fontFamily: 'monospace',
          maxHeight: '80vh',
          overflow: 'auto',
          color: '#333'
        }}>
          <h2 style={{ color: '#c00', marginTop: 0 }}>Something went wrong</h2>

          <details open style={{ marginBottom: '20px' }}>
            <summary style={{ fontWeight: 'bold', cursor: 'pointer' }}>
              Error Details
            </summary>
            <pre style={{
              backgroundColor: '#f5f5f5',
              padding: '10px',
              borderRadius: '4px',
              overflow: 'auto'
            }}>
              {this.state.error && this.state.error.toString()}
            </pre>
          </details>

          {this.state.error && this.state.error.stack && (
            <details open style={{ marginBottom: '20px' }}>
              <summary style={{ fontWeight: 'bold', cursor: 'pointer' }}>
                Stack Trace
              </summary>
              <pre style={{
                backgroundColor: '#f5f5f5',
                padding: '10px',
                borderRadius: '4px',
                overflow: 'auto',
                whiteSpace: 'pre-wrap',
                wordWrap: 'break-word'
              }}>
                {this.state.error.stack}
              </pre>
            </details>
          )}

          {this.state.errorInfo && this.state.errorInfo.componentStack && (
            <details open>
              <summary style={{ fontWeight: 'bold', cursor: 'pointer' }}>
                Component Stack
              </summary>
              <pre style={{
                backgroundColor: '#f5f5f5',
                padding: '10px',
                borderRadius: '4px',
                overflow: 'auto',
                whiteSpace: 'pre-wrap',
                wordWrap: 'break-word'
              }}>
                {this.state.errorInfo.componentStack}
              </pre>
            </details>
          )}

          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: '20px',
              padding: '8px 16px',
              backgroundColor: '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Reload Page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
)
