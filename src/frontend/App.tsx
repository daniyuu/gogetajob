import React, { useState } from 'react';
import { MarketPage } from './pages/MarketPage';
import { PositionsPage } from './pages/PositionsPage';
import { PortfolioPage } from './pages/PortfolioPage';

type Page = 'market' | 'positions' | 'portfolio';

export function App() {
  const [currentPage, setCurrentPage] = useState<Page>('market');

  return (
    <div>
      <header className="header">
        <div className="container">
          <h1>🚀 GoGetAJob</h1>
          <nav className="nav">
            <a
              className={`nav-link ${currentPage === 'market' ? 'active' : ''}`}
              onClick={() => setCurrentPage('market')}
            >
              市场大厅
            </a>
            <a
              className={`nav-link ${currentPage === 'positions' ? 'active' : ''}`}
              onClick={() => setCurrentPage('positions')}
            >
              持仓管理
            </a>
            <a
              className={`nav-link ${currentPage === 'portfolio' ? 'active' : ''}`}
              onClick={() => setCurrentPage('portfolio')}
            >
              投资组合
            </a>
          </nav>
        </div>
      </header>

      <div className="container">
        {currentPage === 'market' && <MarketPage />}
        {currentPage === 'positions' && <PositionsPage />}
        {currentPage === 'portfolio' && <PortfolioPage />}
      </div>
    </div>
  );
}
