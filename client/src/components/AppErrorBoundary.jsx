import { Component } from 'react';

function isChunkLoadError(error) {
  const text = `${error?.name || ''} ${error?.message || ''}`.toLowerCase();
  return text.includes('chunk') || text.includes('dynamically imported module') || text.includes('failed to fetch');
}

export default class AppErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[AppErrorBoundary]', error, info);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const chunkError = isChunkLoadError(error);

    return (
      <div className="app-error-page">
        <div className="app-error-card">
          <h2>页面加载失败</h2>
          <p>
            {chunkError
              ? '手机可能缓存了旧版本页面，刷新后会重新加载最新资源。'
              : '页面运行时遇到错误，请刷新后重试。'}
          </p>
          <button type="button" className="btn-primary" onClick={() => window.location.reload()}>
            刷新页面
          </button>
          {!chunkError && <p className="hint-text app-error-detail">{error.message}</p>}
        </div>
      </div>
    );
  }
}
