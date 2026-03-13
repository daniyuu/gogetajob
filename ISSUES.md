# GoGetAJob Issues for Self-Improvement

## Issue 1: Add real-time worker status display
**Labels**: enhancement, ui

Currently the positions page doesn't show real-time worker activity. Users can't see what the AI is currently doing.

**Expected behavior:**
- Show current worker status (cloning, finding issues, working on issue, committing)
- Display which issue the worker is currently solving
- Show live token consumption counter
- Add worker logs viewer

**Current behavior:**
- Only shows generic status (working/stopped/error)
- No visibility into what the worker is actually doing

---

## Issue 2: Improve error handling and notifications
**Labels**: bug, enhancement

When a worker fails, the error message is not clear enough for users to understand what went wrong.

**Expected behavior:**
- Clear error messages in UI
- Actionable suggestions (e.g., "GitHub token needed", "Repository access denied")
- Toast notifications for important events
- Error recovery suggestions

**Current behavior:**
- Generic "error" status
- Need to check server logs to understand issues

---

## Issue 3: Add project search and filtering
**Labels**: enhancement, ui

Market hall shows all projects but lacks search/filter functionality.

**Expected behavior:**
- Search projects by name
- Filter by language (JavaScript, TypeScript, Python, etc.)
- Sort by price, stars, forks
- Filter by price range

**Current behavior:**
- Only shows flat list of all projects
- No search or filter options

---

## Issue 4: Implement K-line chart visualization
**Labels**: enhancement, ui, visualization

Project snapshots are collected but not visualized.

**Expected behavior:**
- Show K-line chart for project price history
- Display stars/forks growth over time
- Interactive charts with zoom and pan
- Compare multiple projects

**Tech stack suggestion:**
- ECharts or Chart.js

---

## Issue 5: Add GitHub token configuration UI
**Labels**: enhancement, ui

Users need to manually edit config.json to add GitHub token.

**Expected behavior:**
- Settings page in UI
- Form to input GitHub token
- Test connection button
- Save and apply without restart

**Current behavior:**
- Must edit data/config.json manually
- Need to restart server after changes

---

## Issue 6: Optimize worker startup time
**Labels**: performance, enhancement

Worker takes time to clone large repositories on first run.

**Expected behavior:**
- Show clone progress
- Cache cloned repositories
- Incremental git pull for updates
- Parallel worker startup

**Current behavior:**
- No progress indication during clone
- Full clone every time (though cache exists after first run)

---

## Issue 7: Add worker control panel
**Labels**: enhancement, ui

No UI to manually control workers (start, stop, restart).

**Expected behavior:**
- Worker management page showing all workers
- Start/stop/restart buttons for each worker
- View worker logs
- Force kill if stuck

**Current behavior:**
- Can only control via positions (buy/sell)
- No direct worker management

---

## Issue 8: Improve ROI calculation accuracy
**Labels**: enhancement, algorithm

Current ROI only considers project price change, not PR success rate.

**Expected behavior:**
- Factor in PR merge rate
- Consider issue difficulty
- Weight by contribution quality
- Show ROI prediction

**Current behavior:**
- Simple formula: (price_change / token_cost) * 100%
- Doesn't account for PR rejection

---

## Issue 9: Add batch operations
**Labels**: enhancement, ui

Users might want to buy/sell multiple projects at once.

**Expected behavior:**
- Select multiple projects in market hall
- Batch buy with one click
- Batch sell all positions
- Set global token budget

**Current behavior:**
- Can only buy/sell one at a time

---

## Issue 10: Mobile responsive design
**Labels**: enhancement, ui, mobile

UI is not optimized for mobile devices.

**Expected behavior:**
- Responsive layout for mobile screens
- Touch-friendly buttons
- Simplified navigation
- Mobile-first tables

**Current behavior:**
- Desktop-only layout
- Small touch targets
- Horizontal scroll on mobile
