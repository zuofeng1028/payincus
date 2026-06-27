# PayIncus Clean Theme Usage

The Clean Theme demonstrates a visual-only PayIncus theme package. It is loaded through `GET /api/themes/active` after an administrator uploads, previews, enables, or rolls back the theme from the admin theme page.

The package includes:

- `payincus.theme.json`
- `dist/theme.css`
- `tokens/colors.json`
- safe template fragments under `templates/`
- controlled config fields declared by `configSchema`

It covers these template slots:

- `public.home.hero`
- `public.home.sections`
- `public.market.banner`
- `public.auth.aside`
- `user.shell.brand`
- `user.dashboard.banner`
- `user.dashboard.cards`
- `user.instance.detail.extra`
- `user.wallet.banner`
- `user.tickets.banner`
- `user.extensions.banner`
- `user.orders.banner`
- `user.profile.banner`
- `user.invites.banner`
- `user.hosts.banner`
- `user.host.create.banner`
- `admin.shell.brand`
- `admin.extensions.header`
- `admin.extensions.market.banner`
- `admin.extensions.theme.banner`
- `admin.dashboard.banner`
- `admin.dashboard.widgets`
- `admin.billing.banner`
- `admin.payment.providers.banner`
- `admin.oauth.banner`
- `shared.footer`

Package it with:

```bash
tar -czf payincus-clean-theme.tar.gz payincus.theme.json README.md dist tokens templates docs
```

Theme packages can change CSS variables, local assets, safe HTML fragments, and admin-managed config values. They cannot run scripts, submit forms, load iframes, reference remote URLs, bypass permissions, mutate billing, or alter resource delivery logic.
