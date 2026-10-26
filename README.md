# Vigia AmpliaHub

Confere a cada 10 minutos se os sites de produção da AmpliaHub respondem e manda e-mail quando um cai e quando volta.

- **Lista de sites:** `sites.json`. Site novo = uma linha.
- **Quem está fora agora:** `estado.json` (vazio = tudo no ar).
- **Como confere:** `vigiar.mjs`. Um site só conta como fora depois de falhar 3 vezes seguidas, com 20 segundos entre as tentativas.
- **Testar o e-mail:** aba Actions › Vigiar os sites › Run workflow › marcar "Só mandar um e-mail de teste".
