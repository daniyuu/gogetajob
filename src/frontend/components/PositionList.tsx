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
          const isActive = position.status === 'active';

          return (
            <tr key={position.id}>
              <td>#{position.project_id}</td>
              <td>{position.buy_price.toLocaleString()}</td>
              <td>{position.token_cost.toLocaleString()}</td>
              <td>{startedAt}</td>
              <td>
                {isActive ? (
                  <span className="price-up">活跃</span>
                ) : (
                  <span className="price-down">已停止</span>
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
