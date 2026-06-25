# Publicação estática (GitHub Pages)

O workflow `.github/workflows/deploy-github-pages.yml` monta o site com:

- `app/` — portal React (`/app/`)
- `pages/`, `assets/` — módulos legados
- `index.html`, `login.html` — redirecionam para `/app/` (use `?legado=1` para o portal antigo)
- `404.html` — fallback SPA para rotas diretas como `/app/login`

## Domínio customizado

Copie `CNAME.exemplo` para `CNAME` com o domínio desejado, ou defina a variável `PORTAL_CUSTOM_DOMAIN` no GitHub.

## API AWS em produção

Configure o secret `PORTAL_AWS_API_URL` no repositório para injetar a URL no `portal-runtime.json` no deploy.
