import React from 'react';
import { Project } from '../api';

interface ProjectListProps {
  projects: Project[];
  onBuy: (project: Project) => void;
  loading?: boolean;
}

export function ProjectList({ projects, onBuy, loading }: ProjectListProps) {
  if (loading) {
    return <div className="loading">加载中...</div>;
  }

  if (projects.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '40px', color: '#888' }}>
        暂无项目，点击上方"添加项目"开始
      </div>
    );
  }

  return (
    <table className="table">
      <thead>
        <tr>
          <th>项目名称</th>
          <th>语言</th>
          <th>Stars</th>
          <th>Forks</th>
          <th>价格</th>
          <th>最后提交</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        {projects.map((project) => {
          const price = project.stars + project.forks * 2;
          const lastCommit = project.last_commit_at
            ? new Date(project.last_commit_at).toLocaleDateString('zh-CN')
            : '未知';

          return (
            <tr key={project.id}>
              <td>
                <strong>{project.name}</strong>
                {project.description && (
                  <div style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>
                    {project.description}
                  </div>
                )}
              </td>
              <td>{project.language || '-'}</td>
              <td>{project.stars.toLocaleString()}</td>
              <td>{project.forks.toLocaleString()}</td>
              <td style={{ fontWeight: 'bold' }}>{price.toLocaleString()}</td>
              <td>{lastCommit}</td>
              <td>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => onBuy(project)}
                >
                  买入
                </button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
