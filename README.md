# Burger House — cardápio digital e painel (V2)

Cardápio online, pedidos, mesas por QR Code, PDV, pagamento a prazo e painel de gestão.
HTML/CSS/JS puro (módulos ES), Firebase `moda-63d8d` (Firestore + Auth), hospedado na Vercel.
Base de arquitetura: cardapio-online50k.

- Rodar local: `npx serve . -l 5502` → <http://localhost:5502/> e `/admin/`
- Modo demo (dados só no navegador, só em localhost): acrescente `?demo=1` (desliga com `?demo=0`)
- Testes: `npm test` (Node 22, sem dependências)
- Decisões da migração: `docs/superpowers/specs/2026-11-16-migracao-burger-house-v2-design.md`
- Regras do Firestore da V1 (para rollback): `docs/regras-v1.md`
