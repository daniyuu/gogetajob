import React, { useState } from 'react';

interface AddProjectModalProps {
  onAdd: (url: string) => Promise<void>;
  onClose: () => void;
}

export function AddProjectModal({ onAdd, onClose }: AddProjectModalProps) {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!url.trim()) {
      setError('请输入 GitHub 仓库地址');
      return;
    }

    // Simple GitHub URL validation
    if (!url.includes('github.com')) {
      setError('请输入有效的 GitHub 仓库地址');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await onAdd(url.trim());
      onClose();
    } catch (err: any) {
      setError(err.message || '添加失败，请重试');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>添加项目</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="repo-url">GitHub 仓库地址</label>
            <input
              id="repo-url"
              type="text"
              className="form-input"
              placeholder="https://github.com/owner/repo"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={loading}
              autoFocus
            />
            {error && (
              <div style={{ color: '#aa0000', fontSize: '12px', marginTop: '8px' }}>
                {error}
              </div>
            )}
          </div>

          <div className="modal-footer">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              disabled={loading}
            >
              取消
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading}
            >
              {loading ? '添加中...' : '添加'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
