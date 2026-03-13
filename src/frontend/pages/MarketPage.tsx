import React, { useEffect, useState } from 'react';
import { api, type Project } from '../api';
import { ProjectList } from '../components/ProjectList';
import { AddProjectModal } from '../components/AddProjectModal';

export function MarketPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);

  useEffect(() => {
    loadProjects();
  }, []);

  async function loadProjects() {
    try {
      const data = await api.getProjects();
      setProjects(data);
    } catch (error) {
      console.error('Failed to load projects:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleAddProject(url: string) {
    await api.addProject(url);
    await loadProjects();
  }

  async function handleBuyProject(project: Project) {
    if (!confirm(`确定要买入 ${project.name} 吗？`)) {
      return;
    }

    try {
      await api.buyPosition(project.id);
      alert('买入成功！请在"持仓管理"查看进度');
    } catch (error: any) {
      alert('买入失败: ' + (error.message || '未知错误'));
    }
  }

  if (loading) {
    return <div className="loading">加载中...</div>;
  }

  return (
    <div>
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 className="card-title" style={{ marginBottom: 0 }}>市场大厅</h2>
          <button
            className="btn btn-primary"
            onClick={() => setShowAddModal(true)}
          >
            + 添加项目
          </button>
        </div>

        <ProjectList
          projects={projects}
          onBuy={handleBuyProject}
        />
      </div>

      {showAddModal && (
        <AddProjectModal
          onAdd={handleAddProject}
          onClose={() => setShowAddModal(false)}
        />
      )}
    </div>
  );
}
