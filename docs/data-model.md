# BudgetCommand Planner Data Model

All user data lives under `/users/{uid}/...`.

## Collections kept

### `/users/{uid}/accounts/{accountId}`
- `id`
- `name`
- `type`
- `balance`
- `institutionName`
- `createdAt`
- `updatedAt`

### `/users/{uid}/linkedAccounts/{accountId}`
- Plaid-linked balance metadata used to support planner balances and verification.

### `/users/{uid}/transactions/{transactionId}`
- Manual or Plaid transactions used as an activity log and bill-match candidates.

## Planner-first collections

### `/users/{uid}/billTemplates/{templateId}`
- `id`
- `name`
- `category`
- `defaultAccountId`
- `dueDay`
- `paycheckSlot: "first" | "fifteenth"`
- `amountType: "fixed" | "variable"`
- `defaultAmount`
- `autopay`
- `plaidMatchEnabled`
- `plaidMatchRules`
- `notes`
- `active`
- `hidden`
- `system`
- Compatibility mirrors: `merchant`, `isActive`

### `/users/{uid}/statements/{monthKey}/bills/{billInstanceId}`
- `id`
- `templateId`
- `monthKey`
- `name`
- `category`
- `dueDay`
- `dueDate`
- `paycheckSlot: "first" | "fifteenth"`
- `plannedAccountId`
- `plannedAmount`
- `suggestedAmount`
- `actualAmount`
- `amountType: "fixed" | "variable"`
- `status: "planned" | "paid" | "overdue" | "skipped"`
- `paidDate`
- `linkedTransactionId`
- `manuallyConfirmed`
- `verificationStatus: "unverified" | "matched" | "manual"`
- `autopay`
- `plaidMatchEnabled`
- `plaidMatchRules`
- `notes`
- `hidden`
- `system`
- Compatibility mirrors: `merchant`, `accountId`, `amount`, `paidAt`

## Settings

### `/users/{uid}/settings/preferences`
- Existing app settings
- `paychecks.first.label`
- `paychecks.first.depositDay`
- `paychecks.first.expectedIncome`
- `paychecks.fifteenth.label`
- `paychecks.fifteenth.depositDay`
- `paychecks.fifteenth.expectedIncome`

## Notes

- Monthly bill instances are generated from active bill templates.
- Hidden/system/inactive templates are excluded from normal planner visibility by default.
- Plaid is secondary: linked balances and transactions enrich the planner but do not define navigation.
- The planner tolerates legacy fields while the rebuild is in progress.
