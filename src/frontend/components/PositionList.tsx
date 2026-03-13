import React from 'react';
import { Position } from '../api';

interface PositionListProps {
  positions: Position[];
  onSell: (position: Position) => void;
}

export function PositionList({ positions, onSell }: PositionListProps) {
  if (positions.length === 0) {
    return <div className="loading">暂无持仓</div>;
  }

  return (
    <table className="table">
      <thead>
        <tr>
          <th>项目 ID</th>
          <th>买入价格</th>
          <th>Token 成本</th>
          <th>开始时间</th>
          <th>状态</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        {positions.map((position) => {
          const startedAt = new Date(position.started_at).toLocaleString('zh-CN');
          const isActive = position.status === 'working' || position.status === 'buying';
          const buyPrice = position.buy_price || 0;
          const tokenCost = position.token_cost || 0;

          return (
            <tr key={position.id}>
              <td>#{position.project_id}</td>
              <td>{buyPrice.toLocaleString()}</td>
              <td>{tokenCost.toLocaleString()}</td>
              <td>{startedAt}</td>
              <td>
                {position.status === 'working' ? (
                  <span className="price-up">工作中</span>
                ) : position.status === 'buying' ? (
                  <span className="price-up">启动中</span>
                ) : position.status === 'stopped' ? (
                  <span className="price-down">已停止</span>
                ) : position.status === 'error' ? (
                  <span style={{ color: '#e74c3c' }}>错误</span>
                ) : (
                  <span>{position.status}</span>
                )}
              </td>
              <td>
                {isActive ? (
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={() => onSell(position)}
                  >
                    卖出
                  </button>
                ) : (
                  <span style={{ color: '#888' }}>-</span>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
