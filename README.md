# Vigia AmpliaHub

Confere a cada 3 minutos se os sites de produção da AmpliaHub respondem. Enquanto um site estiver fora, manda e-mail a cada rodada; quando volta, avisa também.

- **Onde roda (desde 15/11/2026):** Cloudflare, Worker `vigia-ampliahub` (pasta `cloudflare/`), fora do GitHub e fora da Hostinger. Publicar: `npx wrangler deploy` dentro de `cloudflare/`.
- **Chaves:** segredos do Worker na Cloudflare (`HOSTINGER_API_TOKEN`, chave "Vigia Cloudflare" na Hostinger; `HOSTINGER_MAILBOX_RESOURCE_ID`; `VIGIA_DESTINOS`).
- **Quem está fora agora:** armazenamento `VIGIA_ESTADO` do Worker. O `estado.json` daqui só vale pra rotina manual do GitHub.

- **Lista de sites:** `sites.json`. Site novo = uma linha **e publicar de novo na Cloudflare** (o Worker lê a lista na hora de publicar).
- **Como confere:** `cloudflare/vigia.js` (a cópia `vigiar.mjs` é a da rotina manual do GitHub). Um site só conta como fora depois de falhar 3 vezes seguidas, com 20 segundos entre as tentativas.
- **Testar o e-mail:** aba Actions › Vigiar os sites › Run workflow › marcar "Só mandar um e-mail de teste".
