import React, { useEffect, useState } from 'react';
import { api, type Position, type Project } from '../api';

interface PositionStats {
  position: Position;
  project: Project;
  roi: number;
}

export function PortfolioPage() {
  const [stats, setStats] = useState<PositionStats[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  async function loadStats() {
    try {
      const positions = await api.getPositions();

      const enriched = await Promise.all(
        positions.map(async (pos) => {
          const [project, roiData] = await Promise.all([
            api.getProject(pos.project_id),
            api.getPositionROI(pos.id)
          ]);
          return { position: pos, project, roi: roiData.roi };
        })
      );

      setStats(enriched);
    } catch (error) {
      console.error('Failed to load stats:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return <div className="loading">加载中...</div>;
  }

  const totalInvested = stats.reduce((sum, s) => sum + s.position.token_cost, 0);
  const avgROI = stats.length > 0
    ? stats.reduce((sum, s) => sum + s.roi, 0) / stats.length
    : 0;

  return (
    <div>
      <div className="card">
        <h2 className="card-title">投资总览</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px', marginTop: '20px' }}>
          <div>
            <div style={{ fontSize: '12px', color: '#888', marginBottom: '8px' }}>总投入 (Tokens)</div>
            <div style={{ fontSize: '24px', fontWeight: 'bold' }}>
              {totalInvested.toLocaleString()}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '12px', color: '#888', marginBottom: '8px' }}>持仓数量</div>
            <div style={{ fontSize: '24px', fontWeight: 'bold' }}>
              {stats.length}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '12px', color: '#888', marginBottom: '8px' }}>平均 ROI</div>
            <div style={{ fontSize: '24px', fontWeight: 'bold' }} className={avgROI > 0 ? 'price-up' : avgROI < 0 ? 'price-down' : ''}>
              {avgROI.toFixed(2)}%
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <h2 className="card-title">持仓详情</h2>
        {stats.length === 0 ? (
          <div className="loading">暂无数据</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>项目</th>
                <th>买入价格</th>
                <th>当前价格</th>
                <th>Token 成本</th>
                <th>ROI</th>
                <th>状态</th>
              </tr>
            </thead>
            <tbody>
              {stats.map(({ position, project, roi }) => {
                const currentPrice = project.stars + project.forks * 2;
                return (
                  <tr key={position.id}>
                    <td><strong>{project.name}</strong></td>
                    <td>{position.buy_price.toLocaleString()}</td>
                    <td>{currentPrice.toLocaleString()}</td>
                    <td>{position.token_cost.toLocaleString()}</td>
                    <td className={roi > 0 ? 'price-up' : roi < 0 ? 'price-down' : ''}>
                      {roi.toFixed(2)}%
                    </td>
                    <td>
                      {position.status === 'active' ? (
                        <span className="price-up">活跃</span>
                      ) : (
                        <span className="price-down">已停止</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
