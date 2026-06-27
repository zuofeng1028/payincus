# Flash Sale Plugin Usage

This template is the end-to-end acceptance sample for a PayIncus extension with a front page, admin settings, webhook actions, event subscriptions, notification templates, and scoped storage.

Webhook requests from PayIncus include `x-payincus-plugin-signature`. The extension service must verify the signature before accepting `reserveStock`, `confirmPaidReservation`, or `releaseReservation`.

All write operations must use an `idempotencyKey`. Event handlers should also use the event `dedupeKey` so duplicate `order.paid` or `payment.failed` delivery cannot reserve, confirm, or release the same stock twice.

Package it with:

```bash
tar -czf flash-sale-plugin.tar.gz payincus.plugin.json README.md dist templates docs
```

The user page may call Public API resources such as `/api/v1/products`; it must not call `/api/admin/*`, write balances directly, create payments directly, or mutate instance delivery state.
