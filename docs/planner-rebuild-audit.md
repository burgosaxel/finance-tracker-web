# Planner Rebuild Audit

## Keep
- Firebase auth and Firestore wiring in `src/lib/firebase.js`
- Generic CRUD helpers and collection subscriptions in `src/lib/db.js`
- Existing account collections and Plaid-linked account storage
- Modal, toast, and app shell scaffolding

## Replace or de-emphasize
- `DashboardPage` as the main experience
- Budget, credit card, and loan-first navigation
- Bills and income page structure that treats bills as a flat monthly list instead of paycheck operations
- Transaction/category-first language on the home screen

## New product center
- `PlannerPage` becomes the main route
- `billTemplates` + monthly `statements/{month}/bills` become the operational core
- Paycheck settings move into `settings.preferences.paychecks`
- Accounts page becomes explicit because account assignment is core to the workflow

## Migration stance
- Preserve old data where practical
- Normalize legacy bill fields into the new template and monthly-instance shape
- Keep Plaid support available, but secondary to planner actions
