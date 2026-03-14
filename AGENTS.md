# BudgetCommand / Finance Tracker Agent Instructions

## Branch rules
- Work only in the `plaid-match` branch unless explicitly told otherwise.
- Never modify `main`.
- Do not reset or overwrite unrelated changes.

## Project priorities
This project is a finance tracker / BudgetCommand app with:
- Firebase Auth
- Firestore
- Plaid integration
- linked account syncing
- transaction matching
- recurring detection
- manual accounts, bills, income, loans, and credit cards
- dashboard forecasting and financial summaries

## Protected systems
Do not change these unless the user explicitly requests it:
- Firebase auth flow
- Firestore collection structure
- Plaid sync logic
- transaction matching logic
- recurring detection logic
- import/export logic
- financial calculations
- routing behavior

## UI / styling instructions
When the user asks for UI changes:
- change only the relevant page(s) and component(s)
- do not redesign unrelated sections
- do not refactor the whole app unless explicitly requested
- preserve current functionality
- prefer small, controlled edits over broad rewrites
- preserve the current premium dark design language unless asked to change it

## Screenshot-driven workflow
If the user provides a screenshot or annotated image:
- treat the screenshot as the primary source of truth for the UI issue
- fix only the highlighted or described areas
- do not make unrelated “improvements”
- do not change other pages unless explicitly requested

## Layout safety rules
Before modifying layout:
1. Inspect which component actually renders the affected UI
2. Change the smallest number of files possible
3. Avoid editing global shared styles unless absolutely necessary
4. If a shared style must be changed, verify what else uses it
5. Do not introduce duplicate headers, controls, or cards
6. Do not remove working controls unless requested

## Page-specific caution
Be especially careful with:
- Dashboard layout
- Bills & Income row/card alignment
- Transactions pagination/footer controls
- Settings recurring/accounts sections
- Sidebar branding/layout

These areas have already regressed multiple times and should be edited conservatively.

## Sorting behavior
For sortable tables:
- prefer sorting from table headers when requested
- do not add redundant sort controls if header sorting already exists
- preserve current data and calculations

## Settings page caution
The Settings page has previously broken and rendered blank.
Before modifying Settings:
- inspect for render errors
- avoid merging unrelated sections
- keep these sections separate unless explicitly requested:
  - App Preferences
  - Linked Bank Accounts
  - Detected Recurring
  - Accounts
  - Data Tools

## Transactions / recurring lists
If adding pagination or "show 20/50/100/all":
- keep the control attached to the same card footer
- do not duplicate the control outside the card
- preserve filters before pagination

## Implementation style
Before coding:
- inspect the repo structure
- identify the exact target files
- summarize the minimal plan
- then apply the changes

After coding:
- verify the requested change only
- note which files were changed
- do not claim unrelated improvements

## Preferred behavior for the agent
- Be conservative
- Be surgical
- Do not over-correct
- Do not redesign beyond the request
- Do not break working UI to fix one area
