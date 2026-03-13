import React, { useEffect, useState } from 'react';
import { api, type Position } from '../api';
import { PositionList } from '../components/PositionList';

export function PositionsPage() {
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPositions();
  }, []);

  async function loadPositions() {
    try {
      const data = await api.getPositions();
      setPositions(data);
    } catch (error) {
      console.error('Failed to load positions:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleSellPosition(position: Position) {
    if (!confirm('确定要卖出这个持仓吗？AI 将停止为该项目贡献。')) {
      return;
    }

    try {
      await api.sellPosition(position.id);
      alert('卖出成功！');
      await loadPositions();
    } catch (error: any) {
      alert('卖出失败: ' + (error.message || '未知错误'));
    }
  }

  if (loading) {
    return <div className="loading">加载中...</div>;
  }

  return (
    <div className="card">
      <h2 className="card-title">持仓管理</h2>
      <PositionList
        positions={positions}
        onSell={handleSellPosition}
      />
    </div>
  );
}
