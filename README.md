# Burger House — cardápio digital e painel (V2)

Cardápio online, pedidos, mesas por QR Code, PDV, pagamento a prazo, relatório e painel de gestão.
HTML/CSS/JS puro (módulos ES, sem build), Firebase `moda-63d8d` (Firestore + Auth), hospedado na Vercel.

- **Site:** https://burgerhouse-nine.vercel.app · **Painel:** `/admin/` (superadmin `admin@gmail.com`)
- **QR das mesas:** `/index.html?mesa=<id do documento da mesa>` (os QR impressos da V1 continuam valendo)

## Publicar uma mudança

1. `npm test` (Node 22, sem dependências) — tudo verde.
2. `node scripts/versao.mjs <nova versão>` (ex.: `2.0.1`) e `node scripts/versao.mjs --check` (saída 0).
   Sem isso os celulares podem continuar com arquivos antigos.
3. Commit e `git push origin main` — a Vercel publica sozinha.
4. `node scripts/conferir-cabecalhos.mjs https://burgerhouse-nine.vercel.app` — deve terminar em "Tudo certo".

## Rodar local e ferramentas

- `npx serve . -l 5502` → http://localhost:5502/ e `/admin/`; modo demo (dados só no navegador): `?demo=1`.
- Ferramentas (só funcionam em localhost, não vão para o site): `/ferramentas/backup` (backup completo em JSON —
  guardar em `backups/`, fora do Git), `/ferramentas/ensaio` (carrega um backup no modo demo), `/ferramentas/migrar`
  e `/ferramentas/limpar` (usadas na migração).
- Regras do Firestore: `firestore.rules` (publicar no console: Firestore Database › Regras).

## Voltar para a V1 (emergência)

Vercel › Deployments › último deploy da V1 › Instant Rollback; republicar `regras/v1.rules`; código V1 na tag `v1-final`.

## Documentação da migração

`docs/superpowers/specs/2026-11-16-migracao-burger-house-v2-design.md` e `docs/superpowers/plans/`
(roteiro, planos e resultados de cada fase, e `2026-11-18-migracao-v2-concluida.md`).
