#!/bin/bash
# Script to create issues for GoGetAJob

echo "Creating issues for GoGetAJob..."

# Issue 1
gh issue create --title "Add real-time worker status display" --body "
Currently the positions page doesn't show real-time worker activity. Users can't see what the AI is currently doing.

**Expected behavior:**
- Show current worker status (cloning, finding issues, working on issue, committing)
- Display which issue the worker is currently solving
- Show live token consumption counter
- Add worker logs viewer

**Current behavior:**
- Only shows generic status (working/stopped/error)
- No visibility into what the worker is actually doing

**Priority:** High - Essential for user experience
"

# Issue 2
gh issue create --title "Improve error handling and notifications" --body "
When a worker fails, the error message is not clear enough for users to understand what went wrong.

**Expected behavior:**
- Clear error messages in UI
- Actionable suggestions (e.g., \"GitHub token needed\", \"Repository access denied\")
- Toast notifications for important events
- Error recovery suggestions

**Current behavior:**
- Generic \"error\" status
- Need to check server logs to understand issues

**Priority:** High - Critical for debugging
"

# Issue 3
gh issue create --title "Add project search and filtering" --body "
Market hall shows all projects but lacks search/filter functionality.

**Expected behavior:**
- Search projects by name
- Filter by language (JavaScript, TypeScript, Python, etc.)
- Sort by price, stars, forks
- Filter by price range

**Current behavior:**
- Only shows flat list of all projects
- No search or filter options

**Priority:** Medium - UX improvement
"

# Issue 4
gh issue create --title "Implement K-line chart visualization" --body "
Project snapshots are collected but not visualized.

**Expected behavior:**
- Show K-line chart for project price history
- Display stars/forks growth over time
- Interactive charts with zoom and pan
- Compare multiple projects

**Tech stack suggestion:**
- ECharts or Chart.js

**Priority:** Medium - Data visualization
"

# Issue 5
gh issue create --title "Add GitHub token configuration UI" --body "
Users need to manually edit config.json to add GitHub token.

**Expected behavior:**
- Settings page in UI
- Form to input GitHub token
- Test connection button
- Save and apply without restart

**Current behavior:**
- Must edit data/config.json manually
- Need to restart server after changes

**Priority:** High - User convenience
"

# Issue 6
gh issue create --title "Optimize worker startup time" --body "
Worker takes time to clone large repositories on first run.

**Expected behavior:**
- Show clone progress
- Cache cloned repositories
- Incremental git pull for updates
- Parallel worker startup

**Current behavior:**
- No progress indication during clone
- Full clone every time (though cache exists after first run)

**Priority:** Medium - Performance
"

# Issue 7
gh issue create --title "Add worker control panel" --body "
No UI to manually control workers (start, stop, restart).

**Expected behavior:**
- Worker management page showing all workers
- Start/stop/restart buttons for each worker
- View worker logs
- Force kill if stuck

**Current behavior:**
- Can only control via positions (buy/sell)
- No direct worker management

**Priority:** High - Essential feature
"

# Issue 8
gh issue create --title "Improve ROI calculation accuracy" --body "
Current ROI only considers project price change, not PR success rate.

**Expected behavior:**
- Factor in PR merge rate
- Consider issue difficulty
- Weight by contribution quality
- Show ROI prediction

**Current behavior:**
- Simple formula: (price_change / token_cost) * 100%
- Doesn't account for PR rejection

**Priority:** Medium - Algorithm improvement
"

# Issue 9
gh issue create --title "Add batch operations" --body "
Users might want to buy/sell multiple projects at once.

**Expected behavior:**
- Select multiple projects in market hall
- Batch buy with one click
- Batch sell all positions
- Set global token budget

**Current behavior:**
- Can only buy/sell one at a time

**Priority:** Low - Nice to have
"

# Issue 10
gh issue create --title "Mobile responsive design" --body "
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

**Priority:** Low - Future enhancement
"

echo "All issues created!"
